import { db, Customer, ReferralCode, Sale, Credit, Settings } from '../db.ts';
import { messagingService } from './messaging.ts';
import crypto from 'crypto';

export class BusinessService {
  // Helpers for Indian mobile numbers
  public static normalizeIndianPhone(input: string): string {
    const digits = input.replace(/\D/g, '');
    let phone10 = '';
    if (digits.length === 10) {
      phone10 = digits;
    } else if (digits.length === 12 && digits.startsWith('91')) {
      phone10 = digits.slice(2);
    } else if (digits.length === 11 && digits.startsWith('0')) {
      phone10 = digits.slice(1);
    } else {
      throw new Error('Please enter a valid 10-digit Indian mobile number');
    }

    if (!/^[6-9]\d{9}$/.test(phone10)) {
      throw new Error('Indian mobile numbers must start with 6, 7, 8, or 9');
    }

    return `+91${phone10}`;
  }

  // Generates 6-character code avoiding O, I, 0, 1
  public static generateReferralCode(): string {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 6; i++) {
      const idx = crypto.randomInt(0, chars.length);
      code += chars[idx];
    }
    return code;
  }

  public static generatePersonalToken(): string {
    return crypto.randomBytes(24).toString('hex'); // 48 chars
  }

  public static rupeesToPaise(rupees: number): number {
    return Math.round(rupees * 100);
  }

  public static paiseToRupees(paise: number): number {
    return Math.round(paise / 100);
  }

  // Round calculated amounts to nearest whole rupee in paise
  public static roundToRupeePaise(paiseAmount: number): number {
    return Math.round(paiseAmount / 100) * 100;
  }

  // Floor to whole rupee in paise for credit cap
  public static floorToRupeePaise(paiseAmount: number): number {
    return Math.floor(paiseAmount / 100) * 100;
  }

  // Validate referral code according to section 4 rules
  public static validateReferralCode(
    codeStr: string,
    buyerPhone: string,
    billAmountPaise?: number
  ): { valid: boolean; reason?: string; referralCode?: ReferralCode; ownerCustomer?: Customer } {
    const snapshot = db.getSnapshot();
    const cleanCode = codeStr.trim().toUpperCase();

    const referralCode = snapshot.referral_codes.find((rc) => rc.code === cleanCode);
    if (!referralCode) {
      return { valid: false, reason: 'Code not found' };
    }

    if (referralCode.status !== 'unused') {
      return { valid: false, reason: 'Code already used' };
    }

    if (!snapshot.settings.scheme_enabled) {
      return { valid: false, reason: 'Referral scheme is paused' };
    }

    const ownerCustomer = snapshot.customers.find((c) => c.id === referralCode.owner_customer_id);
    if (!ownerCustomer) {
      return { valid: false, reason: 'Code owner not found' };
    }

    // Checked before rule 4, so self-use gets the clearer message
    const normalizedBuyerPhone = this.normalizeIndianPhone(buyerPhone);
    if (ownerCustomer.phone === normalizedBuyerPhone) {
      return { valid: false, reason: "Can't use your own code" };
    }

    const existingBuyer = snapshot.customers.find((c) => c.phone === normalizedBuyerPhone);
    if (existingBuyer) {
      return { valid: false, reason: 'Only for new customers' };
    }

    if (snapshot.settings.min_bill_for_referral && billAmountPaise !== undefined) {
      const minPaise = snapshot.settings.min_bill_for_referral * 100;
      if (billAmountPaise < minPaise) {
        return { valid: false, reason: `Bill must be at least ₹${snapshot.settings.min_bill_for_referral}` };
      }
    }

    return { valid: true, referralCode, ownerCustomer };
  }

  // Calculate B's discount
  public static calculateDiscount(billAmountPaise: number, settings: Settings): number {
    if (billAmountPaise <= 0) return 0;

    let discountPaise = 0;
    if (settings.b_discount_type === 'percent') {
      const calculated = (billAmountPaise * settings.b_discount_value) / 100;
      discountPaise = this.roundToRupeePaise(calculated);
      if (settings.b_discount_cap) {
        const capPaise = settings.b_discount_cap * 100;
        discountPaise = Math.min(discountPaise, capPaise);
      }
    } else {
      // Fixed discount
      const fixedPaise = settings.b_discount_value * 100;
      discountPaise = Math.min(fixedPaise, billAmountPaise);
    }
    return Math.min(discountPaise, billAmountPaise);
  }

  // Calculate A's credit (based on bill amount before B's discount)
  public static calculateCredit(billAmountPaise: number, settings: Settings): number {
    if (billAmountPaise <= 0) return 0;

    let creditPaise = 0;
    if (settings.a_credit_type === 'percent') {
      const calculated = (billAmountPaise * settings.a_credit_value) / 100;
      creditPaise = this.roundToRupeePaise(calculated);
    } else {
      // Fixed credit
      creditPaise = settings.a_credit_value * 100;
    }
    return creditPaise;
  }

  // Calculate usable credit for a customer on a given bill
  public static calculateUsableCredit(
    customerId: string,
    billAmountPaise: number
  ): { totalActiveCredit: number; maxUsableCredit: number; lots: Credit[] } {
    const snapshot = db.getSnapshot();
    const activeLots = snapshot.credits
      .filter((c) => c.customer_id === customerId && c.status === 'active' && c.remaining > 0)
      .sort((a, b) => new Date(a.expires_at || 0).getTime() - new Date(b.expires_at || 0).getTime());

    const totalActiveCredit = activeLots.reduce((sum, c) => sum + c.remaining, 0);
    const maxCreditSharePercent = snapshot.settings.max_credit_share || 50;

    // usable = min(customer's total active credit, floor(bill_amount * max_credit_share / 100))
    const maxAllowedByBill = this.floorToRupeePaise((billAmountPaise * maxCreditSharePercent) / 100);
    const maxUsableCredit = Math.min(totalActiveCredit, maxAllowedByBill);

    return { totalActiveCredit, maxUsableCredit, lots: activeLots };
  }

  // Format rewards for message templates
  public static formatRewardLabel(type: 'percent' | 'fixed', value: number): string {
    return type === 'percent' ? `${value}%` : `₹${value}`;
  }

  // Run the daily scheduled job (09:00 IST logic)
  public static runDailyJob(): { activated: number; expired: number; remindersSent: number } {
    return db.transaction((database) => {
      const now = new Date();
      const settings = database.settings;
      let activatedCount = 0;
      let expiredCount = 0;
      let remindersSentCount = 0;

      // 1. Release pending credits where available_at <= now
      for (const credit of database.credits) {
        if (credit.status === 'pending') {
          const availDate = new Date(credit.available_at);
          if (availDate <= now) {
            credit.status = 'active';
            const expiryDays = credit.settings_snapshot?.expiry_days || settings.expiry_days || 90;
            const expDate = new Date(availDate.getTime() + expiryDays * 86400000);
            credit.expires_at = expDate.toISOString();
            activatedCount++;

            // Send credit_ready message
            const cust = database.customers.find((c) => c.id === credit.customer_id);
            if (cust) {
              const appUrl = process.env.APP_URL || '';
              const link = `${appUrl}/customer/${cust.personal_token}`;
              messagingService.send({
                customerId: cust.id,
                kind: 'credit_ready',
                data: {
                  amount: `₹${this.paiseToRupees(credit.amount)}`,
                  expiry: expDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                  link,
                },
              });
            }
          }
        }
      }

      // 2. Expire active credits where expires_at <= now
      for (const credit of database.credits) {
        if (credit.status === 'active' && credit.expires_at) {
          const expDate = new Date(credit.expires_at);
          if (expDate <= now) {
            credit.status = 'expired';
            credit.remaining = 0;
            expiredCount++;
          }
        }
      }

      // 3. Send expiry reminders (reminder_days_before days before expiry, once per lot)
      const reminderDays = settings.reminder_days_before || 7;
      if (reminderDays > 0) {
        const reminderWindowMs = reminderDays * 86400000;
        for (const credit of database.credits) {
          if (credit.status === 'active' && credit.remaining > 0 && credit.expires_at && !credit.expiring_notified) {
            const expDate = new Date(credit.expires_at);
            const msUntilExpiry = expDate.getTime() - now.getTime();
            if (msUntilExpiry > 0 && msUntilExpiry <= reminderWindowMs) {
              credit.expiring_notified = true;
              remindersSentCount++;

              const cust = database.customers.find((c) => c.id === credit.customer_id);
              if (cust) {
                messagingService.send({
                  customerId: cust.id,
                  kind: 'credit_expiring',
                  data: {
                    amount: `₹${this.paiseToRupees(credit.remaining)}`,
                    expiry: expDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                  },
                });
              }
            }
          }
        }
      }

      // Record audit log
      database.audit_log.unshift({
        id: crypto.randomUUID(),
        staff_id: 'system',
        action: 'daily_job_executed',
        details: { activated: activatedCount, expired: expiredCount, remindersSent: remindersSentCount },
        created_at: new Date().toISOString(),
      });

      console.log(`[Daily Job] Completed: ${activatedCount} activated, ${expiredCount} expired, ${remindersSentCount} reminders.`);
      return { activated: activatedCount, expired: expiredCount, remindersSent: remindersSentCount };
    });
  }
}

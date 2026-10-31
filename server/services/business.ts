import { DatabaseSchema, Customer, ReferralCode, Sale, Credit, Settings, RedemptionToken } from '../db.ts';
import { messagingService } from './messaging.ts';
import crypto from 'crypto';
import QRCode from 'qrcode';

export interface SaveSaleInput {
  phone: string;
  name?: string;
  marketingConsent?: boolean;
  receiptRef?: string;
  billAmountPounds: number;
  referralCode?: string;
  creditToUsePounds?: number;
  redemptionToken?: string;
}

export class BusinessService {
  public static normalizeUkPhone(input: string): string {
    if (!input || !input.trim()) {
      throw new Error('Please enter a UK mobile number, e.g. 07700 900123');
    }
    const digits = input.replace(/\D/g, '');
    let phone10 = '';
    if (digits.length === 10 && digits.startsWith('7')) {
      phone10 = digits;
    } else if (digits.length === 11 && digits.startsWith('07')) {
      phone10 = digits.slice(1);
    } else if (digits.length === 12 && digits.startsWith('447')) {
      phone10 = digits.slice(2);
    } else {
      throw new Error('Please enter a UK mobile number, e.g. 07700 900123');
    }

    if (!/^7\d{9}$/.test(phone10)) {
      throw new Error('Please enter a UK mobile number, e.g. 07700 900123');
    }

    return `+44${phone10}`;
  }

  public static formatUkPhone(storedPhone: string): string {
    const digits = storedPhone.replace(/\D/g, '');
    if (digits.startsWith('447') && digits.length === 12) {
      const local = '0' + digits.slice(2);
      return `${local.slice(0, 5)} ${local.slice(5)}`;
    }
    return storedPhone;
  }

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
    return crypto.randomBytes(24).toString('hex');
  }

  public static generateRedemptionToken(): string {
    return crypto.randomBytes(24).toString('hex');
  }

  public static poundsToPence(pounds: number): number {
    return Math.round(pounds * 100);
  }

  public static penceToPounds(pence: number): number {
    return pence / 100;
  }

  public static formatPounds(pence: number): string {
    return `£${(pence / 100).toFixed(2)}`;
  }

  public static formatShortDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      day: 'numeric',
      month: 'short',
    }).format(d);
  }

  public static validateSettings(input: any): {
    scheme_enabled?: boolean;
    friend_discount: number;
    referrer_reward: number;
    min_spend: number;
    expiry_days: number;
    reminder_days_before: number;
    max_credit_share: number;
    shop_name: string;
  } {
    if (!input || typeof input !== 'object') {
      throw new Error('Invalid settings input.');
    }

    const friend_discount = Number(input.friend_discount);
    if (isNaN(friend_discount) || friend_discount < 1) {
      throw new Error('Friend discount must be at least £1.');
    }

    const referrer_reward = Number(input.referrer_reward);
    if (isNaN(referrer_reward) || referrer_reward < 1) {
      throw new Error('Referrer reward must be at least £1.');
    }

    const min_spend = Number(input.min_spend);
    if (isNaN(min_spend) || min_spend < 1) {
      throw new Error('Minimum spend must be at least £1.');
    }

    if (friend_discount >= min_spend) {
      throw new Error('Friend discount must be less than minimum spend.');
    }

    const expiry_days = Number(input.expiry_days ?? 90);
    if (isNaN(expiry_days) || expiry_days < 7 || expiry_days > 365) {
      throw new Error('Expiry days must be between 7 and 365.');
    }

    const reminder_days_before = Number(input.reminder_days_before ?? 7);
    if (isNaN(reminder_days_before) || reminder_days_before < 0 || reminder_days_before > 30) {
      throw new Error('Reminder days before expiry must be between 0 and 30.');
    }

    const max_credit_share = Number(input.max_credit_share ?? 50);
    if (isNaN(max_credit_share) || max_credit_share < 1 || max_credit_share > 100) {
      throw new Error('Max credit share must be between 1 and 100%.');
    }

    const shop_name = input.shop_name !== undefined ? String(input.shop_name).trim() : 'Your Business';
    if (input.shop_name !== undefined && (!shop_name || shop_name.length > 60)) {
      throw new Error('Shop name is required and must be between 1 and 60 characters.');
    }

    return {
      scheme_enabled: typeof input.scheme_enabled === 'boolean' ? input.scheme_enabled : undefined,
      friend_discount,
      referrer_reward,
      min_spend,
      expiry_days,
      reminder_days_before,
      max_credit_share,
      shop_name: shop_name || 'Your Business',
    };
  }

  public static validateReferralCode(
    database: DatabaseSchema,
    codeStr: string,
    buyerPhone: string,
    billAmountPence?: number
  ): { valid: boolean; reason?: string; referralCode?: ReferralCode; ownerCustomer?: Customer } {
    const cleanCode = codeStr.trim().toUpperCase();

    const referralCode = database.referral_codes.find((rc) => rc.code === cleanCode);
    if (!referralCode) {
      return { valid: false, reason: 'Code not found' };
    }

    if (referralCode.status !== 'unused') {
      return { valid: false, reason: 'Code already used' };
    }

    if (!database.settings.scheme_enabled) {
      return { valid: false, reason: 'Referral scheme is paused' };
    }

    const ownerCustomer = database.customers.find((c) => c.id === referralCode.owner_customer_id);
    if (!ownerCustomer) {
      return { valid: false, reason: 'Code owner not found' };
    }

    const normalizedBuyerPhone = this.normalizeUkPhone(buyerPhone);
    if (ownerCustomer.phone === normalizedBuyerPhone) {
      return { valid: false, reason: "Can't use your own code" };
    }

    const existingBuyer = database.customers.find((c) => c.phone === normalizedBuyerPhone);
    if (existingBuyer) {
      return { valid: false, reason: 'Only for new customers' };
    }

    if (billAmountPence !== undefined) {
      const minSpendPence = (database.settings.min_spend ?? 20) * 100;
      if (billAmountPence < minSpendPence) {
        return { valid: false, reason: `Spend at least £${database.settings.min_spend} to use a code` };
      }
    }

    return { valid: true, referralCode, ownerCustomer };
  }

  public static calculateUsableCredit(
    database: DatabaseSchema,
    customerId: string,
    billAmountPence: number
  ): { totalActiveCredit: number; maxUsableCredit: number; lots: Credit[] } {
    const activeLots = database.credits
      .filter((c) => c.customer_id === customerId && c.status === 'active' && c.remaining > 0)
      .sort((a, b) => new Date(a.expires_at || 0).getTime() - new Date(b.expires_at || 0).getTime());

    const totalActiveCredit = activeLots.reduce((sum, c) => sum + c.remaining, 0);
    const maxCreditSharePercent = database.settings.max_credit_share || 50;

    const maxAllowedByBill = Math.round((billAmountPence * maxCreditSharePercent) / 100);
    const maxUsableCredit = Math.min(totalActiveCredit, maxAllowedByBill);

    return { totalActiveCredit, maxUsableCredit, lots: activeLots };
  }

  public static requestOtp(
    database: DatabaseSchema,
    customerId: string
  ): { success: boolean; expiresAt: string } {
    const customer = database.customers.find((c) => c.id === customerId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
    const recentOtps = database.otp_codes.filter(
      (o) => o.customer_id === customerId && o.created_at >= oneHourAgo
    );

    if (recentOtps.length >= 3) {
      throw new Error('Rate limit exceeded: Maximum 3 OTPs allowed per hour for this customer');
    }

    const otpDigits = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = crypto.createHash('sha256').update(otpDigits).digest('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    database.otp_codes.push({
      id: crypto.randomUUID(),
      customer_id: customerId,
      code_hash: codeHash,
      code_plain: otpDigits,
      expires_at: expiresAt,
      attempts: 0,
      used_at: null,
      created_at: new Date().toISOString(),
    });

    messagingService.send(database, {
      customerId: customer.id,
      kind: 'otp',
      data: { otp: otpDigits },
    });

    return {
      success: true,
      expiresAt,
    };
  }

  public static async getCustomerPageData(database: DatabaseSchema, token: string) {
    const customer = database.customers.find((c) => c.personal_token === token);
    if (!customer) {
      throw new Error('Customer not found or invalid token');
    }

    const referralCode = database.referral_codes.find((rc) => rc.owner_customer_id === customer.id);

    const now = new Date();
    const activeLots = database.credits
      .filter((c) => c.customer_id === customer.id && c.status === 'active' && c.remaining > 0)
      .map((c) => ({
        id: c.id,
        amountPounds: this.penceToPounds(c.amount),
        remainingPounds: this.penceToPounds(c.remaining),
        source: c.source,
        expiresAt: c.expires_at,
        daysLeft: c.expires_at
          ? Math.max(0, Math.ceil((new Date(c.expires_at).getTime() - now.getTime()) / 86400000))
          : null,
      }));

    const totalActiveCreditPence = activeLots.reduce((sum, c) => sum + this.poundsToPence(c.remainingPounds), 0);

    const appUrl = process.env.APP_URL || '';
    const customerPageUrl = `${appUrl}/customer/${customer.personal_token}`;

    const personalQrDataUri = await QRCode.toDataURL(customerPageUrl, { width: 280, margin: 2 });

    let referralQrDataUri: string | null = null;
    let whatsappShareUrl: string = '';
    const friendDiscountPounds = database.settings.friend_discount;
    const referrerRewardPounds = referralCode ? this.penceToPounds(referralCode.referrer_return_amount) : database.settings.referrer_reward;
    const minSpendPounds = database.settings.min_spend;

    if (referralCode) {
      referralQrDataUri = await QRCode.toDataURL(referralCode.code, { width: 240, margin: 2 });
      const promoMsg = `Use my code ${referralCode.code} at ${database.settings.shop_name} and get £${friendDiscountPounds} off your first visit (min spend £${minSpendPounds}).`;
      whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(promoMsg)}`;
    }

    const firstName = customer.name.split(' ')[0] || customer.name;

    return {
      shopName: database.settings.shop_name,
      firstName,
      fullName: customer.name,
      personalToken: customer.personal_token,
      personalQrDataUri,
      totalActiveCreditPounds: this.penceToPounds(totalActiveCreditPence),
      activeLots,
      referralCode: referralCode
        ? {
            code: referralCode.code,
            status: referralCode.status,
            qrDataUri: referralQrDataUri,
            whatsappShareUrl,
            friendDiscountPounds,
            referrerRewardPounds,
          }
        : null,
      marketingConsent: customer.marketing_consent && !customer.opted_out_at,
      optedOut: !!customer.opted_out_at,
    };
  }

  public static verifyOtp(
    database: DatabaseSchema,
    customerId: string,
    otpInput: string
  ): { verified: boolean; redemptionToken: string } {
    const now = new Date();
    const otps = database.otp_codes
      .filter((o) => o.customer_id === customerId && !o.used_at)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const activeOtp = otps[0];
    if (!activeOtp) {
      throw new Error('No active OTP found. Please send a new OTP.');
    }

    if (new Date(activeOtp.expires_at) < now) {
      throw new Error('OTP has expired. Please send a new OTP.');
    }

    if (activeOtp.attempts >= 5) {
      throw new Error('OTP locked: Maximum 5 attempts exceeded. Cashier must send a new OTP.');
    }

    const inputHash = crypto.createHash('sha256').update(otpInput.trim()).digest('hex');
    if (inputHash !== activeOtp.code_hash) {
      activeOtp.attempts += 1;
      const remaining = 5 - activeOtp.attempts;
      if (remaining <= 0) {
        throw new Error('OTP locked: Maximum 5 attempts exceeded. Cashier must send a new OTP.');
      }
      throw new Error(`Incorrect OTP. ${remaining} attempts remaining.`);
    }

    activeOtp.used_at = now.toISOString();

    const token = this.generateRedemptionToken();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    database.redemption_tokens.push({
      id: crypto.randomUUID(),
      customer_id: customerId,
      token,
      expires_at: expiresAt,
      used: false,
      created_at: now.toISOString(),
    });

    return { verified: true, redemptionToken: token };
  }

  public static verifyPersonalQr(
    database: DatabaseSchema,
    customerId: string,
    scannedTokenOrUrl: string
  ): { verified: boolean; redemptionToken: string; customerName: string } {
    const now = new Date();
    const customer = database.customers.find((c) => c.id === customerId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    const tokenPart = scannedTokenOrUrl.includes('/customer/')
      ? scannedTokenOrUrl.split('/customer/')[1]?.trim()
      : scannedTokenOrUrl.trim();

    if (tokenPart !== customer.personal_token) {
      throw new Error('Personal QR does not match this customer!');
    }

    const token = this.generateRedemptionToken();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    database.redemption_tokens.push({
      id: crypto.randomUUID(),
      customer_id: customerId,
      token,
      expires_at: expiresAt,
      used: false,
      created_at: now.toISOString(),
    });

    return { verified: true, redemptionToken: token, customerName: customer.name };
  }

  public static saveSale(
    database: DatabaseSchema,
    input: SaveSaleInput,
    staffId: string
  ) {
    const {
      phone,
      name,
      marketingConsent,
      receiptRef,
      billAmountPounds,
      referralCode,
      creditToUsePounds,
      redemptionToken,
    } = input;

    if (!phone || billAmountPounds === undefined) {
      throw new Error('Phone and bill amount are required.');
    }

    const normalizedPhone = this.normalizeUkPhone(phone);
    const cleanReceiptRef = receiptRef ? receiptRef.trim().toUpperCase() : null;
    const billAmountPence = this.poundsToPence(Number(billAmountPounds));

    if (billAmountPence <= 0) {
      throw new Error('Bill amount must be greater than £0');
    }

    if (cleanReceiptRef) {
      const duplicateBill = database.sales.find(
        (s) => s.receipt_ref && s.receipt_ref.toLowerCase() === cleanReceiptRef.toLowerCase()
      );
      if (duplicateBill) {
        throw new Error(`Receipt number "${cleanReceiptRef}" already exists.`);
      }
    }

    let customer = database.customers.find((c) => c.phone === normalizedPhone);
    const isNewCustomer = !customer;

    let appliedReferralCodeRow: ReferralCode | null = null;
    let referrerCustomer: Customer | null = null;
    let friendDiscountPence = 0;
    let referrerReturnPence = 0;

    if (referralCode) {
      const check = this.validateReferralCode(database, referralCode, normalizedPhone, billAmountPence);
      if (!check.valid) {
        throw new Error(check.reason || 'Invalid referral code');
      }
      appliedReferralCodeRow = check.referralCode!;
      referrerCustomer = check.ownerCustomer!;
      friendDiscountPence = database.settings.friend_discount * 100;
      referrerReturnPence = appliedReferralCodeRow.referrer_return_amount;
    }

    if (isNewCustomer) {
      if (!name || !name.trim()) {
        throw new Error('Customer name is required for new customers.');
      }
      const newCustId = crypto.randomUUID();
      const personalToken = this.generatePersonalToken();

      customer = {
        id: newCustId,
        name: name.trim(),
        phone: normalizedPhone,
        personal_token: personalToken,
        marketing_consent: Boolean(marketingConsent),
        consent_at: new Date().toISOString(),
        opted_out_at: null,
        referred_by_customer_id: referrerCustomer ? referrerCustomer.id : null,
        created_at: new Date().toISOString(),
      };
      database.customers.push(customer);

      const promisedReturnOnOwnCode = database.settings.referrer_reward * 100;

      let uniqueCode = this.generateReferralCode();
      while (database.referral_codes.some((rc) => rc.code === uniqueCode)) {
        uniqueCode = this.generateReferralCode();
      }

      database.referral_codes.push({
        id: crypto.randomUUID(),
        code: uniqueCode,
        owner_customer_id: newCustId,
        status: 'unused',
        used_by_customer_id: null,
        used_sale_id: null,
        used_at: null,
        issued_sale_id: '',
        referrer_return_amount: promisedReturnOnOwnCode,
      });
    }

    if (!customer) {
      throw new Error('Customer record could not be established.');
    }

    const requestedCreditPence = creditToUsePounds ? this.poundsToPence(Number(creditToUsePounds)) : 0;
    let actualCreditUsedPence = 0;

    if (requestedCreditPence > 0) {
      if (isNewCustomer) {
        throw new Error('New customers cannot use credit on their first purchase.');
      }

      if (!redemptionToken) {
        throw new Error('Store credit redemption requires authentication via OTP or Personal QR.');
      }

      const tokenRecord = database.redemption_tokens.find(
        (rt) => rt.token === redemptionToken && rt.customer_id === customer!.id
      );

      if (!tokenRecord) {
        throw new Error('Invalid or unauthenticated redemption token.');
      }

      if (tokenRecord.used) {
        throw new Error('Redemption token has already been used.');
      }

      if (new Date(tokenRecord.expires_at) <= new Date()) {
        throw new Error('Redemption token has expired. Please verify customer again.');
      }

      tokenRecord.used = true;

      const effectiveBillForCredit = billAmountPence - friendDiscountPence;
      const usable = this.calculateUsableCredit(database, customer.id, effectiveBillForCredit);
      actualCreditUsedPence = Math.min(requestedCreditPence, usable.maxUsableCredit);

      if (actualCreditUsedPence > 0) {
        let neededPence = actualCreditUsedPence;
        const activeLots = database.credits
          .filter((c) => c.customer_id === customer.id && c.status === 'active' && c.remaining > 0)
          .sort((a, b) => new Date(a.expires_at || 0).getTime() - new Date(b.expires_at || 0).getTime());

        for (const lot of activeLots) {
          if (neededPence <= 0) break;
          const deduct = Math.min(lot.remaining, neededPence);
          lot.remaining -= deduct;
          neededPence -= deduct;

          database.credit_redemptions.push({
            id: crypto.randomUUID(),
            credit_id: lot.id,
            sale_id: '',
            amount: deduct,
            created_at: new Date().toISOString(),
          });
        }
      }
    }

    const saleId = crypto.randomUUID();
    const saleRecord: Sale = {
      id: saleId,
      customer_id: customer.id,
      receipt_ref: cleanReceiptRef,
      bill_amount: billAmountPence,
      discount_amount: friendDiscountPence,
      credit_used: actualCreditUsedPence,
      referral_code_id: appliedReferralCodeRow ? appliedReferralCodeRow.id : null,
      staff_id: staffId,
      created_at: new Date().toISOString(),
    };
    database.sales.push(saleRecord);

    if (isNewCustomer) {
      const ownCode = database.referral_codes.find((rc) => rc.owner_customer_id === customer!.id);
      if (ownCode) {
        ownCode.issued_sale_id = saleId;
      }
    }

    for (const cr of database.credit_redemptions) {
      if (!cr.sale_id) {
        cr.sale_id = saleId;
      }
    }

    const expiryDays = database.settings.expiry_days || 90;
    const expiresAt = new Date(Date.now() + expiryDays * 86400000).toISOString();
    const expiryDateStr = this.formatShortDate(expiresAt);

    if (appliedReferralCodeRow && referrerCustomer) {
      appliedReferralCodeRow.status = 'used';
      appliedReferralCodeRow.used_by_customer_id = customer.id;
      appliedReferralCodeRow.used_sale_id = saleId;
      appliedReferralCodeRow.used_at = new Date().toISOString();

      database.credits.push({
        id: crypto.randomUUID(),
        customer_id: referrerCustomer.id,
        source_sale_id: saleId,
        amount: referrerReturnPence,
        remaining: referrerReturnPence,
        status: 'active',
        expires_at: expiresAt,
        source: 'referral_return',
        settings_snapshot: {
          expiry_days: database.settings.expiry_days,
        },
        reason: `Referral return from ${customer.name}'s first purchase`,
        created_by_staff_id: staffId,
        created_at: new Date().toISOString(),
      });

      const appUrl = process.env.APP_URL || '';
      messagingService.send(database, {
        customerId: referrerCustomer.id,
        kind: 'referral_return',
        data: {
          amount: this.formatPounds(referrerReturnPence),
          expiry: expiryDateStr,
          link: `${appUrl}/customer/${referrerCustomer.personal_token}`,
        },
      });
    }

    const appUrl = process.env.APP_URL || '';
    const customerLink = `${appUrl}/customer/${customer.personal_token}`;

    if (isNewCustomer) {
      const ownCode = database.referral_codes.find((rc) => rc.owner_customer_id === customer!.id);
      const friendDiscountStr = this.formatPounds(database.settings.friend_discount * 100);
      const referrerRewardStr = this.formatPounds(database.settings.referrer_reward * 100);
      const usedCode = !!appliedReferralCodeRow;

      messagingService.send(database, {
        customerId: customer.id,
        kind: usedCode ? 'welcome_with_code' : 'welcome_no_code',
        data: {
          name: customer.name,
          link: customerLink,
          friend_discount: friendDiscountStr,
          referrer_reward: referrerRewardStr,
        },
      });
    } else if (actualCreditUsedPence > 0) {
      const remainingActivePence = database.credits
        .filter((c) => c.customer_id === customer!.id && c.status === 'active' && c.remaining > 0)
        .reduce((sum, c) => sum + c.remaining, 0);

      messagingService.send(database, {
        customerId: customer.id,
        kind: 'credit_used',
        data: {
          used: this.formatPounds(actualCreditUsedPence),
          balance: this.formatPounds(remainingActivePence),
        },
      });
    }

    return {
      saleId,
      customerName: customer.name,
      customerPhone: this.formatUkPhone(customer.phone),
      isNewCustomer,
      receiptRef: cleanReceiptRef,
      billAmountPounds: this.penceToPounds(billAmountPence),
      discountAmountPounds: this.penceToPounds(friendDiscountPence),
      creditUsedPounds: this.penceToPounds(actualCreditUsedPence),
      finalAmountPounds: this.penceToPounds(billAmountPence - friendDiscountPence - actualCreditUsedPence),
      referralCodeUsed: appliedReferralCodeRow?.code || null,
      referrerName: referrerCustomer?.name || null,
      referrerReturnPounds: this.penceToPounds(referrerReturnPence),
      messagesSent: database.messages.slice(0, 2),
    };
  }

  public static runDailyJob(database: DatabaseSchema): { expired: number; remindersSent: number } {
    const now = new Date();
    const settings = database.settings;
    let expiredCount = 0;
    let remindersSentCount = 0;

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

    const reminderDays = settings.reminder_days_before !== undefined ? settings.reminder_days_before : 7;
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
              messagingService.send(database, {
                customerId: cust.id,
                kind: 'credit_expiring',
                data: {
                  amount: this.formatPounds(credit.remaining),
                  expiry: this.formatShortDate(expDate.toISOString()),
                },
              });
            }
          }
        }
      }
    }

    database.audit_log.unshift({
      id: crypto.randomUUID(),
      staff_id: 'system',
      action: 'daily_job_executed',
      details: { expired: expiredCount, remindersSent: remindersSentCount },
      created_at: new Date().toISOString(),
    });

    return { expired: expiredCount, remindersSent: remindersSentCount };
  }
}

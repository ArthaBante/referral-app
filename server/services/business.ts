import { DatabaseSchema, Customer, ReferralCode, Sale, Credit, Settings, ReferralUse } from '../db.ts';
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
    referrer_points: number;
    friend_points: number;
    min_spend: number;
    points_expiry_days: number;
    referral_limit: number | null;
    reminder_days_before: number;
    shop_name: string;
  } {
    if (!input || typeof input !== 'object') {
      throw new Error('Invalid settings input.');
    }

    const referrer_points = Number(input.referrer_points);
    if (isNaN(referrer_points) || referrer_points < 1) {
      throw new Error('Points for each new friend must be at least 1.');
    }

    const friend_points = Number(input.friend_points);
    if (isNaN(friend_points) || friend_points < 1) {
      throw new Error('Welcome points must be at least 1.');
    }

    const min_spend = Number(input.min_spend);
    if (isNaN(min_spend) || min_spend < 1) {
      throw new Error('Minimum spend must be at least £1.');
    }

    const points_expiry_days = Number(input.points_expiry_days ?? input.expiry_days ?? 365);
    if (isNaN(points_expiry_days) || points_expiry_days < 1) {
      throw new Error('Points expiry days must be at least 1.');
    }

    let referral_limit: number | null = null;
    if (input.referral_limit !== undefined && input.referral_limit !== null && String(input.referral_limit).trim() !== '') {
      const lim = Number(input.referral_limit);
      if (isNaN(lim) || lim < 1 || !Number.isInteger(lim)) {
        throw new Error('Referral limit must be a positive number or empty.');
      }
      referral_limit = lim;
    }

    const reminder_days_before = Number(input.reminder_days_before ?? 7);
    if (isNaN(reminder_days_before) || reminder_days_before < 0 || reminder_days_before > 30) {
      throw new Error('Reminder days before expiry must be between 0 and 30.');
    }

    const shop_name = input.shop_name !== undefined ? String(input.shop_name).trim() : 'Your Business';
    if (input.shop_name !== undefined && (!shop_name || shop_name.length > 60)) {
      throw new Error('Shop name is required and must be between 1 and 60 characters.');
    }

    return {
      scheme_enabled: typeof input.scheme_enabled === 'boolean' ? input.scheme_enabled : undefined,
      referrer_points,
      friend_points,
      min_spend,
      points_expiry_days,
      referral_limit,
      reminder_days_before,
      shop_name: shop_name || 'Your Business',
    };
  }

  public static validateReferralCode(
    database: DatabaseSchema,
    codeStr: string,
    buyerPhone: string,
    billAmountPounds?: number
  ): {
    valid: boolean;
    reason?: string;
    referralCode?: ReferralCode;
    ownerCustomer?: Customer;
    friendPoints?: number;
    referrerPoints?: number;
  } {
    const cleanCode = codeStr.trim().toUpperCase();

    const referralCode = database.referral_codes.find((rc) => rc.code === cleanCode);
    if (!referralCode) {
      return { valid: false, reason: 'Code not found' };
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
      return { valid: false, reason: 'You cannot use your own referral code' };
    }

    const existingBuyer = database.customers.find((c) => c.phone === normalizedBuyerPhone);
    if (existingBuyer) {
      return { valid: false, reason: 'Only for new customers' };
    }

    if (billAmountPounds !== undefined) {
      const minSpend = database.settings.min_spend ?? 10;
      if (billAmountPounds < minSpend) {
        return { valid: false, reason: `Spend at least £${minSpend} to use a code` };
      }
    }

    if (database.settings.referral_limit !== null && database.settings.referral_limit !== undefined) {
      const usesCount = database.referral_uses.filter((u) => u.referrer_customer_id === ownerCustomer.id).length;
      if (usesCount >= database.settings.referral_limit) {
        return { valid: false, reason: 'This code has reached its referral limit' };
      }
    }

    return {
      valid: true,
      referralCode,
      ownerCustomer,
      friendPoints: database.settings.friend_points,
      referrerPoints: database.settings.referrer_points,
    };
  }

  public static getTotalPoints(database: DatabaseSchema, customerId: string): number {
    const now = new Date();
    return database.credits
      .filter((c) => c.customer_id === customerId && c.remaining > 0 && (!c.expires_at || new Date(c.expires_at) > now))
      .reduce((sum, c) => sum + c.remaining, 0);
  }

  public static getFriendsReferredCount(database: DatabaseSchema, customerId: string): number {
    return database.referral_uses.filter((u) => u.referrer_customer_id === customerId).length;
  }

  public static async getCustomerPageData(database: DatabaseSchema, token: string) {
    const customer = database.customers.find((c) => c.personal_token === token);
    if (!customer) {
      throw new Error('Customer not found or invalid token');
    }

    const referralCode = database.referral_codes.find((rc) => rc.owner_customer_id === customer.id);

    const now = new Date();
    const activeLots = database.credits
      .filter((c) => c.customer_id === customer.id && c.remaining > 0 && (!c.expires_at || new Date(c.expires_at) > now))
      .map((c) => ({
        id: c.id,
        points: c.points,
        remaining: c.remaining,
        source: c.source,
        expiresAt: c.expires_at,
        daysLeft: c.expires_at
          ? Math.max(0, Math.ceil((new Date(c.expires_at).getTime() - now.getTime()) / 86400000))
          : null,
      }));

    const totalPoints = this.getTotalPoints(database, customer.id);
    const friendsReferred = this.getFriendsReferredCount(database, customer.id);

    const appUrl = process.env.APP_URL || '';
    const customerPageUrl = `${appUrl}/customer/${customer.personal_token}`;
    const personalQrDataUri = await QRCode.toDataURL(customerPageUrl, { width: 280, margin: 2 });

    let referralQrDataUri: string | null = null;
    let whatsappShareUrl: string = '';
    const friendPoints = database.settings.friend_points;
    const referrerPoints = database.settings.referrer_points;
    const minSpendPounds = database.settings.min_spend;

    if (referralCode) {
      referralQrDataUri = await QRCode.toDataURL(referralCode.code, { width: 240, margin: 2 });
      const promoMsg = `Use my code ${referralCode.code} at ${database.settings.shop_name} on your first visit and get ${friendPoints} welcome points! (min spend £${minSpendPounds})`;
      whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(promoMsg)}`;
    }

    const firstName = customer.name.split(' ')[0] || customer.name;

    return {
      shopName: database.settings.shop_name,
      firstName,
      fullName: customer.name,
      personalToken: customer.personal_token,
      personalQrDataUri,
      totalPoints,
      friendsReferred,
      activeLots,
      referralCode: referralCode
        ? {
            code: referralCode.code,
            qrDataUri: referralQrDataUri,
            whatsappShareUrl,
            friendPoints,
            referrerPoints,
            minSpendPounds,
          }
        : null,
      marketingConsent: customer.marketing_consent && !customer.opted_out_at,
      optedOut: !!customer.opted_out_at,
    };
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

    if (referralCode) {
      const check = this.validateReferralCode(database, referralCode, normalizedPhone, Number(billAmountPounds));
      if (!check.valid) {
        throw new Error(check.reason || 'Invalid referral code');
      }
      appliedReferralCodeRow = check.referralCode!;
      referrerCustomer = check.ownerCustomer!;
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

      let uniqueCode = this.generateReferralCode();
      while (database.referral_codes.some((rc) => rc.code === uniqueCode)) {
        uniqueCode = this.generateReferralCode();
      }

      database.referral_codes.push({
        id: crypto.randomUUID(),
        code: uniqueCode,
        owner_customer_id: newCustId,
        created_at: new Date().toISOString(),
      });
    }

    if (!customer) {
      throw new Error('Customer record could not be established.');
    }

    const saleId = crypto.randomUUID();
    const saleRecord: Sale = {
      id: saleId,
      customer_id: customer.id,
      receipt_ref: cleanReceiptRef,
      bill_amount: billAmountPence,
      discount_amount: 0,
      referral_code_id: appliedReferralCodeRow ? appliedReferralCodeRow.id : null,
      staff_id: staffId,
      created_at: new Date().toISOString(),
    };
    database.sales.push(saleRecord);

    const pointsExpiryDays = database.settings.points_expiry_days || 365;
    const expiresAt = new Date(Date.now() + pointsExpiryDays * 86400000).toISOString();

    let friendPointsEarned = 0;
    let referrerPointsEarned = 0;
    let referrerTotalPoints = 0;

    if (appliedReferralCodeRow && referrerCustomer) {
      friendPointsEarned = database.settings.friend_points;
      referrerPointsEarned = database.settings.referrer_points;

      // Friend welcome points lot
      database.credits.push({
        id: crypto.randomUUID(),
        customer_id: customer.id,
        points: friendPointsEarned,
        remaining: friendPointsEarned,
        source: 'welcome',
        source_sale_id: saleId,
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
      });

      // Referrer points lot
      database.credits.push({
        id: crypto.randomUUID(),
        customer_id: referrerCustomer.id,
        points: referrerPointsEarned,
        remaining: referrerPointsEarned,
        source: 'referral',
        source_sale_id: saleId,
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
      });

      // Record referral use
      database.referral_uses.push({
        id: crypto.randomUUID(),
        code_id: appliedReferralCodeRow.id,
        referrer_customer_id: referrerCustomer.id,
        friend_customer_id: customer.id,
        sale_id: saleId,
        referrer_points: referrerPointsEarned,
        friend_points: friendPointsEarned,
        created_at: new Date().toISOString(),
      });

      referrerTotalPoints = this.getTotalPoints(database, referrerCustomer.id);

      const appUrl = process.env.APP_URL || '';
      messagingService.send(database, {
        customerId: referrerCustomer.id,
        kind: 'referral_return',
        data: {
          amount: referrerPointsEarned,
          points_balance: referrerTotalPoints,
          link: `${appUrl}/customer/${referrerCustomer.personal_token}`,
        },
      });
    }

    const appUrl = process.env.APP_URL || '';
    const customerLink = `${appUrl}/customer/${customer.personal_token}`;

    if (isNewCustomer) {
      messagingService.send(database, {
        customerId: customer.id,
        kind: appliedReferralCodeRow ? 'welcome_with_code' : 'welcome_no_code',
        data: {
          name: customer.name,
          link: customerLink,
          friend_points: database.settings.friend_points,
          referrer_points: database.settings.referrer_points,
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
      finalAmountPounds: this.penceToPounds(billAmountPence),
      referralCodeUsed: appliedReferralCodeRow?.code || null,
      friendPointsGiven: friendPointsEarned,
      referrerName: referrerCustomer?.name || null,
      referrerPointsGiven: referrerPointsEarned,
      referrerTotalPoints,
    };
  }

  public static adjustPoints(
    database: DatabaseSchema,
    customerId: string,
    pointsDelta: number,
    reason: string,
    staffId: string
  ) {
    if (!reason || !reason.trim()) {
      throw new Error('Reason is required for manual points adjustment');
    }

    const customer = database.customers.find((c) => c.id === customerId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    const pointsExpiryDays = database.settings.points_expiry_days || 365;
    const expiresAt = new Date(Date.now() + pointsExpiryDays * 86400000).toISOString();

    if (pointsDelta > 0) {
      database.credits.push({
        id: crypto.randomUUID(),
        customer_id: customer.id,
        points: pointsDelta,
        remaining: pointsDelta,
        source: 'manual',
        source_sale_id: null,
        expires_at: expiresAt,
        reason: reason.trim(),
        created_by_staff_id: staffId,
        created_at: new Date().toISOString(),
      });
    } else if (pointsDelta < 0) {
      let needed = Math.abs(pointsDelta);
      const activeLots = database.credits
        .filter((c) => c.customer_id === customer.id && c.remaining > 0)
        .sort((a, b) => new Date(a.expires_at || 0).getTime() - new Date(b.expires_at || 0).getTime());

      for (const lot of activeLots) {
        if (needed <= 0) break;
        const deduct = Math.min(lot.remaining, needed);
        lot.remaining -= deduct;
        needed -= deduct;
      }
    }

    database.audit_log.unshift({
      id: crypto.randomUUID(),
      staff_id: staffId,
      action: 'points_adjusted',
      details: { customerId, customerName: customer.name, pointsDelta, reason: reason.trim() },
      created_at: new Date().toISOString(),
    });

    return { success: true, newTotalPoints: this.getTotalPoints(database, customer.id) };
  }

  public static runDailyJob(database: DatabaseSchema): { expired: number; remindersSent: number } {
    const now = new Date();
    const settings = database.settings;
    let expiredCount = 0;
    let remindersSentCount = 0;

    for (const lot of database.credits) {
      if (lot.remaining > 0 && lot.expires_at) {
        const expDate = new Date(lot.expires_at);
        if (expDate <= now) {
          lot.remaining = 0;
          expiredCount++;
        }
      }
    }

    const reminderDays = settings.reminder_days_before !== undefined ? settings.reminder_days_before : 7;
    if (reminderDays > 0) {
      const reminderWindowMs = reminderDays * 86400000;
      for (const lot of database.credits) {
        if (lot.remaining > 0 && lot.expires_at && !lot.expiring_notified) {
          const expDate = new Date(lot.expires_at);
          const msUntilExpiry = expDate.getTime() - now.getTime();
          if (msUntilExpiry > 0 && msUntilExpiry <= reminderWindowMs) {
            lot.expiring_notified = true;
            remindersSentCount++;

            const cust = database.customers.find((c) => c.id === lot.customer_id);
            if (cust) {
              messagingService.send(database, {
                customerId: cust.id,
                kind: 'credit_expiring',
                data: {
                  amount: lot.remaining,
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

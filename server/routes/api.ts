import express, { Request, Response, NextFunction } from 'express';
import { db, Customer, ReferralCode, Sale, Credit, Settings, Staff, DatabaseSchema, MessageTemplate, MessageTemplateKind } from '../db.ts';
import { AuthService, UserSession } from '../services/auth.ts';
import { BusinessService } from '../services/business.ts';
import { messagingService, validateTemplate, TEMPLATE_CONFIG } from '../services/messaging.ts';
import crypto from 'crypto';
import QRCode from 'qrcode';

export const apiRouter = express.Router();

function getStaffSession(req: Request): UserSession | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  return AuthService.getSession(token);
}

function requireStaff(req: Request, res: Response, next: NextFunction) {
  const session = getStaffSession(req);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  (req as any).session = session;
  next();
}

function requireOwner(req: Request, res: Response, next: NextFunction) {
  const session = getStaffSession(req);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  if (session.staff.role !== 'owner') {
    return res.status(403).json({ error: 'Access denied: Owner privileges required.' });
  }
  (req as any).session = session;
  next();
}

// -------------------------------------------------------------
// AUTH ROUTES
// -------------------------------------------------------------

apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const snapshot = db.getSnapshot();
    const staff = snapshot.staff.find((s) => s.username.toLowerCase() === username.trim().toLowerCase());

    if (!staff || !staff.active) {
      return res.status(401).json({ error: 'Invalid username or account is deactivated' });
    }

    const valid = await AuthService.verifyPassword(password, staff.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const session = AuthService.createSession(staff);
    return res.json({
      token: session.token,
      staff: session.staff,
      expiresAt: session.expiresAt,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/auth/logout', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    AuthService.revokeSession(token);
  }
  return res.json({ success: true });
});

apiRouter.get('/auth/me', (req: Request, res: Response) => {
  const session = getStaffSession(req);
  if (!session) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  return res.json({ staff: session.staff });
});

// -------------------------------------------------------------
// PUBLIC CUSTOMER PORTAL (TOKEN-BASED)
// -------------------------------------------------------------

apiRouter.get('/customer/by-token/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const snapshot = db.getSnapshot();

    const customer = snapshot.customers.find((c) => c.personal_token === token);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found or invalid token' });
    }

    const referralCode = snapshot.referral_codes.find((rc) => rc.owner_customer_id === customer.id);

    const now = new Date();
    const activeLots = snapshot.credits
      .filter((c) => c.customer_id === customer.id && c.status === 'active' && c.remaining > 0)
      .map((c) => ({
        id: c.id,
        amountPounds: BusinessService.penceToPounds(c.amount),
        remainingPounds: BusinessService.penceToPounds(c.remaining),
        source: c.source,
        expiresAt: c.expires_at,
        daysLeft: c.expires_at
          ? Math.max(0, Math.ceil((new Date(c.expires_at).getTime() - now.getTime()) / 86400000))
          : null,
      }));

    const totalActiveCreditPence = activeLots.reduce((sum, c) => sum + BusinessService.poundsToPence(c.remainingPounds), 0);

    const appUrl = process.env.APP_URL || '';
    const customerPageUrl = `${appUrl}/customer/${customer.personal_token}`;

    const personalQrDataUri = await QRCode.toDataURL(customerPageUrl, { width: 280, margin: 2 });

    let referralQrDataUri: string | null = null;
    let whatsappShareUrl: string = '';
    const friendDiscountPounds = snapshot.settings.friend_discount;
    const referrerRewardPounds = referralCode ? BusinessService.penceToPounds(referralCode.referrer_return_amount) : snapshot.settings.referrer_reward;
    const minSpendPounds = snapshot.settings.min_spend;

    if (referralCode) {
      referralQrDataUri = await QRCode.toDataURL(referralCode.code, { width: 240, margin: 2 });
      const promoMsg = `Use my code ${referralCode.code} at ${snapshot.settings.shop_name} and get £${friendDiscountPounds} off your first visit (min spend £${minSpendPounds}).`;
      whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(promoMsg)}`;
    }

    const firstName = customer.name.split(' ')[0] || customer.name;

    return res.json({
      shopName: snapshot.settings.shop_name,
      firstName,
      fullName: customer.name,
      personalToken: customer.personal_token,
      personalQrDataUri,
      totalActiveCreditPounds: BusinessService.penceToPounds(totalActiveCreditPence),
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
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/customer/opt-out/:token', (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    db.transaction((database) => {
      const customer = database.customers.find((c) => c.personal_token === token);
      if (!customer) {
        throw new Error('Customer not found');
      }
      customer.marketing_consent = false;
      customer.opted_out_at = new Date().toISOString();
      return customer;
    });
    return res.json({ success: true, message: 'You have been opted out from marketing offers.' });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// CASHIER / COUNTER SALE FLOWS
// -------------------------------------------------------------

apiRouter.get('/cashier/lookup-customer', requireStaff, (req: Request, res: Response) => {
  try {
    const phoneInput = req.query.phone as string;
    if (!phoneInput) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const normalizedPhone = BusinessService.normalizeUkPhone(phoneInput);
    const snapshot = db.getSnapshot();
    const customer = snapshot.customers.find((c) => c.phone === normalizedPhone);

    if (!customer) {
      return res.json({
        exists: false,
        formattedPhone: BusinessService.formatUkPhone(normalizedPhone),
      });
    }

    const activeCreditPence = snapshot.credits
      .filter((c) => c.customer_id === customer.id && c.status === 'active' && c.remaining > 0)
      .reduce((sum, c) => sum + c.remaining, 0);

    return res.json({
      exists: true,
      customerId: customer.id,
      name: customer.name,
      formattedPhone: BusinessService.formatUkPhone(customer.phone),
      activeCreditPounds: BusinessService.penceToPounds(activeCreditPence),
      marketingConsent: customer.marketing_consent && !customer.opted_out_at,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/cashier/validate-referral', requireStaff, (req: Request, res: Response) => {
  try {
    const { code, buyerPhone, billAmountPounds } = req.body;
    if (!code || !buyerPhone) {
      return res.status(400).json({ error: 'Code and buyer phone are required' });
    }

    const billAmountPence = billAmountPounds !== undefined ? BusinessService.poundsToPence(Number(billAmountPounds)) : undefined;
    const snapshot = db.getSnapshot();
    const check = BusinessService.validateReferralCode(snapshot, code, buyerPhone, billAmountPence);

    if (!check.valid) {
      return res.json({
        valid: false,
        reason: check.reason,
      });
    }

    const friendDiscountPounds = snapshot.settings.friend_discount;
    const referrerRewardPounds = check.referralCode ? BusinessService.penceToPounds(check.referralCode.referrer_return_amount) : snapshot.settings.referrer_reward;

    return res.json({
      valid: true,
      code: check.referralCode?.code,
      ownerName: check.ownerCustomer?.name,
      friendDiscountPounds,
      referrerRewardPounds,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/cashier/request-otp', requireStaff, (req: Request, res: Response) => {
  try {
    const { customerId } = req.body;
    if (!customerId) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    const result = db.transaction((database) => {
      return BusinessService.requestOtp(database, customerId);
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/cashier/verify-otp', requireStaff, (req: Request, res: Response) => {
  try {
    const { customerId, otp } = req.body;
    if (!customerId || !otp) {
      return res.status(400).json({ error: 'Customer ID and OTP are required' });
    }

    const result = db.transaction((database) => {
      return BusinessService.verifyOtp(database, customerId, otp);
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/cashier/verify-personal-qr', requireStaff, (req: Request, res: Response) => {
  try {
    const { customerId, scannedTokenOrUrl } = req.body;
    if (!customerId || !scannedTokenOrUrl) {
      return res.status(400).json({ error: 'Customer ID and scanned token are required' });
    }

    const result = db.transaction((database) => {
      return BusinessService.verifyPersonalQr(database, customerId, scannedTokenOrUrl);
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/cashier/calculate-bill', requireStaff, (req: Request, res: Response) => {
  try {
    const { phone, billAmountPounds, referralCode, useCredit, verified } = req.body;
    if (!phone || billAmountPounds === undefined) {
      return res.status(400).json({ error: 'Phone and bill amount are required' });
    }

    const normalizedPhone = BusinessService.normalizeUkPhone(phone);
    const billAmountPence = BusinessService.poundsToPence(Number(billAmountPounds));
    const snapshot = db.getSnapshot();

    let discountPence = 0;
    let creditUsedPence = 0;
    let instructions = '';

    const existingCustomer = snapshot.customers.find((c) => c.phone === normalizedPhone);

    if (referralCode && !existingCustomer) {
      const check = BusinessService.validateReferralCode(snapshot, referralCode, normalizedPhone, billAmountPence);
      if (check.valid && check.ownerCustomer) {
        discountPence = snapshot.settings.friend_discount * 100;
        const discountPoundsStr = (snapshot.settings.friend_discount).toFixed(2);
        const returnPoundsStr = BusinessService.penceToPounds(check.referralCode?.referrer_return_amount || snapshot.settings.referrer_reward * 100).toFixed(2);
        instructions = `Code valid. Take £${discountPoundsStr} off at the till. ${check.ownerCustomer.name} gets £${returnPoundsStr} back.`;
      } else if (!check.valid) {
        throw new Error(check.reason || 'Invalid referral code');
      }
    }

    if (useCredit && existingCustomer && verified) {
      const effectiveBill = billAmountPence - discountPence;
      const usable = BusinessService.calculateUsableCredit(snapshot, existingCustomer.id, effectiveBill);
      creditUsedPence = usable.maxUsableCredit;
      const creditPounds = BusinessService.penceToPounds(creditUsedPence);
      if (creditPounds > 0) {
        instructions = `Take £${creditPounds.toFixed(2)} credit off at the till.`;
      }
    }

    const finalPayablePence = billAmountPence - discountPence - creditUsedPence;

    return res.json({
      billAmountPounds: BusinessService.penceToPounds(billAmountPence),
      discountAmountPounds: BusinessService.penceToPounds(discountPence),
      creditUsedPounds: BusinessService.penceToPounds(creditUsedPence),
      finalPayablePounds: BusinessService.penceToPounds(Math.max(0, finalPayablePence)),
      instructions: instructions || 'No referral discount or credit applied.',
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/cashier/save-sale', requireStaff, (req: Request, res: Response) => {
  try {
    const staffSession = (req as any).session as UserSession;
    const result = db.transaction((database) => {
      return BusinessService.saveSale(database, req.body, staffSession.staff.id);
    });
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

apiRouter.get('/cashier/find-sale', requireStaff, (req: Request, res: Response) => {
  try {
    const q = ((req.query.query as string) || '').trim().toLowerCase();
    const snapshot = db.getSnapshot();

    let sales = snapshot.sales.map((s) => {
      const customer = snapshot.customers.find((c) => c.id === s.customer_id);
      return {
        ...s,
        customerName: customer?.name || 'Unknown',
        customerPhone: customer ? BusinessService.formatUkPhone(customer.phone) : '',
        billAmountPounds: BusinessService.penceToPounds(s.bill_amount),
        creditUsedPounds: BusinessService.penceToPounds(s.credit_used),
      };
    });

    if (q) {
      sales = sales.filter(
        (s) =>
          (s.receipt_ref && s.receipt_ref.toLowerCase().includes(q)) ||
          s.customerPhone.includes(q) ||
          s.customerName.toLowerCase().includes(q)
      );
    }

    sales.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return res.json({ sales });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// OWNER SCREENS & MANAGEMENT
// -------------------------------------------------------------

apiRouter.get('/owner/dashboard', requireOwner, (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;
    const snapshot = db.getSnapshot();

    const fromDate = from ? new Date(from as string) : new Date(0);
    const toDate = to ? new Date(to as string) : new Date(8640000000000000);

    const filteredSales = snapshot.sales.filter((s) => {
      const dt = new Date(s.created_at);
      return dt >= fromDate && dt <= toDate;
    });

    const totalCustomers = snapshot.customers.length;
    const referralCustomers = snapshot.customers.filter((c) => c.referred_by_customer_id).length;
    const referralCodesUsed = snapshot.referral_codes.filter((rc) => rc.status === 'used').length;

    let returnsPaidPence = 0;
    let discountsGivenPence = 0;
    let creditOutstandingPence = 0;
    let creditExpiredPence = 0;

    for (const c of snapshot.credits) {
      if (c.source === 'referral_return') {
        returnsPaidPence += c.amount;
      }
      if (c.status === 'active') {
        creditOutstandingPence += c.remaining;
      } else if (c.status === 'expired') {
        creditExpiredPence += c.amount;
      }
    }

    for (const s of filteredSales) {
      if (s.discount_amount) {
        discountsGivenPence += s.discount_amount;
      }
    }

    const creditRedeemedPence = snapshot.credit_redemptions.reduce((sum, r) => sum + r.amount, 0);

    const referredCustomerIds = new Set(
      snapshot.customers.filter((c) => c.referred_by_customer_id).map((c) => c.id)
    );
    const salesFromReferredCustomersPence = filteredSales
      .filter((s) => referredCustomerIds.has(s.customer_id))
      .reduce((sum, s) => sum + s.bill_amount, 0);

    const referrerCounts: Record<string, number> = {};
    for (const rc of snapshot.referral_codes) {
      if (rc.status === 'used') {
        referrerCounts[rc.owner_customer_id] = (referrerCounts[rc.owner_customer_id] || 0) + 1;
      }
    }

    const topReferrers = Object.entries(referrerCounts)
      .map(([custId, count]) => {
        const cust = snapshot.customers.find((c) => c.id === custId);
        return {
          customerId: custId,
          name: cust?.name || 'Customer',
          phone: cust ? BusinessService.formatUkPhone(cust.phone) : '',
          referralsCount: count,
        };
      })
      .sort((a, b) => b.referralsCount - a.referralsCount)
      .slice(0, 10);

    return res.json({
      totalCustomers,
      referralCustomers,
      referralCodesUsed,
      discountsGivenPounds: BusinessService.penceToPounds(discountsGivenPence),
      returnsPaidPounds: BusinessService.penceToPounds(returnsPaidPence),
      creditRedeemedPounds: BusinessService.penceToPounds(creditRedeemedPence),
      creditOutstandingPounds: BusinessService.penceToPounds(creditOutstandingPence),
      creditExpiredPounds: BusinessService.penceToPounds(creditExpiredPence),
      salesFromReferredCustomersPounds: BusinessService.penceToPounds(salesFromReferredCustomersPence),
      topReferrers,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/owner/settings', requireOwner, (req: Request, res: Response) => {
  const snapshot = db.getSnapshot();
  return res.json(snapshot.settings);
});

apiRouter.post('/owner/settings', requireOwner, (req: Request, res: Response) => {
  try {
    const session = (req as any).session as UserSession;
    const body = req.body;

    const friend_discount = Number(body.friend_discount);
    if (isNaN(friend_discount) || friend_discount < 1) {
      return res.status(400).json({ error: 'Friend discount must be at least £1.' });
    }

    const referrer_reward = Number(body.referrer_reward);
    if (isNaN(referrer_reward) || referrer_reward < 1) {
      return res.status(400).json({ error: 'Referrer reward must be at least £1.' });
    }

    const min_spend = Number(body.min_spend);
    if (isNaN(min_spend) || min_spend < 1) {
      return res.status(400).json({ error: 'Minimum spend must be at least £1.' });
    }

    if (friend_discount >= min_spend) {
      return res.status(400).json({ error: 'Friend discount must be less than minimum spend.' });
    }

    const expiry_days = Number(body.expiry_days);
    if (isNaN(expiry_days) || expiry_days < 7 || expiry_days > 365) {
      return res.status(400).json({ error: 'Expiry days must be between 7 and 365.' });
    }

    const reminder_days_before = Number(body.reminder_days_before);
    if (isNaN(reminder_days_before) || reminder_days_before < 0 || reminder_days_before > 30) {
      return res.status(400).json({ error: 'Reminder days before expiry must be between 0 and 30.' });
    }

    const max_credit_share = Number(body.max_credit_share);
    if (isNaN(max_credit_share) || max_credit_share < 1 || max_credit_share > 100) {
      return res.status(400).json({ error: 'Max credit share must be between 1 and 100%.' });
    }

    const shop_name = (body.shop_name || '').trim();
    if (!shop_name || shop_name.length > 60) {
      return res.status(400).json({ error: 'Shop name is required and must be between 1 and 60 characters.' });
    }

    const updated = db.transaction((database) => {
      const oldSettings = { ...database.settings };

      database.settings = {
        ...database.settings,
        scheme_enabled: typeof body.scheme_enabled === 'boolean' ? body.scheme_enabled : database.settings.scheme_enabled,
        friend_discount,
        referrer_reward,
        min_spend,
        expiry_days,
        reminder_days_before,
        max_credit_share,
        shop_name,
        updated_at: new Date().toISOString(),
        updated_by: session.staff.name,
      };

      database.audit_log.unshift({
        id: crypto.randomUUID(),
        staff_id: session.staff.id,
        action: 'settings_updated',
        details: { oldSettings, newSettings: database.settings },
        created_at: new Date().toISOString(),
      });

      return database.settings;
    });

    return res.json({ success: true, settings: updated });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

apiRouter.get('/owner/customers', requireOwner, (req: Request, res: Response) => {
  try {
    const q = ((req.query.query as string) || '').trim().toLowerCase();
    const snapshot = db.getSnapshot();

    const list = snapshot.customers.map((c) => {
      const activeCreditPence = snapshot.credits
        .filter((cr) => cr.customer_id === c.id && cr.status === 'active' && cr.remaining > 0)
        .reduce((sum, cr) => sum + cr.remaining, 0);

      const referralCode = snapshot.referral_codes.find((rc) => rc.owner_customer_id === c.id);

      return {
        id: c.id,
        name: c.name,
        phone: BusinessService.formatUkPhone(c.phone),
        activeCreditPounds: BusinessService.penceToPounds(activeCreditPence),
        marketingConsent: c.marketing_consent && !c.opted_out_at,
        joinedDate: c.created_at,
        referralCode: referralCode?.code || 'None',
        referralCodeUsed: referralCode?.status === 'used',
        promisedReturnPounds: referralCode ? BusinessService.penceToPounds(referralCode.referrer_return_amount) : 0,
        personalToken: c.personal_token,
      };
    });

    const filtered = q
      ? list.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.referralCode.toLowerCase().includes(q))
      : list;

    filtered.sort((a, b) => new Date(b.joinedDate).getTime() - new Date(a.joinedDate).getTime());

    return res.json({ customers: filtered });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/owner/customers/:id', requireOwner, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const snapshot = db.getSnapshot();

    const customer = snapshot.customers.find((c) => c.id === id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const referralCode = snapshot.referral_codes.find((rc) => rc.owner_customer_id === customer.id);
    const sales = snapshot.sales
      .filter((s) => s.customer_id === customer.id)
      .map((s) => ({
        ...s,
        billAmountPounds: BusinessService.penceToPounds(s.bill_amount),
        creditUsedPounds: BusinessService.penceToPounds(s.credit_used),
      }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const credits = snapshot.credits
      .filter((c) => c.customer_id === customer.id)
      .map((c) => ({
        ...c,
        amountPounds: BusinessService.penceToPounds(c.amount),
        remainingPounds: BusinessService.penceToPounds(c.remaining),
      }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return res.json({
      customer: {
        ...customer,
        phone: BusinessService.formatUkPhone(customer.phone),
      },
      referralCode,
      sales,
      credits,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/owner/customers/:id/credit-adjustment', requireOwner, (req: Request, res: Response) => {
  try {
    const session = (req as any).session as UserSession;
    const { id } = req.params;
    const { amountPounds, reason } = req.body;

    if (!amountPounds || !reason || !reason.trim()) {
      return res.status(400).json({ error: 'Adjustment amount (£) and a valid reason are required.' });
    }

    const amountPence = BusinessService.poundsToPence(Number(amountPounds));
    if (amountPence === 0) {
      return res.status(400).json({ error: 'Adjustment cannot be zero' });
    }

    const result = db.transaction((database) => {
      const customer = database.customers.find((c) => c.id === id);
      if (!customer) {
        throw new Error('Customer not found');
      }

      const now = new Date();
      if (amountPence > 0) {
        const expiryDays = database.settings.expiry_days || 90;
        const expiresAt = new Date(now.getTime() + expiryDays * 86400000).toISOString();

        database.credits.push({
          id: crypto.randomUUID(),
          customer_id: customer.id,
          source_sale_id: null,
          amount: amountPence,
          remaining: amountPence,
          status: 'active',
          expires_at: expiresAt,
          source: 'manual',
          settings_snapshot: { expiry_days: expiryDays },
          reason: reason.trim(),
          created_by_staff_id: session.staff.id,
          created_at: now.toISOString(),
        });
      } else {
        let deductNeeded = Math.abs(amountPence);
        const activeLots = database.credits
          .filter((c) => c.customer_id === customer.id && c.status === 'active' && c.remaining > 0)
          .sort((a, b) => new Date(a.expires_at || 0).getTime() - new Date(b.expires_at || 0).getTime());

        for (const lot of activeLots) {
          if (deductNeeded <= 0) break;
          const take = Math.min(lot.remaining, deductNeeded);
          lot.remaining -= take;
          deductNeeded -= take;
        }
      }

      database.audit_log.unshift({
        id: crypto.randomUUID(),
        staff_id: session.staff.id,
        action: 'manual_credit_adjustment',
        details: {
          customerId: customer.id,
          customerName: customer.name,
          amountPounds: Number(amountPounds),
          reason: reason.trim(),
        },
        created_at: now.toISOString(),
      });

      return { success: true };
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

apiRouter.delete('/owner/customers/:id', requireOwner, (req: Request, res: Response) => {
  try {
    const session = (req as any).session as UserSession;
    const { id } = req.params;

    const result = db.transaction((database) => {
      const customer = database.customers.find((c) => c.id === id);
      if (!customer) {
        throw new Error('Customer not found');
      }

      const originalName = customer.name;
      customer.name = `[Deleted Customer ${customer.id.slice(0, 6)}]`;
      customer.phone = `+447000000000`;
      customer.marketing_consent = false;
      customer.opted_out_at = new Date().toISOString();

      database.audit_log.unshift({
        id: crypto.randomUUID(),
        staff_id: session.staff.id,
        action: 'customer_anonymized_deleted',
        details: { customerId: customer.id, originalName },
        created_at: new Date().toISOString(),
      });

      return { success: true };
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

apiRouter.get('/owner/export-csv', requireOwner, (req: Request, res: Response) => {
  try {
    const snapshot = db.getSnapshot();
    const rows = [
      ['Customer ID', 'Name', 'Phone', 'Active Credit (£)', 'Offers Consent', 'Joined Date'],
    ];

    for (const c of snapshot.customers) {
      const activePence = snapshot.credits
        .filter((cr) => cr.customer_id === c.id && cr.status === 'active')
        .reduce((sum, cr) => sum + cr.remaining, 0);

      rows.push([
        c.id,
        `"${c.name.replace(/"/g, '""')}"`,
        BusinessService.formatUkPhone(c.phone),
        String(BusinessService.penceToPounds(activePence).toFixed(2)),
        c.marketing_consent && !c.opted_out_at ? 'YES' : 'NO',
        c.created_at,
      ]);
    }

    const csvContent = rows.map((r) => r.join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="reffrnd-customers.csv"');
    return res.send(csvContent);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/owner/offers/audience', requireOwner, (req: Request, res: Response) => {
  const snapshot = db.getSnapshot();
  const eligible = snapshot.customers.filter((c) => c.marketing_consent && !c.opted_out_at);
  return res.json({ eligibleCount: eligible.length, totalCustomers: snapshot.customers.length });
});

apiRouter.post('/owner/offers/send', requireOwner, (req: Request, res: Response) => {
  try {
    const session = (req as any).session as UserSession;
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Offer text is required' });
    }

    const result = db.transaction((database) => {
      const recipients = database.customers.filter((c) => c.marketing_consent && !c.opted_out_at);
      const appUrl = process.env.APP_URL || '';

      for (const cust of recipients) {
        const link = `${appUrl}/customer/${cust.personal_token}`;
        messagingService.send(database, {
          customerId: cust.id,
          kind: 'offer',
          data: {
            customBody: text.trim(),
            link,
          },
        });
      }

      database.audit_log.unshift({
        id: crypto.randomUUID(),
        staff_id: session.staff.id,
        action: 'offer_broadcast_sent',
        details: { count: recipients.length, text: text.trim() },
        created_at: new Date().toISOString(),
      });

      return { sentCount: recipients.length };
    });

    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

apiRouter.get('/owner/staff', requireOwner, (req: Request, res: Response) => {
  const snapshot = db.getSnapshot();
  const list = snapshot.staff.map((s) => ({
    id: s.id,
    name: s.name,
    username: s.username,
    role: s.role,
    active: s.active,
    createdAt: s.created_at,
  }));
  return res.json({ staff: list });
});

apiRouter.post('/owner/staff', requireOwner, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session as UserSession;
    const { name, username, password, role } = req.body;
    if (!name || !username || !password) {
      return res.status(400).json({ error: 'Name, username and password are required' });
    }

    const cleanUsername = username.trim().toLowerCase();
    const hash = await AuthService.hashPassword(password);

    const result = db.transaction((database) => {
      if (database.staff.some((s) => s.username.toLowerCase() === cleanUsername)) {
        throw new Error('Username already exists');
      }

      const newStaff: Staff = {
        id: crypto.randomUUID(),
        name: name.trim(),
        username: cleanUsername,
        password_hash: hash,
        role: role === 'owner' ? 'owner' : 'cashier',
        active: true,
        created_at: new Date().toISOString(),
      };
      database.staff.push(newStaff);

      database.audit_log.unshift({
        id: crypto.randomUUID(),
        staff_id: session.staff.id,
        action: 'staff_created',
        details: { username: cleanUsername, role: newStaff.role },
        created_at: new Date().toISOString(),
      });

      return { id: newStaff.id, name: newStaff.name, username: newStaff.username, role: newStaff.role };
    });

    return res.json({ success: true, staff: result });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

apiRouter.patch('/owner/staff/:id', requireOwner, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session as UserSession;
    const { id } = req.params;
    const { active, newPassword } = req.body;

    let newHash: string | undefined;
    if (newPassword) {
      newHash = await AuthService.hashPassword(newPassword);
    }

    const result = db.transaction((database) => {
      const staff = database.staff.find((s) => s.id === id);
      if (!staff) {
        throw new Error('Staff not found');
      }

      if (typeof active === 'boolean') {
        staff.active = active;
      }

      if (newHash) {
        staff.password_hash = newHash;
      }

      database.audit_log.unshift({
        id: crypto.randomUUID(),
        staff_id: session.staff.id,
        action: 'staff_updated',
        details: { targetStaff: staff.username, active, passwordReset: !!newHash },
        created_at: new Date().toISOString(),
      });

      return { id: staff.id, username: staff.username, active: staff.active };
    });

    return res.json({ success: true, staff: result });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

apiRouter.get('/owner/messages', requireOwner, (req: Request, res: Response) => {
  const snapshot = db.getSnapshot();
  const list = snapshot.messages.slice(0, 100);
  return res.json({ messages: list });
});

apiRouter.post('/owner/messages/:id/retry', requireOwner, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = db.transaction((database) => {
      return messagingService.retry(database, id);
    });
    return res.json({ success: true, message: result });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

apiRouter.get('/owner/message-templates', requireOwner, (req: Request, res: Response) => {
  const snapshot = db.getSnapshot();
  return res.json({
    templates: snapshot.message_templates || [],
    configs: TEMPLATE_CONFIG,
  });
});

apiRouter.post('/owner/message-templates', requireOwner, (req: Request, res: Response) => {
  try {
    const session = (req as any).session as UserSession;
    const { kind, body } = req.body;

    if (!kind) {
      return res.status(400).json({ error: 'kind is required' });
    }

    const validation = validateTemplate(kind as MessageTemplateKind, body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const updated = db.transaction((database) => {
      database.message_templates = database.message_templates || [];
      let template = database.message_templates.find((t) => t.kind === kind);
      const oldBody = template ? template.body : '';

      if (template) {
        template.body = body.trim();
        template.updated_at = new Date().toISOString();
        template.updated_by = session.staff.name;
      } else {
        template = {
          id: crypto.randomUUID(),
          kind: kind as MessageTemplateKind,
          body: body.trim(),
          updated_at: new Date().toISOString(),
          updated_by: session.staff.name,
        };
        database.message_templates.push(template);
      }

      database.audit_log.unshift({
        id: crypto.randomUUID(),
        staff_id: session.staff.id,
        action: 'message_template_updated',
        details: {
          kind,
          old_body: oldBody,
          new_body: body.trim(),
        },
        created_at: new Date().toISOString(),
      });

      return template;
    });

    return res.json({ success: true, template: updated });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/owner/message-templates/reset', requireOwner, (req: Request, res: Response) => {
  try {
    const session = (req as any).session as UserSession;
    const { kind } = req.body;

    if (!kind) {
      return res.status(400).json({ error: 'kind is required' });
    }

    const config = TEMPLATE_CONFIG[kind as MessageTemplateKind];
    if (!config) {
      return res.status(400).json({ error: `Invalid template kind: ${kind}` });
    }

    const defaultBody = config.defaultEn;

    const resetTemplate = db.transaction((database) => {
      database.message_templates = database.message_templates || [];
      let template = database.message_templates.find((t) => t.kind === kind);
      const oldBody = template ? template.body : '';

      if (template) {
        template.body = defaultBody;
        template.updated_at = new Date().toISOString();
        template.updated_by = session.staff.name;
      } else {
        const newTemplate: MessageTemplate = {
          id: crypto.randomUUID(),
          kind: kind as MessageTemplateKind,
          body: defaultBody,
          updated_at: new Date().toISOString(),
          updated_by: session.staff.name,
        };
        database.message_templates.push(newTemplate);
        template = newTemplate;
      }

      database.audit_log.unshift({
        id: crypto.randomUUID(),
        staff_id: session.staff.id,
        action: 'message_template_reset',
        details: {
          kind,
          old_body: oldBody,
          new_body: defaultBody,
        },
        created_at: new Date().toISOString(),
      });

      return template;
    });

    return res.json({ success: true, template: resetTemplate });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

apiRouter.get('/owner/audit-log', requireOwner, (req: Request, res: Response) => {
  const snapshot = db.getSnapshot();
  return res.json({ auditLog: snapshot.audit_log.slice(0, 100) });
});

apiRouter.post('/owner/run-daily-job', requireOwner, (req: Request, res: Response) => {
  try {
    const result = db.transaction((database) => {
      return BusinessService.runDailyJob(database);
    });
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});



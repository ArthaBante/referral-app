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

apiRouter.get('/shop', (req: Request, res: Response) => {
  const snapshot = db.getSnapshot();
  return res.json({ shopName: snapshot.settings.shop_name });
});

apiRouter.get('/customer/by-token/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const snapshot = db.getSnapshot();
    const data = await BusinessService.getCustomerPageData(snapshot, token);
    return res.json(data);
  } catch (err: any) {
    return res.status(404).json({ error: err.message });
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

    const totalPoints = BusinessService.getTotalPoints(snapshot, customer.id);
    const redeemPoints = snapshot.settings.redeem_points || 1000;
    const redeemPounds = snapshot.settings.redeem_pounds || 5;
    const maxOffPerBill = snapshot.settings.max_off_per_bill;

    const usableBlocksByPoints = Math.floor(totalPoints / redeemPoints);
    const maxBlocksByBill = maxOffPerBill ? Math.floor(maxOffPerBill / redeemPounds) : Infinity;
    const usableBlocks = Math.min(usableBlocksByPoints, maxBlocksByBill);
    const maxDiscountPounds = usableBlocks * redeemPounds;

    return res.json({
      exists: true,
      customerId: customer.id,
      name: customer.name,
      formattedPhone: BusinessService.formatUkPhone(customer.phone),
      totalPoints,
      usableBlocks,
      maxDiscountPounds,
      redeemPoints,
      redeemPounds,
      maxOffPerBill,
      marketingConsent: customer.marketing_consent && !customer.opted_out_at,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/cashier/send-otp', requireStaff, (req: Request, res: Response) => {
  try {
    const { customerId } = req.body;
    if (!customerId) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }
    const result = db.transaction((database) => {
      return BusinessService.sendOtpCode(database, customerId);
    });
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/cashier/verify-otp', requireStaff, (req: Request, res: Response) => {
  try {
    const { customerId, code } = req.body;
    if (!customerId || !code) {
      return res.status(400).json({ error: 'Customer ID and code are required' });
    }
    const result = db.transaction((database) => {
      return BusinessService.verifyOtpCode(database, customerId, code);
    });
    if (!result.success) {
      return res.status(400).json({ error: (result as any).error || (result as any).message });
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/cashier/confirm-qr', requireStaff, (req: Request, res: Response) => {
  try {
    const { customerId, qrData } = req.body;
    if (!customerId || !qrData) {
      return res.status(400).json({ error: 'Customer ID and QR code data are required' });
    }
    const result = db.transaction((database) => {
      return BusinessService.confirmCustomerQr(database, customerId, qrData);
    });
    return res.json(result);
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

    const snapshot = db.getSnapshot();
    const check = BusinessService.validateReferralCode(
      snapshot,
      code,
      buyerPhone,
      billAmountPounds !== undefined ? Number(billAmountPounds) : undefined
    );

    if (!check.valid) {
      return res.json({
        valid: false,
        reason: check.reason,
      });
    }

    return res.json({
      valid: true,
      code: check.referralCode?.code,
      ownerName: check.ownerCustomer?.name,
      friendPoints: check.friendPoints,
      referrerPoints: check.referrerPoints,
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
        discount_amount: s.discount_amount || 0,
        discountPounds: BusinessService.penceToPounds(s.discount_amount || 0),
        points_spent: s.points_spent || 0,
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
    const fromStr = req.query.from as string | undefined;
    const snapshot = db.getSnapshot();

    let fromTime: number | null = null;
    if (fromStr) {
      const parsed = new Date(fromStr).getTime();
      if (!isNaN(parsed)) {
        fromTime = parsed;
      }
    }

    let customers = snapshot.customers;
    if (fromTime !== null) {
      customers = customers.filter((c) => new Date(c.created_at).getTime() >= fromTime!);
    }

    const totalCustomers = customers.length;
    const referralCustomers = customers.filter((c) => c.referred_by_customer_id).length;

    let referralUses = snapshot.referral_uses;
    if (fromTime !== null) {
      referralUses = referralUses.filter((u) => new Date(u.created_at).getTime() >= fromTime!);
    }

    const referralCodesUsed = referralUses.length;
    const friendsReferredTotal = referralUses.length;

    let pointsGivenReferrals = 0;
    let welcomePointsGiven = 0;

    for (const u of referralUses) {
      pointsGivenReferrals += u.referrer_points;
      welcomePointsGiven += u.friend_points;
    }

    let credits = snapshot.credits;
    if (fromTime !== null) {
      credits = credits.filter((c) => new Date(c.created_at).getTime() >= fromTime!);
    }

    let pointsGivenPurchases = 0;
    for (const c of credits) {
      if (c.source === 'purchase') {
        pointsGivenPurchases += c.points;
      }
    }

    const now = new Date();
    let pointsOutstanding = 0;
    for (const c of snapshot.credits) {
      if (c.remaining > 0 && (!c.expires_at || new Date(c.expires_at) > now)) {
        pointsOutstanding += c.remaining;
      }
    }

    const referrerCounts: Record<string, number> = {};
    for (const u of referralUses) {
      referrerCounts[u.referrer_customer_id] = (referrerCounts[u.referrer_customer_id] || 0) + 1;
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
      friendsReferredTotal,
      pointsGivenReferrals,
      welcomePointsGiven,
      pointsGivenPurchases,
      pointsOutstanding,
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
    const validated = BusinessService.validateSettings(req.body);

    const updated = db.transaction((database) => {
      const oldSettings = { ...database.settings };

      database.settings = {
        ...database.settings,
        ...validated,
        shop_name: validated.shop_name || database.settings.shop_name,
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
      const totalPoints = BusinessService.getTotalPoints(snapshot, c.id);
      const friendsReferred = BusinessService.getFriendsReferredCount(snapshot, c.id);
      const referralCode = snapshot.referral_codes.find((rc) => rc.owner_customer_id === c.id);

      return {
        id: c.id,
        name: c.name,
        phone: BusinessService.formatUkPhone(c.phone),
        totalPoints,
        friendsReferred,
        marketingConsent: c.marketing_consent && !c.opted_out_at,
        joinedDate: c.created_at,
        referralCode: referralCode?.code || 'None',
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
      }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const credits = snapshot.credits
      .filter((c) => c.customer_id === customer.id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const totalPoints = BusinessService.getTotalPoints(snapshot, customer.id);
    const friendsReferred = BusinessService.getFriendsReferredCount(snapshot, customer.id);

    return res.json({
      customer: {
        ...customer,
        phone: BusinessService.formatUkPhone(customer.phone),
      },
      totalPoints,
      friendsReferred,
      referralCode,
      sales,
      credits,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/owner/customers/:id/points-adjustment', requireOwner, (req: Request, res: Response) => {
  try {
    const session = (req as any).session as UserSession;
    const { id } = req.params;
    const { pointsDelta, amountPounds, reason } = req.body;
    const val = pointsDelta !== undefined ? Number(pointsDelta) : Number(amountPounds);

    if (isNaN(val) || !Number.isInteger(val) || val === 0) {
      return res.status(400).json({ error: 'Adjustment points amount must be a non-zero whole number.' });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Reason is required for manual points adjustment.' });
    }

    const result = db.transaction((database) => {
      return BusinessService.adjustPoints(database, id, val, reason, session.staff.id);
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
      ['Customer ID', 'Name', 'Phone', 'Total Points', 'Offers Consent', 'Joined Date'],
    ];

    for (const c of snapshot.customers) {
      const activePoints = BusinessService.getTotalPoints(snapshot, c.id);

      rows.push([
        c.id,
        `"${c.name.replace(/"/g, '""')}"`,
        BusinessService.formatUkPhone(c.phone),
        String(activePoints),
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



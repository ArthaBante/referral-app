import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db, Staff, DatabaseSchema, getDefaultDatabaseSchema } from '../db.ts';
import { TEMPLATE_CONFIG } from './messaging.ts';

export interface UserSession {
  token: string;
  staff: {
    id: string;
    name: string;
    username: string;
    role: 'owner' | 'cashier';
  };
  expiresAt: number;
}

const activeSessions = new Map<string, UserSession>();

export class AuthService {
  public static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  public static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  public static createSession(staff: Staff): UserSession {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 12 * 3600 * 1000;
    const session: UserSession = {
      token,
      staff: {
        id: staff.id,
        name: staff.name,
        username: staff.username,
        role: staff.role,
      },
      expiresAt,
    };
    activeSessions.set(token, session);
    return session;
  }

  public static getSession(token: string): UserSession | null {
    if (!token) return null;
    const session = activeSessions.get(token);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      activeSessions.delete(token);
      return null;
    }
    return session;
  }

  public static revokeSession(token: string) {
    activeSessions.delete(token);
  }

  // Populate seed database with UK sample data
  public static populateSeed(database: DatabaseSchema) {
    const ownerHash = bcrypt.hashSync('change-me', 10);
    const cashierHash = bcrypt.hashSync('change-me', 10);

    database.settings = {
      scheme_enabled: true,
      a_return_type: 'percent',
      a_return_value: 20,
      b_credit_type: 'percent',
      b_credit_value: 10,
      b_credit_cap: null,
      min_bill_for_referral: null,
      expiry_days: 90,
      reminder_days_before: 7,
      max_credit_share: 50,
      shop_name: 'Demo Salon',
      updated_at: new Date().toISOString(),
      updated_by: 'Demo Owner (Owner)',
    };

    const ownerId = crypto.randomUUID();
    const cashierId = crypto.randomUUID();

    database.staff = [
      {
        id: ownerId,
        name: 'Demo Owner (Owner)',
        username: 'owner',
        password_hash: ownerHash,
        role: 'owner',
        active: true,
        created_at: new Date().toISOString(),
      },
      {
        id: cashierId,
        name: 'Demo Cashier',
        username: 'cashier',
        password_hash: cashierHash,
        role: 'cashier',
        active: true,
        created_at: new Date().toISOString(),
      },
    ];

    // Customer A: Emma Smith (+447700900101)
    const custAId = crypto.randomUUID();
    const custAToken = 'token-emma-smith-uk-789012345678';
    const codeAId = crypto.randomUUID();
    const codeA = 'EMM789';

    // Customer B: Sophie Taylor (+447700900102) - referred by A
    const custBId = crypto.randomUUID();
    const custBToken = 'token-sophie-taylor-uk-1234567890123';
    const codeB = 'SOP456';

    const saleAId = crypto.randomUUID();
    const saleBId = crypto.randomUUID();

    database.customers = [
      {
        id: custAId,
        name: 'Emma Smith',
        phone: '+447700900101',
        personal_token: custAToken,
        marketing_consent: true,
        consent_at: new Date(Date.now() - 10 * 86400000).toISOString(),
        opted_out_at: null,
        referred_by_customer_id: null,
        created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
      },
      {
        id: custBId,
        name: 'Sophie Taylor',
        phone: '+447700900102',
        personal_token: custBToken,
        marketing_consent: true,
        consent_at: new Date(Date.now() - 3 * 86400000).toISOString(),
        opted_out_at: null,
        referred_by_customer_id: custAId,
        created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
      },
      {
        id: crypto.randomUUID(),
        name: 'Oliver Jones',
        phone: '+447700900103',
        personal_token: 'token-oliver-jones-uk-345678901234',
        marketing_consent: true,
        consent_at: new Date(Date.now() - 30 * 86400000).toISOString(),
        opted_out_at: null,
        referred_by_customer_id: null,
        created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
      },
      {
        id: crypto.randomUUID(),
        name: 'Charlotte Brown',
        phone: '+447700900104',
        personal_token: 'token-charlotte-brown-uk-4567890123456',
        marketing_consent: true,
        consent_at: new Date(Date.now() - 5 * 86400000).toISOString(),
        opted_out_at: null,
        referred_by_customer_id: null,
        created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
      },
      {
        id: crypto.randomUUID(),
        name: 'Harry Wilson',
        phone: '+447700900105',
        personal_token: 'token-harry-wilson-uk-56789012345',
        marketing_consent: false,
        consent_at: new Date(Date.now() - 15 * 86400000).toISOString(),
        opted_out_at: new Date(Date.now() - 2 * 86400000).toISOString(),
        referred_by_customer_id: null,
        created_at: new Date(Date.now() - 15 * 86400000).toISOString(),
      },
    ];

    const oliverId = database.customers[2].id;
    const charlotteId = database.customers[3].id;
    const harryId = database.customers[4].id;

    // Sales: Emma's initial sale of £60.00 (£6000 pence), Sophie's sale of £60.00 (£6000 pence) with code EMM789
    database.sales = [
      {
        id: saleAId,
        customer_id: custAId,
        receipt_ref: 'REC-26-001',
        bill_amount: 6000,
        credit_used: 0,
        referral_code_id: null,
        staff_id: cashierId,
        created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
      },
      {
        id: saleBId,
        customer_id: custBId,
        receipt_ref: 'REC-26-002',
        bill_amount: 6000,
        credit_used: 0,
        referral_code_id: codeAId,
        staff_id: cashierId,
        created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
      },
    ];

    // Referral codes
    database.referral_codes = [
      {
        id: codeAId,
        code: codeA,
        owner_customer_id: custAId,
        status: 'used',
        used_by_customer_id: custBId,
        used_sale_id: saleBId,
        used_at: new Date(Date.now() - 3 * 86400000).toISOString(),
        issued_sale_id: saleAId,
        referrer_return_amount: 1200, // 20% of £60 = £12 (1200 pence)
        return_settings_snapshot: { a_return_type: 'percent', a_return_value: 20 },
      },
      {
        id: crypto.randomUUID(),
        code: codeB,
        owner_customer_id: custBId,
        status: 'unused',
        used_by_customer_id: null,
        used_sale_id: null,
        used_at: null,
        issued_sale_id: saleBId,
        referrer_return_amount: 1200, // 20% of £60 = £12
        return_settings_snapshot: { a_return_type: 'percent', a_return_value: 20 },
      },
      {
        id: crypto.randomUUID(),
        code: 'OLI333',
        owner_customer_id: oliverId,
        status: 'unused',
        used_by_customer_id: null,
        used_sale_id: null,
        used_at: null,
        referrer_return_amount: 1200,
        return_settings_snapshot: { a_return_type: 'percent', a_return_value: 20 },
      },
      {
        id: crypto.randomUUID(),
        code: 'CHA444',
        owner_customer_id: charlotteId,
        status: 'unused',
        used_by_customer_id: null,
        used_sale_id: null,
        used_at: null,
        referrer_return_amount: 1200,
        return_settings_snapshot: { a_return_type: 'percent', a_return_value: 20 },
      },
      {
        id: crypto.randomUUID(),
        code: 'HAR555',
        owner_customer_id: harryId,
        status: 'unused',
        used_by_customer_id: null,
        used_sale_id: null,
        used_at: null,
        referrer_return_amount: 1200,
        return_settings_snapshot: { a_return_type: 'percent', a_return_value: 20 },
      },
    ];

    const expiryDate = new Date(Date.now() + 87 * 86400000).toISOString();
    database.credits = [
      {
        id: crypto.randomUUID(),
        customer_id: custAId,
        source_sale_id: saleBId,
        amount: 1200,
        remaining: 1200,
        status: 'active',
        expires_at: expiryDate,
        source: 'referral_return',
        settings_snapshot: { expiry_days: 90 },
        reason: "Referral return from Sophie Taylor's first purchase",
        created_by_staff_id: cashierId,
        created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
      },
      {
        id: crypto.randomUUID(),
        customer_id: custBId,
        source_sale_id: saleBId,
        amount: 600,
        remaining: 600,
        status: 'active',
        expires_at: expiryDate,
        source: 'friend_credit',
        settings_snapshot: { expiry_days: 90 },
        reason: "Friend store credit using Emma Smith's referral code",
        created_by_staff_id: cashierId,
        created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
      },
      {
        id: crypto.randomUUID(),
        customer_id: oliverId,
        source_sale_id: null,
        amount: 1000,
        remaining: 1000,
        status: 'active',
        expires_at: new Date(Date.now() + 60 * 86400000).toISOString(),
        source: 'manual',
        settings_snapshot: { expiry_days: 90 },
        reason: 'Loyalty bonus',
        created_by_staff_id: ownerId,
        created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
      },
    ];

    database.credit_redemptions = [];
    database.messages = [];
    database.otp_codes = [];
    database.redemption_tokens = [];

    // Seed default English message templates
    database.message_templates = [];
    const kinds = Object.keys(TEMPLATE_CONFIG) as (keyof typeof TEMPLATE_CONFIG)[];
    for (const kind of kinds) {
      const cfg = TEMPLATE_CONFIG[kind];
      database.message_templates.push({
        id: crypto.randomUUID(),
        kind,
        body: cfg.defaultEn,
        dlt_template_id: null,
        updated_at: new Date().toISOString(),
        updated_by: 'Demo Owner (Owner)',
      });
    }

    database.audit_log = [
      {
        id: crypto.randomUUID(),
        staff_id: 'system',
        action: 'system_initialized',
        details: { shop_name: 'Demo Salon', owner: 'Demo Owner' },
        created_at: new Date().toISOString(),
      },
    ];
  }

  public static initSeedData(forceRegenerate = false) {
    const snapshot = db.getSnapshot();
    const needsRegen = forceRegenerate ||
      snapshot.staff.length === 0 ||
      snapshot.settings?.shop_name === 'Sangam Bazaar' ||
      !snapshot.staff.some((s) => s.name.includes('Demo Owner')) ||
      (snapshot.settings as any).a_credit_type !== undefined;

    if (needsRegen) {
      console.log('[Seed] Regenerating .data/db.json with RefFrnd UK demo data...');
      db.transaction((database) => {
        this.populateSeed(database);
        return true;
      });
      console.log('[Seed] Database successfully regenerated!');
    } else if (!snapshot.message_templates || snapshot.message_templates.length < 7) {
      db.transaction((database) => {
        database.message_templates = database.message_templates || [];
        const existingMap = new Set(database.message_templates.map((t) => t.kind));
        const kinds = Object.keys(TEMPLATE_CONFIG) as (keyof typeof TEMPLATE_CONFIG)[];
        for (const kind of kinds) {
          const cfg = TEMPLATE_CONFIG[kind];
          if (!existingMap.has(kind)) {
            database.message_templates.push({
              id: crypto.randomUUID(),
              kind,
              body: cfg.defaultEn,
              dlt_template_id: null,
              updated_at: new Date().toISOString(),
              updated_by: 'Demo Owner (Owner)',
            });
          }
        }
        return true;
      });
    }
  }

  public static createInMemoryTestDb(): DatabaseSchema {
    const testDb = getDefaultDatabaseSchema();
    this.populateSeed(testDb);
    return testDb;
  }
}

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

  public static populateSeed(database: DatabaseSchema) {
    const ownerHash = bcrypt.hashSync('change-me', 10);
    const cashierHash = bcrypt.hashSync('change-me', 10);

    database.settings = {
      scheme_enabled: true,
      friend_discount: 5,
      referrer_reward: 5,
      min_spend: 20,
      expiry_days: 90,
      reminder_days_before: 7,
      max_credit_share: 50,
      shop_name: 'Your Business',
      updated_at: new Date().toISOString(),
      updated_by: 'Demo Owner (Owner)',
      last_daily_job_run_date: null,
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

    const custAId = crypto.randomUUID();
    const custAToken = 'token-emma-smith-uk-789012345678';
    const codeAId = crypto.randomUUID();
    const codeA = 'EMM789';

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

    database.sales = [
      {
        id: saleAId,
        customer_id: custAId,
        receipt_ref: 'REC-26-001',
        bill_amount: 6000,
        discount_amount: 0,
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
        discount_amount: 500,
        credit_used: 0,
        referral_code_id: codeAId,
        staff_id: cashierId,
        created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
      },
    ];

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
        referrer_return_amount: 1200,
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
        referrer_return_amount: 1200,
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

    database.message_templates = [];
    const kinds = Object.keys(TEMPLATE_CONFIG) as (keyof typeof TEMPLATE_CONFIG)[];
    for (const kind of kinds) {
      const cfg = TEMPLATE_CONFIG[kind];
      database.message_templates.push({
        id: crypto.randomUUID(),
        kind,
        body: cfg.defaultEn,
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

  // Never wipe data on startup. Seed demo data ONLY when database has no staff and no customers at all.
  public static initSeedData(forceRegenerate = false) {
    const snapshot = db.getSnapshot();
    const isBrandNew = snapshot.staff.length === 0 && snapshot.customers.length === 0;

    if (forceRegenerate || isBrandNew) {
      console.log('[Seed] Initializing brand-new database with RefFrnd demo data...');
      db.transaction((database) => {
        this.populateSeed(database);
        return true;
      });
      console.log('[Seed] Database successfully initialized!');
    } else {
      if (
        snapshot.staff.some(
          (s) =>
            s.name.includes('Sangam Bazaar') ||
            s.name.includes('Vivek Udasi') ||
            s.name.includes('Raigarh')
        )
      ) {
        console.warn(
          '[Seed Warning] Old-format data detected in database. Preserving existing data without overwriting.'
        );
      }
    }
  }

  public static createInMemoryTestDb(): DatabaseSchema {
    const testDb = getDefaultDatabaseSchema();
    this.populateSeed(testDb);
    return testDb;
  }
}

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
      referrer_points: 100,
      friend_points: 50,
      min_spend: 10,
      points_expiry_days: 365,
      referral_limit: null,
      reminder_days_before: 7,
      shop_name: 'Your Business',
      updated_at: new Date().toISOString(),
      updated_by: 'Owner',
      last_daily_job_run_date: null,
    };

    const ownerId = crypto.randomUUID();
    const cashierId = crypto.randomUUID();

    database.staff = [
      {
        id: ownerId,
        name: 'Store Owner',
        username: 'owner',
        password_hash: ownerHash,
        role: 'owner',
        active: true,
        created_at: new Date().toISOString(),
      },
      {
        id: cashierId,
        name: 'Store Cashier',
        username: 'cashier',
        password_hash: cashierHash,
        role: 'cashier',
        active: true,
        created_at: new Date().toISOString(),
      },
    ];

    database.customers = [];
    database.referral_codes = [];
    database.sales = [];
    database.credits = [];
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
        updated_by: 'Owner',
      });
    }

    database.audit_log = [];
  }

  public static initSeedData(forceRegenerate = false) {
    const snapshot = db.getSnapshot();
    const isBrandNew = snapshot.staff.length === 0 && snapshot.customers.length === 0;

    if (forceRegenerate || isBrandNew) {
      console.log('[Seed] Initializing brand-new database with RefFrnd seed data...');
      db.transaction((database) => {
        this.populateSeed(database);
        return true;
      });
      console.log('[Seed] Database successfully initialized!');
    }
  }
}

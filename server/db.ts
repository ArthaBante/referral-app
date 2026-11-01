import fs from 'fs';
import path from 'path';

export interface Customer {
  id: string;
  name: string;
  phone: string; // +447XXXXXXXXX
  personal_token: string;
  marketing_consent: boolean;
  consent_at: string;
  opted_out_at: string | null;
  referred_by_customer_id: string | null;
  created_at: string;
}

export interface ReferralCode {
  id: string;
  code: string;
  owner_customer_id: string;
  created_at?: string;
}

export interface Sale {
  id: string;
  customer_id: string;
  receipt_ref: string | null;
  bill_amount: number; // pence
  discount_amount: number; // pence
  referral_code_id: string | null;
  staff_id: string;
  created_at: string;
}

export interface Credit {
  id: string;
  customer_id: string;
  points: number;
  remaining: number;
  source: 'purchase' | 'referral' | 'welcome' | 'manual';
  source_sale_id: string | null;
  expires_at: string | null;
  expiring_notified?: boolean;
  reason?: string | null;
  created_by_staff_id?: string | null;
  created_at: string;
}

export interface ReferralUse {
  id: string;
  code_id: string;
  referrer_customer_id: string;
  friend_customer_id: string;
  sale_id: string;
  referrer_points: number;
  friend_points: number;
  created_at: string;
}

export interface MessageRecord {
  id: string;
  customer_id: string;
  kind: 'welcome' | 'welcome_no_code' | 'welcome_with_code' | 'referral_return' | 'credit_expiring' | 'points_earned' | 'offer';
  channel: 'dev' | 'sms' | 'whatsapp';
  body: string;
  status: 'sent' | 'failed';
  error: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface OtpCode {
  id: string;
  customer_id: string;
  code_hash: string;
  code_plain?: string;
  expires_at: string;
  attempts: number;
  used_at: string | null;
  created_at: string;
}

export interface RedemptionToken {
  id: string;
  customer_id: string;
  token: string;
  expires_at: string;
  used: boolean;
  created_at: string;
}

export interface Settings {
  scheme_enabled: boolean;
  earn_spend_pounds: number;   // default 10
  earn_points: number;         // default 100
  points_expiry_days: number;  // default 365
  points_earned_text: boolean; // default false
  referrer_points?: number;
  friend_points?: number;
  min_spend?: number;
  referral_limit?: number | null;
  reminder_days_before?: number;
  shop_name: string;
  updated_at: string;
  updated_by: string;
  last_daily_job_run_date?: string | null;
}

export interface Staff {
  id: string;
  name: string;
  username: string;
  password_hash: string;
  role: 'owner' | 'cashier';
  active: boolean;
  created_at: string;
}

export interface AuditLog {
  id: string;
  staff_id: string;
  action: string;
  details: any;
  created_at: string;
}

export type MessageTemplateKind =
  | 'welcome_no_code'
  | 'welcome_with_code'
  | 'referral_return'
  | 'credit_expiring'
  | 'points_earned'
  | 'offer_footer';

export interface MessageTemplate {
  id: string;
  kind: MessageTemplateKind;
  body: string;
  updated_at: string;
  updated_by: string;
}

export interface DatabaseSchema {
  customers: Customer[];
  referral_codes: ReferralCode[];
  sales: Sale[];
  credits: Credit[];
  referral_uses: ReferralUse[];
  messages: MessageRecord[];
  otp_codes: OtpCode[];
  redemption_tokens: RedemptionToken[];
  settings: Settings;
  staff: Staff[];
  audit_log: AuditLog[];
  message_templates: MessageTemplate[];
}

const DB_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DB_DIR, 'db.json');

export function getDefaultDatabaseSchema(): DatabaseSchema {
  const now = new Date().toISOString();
  return {
    customers: [],
    referral_codes: [],
    sales: [],
    credits: [],
    referral_uses: [],
    messages: [],
    otp_codes: [],
    redemption_tokens: [],
    settings: {
      scheme_enabled: true,
      earn_spend_pounds: 10,
      earn_points: 100,
      points_expiry_days: 365,
      points_earned_text: false,
      referrer_points: 100,
      friend_points: 50,
      min_spend: 10,
      referral_limit: null,
      reminder_days_before: 7,
      shop_name: 'Your Business',
      updated_at: now,
      updated_by: 'system',
      last_daily_job_run_date: null,
    },
    staff: [],
    audit_log: [],
    message_templates: [],
  };
}

class Database {
  private data: DatabaseSchema;
  private transactionDepth: number = 0;

  constructor() {
    this.data = this.loadOrInit();
  }

  private loadOrInit(): DatabaseSchema {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!parsed.redemption_tokens) parsed.redemption_tokens = [];
        if (!parsed.message_templates) parsed.message_templates = [];
        if (!parsed.referral_uses) parsed.referral_uses = [];
        if (parsed.settings && parsed.settings.referrer_points === undefined) {
          const def = getDefaultDatabaseSchema();
          parsed.settings = {
            ...def.settings,
            shop_name: parsed.settings.shop_name || def.settings.shop_name,
            scheme_enabled: parsed.settings.scheme_enabled ?? def.settings.scheme_enabled,
          };
        }
        return parsed;
      } catch (err) {
        console.error('Error reading db.json, reinitializing...', err);
      }
    }

    const initial = getDefaultDatabaseSchema();
    this.saveData(initial);
    return initial;
  }

  private saveData(data: DatabaseSchema) {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
  }

  public transaction<T>(callback: (db: DatabaseSchema) => T): T {
    if (this.transactionDepth > 0) {
      return callback(this.data);
    }

    this.transactionDepth++;
    const snapshot = JSON.parse(JSON.stringify(this.data));
    try {
      const result = callback(this.data);
      if (result && typeof (result as any).then === 'function') {
        return ((result as unknown) as Promise<any>)
          .then((res) => {
            this.saveData(this.data);
            return res;
          })
          .catch((err) => {
            this.data = snapshot;
            throw err;
          })
          .finally(() => {
            this.transactionDepth--;
          }) as any;
      }
      this.saveData(this.data);
      return result;
    } catch (err) {
      this.data = snapshot;
      this.transactionDepth--;
      throw err;
    } finally {
      if (this.transactionDepth > 0) {
        this.transactionDepth--;
      }
    }
  }

  public getSnapshot(): DatabaseSchema {
    return JSON.parse(JSON.stringify(this.data));
  }

  public resetToDefault() {
    this.transaction((database) => {
      const def = getDefaultDatabaseSchema();
      database.customers = def.customers;
      database.referral_codes = def.referral_codes;
      database.sales = def.sales;
      database.credits = def.credits;
      database.messages = def.messages;
      database.otp_codes = def.otp_codes;
      database.redemption_tokens = def.redemption_tokens;
      database.settings = def.settings;
      database.staff = def.staff;
      database.audit_log = def.audit_log;
      database.message_templates = def.message_templates;
      return true;
    });
  }
}

export const db = new Database();

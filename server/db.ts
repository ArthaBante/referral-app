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
  status: 'unused' | 'used';
  used_by_customer_id: string | null;
  used_sale_id: string | null;
  used_at: string | null;
  issued_sale_id?: string;
  referrer_return_amount: number; // pence
  return_settings_snapshot?: Record<string, any>;
}

export interface Sale {
  id: string;
  customer_id: string;
  receipt_ref: string | null;
  bill_amount: number; // pence (full price)
  discount_amount: number; // pence
  credit_used: number; // pence
  referral_code_id: string | null;
  staff_id: string;
  created_at: string;
}

export interface Credit {
  id: string;
  customer_id: string;
  source_sale_id: string | null;
  amount: number; // pence
  remaining: number; // pence
  status: 'active' | 'expired' | 'cancelled';
  expires_at: string | null;
  source: 'referral_return' | 'friend_credit' | 'manual';
  settings_snapshot: Record<string, any>;
  reason: string | null;
  created_by_staff_id: string | null;
  expiring_notified?: boolean;
  created_at: string;
}

export interface CreditRedemption {
  id: string;
  credit_id: string;
  sale_id: string;
  amount: number; // pence
  created_at: string;
}

export interface MessageRecord {
  id: string;
  customer_id: string;
  kind: 'welcome' | 'welcome_no_code' | 'welcome_with_code' | 'referral_return' | 'credit_expiring' | 'credit_used' | 'otp' | 'offer';
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
  code_plain?: string; // stored for dev mode testing
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
  friend_discount: number; // £
  referrer_reward: number; // £
  min_spend: number; // £
  expiry_days: number;
  reminder_days_before: number;
  max_credit_share: number;
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
  | 'credit_used'
  | 'otp'
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
  credit_redemptions: CreditRedemption[];
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
    credit_redemptions: [],
    messages: [],
    otp_codes: [],
    redemption_tokens: [],
    settings: {
      scheme_enabled: true,
      friend_discount: 5,
      referrer_reward: 5,
      min_spend: 20,
      expiry_days: 90,
      reminder_days_before: 7,
      max_credit_share: 50,
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
        if (parsed.settings && parsed.settings.friend_discount === undefined) {
          const def = getDefaultDatabaseSchema();
          parsed.settings = {
            ...def.settings,
            shop_name: parsed.settings.shop_name || def.settings.shop_name,
            scheme_enabled: parsed.settings.scheme_enabled ?? def.settings.scheme_enabled,
            expiry_days: parsed.settings.expiry_days ?? def.settings.expiry_days,
            reminder_days_before: parsed.settings.reminder_days_before ?? def.settings.reminder_days_before,
            max_credit_share: parsed.settings.max_credit_share ?? def.settings.max_credit_share,
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
      database.credit_redemptions = def.credit_redemptions;
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

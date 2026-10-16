import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface Customer {
  id: string;
  name: string;
  phone: string; // +91XXXXXXXXXX
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
}

export interface Sale {
  id: string;
  customer_id: string;
  tally_bill_no: string;
  bill_amount: number; // paise
  discount_amount: number; // paise
  credit_used: number; // paise
  referral_code_id: string | null;
  staff_id: string;
  status: 'completed' | 'returned';
  returned_at: string | null;
  created_at: string;
}

export interface Credit {
  id: string;
  customer_id: string;
  source_sale_id: string | null;
  amount: number; // paise
  remaining: number; // paise
  status: 'pending' | 'active' | 'expired' | 'cancelled';
  available_at: string;
  expires_at: string | null;
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
  amount: number; // paise
  created_at: string;
}

export interface MessageRecord {
  id: string;
  customer_id: string;
  kind: 'welcome' | 'credit_pending' | 'credit_ready' | 'credit_expiring' | 'credit_used' | 'otp' | 'offer';
  channel: 'dev' | 'sms' | 'whatsapp';
  body: string;
  status: 'queued' | 'sent' | 'failed';
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

export interface Settings {
  scheme_enabled: boolean;
  b_discount_type: 'percent' | 'fixed';
  b_discount_value: number; // % or ₹ (in rupees)
  b_discount_cap: number | null; // ₹ cap (in rupees)
  a_credit_type: 'percent' | 'fixed';
  a_credit_value: number; // % or ₹ (in rupees)
  min_bill_for_referral: number | null; // ₹ (in rupees)
  pending_days: number;
  expiry_days: number;
  reminder_days_before: number;
  max_credit_share: number; // % (e.g. 50)
  shop_name: string;
  message_language: 'English' | 'Hindi' | 'both';
  updated_at: string;
  updated_by: string;
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

export interface DatabaseSchema {
  customers: Customer[];
  referral_codes: ReferralCode[];
  sales: Sale[];
  credits: Credit[];
  credit_redemptions: CreditRedemption[];
  messages: MessageRecord[];
  otp_codes: OtpCode[];
  settings: Settings;
  staff: Staff[];
  audit_log: AuditLog[];
}

const DB_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DB_DIR, 'db.json');

class Database {
  private data: DatabaseSchema;
  private isLocked: boolean = false;

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
        return JSON.parse(raw);
      } catch (err) {
        console.error('Error reading db.json, reinitializing...', err);
      }
    }

    const initial = this.getDefaultData();
    this.saveData(initial);
    return initial;
  }

  private getDefaultData(): DatabaseSchema {
    const now = new Date().toISOString();
    return {
      customers: [],
      referral_codes: [],
      sales: [],
      credits: [],
      credit_redemptions: [],
      messages: [],
      otp_codes: [],
      settings: {
        scheme_enabled: true,
        b_discount_type: 'percent',
        b_discount_value: 10,
        b_discount_cap: null,
        a_credit_type: 'percent',
        a_credit_value: 20,
        min_bill_for_referral: null,
        pending_days: 7,
        expiry_days: 90,
        reminder_days_before: 7,
        max_credit_share: 50,
        shop_name: 'Shehzaadi',
        message_language: 'English',
        updated_at: now,
        updated_by: 'system',
      },
      staff: [],
      audit_log: [],
    };
  }

  private saveData(data: DatabaseSchema) {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
  }

  // Atomically perform transaction with snapshot rollback on failure
  public transaction<T>(callback: (db: DatabaseSchema) => T): T {
    // Basic mutex lock for single-process concurrency
    let lockRetries = 0;
    while (this.isLocked && lockRetries < 50) {
      // Busy wait synchronous yield
      const start = Date.now();
      while (Date.now() - start < 10) {}
      lockRetries++;
    }

    this.isLocked = true;
    const snapshot = JSON.parse(JSON.stringify(this.data));
    try {
      const result = callback(this.data);
      this.saveData(this.data);
      return result;
    } catch (err) {
      this.data = snapshot;
      throw err;
    } finally {
      this.isLocked = false;
    }
  }

  public getSnapshot(): DatabaseSchema {
    return JSON.parse(JSON.stringify(this.data));
  }

  public resetToDefault() {
    this.transaction(() => {
      this.data = this.getDefaultData();
      return true;
    });
  }
}

export const db = new Database();

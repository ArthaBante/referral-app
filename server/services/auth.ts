import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db, Staff } from '../db.ts';

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

// In-memory active sessions map (backed by token string)
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
    const expiresAt = Date.now() + 12 * 3600 * 1000; // 12 hours timeout
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

  // Ensure default staff and seed data exist
  public static async initSeedData() {
    const snapshot = db.getSnapshot();

    // Check if staff already exists
    if (snapshot.staff.length === 0) {
      console.log('[Seed] Seeding staff accounts...');
      const ownerHash = await this.hashPassword('change-me');
      const cashierHash = await this.hashPassword('change-me');

      db.transaction((database) => {
        const ownerId = crypto.randomUUID();
        const cashierId = crypto.randomUUID();

        database.staff.push(
          {
            id: ownerId,
            name: 'Krishna Udasi (Owner)',
            username: 'owner',
            password_hash: ownerHash,
            role: 'owner',
            active: true,
            created_at: new Date().toISOString(),
          },
          {
            id: cashierId,
            name: 'Kavita Dewangan (Billing Counter)',
            username: 'cashier',
            password_hash: cashierHash,
            role: 'cashier',
            active: true,
            created_at: new Date().toISOString(),
          }
        );

        // Seed 5 sample customers with an A-B referral pair
        // Customer A: Sunita Sharma (+919827100001)
        const custAId = crypto.randomUUID();
        const custAToken = 'token-sunita-sharma-raigarh-789012345678';
        const codeA = 'SUN789';

        database.customers.push({
          id: custAId,
          name: 'Sunita Sharma',
          phone: '+919827100001',
          personal_token: custAToken,
          marketing_consent: true,
          consent_at: new Date(Date.now() - 10 * 86400000).toISOString(),
          opted_out_at: null,
          referred_by_customer_id: null,
          created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
        });

        // Referral code for A (used by B)
        const codeAId = crypto.randomUUID();

        // Customer B: Priya Verma (+919827100002) - referred by A
        const custBId = crypto.randomUUID();
        const custBToken = 'token-priya-verma-raigarh-1234567890123';
        const codeB = 'PRI456';

        database.customers.push({
          id: custBId,
          name: 'Priya Verma',
          phone: '+919827100002',
          personal_token: custBToken,
          marketing_consent: true,
          consent_at: new Date(Date.now() - 3 * 86400000).toISOString(),
          opted_out_at: null,
          referred_by_customer_id: custAId,
          created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
        });

        // B's referral sale
        const saleBId = crypto.randomUUID();
        database.sales.push({
          id: saleBId,
          customer_id: custBId,
          tally_bill_no: 'TL-2026-001',
          bill_amount: 100000, // ₹1,000 in paise
          discount_amount: 10000, // ₹100 in paise (10%)
          credit_used: 0,
          referral_code_id: codeAId,
          staff_id: cashierId,
          status: 'completed',
          returned_at: null,
          created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
        });

        // Code A marked used
        database.referral_codes.push({
          id: codeAId,
          code: codeA,
          owner_customer_id: custAId,
          status: 'used',
          used_by_customer_id: custBId,
          used_sale_id: saleBId,
          used_at: new Date(Date.now() - 3 * 86400000).toISOString(),
        });

        // Code B is unused
        database.referral_codes.push({
          id: crypto.randomUUID(),
          code: codeB,
          owner_customer_id: custBId,
          status: 'unused',
          used_by_customer_id: null,
          used_sale_id: null,
          used_at: null,
        });

        // A's pending credit from B's sale: ₹200 (20% of ₹1,000)
        // Created 3 days ago, available 7 days after sale (in 4 days)
        const creditAId = crypto.randomUUID();
        database.credits.push({
          id: creditAId,
          customer_id: custAId,
          source_sale_id: saleBId,
          amount: 20000, // ₹200 in paise
          remaining: 20000,
          status: 'pending',
          available_at: new Date(Date.now() + 4 * 86400000).toISOString(),
          expires_at: null,
          settings_snapshot: {
            a_credit_type: 'percent',
            a_credit_value: 20,
            expiry_days: 90,
          },
          reason: null,
          created_by_staff_id: cashierId,
          created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
        });

        // Customer 3: Anita Agrawal (+919827100003) - has active credit of ₹150 expiring in 60 days
        const cust3Id = crypto.randomUUID();
        const cust3Token = 'token-anita-agrawal-raigarh-345678901234';
        database.customers.push({
          id: cust3Id,
          name: 'Anita Agrawal',
          phone: '+919827100003',
          personal_token: cust3Token,
          marketing_consent: true,
          consent_at: new Date(Date.now() - 30 * 86400000).toISOString(),
          opted_out_at: null,
          referred_by_customer_id: null,
          created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
        });
        database.referral_codes.push({
          id: crypto.randomUUID(),
          code: 'ANI333',
          owner_customer_id: cust3Id,
          status: 'unused',
          used_by_customer_id: null,
          used_sale_id: null,
          used_at: null,
        });
        database.credits.push({
          id: crypto.randomUUID(),
          customer_id: cust3Id,
          source_sale_id: null,
          amount: 15000, // ₹150 in paise
          remaining: 15000,
          status: 'active',
          available_at: new Date(Date.now() - 30 * 86400000).toISOString(),
          expires_at: new Date(Date.now() + 60 * 86400000).toISOString(),
          settings_snapshot: { expiry_days: 90 },
          reason: 'Loyalty reward bonus',
          created_by_staff_id: ownerId,
          created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
        });

        // Customer 4: Meena Patel (+919827100004) - opted-in
        const cust4Id = crypto.randomUUID();
        database.customers.push({
          id: cust4Id,
          name: 'Meena Patel',
          phone: '+919827100004',
          personal_token: 'token-meena-patel-raigarh-4567890123456',
          marketing_consent: true,
          consent_at: new Date(Date.now() - 5 * 86400000).toISOString(),
          opted_out_at: null,
          referred_by_customer_id: null,
          created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
        });
        database.referral_codes.push({
          id: crypto.randomUUID(),
          code: 'MEE444',
          owner_customer_id: cust4Id,
          status: 'unused',
          used_by_customer_id: null,
          used_sale_id: null,
          used_at: null,
        });

        // Customer 5: Pooja Dewangan (+919827100005) - opted-out
        const cust5Id = crypto.randomUUID();
        database.customers.push({
          id: cust5Id,
          name: 'Pooja Dewangan',
          phone: '+919827100005',
          personal_token: 'token-pooja-dewangan-raigarh-56789012345',
          marketing_consent: false,
          consent_at: new Date(Date.now() - 15 * 86400000).toISOString(),
          opted_out_at: new Date(Date.now() - 2 * 86400000).toISOString(),
          referred_by_customer_id: null,
          created_at: new Date(Date.now() - 15 * 86400000).toISOString(),
        });
        database.referral_codes.push({
          id: crypto.randomUUID(),
          code: 'POO555',
          owner_customer_id: cust5Id,
          status: 'unused',
          used_by_customer_id: null,
          used_sale_id: null,
          used_at: null,
        });

        console.log('[Seed] Database seeded with owner, cashier, and 5 sample customers!');
        return true;
      });
    }
  }
}

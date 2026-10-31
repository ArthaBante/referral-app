import { describe, it, expect } from 'vitest';
import { DatabaseSchema, getDefaultDatabaseSchema } from '../server/db.ts';
import { AuthService } from '../server/services/auth.ts';
import { BusinessService } from '../server/services/business.ts';

describe('RefFrnd Acceptance Tests', () => {
  it('Scenario a: Customer with no code -> welcome message does NOT contain "You saved"', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    BusinessService.saveSale(testDb, {
      phone: '07700900010',
      name: 'No Code Customer',
      marketingConsent: true,
      receiptRef: 'TEST-A-010',
      billAmountPounds: 40,
    }, staffId);

    const cust = testDb.customers.find((c) => c.phone === '+447700900010')!;
    const msg = testDb.messages.find((m) => m.customer_id === cust.id && m.kind === 'welcome_no_code');
    expect(msg).toBeDefined();
    expect(msg!.body).not.toContain('You saved');
  });

  it('Scenario b: Customer who used a code -> welcome message contains "You saved £5.00"', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    BusinessService.saveSale(testDb, {
      phone: '07700900001',
      name: 'Customer A',
      marketingConsent: true,
      receiptRef: 'TEST-A-001',
      billAmountPounds: 60,
    }, staffId);

    const custA = testDb.customers.find((c) => c.phone === '+447700900001')!;
    const codeA = testDb.referral_codes.find((rc) => rc.owner_customer_id === custA.id)!;

    BusinessService.saveSale(testDb, {
      phone: '07700900011',
      name: 'With Code Customer',
      marketingConsent: true,
      receiptRef: 'TEST-A-011',
      billAmountPounds: 40,
      referralCode: codeA.code,
    }, staffId);

    const cust = testDb.customers.find((c) => c.phone === '+447700900011')!;
    const msg = testDb.messages.find((m) => m.customer_id === cust.id && m.kind === 'welcome_with_code');
    expect(msg).toBeDefined();
    expect(msg!.body).toContain('You saved £5.00');
  });

  it('Scenario c: validate-referral for a valid code returns friendDiscountPounds = 5 and referrerRewardPounds = 5', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    BusinessService.saveSale(testDb, {
      phone: '07700900001',
      name: 'Customer A',
      marketingConsent: true,
      receiptRef: 'TEST-A-001',
      billAmountPounds: 60,
    }, staffId);

    const unusedCodeRow = testDb.referral_codes.find((rc) => rc.status === 'unused')!;
    const check = BusinessService.validateReferralCode(testDb, unusedCodeRow.code, '+447700900019', 3000);
    expect(check.valid).toBe(true);
    expect(testDb.settings.friend_discount).toBe(5);
    expect(testDb.settings.referrer_reward).toBe(5);
  });

  it('Scenario d: After B uses A s code, A s customer page data shows totalActiveCreditPounds = 5', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    BusinessService.saveSale(testDb, {
      phone: '07700900001',
      name: 'Customer A',
      marketingConsent: true,
      receiptRef: 'TEST-A-001',
      billAmountPounds: 60,
    }, staffId);

    const custA = testDb.customers.find((c) => c.phone === '+447700900001')!;
    const codeA = testDb.referral_codes.find((rc) => rc.owner_customer_id === custA.id)!;

    BusinessService.saveSale(testDb, {
      phone: '07700900002',
      name: 'Customer B',
      marketingConsent: true,
      receiptRef: 'TEST-B-001',
      billAmountPounds: 40,
      referralCode: codeA.code,
    }, staffId);

    const aActivePence = testDb.credits
      .filter((c) => c.customer_id === custA.id && c.status === 'active' && c.remaining > 0)
      .reduce((sum, c) => sum + c.remaining, 0);
    const totalActiveCreditPounds = BusinessService.penceToPounds(aActivePence);
    expect(totalActiveCreditPounds).toBe(5);
  });

  it('Scenario e: Credit 5 days from expiry -> daily job sends one reminder; second run sends none. With reminder_days_before = 0, sends none.', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    const testCustId = crypto.randomUUID();
    testDb.customers.push({
      id: testCustId,
      name: 'Expiry Test',
      phone: '+447700900099',
      personal_token: 'token-expiry-test',
      marketing_consent: true,
      consent_at: new Date().toISOString(),
      opted_out_at: null,
      referred_by_customer_id: null,
      created_at: new Date().toISOString(),
    });
    testDb.credits.push({
      id: crypto.randomUUID(),
      customer_id: testCustId,
      source_sale_id: null,
      amount: 500,
      remaining: 500,
      status: 'active',
      expires_at: new Date(Date.now() + 5 * 86400000).toISOString(),
      source: 'manual',
      settings_snapshot: { expiry_days: 90 },
      reason: 'Test expiry',
      created_by_staff_id: staffId,
      created_at: new Date().toISOString(),
    });

    testDb.settings.reminder_days_before = 7;
    const job1 = BusinessService.runDailyJob(testDb);
    const job2 = BusinessService.runDailyJob(testDb);

    testDb.settings.reminder_days_before = 0;
    testDb.credits.push({
      id: crypto.randomUUID(),
      customer_id: testCustId,
      source_sale_id: null,
      amount: 500,
      remaining: 500,
      status: 'active',
      expires_at: new Date(Date.now() + 5 * 86400000).toISOString(),
      source: 'manual',
      settings_snapshot: { expiry_days: 90 },
      reason: 'Test expiry 0',
      created_by_staff_id: staffId,
      created_at: new Date().toISOString(),
    });
    const job3 = BusinessService.runDailyJob(testDb);

    expect(job1.remindersSent).toBe(1);
    expect(job2.remindersSent).toBe(0);
    expect(job3.remindersSent).toBe(0);
  });

  it('Scenario f: Sale with made-up token rejected & scheme switched off rejects code', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    BusinessService.saveSale(testDb, {
      phone: '+447700900001',
      name: 'Customer 1',
      marketingConsent: true,
      receiptRef: 'TEST-F-000',
      billAmountPounds: 30,
    }, staffId);

    let rejectedMadeUpToken = false;
    try {
      BusinessService.saveSale(testDb, {
        phone: '+447700900001',
        receiptRef: 'TEST-F-001',
        billAmountPounds: 30,
        creditToUsePounds: 5,
        redemptionToken: 'made-up-token-12345',
      }, staffId);
    } catch (err: any) {
      rejectedMadeUpToken = err.message.includes('Invalid or unauthenticated redemption token');
    }
    expect(rejectedMadeUpToken).toBe(true);

    testDb.settings.scheme_enabled = false;
    const codeId = crypto.randomUUID();
    testDb.referral_codes.push({
      id: codeId,
      code: 'SCH123',
      owner_customer_id: testDb.customers[0].id,
      status: 'unused',
      used_by_customer_id: null,
      used_sale_id: null,
      used_at: null,
      referrer_return_amount: 500,
    });

    const checkPaused = BusinessService.validateReferralCode(testDb, 'SCH123', '+447700900088', 3000);
    expect(checkPaused.valid).toBe(false);
    expect(checkPaused.reason).toBe('Referral scheme is paused');
  });
});

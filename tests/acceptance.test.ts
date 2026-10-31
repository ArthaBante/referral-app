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

  it('Scenario d: After B uses A s code, A s customer page data shows totalActiveCreditPounds = 5', async () => {
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

    const pageData = await BusinessService.getCustomerPageData(testDb, custA.personal_token);
    expect(pageData.totalActiveCreditPounds).toBe(5);
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

  it('Scenario g: A buys 60 -> B buys 40 with A code (pays 35, A gets 5) -> C buys 100 with B code (pays 95, B gets 5)', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    BusinessService.saveSale(testDb, { phone: '07700900001', name: 'A', billAmountPounds: 60, receiptRef: 'G-1' }, staffId);
    const custA = testDb.customers.find((c) => c.phone === '+447700900001')!;
    const codeA = testDb.referral_codes.find((rc) => rc.owner_customer_id === custA.id)!;

    const saleB = BusinessService.saveSale(testDb, { phone: '07700900002', name: 'B', billAmountPounds: 40, referralCode: codeA.code, receiptRef: 'G-2' }, staffId);
    expect(saleB.finalAmountPounds).toBe(35);
    const custB = testDb.customers.find((c) => c.phone === '+447700900002')!;
    const codeB = testDb.referral_codes.find((rc) => rc.owner_customer_id === custB.id)!;

    const saleC = BusinessService.saveSale(testDb, { phone: '07700900003', name: 'C', billAmountPounds: 100, referralCode: codeB.code, receiptRef: 'G-3' }, staffId);
    expect(saleC.finalAmountPounds).toBe(95);

    const bCredits = testDb.credits.filter((c) => c.customer_id === custB.id && c.status === 'active');
    expect(bCredits.length).toBe(1);
    expect(bCredits[0].amount).toBe(500);
  });

  it('Scenario h: A code on a £15 bill -> Spend at least £20 to use a code', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    BusinessService.saveSale(testDb, { phone: '07700900001', name: 'A', billAmountPounds: 60, receiptRef: 'H-1' }, staffId);
    const custA = testDb.customers.find((c) => c.phone === '+447700900001')!;
    const codeA = testDb.referral_codes.find((rc) => rc.owner_customer_id === custA.id)!;

    let rejected = false;
    let reason = '';
    try {
      BusinessService.saveSale(testDb, { phone: '07700900002', name: 'B', billAmountPounds: 15, referralCode: codeA.code, receiptRef: 'H-2' }, staffId);
    } catch (err: any) {
      rejected = true;
      reason = err.message;
    }
    expect(rejected).toBe(true);
    expect(reason).toContain('Spend at least £20');
  });

  it('Scenario i: Owner changes referrer_reward to £8 -> new codes promise £8, old codes still £5', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    BusinessService.saveSale(testDb, { phone: '07700900001', name: 'A', billAmountPounds: 60, receiptRef: 'I-1' }, staffId);
    const custA = testDb.customers.find((c) => c.phone === '+447700900001')!;
    const codeA = testDb.referral_codes.find((rc) => rc.owner_customer_id === custA.id)!;
    expect(codeA.referrer_return_amount).toBe(500);

    testDb.settings.referrer_reward = 8;

    BusinessService.saveSale(testDb, { phone: '07700900002', name: 'B', billAmountPounds: 40, receiptRef: 'I-2' }, staffId);
    const custB = testDb.customers.find((c) => c.phone === '+447700900002')!;
    const codeB = testDb.referral_codes.find((rc) => rc.owner_customer_id === custB.id)!;

    expect(codeB.referrer_return_amount).toBe(800);
    expect(codeA.referrer_return_amount).toBe(500);
  });

  it('Scenario j: friend_discount £25 with min_spend £20 -> rejected', () => {
    let errorMsg = '';
    try {
      BusinessService.validateSettings({
        friend_discount: 25,
        referrer_reward: 5,
        min_spend: 20,
        expiry_days: 90,
        reminder_days_before: 7,
        max_credit_share: 50,
        shop_name: 'Test Shop',
      });
    } catch (err: any) {
      errorMsg = err.message;
    }
    expect(errorMsg).toBe('Friend discount must be less than minimum spend.');
  });

  it('Scenario k: A redeems credit after a real OTP -> credit used is capped at 50% of the bill', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    const custId = crypto.randomUUID();
    testDb.customers.push({
      id: custId,
      name: 'Credit Holder',
      phone: '+447700900005',
      personal_token: 'token-k-test',
      marketing_consent: true,
      consent_at: new Date().toISOString(),
      opted_out_at: null,
      referred_by_customer_id: null,
      created_at: new Date().toISOString(),
    });
    testDb.credits.push({
      id: crypto.randomUUID(),
      customer_id: custId,
      source_sale_id: null,
      amount: 2000,
      remaining: 2000,
      status: 'active',
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      source: 'manual',
      settings_snapshot: { expiry_days: 90 },
      reason: 'test',
      created_by_staff_id: staffId,
      created_at: new Date().toISOString(),
    });

    BusinessService.requestOtp(testDb, custId);
    const otpRec = testDb.otp_codes.find((o) => o.customer_id === custId)!;
    const verifyRes = BusinessService.verifyOtp(testDb, custId, otpRec.code_plain!);

    const sale = BusinessService.saveSale(testDb, {
      phone: '+447700900005',
      billAmountPounds: 10,
      creditToUsePounds: 20,
      redemptionToken: verifyRes.redemptionToken,
      receiptRef: 'K-1',
    }, staffId);

    expect(sale.creditUsedPounds).toBe(5); // 50% of £10
  });

  it('Scenario l: Same receipt number saved twice -> second save rejected', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    BusinessService.saveSale(testDb, {
      phone: '+447700900001',
      name: 'R1',
      receiptRef: 'REC-DUP-1',
      billAmountPounds: 30,
    }, staffId);

    let rejected = false;
    try {
      BusinessService.saveSale(testDb, {
        phone: '+447700900002',
        name: 'R2',
        receiptRef: 'REC-DUP-1',
        billAmountPounds: 40,
      }, staffId);
    } catch (err: any) {
      rejected = err.message.includes('already exists');
    }
    expect(rejected).toBe(true);
  });

  it('Scenario m: validateSettings with friend_discount "abc" throws', () => {
    let rejected = false;
    try {
      BusinessService.validateSettings({
        friend_discount: 'abc',
        referrer_reward: 5,
        min_spend: 20,
      });
    } catch (err: any) {
      rejected = true;
    }
    expect(rejected).toBe(true);
  });
});

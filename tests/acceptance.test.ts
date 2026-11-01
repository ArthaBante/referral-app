import { describe, it, expect } from 'vitest';
import { getDefaultDatabaseSchema } from '../server/db.ts';
import { AuthService } from '../server/services/auth.ts';
import { BusinessService } from '../server/services/business.ts';

describe('RefFrnd Acceptance Tests - Purchase Points Model', () => {
  it('Scenario a: With defaults (10 spent = 100 points)', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    // £60 sale earns 600 points saved as a 'purchase' lot
    const res60 = BusinessService.saveSale(testDb, {
      phone: '07700900010',
      name: 'Test Customer A',
      receiptRef: 'SALE-60',
      billAmountPounds: 60,
    }, staffId);

    expect(res60.earnedPoints).toBe(600);
    const custA = testDb.customers.find((c) => c.phone === '+447700900010')!;
    const purchaseLot60 = testDb.credits.find((c) => c.customer_id === custA.id && c.source === 'purchase');
    expect(purchaseLot60).toBeDefined();
    expect(purchaseLot60!.points).toBe(600);

    // £12.34 sale earns 123 points
    const res1234 = BusinessService.saveSale(testDb, {
      phone: '07700900011',
      name: 'Test Customer B',
      receiptRef: 'SALE-1234',
      billAmountPounds: 12.34,
    }, staffId);
    expect(res1234.earnedPoints).toBe(123);

    // £12.35 sale earns 124 points
    const res1235 = BusinessService.saveSale(testDb, {
      phone: '07700900012',
      name: 'Test Customer C',
      receiptRef: 'SALE-1235',
      billAmountPounds: 12.35,
    }, staffId);
    expect(res1235.earnedPoints).toBe(124);
  });

  it('Points rounding tests at £10 = 100 points: £1.15 -> 12, £2.05 -> 21, £4.35 -> 44, £8.45 -> 85, £0.05 -> 1, £0.04 -> 0', () => {
    expect(BusinessService.calculatePurchasePoints(1.15, 10, 100)).toBe(12);
    expect(BusinessService.calculatePurchasePoints(2.05, 10, 100)).toBe(21);
    expect(BusinessService.calculatePurchasePoints(4.35, 10, 100)).toBe(44);
    expect(BusinessService.calculatePurchasePoints(8.45, 10, 100)).toBe(85);
    expect(BusinessService.calculatePurchasePoints(0.05, 10, 100)).toBe(1);
    expect(BusinessService.calculatePurchasePoints(0.04, 10, 100)).toBe(0);
  });

  it('Scenario b: Change settings to earn_spend_pounds 5, earn_points 100. £12 sale earns 240 points.', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    testDb.settings.earn_spend_pounds = 5;
    testDb.settings.earn_points = 100;

    const res12 = BusinessService.saveSale(testDb, {
      phone: '07700900020',
      name: 'Custom Spend Customer',
      receiptRef: 'SALE-12',
      billAmountPounds: 12,
    }, staffId);

    expect(res12.earnedPoints).toBe(240);
  });

  it('Scenario c: points_earned_text off (default) -> no message on sale. Turn it on -> points_earned message sent with earned_points and points_balance.', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    // Default off
    expect(testDb.settings.points_earned_text).toBe(false);
    BusinessService.saveSale(testDb, {
      phone: '07700900030',
      name: 'SMS Off Customer',
      receiptRef: 'SMS-OFF',
      billAmountPounds: 50,
    }, staffId);

    const custOff = testDb.customers.find((c) => c.phone === '+447700900030')!;
    const msgOff = testDb.messages.find((m) => m.customer_id === custOff.id && m.kind === 'points_earned');
    expect(msgOff).toBeUndefined();

    // Turn on
    testDb.settings.points_earned_text = true;
    BusinessService.saveSale(testDb, {
      phone: '07700900031',
      name: 'SMS On Customer',
      receiptRef: 'SMS-ON',
      billAmountPounds: 50,
    }, staffId);

    const custOn = testDb.customers.find((c) => c.phone === '+447700900031')!;
    const msgOn = testDb.messages.find((m) => m.customer_id === custOn.id && m.kind === 'points_earned');
    expect(msgOn).toBeDefined();
    expect(msgOn!.body).toContain('500');
  });

  it('Scenario d: Manual points adjustment "+50" and "-30" with reason -> updates balance, adds audit log entry with action points_adjusted.', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    BusinessService.saveSale(testDb, {
      phone: '07700900040',
      name: 'Adjust Customer',
      receiptRef: 'ADJ-1',
      billAmountPounds: 10, // 100 points
    }, staffId);

    const cust = testDb.customers.find((c) => c.phone === '+447700900040')!;
    expect(BusinessService.getTotalPoints(testDb, cust.id)).toBe(100);

    // Add +50 points
    const resAdd = BusinessService.adjustPoints(testDb, cust.id, 50, 'Goodwill bonus', staffId);
    expect(resAdd.newTotalPoints).toBe(150);

    // Deduct -30 points
    const resSub = BusinessService.adjustPoints(testDb, cust.id, -30, 'Correction', staffId);
    expect(resSub.newTotalPoints).toBe(120);

    // Audit log check
    const auditEntries = testDb.audit_log.filter((a) => a.action === 'points_adjusted');
    expect(auditEntries.length).toBe(2);
    expect(auditEntries[0].details.reason).toBe('Correction');
    expect(auditEntries[1].details.reason).toBe('Goodwill bonus');
  });

  it('Removing 5000 points from a customer with 1000 leaves 0 and the audit records 1000', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    BusinessService.saveSale(testDb, {
      phone: '07700900050',
      name: 'Deduct Customer',
      receiptRef: 'DED-100',
      billAmountPounds: 100, // 1000 points
    }, staffId);

    const cust = testDb.customers.find((c) => c.phone === '+447700900050')!;
    expect(BusinessService.getTotalPoints(testDb, cust.id)).toBe(1000);

    const res = BusinessService.adjustPoints(testDb, cust.id, -5000, 'Over-deduct test', staffId);
    expect(res.newTotalPoints).toBe(0);
    expect(res.removedAmount).toBe(1000);
    expect(res.message).toContain('1000');

    const auditEntry = testDb.audit_log.find((a) => a.action === 'points_adjusted')!;
    expect(auditEntry.details.pointsDelta).toBe(-1000);
  });

  it('Removing points never touches expired lots', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    const custId = 'cust-expired-test';
    testDb.customers.push({
      id: custId,
      name: 'Expired Lot Customer',
      phone: '+447700900060',
      personal_token: 'tok-exp',
      marketing_consent: false,
      consent_at: new Date().toISOString(),
      opted_out_at: null,
      referred_by_customer_id: null,
      created_at: new Date().toISOString(),
    });

    // Expired lot of 500 points
    const pastDate = new Date(Date.now() - 10 * 86400000).toISOString();
    testDb.credits.push({
      id: 'lot-exp',
      customer_id: custId,
      points: 500,
      remaining: 500,
      source: 'manual',
      source_sale_id: null,
      expires_at: pastDate,
      created_at: pastDate,
    });

    // Active lot of 200 points
    const futureDate = new Date(Date.now() + 30 * 86400000).toISOString();
    testDb.credits.push({
      id: 'lot-act',
      customer_id: custId,
      points: 200,
      remaining: 200,
      source: 'manual',
      source_sale_id: null,
      expires_at: futureDate,
      created_at: new Date().toISOString(),
    });

    // Remove 100 points
    BusinessService.adjustPoints(testDb, custId, -100, 'Test deduction', staffId);

    // Active lot should be reduced to 100, expired lot should still have 500 remaining
    const expiredLot = testDb.credits.find((c) => c.id === 'lot-exp')!;
    const activeLot = testDb.credits.find((c) => c.id === 'lot-act')!;
    expect(expiredLot.remaining).toBe(500);
    expect(activeLot.remaining).toBe(100);
  });

  it('1.5 points is rejected', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    const cust = testDb.customers[0] || { id: 'test-cust' };
    expect(() => BusinessService.adjustPoints(testDb, cust.id, 1.5, 'Decimal test', staffId)).toThrow();
  });

  it('Scenario e: validateSettings rejects earn_points 0, "abc", points_expiry_days 0', () => {
    const validBase = {
      earn_spend_pounds: 10,
      earn_points: 100,
      points_expiry_days: 365,
      referrer_points: 100,
      friend_points: 100,
      min_spend: 10,
      reminder_days_before: 7,
      shop_name: 'Test Shop',
    };

    expect(() => BusinessService.validateSettings({ ...validBase, earn_points: 0 })).toThrow();
    expect(() => BusinessService.validateSettings({ ...validBase, earn_points: 'abc' as any })).toThrow();
    expect(() => BusinessService.validateSettings({ ...validBase, points_expiry_days: 0 })).toThrow();
  });

  it('1. Both referral bonuses default to 100', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);

    expect(testDb.settings.friend_points).toBe(100);
    expect(testDb.settings.referrer_points).toBe(100);
  });

  it('2. "No minimum" option for friend minimum spend (min_spend = null)', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    // Create referrer customer
    const refSale = BusinessService.saveSale(testDb, {
      phone: '07700900070',
      name: 'Referrer Customer',
      billAmountPounds: 20,
    }, staffId);

    const refCust = testDb.customers.find((c) => c.phone === '+447700900070')!;
    const refCode = testDb.referral_codes.find((rc) => rc.owner_customer_id === refCust.id)!;

    // With min_spend = 10, £9 bill is rejected
    testDb.settings.min_spend = 10;
    const check1 = BusinessService.validateReferralCode(testDb, refCode.code, '07700900071', 9);
    expect(check1.valid).toBe(false);
    expect(check1.reason).toBe('Spend at least £10 to use a code');

    // With min_spend = null, £3 bill is accepted
    testDb.settings.min_spend = null;
    const check2 = BusinessService.validateReferralCode(testDb, refCode.code, '07700900071', 3);
    expect(check2.valid).toBe(true);
  });

  it('3. Referral limit message change: exactly "This code has reached its limit"', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    testDb.settings.referral_limit = 1;

    const refSale = BusinessService.saveSale(testDb, {
      phone: '07700900080',
      name: 'Referrer Limit Customer',
      billAmountPounds: 20,
    }, staffId);

    const refCust = testDb.customers.find((c) => c.phone === '+447700900080')!;
    const refCode = testDb.referral_codes.find((rc) => rc.owner_customer_id === refCust.id)!;

    // First use works
    BusinessService.saveSale(testDb, {
      phone: '07700900081',
      name: 'Friend One',
      billAmountPounds: 20,
      referralCode: refCode.code,
    }, staffId);

    // Second use rejected with exact string
    const check = BusinessService.validateReferralCode(testDb, refCode.code, '07700900082', 20);
    expect(check.valid).toBe(false);
    expect(check.reason).toBe('This code has reached its limit');
  });

  it('5. Removing points from customer with 0 points', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    const custId = 'cust-zero-points';
    testDb.customers.push({
      id: custId,
      name: 'Amy Walsh',
      phone: '+447700900090',
      personal_token: 'tok-zero',
      marketing_consent: false,
      consent_at: new Date().toISOString(),
      opted_out_at: null,
      referred_by_customer_id: null,
      created_at: new Date().toISOString(),
    });

    const auditCountBefore = testDb.audit_log.length;

    const res = BusinessService.adjustPoints(testDb, custId, -100, 'Test remove 0', staffId);
    expect(res.success).toBe(false);
    expect(res.message).toBe('Amy Walsh has no points to remove');
    expect(testDb.audit_log.length).toBe(auditCountBefore);
  });

  it('Settings rejects friend_points -5, referrer_points "abc", min_spend -1, reminder_days_before 31, and a blank shop name', () => {
    const validBase = {
      earn_spend_pounds: 10,
      earn_points: 100,
      points_expiry_days: 365,
      referrer_points: 100,
      friend_points: 100,
      min_spend: 10,
      reminder_days_before: 7,
      shop_name: 'Test Shop',
      redeem_points: 1000,
      redeem_pounds: 5,
      max_off_per_bill: null,
    };

    expect(() => BusinessService.validateSettings({ ...validBase, friend_points: -5 })).toThrow();
    expect(() => BusinessService.validateSettings({ ...validBase, referrer_points: 'abc' as any })).toThrow();
    expect(() => BusinessService.validateSettings({ ...validBase, min_spend: -1 })).toThrow();
    expect(() => BusinessService.validateSettings({ ...validBase, reminder_days_before: 31 })).toThrow();
    expect(() => BusinessService.validateSettings({ ...validBase, shop_name: '   ' })).toThrow();
  });

  it('validateSettings accepts min_spend null and rejects -1 and 2.5', () => {
    const validBase = {
      earn_spend_pounds: 10,
      earn_points: 100,
      points_expiry_days: 365,
      referrer_points: 100,
      friend_points: 100,
      min_spend: 10,
      reminder_days_before: 7,
      shop_name: 'Test Shop',
      redeem_points: 1000,
      redeem_pounds: 5,
      max_off_per_bill: null,
    };

    const resNull = BusinessService.validateSettings({ ...validBase, min_spend: null });
    expect(resNull.min_spend).toBeNull();

    expect(() => BusinessService.validateSettings({ ...validBase, min_spend: -1 })).toThrow();
    expect(() => BusinessService.validateSettings({ ...validBase, min_spend: 2.5 })).toThrow();
  });

  it('Spending Test 1: 2500 points, 1000 = £5, £30 bill, 2 blocks: pays £20, spends 2000, keeps 500, then earns 300 on full £30', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    // Create customer with 2500 points lot
    const custId = 'cust-spend-1';
    const phone = '07700900100';
    testDb.customers.push({
      id: custId,
      name: 'Spend Customer 1',
      phone: '+447700900100',
      personal_token: 'tok-spend-1',
      marketing_consent: false,
      consent_at: new Date().toISOString(),
      opted_out_at: null,
      referred_by_customer_id: null,
      created_at: new Date().toISOString(),
    });
    testDb.credits.push({
      id: 'lot-2500',
      customer_id: custId,
      points: 2500,
      remaining: 2500,
      source: 'manual',
      source_sale_id: null,
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      created_at: new Date().toISOString(),
    });

    // Confirm QR
    const confirm = BusinessService.confirmCustomerQr(testDb, custId, 'tok-spend-1');
    expect(confirm.redemptionToken).toBeDefined();

    // Save sale spending 2 blocks (£10 off on £30 bill)
    const saleRes = BusinessService.saveSale(testDb, {
      phone,
      name: 'Spend Customer 1',
      billAmountPounds: 30,
      blocksToSpend: 2,
      redemptionToken: confirm.redemptionToken,
    }, staffId);

    expect(saleRes.discountPounds).toBe(10);
    expect(saleRes.finalAmountPounds).toBe(20);
    expect(saleRes.pointsSpent).toBe(2000);
    expect(saleRes.earnedPoints).toBe(300); // 300 points earned on full £30 bill

    // Total active points remaining: 500 (from lot-2500) + 300 (new purchase lot) = 800
    expect(BusinessService.getTotalPoints(testDb, custId)).toBe(800);
    const preExistingLot = testDb.credits.find(c => c.id === 'lot-2500')!;
    expect(preExistingLot.remaining).toBe(500);
  });

  it('Spending Test 2: Asking for 3 blocks with 2500 points is rejected', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    const custId = 'cust-spend-2';
    testDb.customers.push({
      id: custId,
      name: 'Spend Customer 2',
      phone: '+447700900101',
      personal_token: 'tok-spend-2',
      marketing_consent: false,
      consent_at: new Date().toISOString(),
      opted_out_at: null,
      referred_by_customer_id: null,
      created_at: new Date().toISOString(),
    });
    testDb.credits.push({
      id: 'lot-2500-b',
      customer_id: custId,
      points: 2500,
      remaining: 2500,
      source: 'manual',
      source_sale_id: null,
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      created_at: new Date().toISOString(),
    });

    const confirm = BusinessService.confirmCustomerQr(testDb, custId, 'tok-spend-2');

    expect(() => BusinessService.saveSale(testDb, {
      phone: '07700900101',
      name: 'Spend Customer 2',
      billAmountPounds: 50,
      blocksToSpend: 3,
      redemptionToken: confirm.redemptionToken,
    }, staffId)).toThrow();
  });

  it('Spending Test 3: max_off_per_bill 5 rejects 2 blocks', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    testDb.settings.max_off_per_bill = 5;

    const custId = 'cust-spend-3';
    testDb.customers.push({
      id: custId,
      name: 'Spend Customer 3',
      phone: '+447700900102',
      personal_token: 'tok-spend-3',
      marketing_consent: false,
      consent_at: new Date().toISOString(),
      opted_out_at: null,
      referred_by_customer_id: null,
      created_at: new Date().toISOString(),
    });
    testDb.credits.push({
      id: 'lot-2500-c',
      customer_id: custId,
      points: 2500,
      remaining: 2500,
      source: 'manual',
      source_sale_id: null,
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      created_at: new Date().toISOString(),
    });

    const confirm = BusinessService.confirmCustomerQr(testDb, custId, 'tok-spend-3');

    expect(() => BusinessService.saveSale(testDb, {
      phone: '07700900102',
      name: 'Spend Customer 3',
      billAmountPounds: 50,
      blocksToSpend: 2,
      redemptionToken: confirm.redemptionToken,
    }, staffId)).toThrow();
  });

  it('Spending Test 4: A £3 bill with 1 block becomes £0 and still spends 1000 points', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    const custId = 'cust-spend-4';
    testDb.customers.push({
      id: custId,
      name: 'Spend Customer 4',
      phone: '+447700900103',
      personal_token: 'tok-spend-4',
      marketing_consent: false,
      consent_at: new Date().toISOString(),
      opted_out_at: null,
      referred_by_customer_id: null,
      created_at: new Date().toISOString(),
    });
    testDb.credits.push({
      id: 'lot-1000',
      customer_id: custId,
      points: 1000,
      remaining: 1000,
      source: 'manual',
      source_sale_id: null,
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      created_at: new Date().toISOString(),
    });

    const confirm = BusinessService.confirmCustomerQr(testDb, custId, 'tok-spend-4');

    const saleRes = BusinessService.saveSale(testDb, {
      phone: '07700900103',
      name: 'Spend Customer 4',
      billAmountPounds: 3,
      blocksToSpend: 1,
      redemptionToken: confirm.redemptionToken,
    }, staffId);

    expect(saleRes.discountPounds).toBe(5);
    expect(saleRes.finalAmountPounds).toBe(0);
    expect(saleRes.pointsSpent).toBe(1000);
    expect(saleRes.earnedPoints).toBe(30); // 30 points on £3 bill

    const preExistingLot = testDb.credits.find(c => c.id === 'lot-1000')!;
    expect(preExistingLot.remaining).toBe(0);
  });

  it('Spending Test 5: A new friend cannot spend their welcome points on their first bill', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    // First create referrer
    BusinessService.saveSale(testDb, {
      phone: '07700900110',
      name: 'Referrer First',
      billAmountPounds: 20,
    }, staffId);
    const refCust = testDb.customers.find(c => c.phone === '+447700900110')!;
    const refCode = testDb.referral_codes.find(rc => rc.owner_customer_id === refCust.id)!;

    // Friend tries to spend 1 block on their first bill
    expect(() => BusinessService.saveSale(testDb, {
      phone: '07700900111',
      name: 'Friend First',
      billAmountPounds: 20,
      referralCode: refCode.code,
      blocksToSpend: 1,
      redemptionToken: 'dummy-token',
    }, staffId)).toThrow();
  });

  it('Spending Test 6: Spending with no token, a wrong token, another customer token or a used token is rejected', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    const custA = 'cust-spend-6a';
    const custB = 'cust-spend-6b';
    testDb.customers.push({
      id: custA,
      name: 'Customer A',
      phone: '+447700900120',
      personal_token: 'tok-6a',
      marketing_consent: false,
      consent_at: new Date().toISOString(),
      opted_out_at: null,
      referred_by_customer_id: null,
      created_at: new Date().toISOString(),
    });
    testDb.credits.push({
      id: 'lot-6a',
      customer_id: custA,
      points: 2000,
      remaining: 2000,
      source: 'manual',
      source_sale_id: null,
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      created_at: new Date().toISOString(),
    });

    testDb.customers.push({
      id: custB,
      name: 'Customer B',
      phone: '+447700900121',
      personal_token: 'tok-6b',
      marketing_consent: false,
      consent_at: new Date().toISOString(),
      opted_out_at: null,
      referred_by_customer_id: null,
      created_at: new Date().toISOString(),
    });

    // 1. No token
    expect(() => BusinessService.saveSale(testDb, {
      phone: '07700900120',
      name: 'Customer A',
      billAmountPounds: 20,
      blocksToSpend: 1,
    }, staffId)).toThrow();

    // 2. Wrong token
    expect(() => BusinessService.saveSale(testDb, {
      phone: '07700900120',
      name: 'Customer A',
      billAmountPounds: 20,
      blocksToSpend: 1,
      redemptionToken: 'wrong-token',
    }, staffId)).toThrow();

    // 3. Customer B token used for Customer A
    const confirmB = BusinessService.confirmCustomerQr(testDb, custB, 'tok-6b');
    expect(() => BusinessService.saveSale(testDb, {
      phone: '07700900120',
      name: 'Customer A',
      billAmountPounds: 20,
      blocksToSpend: 1,
      redemptionToken: confirmB.redemptionToken,
    }, staffId)).toThrow();

    // 4. Used token
    const confirmA = BusinessService.confirmCustomerQr(testDb, custA, 'tok-6a');
    BusinessService.saveSale(testDb, {
      phone: '07700900120',
      name: 'Customer A',
      billAmountPounds: 20,
      blocksToSpend: 1,
      redemptionToken: confirmA.redemptionToken,
    }, staffId);

    // Reuse token
    expect(() => BusinessService.saveSale(testDb, {
      phone: '07700900120',
      name: 'Customer A',
      billAmountPounds: 20,
      blocksToSpend: 1,
      redemptionToken: confirmA.redemptionToken,
    }, staffId)).toThrow();
  });

  it('Spending Test 7: A wrong OTP 5 times blocks the code. The right OTP within 10 minutes gives a token.', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);

    const custId = 'cust-otp-7';
    testDb.customers.push({
      id: custId,
      name: 'OTP Customer',
      phone: '+447700900130',
      personal_token: 'tok-otp-7',
      marketing_consent: false,
      consent_at: new Date().toISOString(),
      opted_out_at: null,
      referred_by_customer_id: null,
      created_at: new Date().toISOString(),
    });

    // Send OTP
    const sendRes = BusinessService.sendOtpCode(testDb, custId);
    expect(sendRes.success).toBe(true);

    const otpRecord = testDb.otp_codes.find(o => o.customer_id === custId)!;
    const correctCode = otpRecord.code_plain!;
    const wrongCode = correctCode === '123456' ? '654321' : '123456';

    // 4 wrong attempts throw error
    for (let i = 0; i < 4; i++) {
      expect(() => BusinessService.verifyOtpCode(testDb, custId, wrongCode)).toThrow();
    }

    // 5th wrong attempt blocks code
    expect(() => BusinessService.verifyOtpCode(testDb, custId, wrongCode)).toThrow('Code blocked due to too many incorrect attempts');

    // Trying correct code now fails because blocked
    expect(() => BusinessService.verifyOtpCode(testDb, custId, correctCode)).toThrow('Code blocked due to too many incorrect attempts');

    // Send new OTP
    BusinessService.sendOtpCode(testDb, custId);
    const newOtpRecord = testDb.otp_codes.filter(o => o.customer_id === custId && !o.used_at).pop()!;
    
    // Verify correct code gives redemption token
    const resRight = BusinessService.verifyOtpCode(testDb, custId, newOtpRecord.code_plain!);
    expect(resRight.success).toBe(true);
    expect(resRight.redemptionToken).toBeDefined();
  });

  it('Spending Test 8: Expired lots are never spent', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    const custId = 'cust-spend-8';
    testDb.customers.push({
      id: custId,
      name: 'Expired Customer',
      phone: '+447700900140',
      personal_token: 'tok-spend-8',
      marketing_consent: false,
      consent_at: new Date().toISOString(),
      opted_out_at: null,
      referred_by_customer_id: null,
      created_at: new Date().toISOString(),
    });

    // Only expired lot
    testDb.credits.push({
      id: 'lot-exp-8',
      customer_id: custId,
      points: 2000,
      remaining: 2000,
      source: 'manual',
      source_sale_id: null,
      expires_at: new Date(Date.now() - 10 * 86400000).toISOString(),
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    });

    const confirm = BusinessService.confirmCustomerQr(testDb, custId, 'tok-spend-8');

    expect(() => BusinessService.saveSale(testDb, {
      phone: '07700900140',
      name: 'Expired Customer',
      billAmountPounds: 20,
      blocksToSpend: 1,
      redemptionToken: confirm.redemptionToken,
    }, staffId)).toThrow();
  });
});

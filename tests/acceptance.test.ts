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

  it('Settings rejects friend_points -5, referrer_points "abc", min_spend -1, reminder_days_before 31, and a blank shop name', () => {
    const validBase = {
      earn_spend_pounds: 10,
      earn_points: 100,
      points_expiry_days: 365,
      referrer_points: 100,
      friend_points: 50,
      min_spend: 10,
      reminder_days_before: 7,
      shop_name: 'Test Shop',
    };

    expect(() => BusinessService.validateSettings({ ...validBase, friend_points: -5 })).toThrow();
    expect(() => BusinessService.validateSettings({ ...validBase, referrer_points: 'abc' as any })).toThrow();
    expect(() => BusinessService.validateSettings({ ...validBase, min_spend: -1 })).toThrow();
    expect(() => BusinessService.validateSettings({ ...validBase, reminder_days_before: 31 })).toThrow();
    expect(() => BusinessService.validateSettings({ ...validBase, shop_name: '   ' })).toThrow();
  });
});

import { describe, it, expect } from 'vitest';
import { getDefaultDatabaseSchema } from '../server/db.ts';
import { AuthService } from '../server/services/auth.ts';
import { BusinessService } from '../server/services/business.ts';

describe('RefFrnd Acceptance Tests - Points Model', () => {
  it('Scenario a: Customer with no code -> receives welcome_no_code message', () => {
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

  it('Scenario b: Customer B uses A code on £20 bill -> B gets 50 welcome points, A gets 100 points', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    BusinessService.saveSale(testDb, {
      phone: '07700900001',
      name: 'Customer A',
      marketingConsent: true,
      receiptRef: 'TEST-B-001',
      billAmountPounds: 60,
    }, staffId);

    const custA = testDb.customers.find((c) => c.phone === '+447700900001')!;
    const codeA = testDb.referral_codes.find((rc) => rc.owner_customer_id === custA.id)!;

    const saleRes = BusinessService.saveSale(testDb, {
      phone: '07700900002',
      name: 'Customer B',
      marketingConsent: true,
      receiptRef: 'TEST-B-002',
      billAmountPounds: 20,
      referralCode: codeA.code,
    }, staffId);

    expect(saleRes.friendPointsGiven).toBe(50);
    expect(saleRes.referrerPointsGiven).toBe(100);

    const custB = testDb.customers.find((c) => c.phone === '+447700900002')!;
    expect(BusinessService.getTotalPoints(testDb, custB.id)).toBe(50);
    expect(BusinessService.getTotalPoints(testDb, custA.id)).toBe(100);
  });

  it('Scenario c: One code, many friends -> Customer C also uses A code -> A has 200 total points', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    BusinessService.saveSale(testDb, {
      phone: '07700900001',
      name: 'Customer A',
      billAmountPounds: 60,
      receiptRef: 'TEST-C-001',
    }, staffId);

    const custA = testDb.customers.find((c) => c.phone === '+447700900001')!;
    const codeA = testDb.referral_codes.find((rc) => rc.owner_customer_id === custA.id)!;

    BusinessService.saveSale(testDb, {
      phone: '07700900002',
      name: 'Customer B',
      billAmountPounds: 20,
      referralCode: codeA.code,
      receiptRef: 'TEST-C-002',
    }, staffId);

    BusinessService.saveSale(testDb, {
      phone: '07700900003',
      name: 'Customer C',
      billAmountPounds: 25,
      referralCode: codeA.code,
      receiptRef: 'TEST-C-003',
    }, staffId);

    expect(BusinessService.getTotalPoints(testDb, custA.id)).toBe(200);
    expect(BusinessService.getFriendsReferredCount(testDb, custA.id)).toBe(2);
  });

  it('Scenario d: Customer portal page data for A shows totalPoints = 200 and friendsReferred = 2', async () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    BusinessService.saveSale(testDb, {
      phone: '07700900001',
      name: 'Customer A',
      billAmountPounds: 60,
      receiptRef: 'TEST-D-001',
    }, staffId);

    const custA = testDb.customers.find((c) => c.phone === '+447700900001')!;
    const codeA = testDb.referral_codes.find((rc) => rc.owner_customer_id === custA.id)!;

    BusinessService.saveSale(testDb, {
      phone: '07700900002',
      name: 'Customer B',
      billAmountPounds: 20,
      referralCode: codeA.code,
      receiptRef: 'TEST-D-002',
    }, staffId);

    BusinessService.saveSale(testDb, {
      phone: '07700900003',
      name: 'Customer C',
      billAmountPounds: 25,
      referralCode: codeA.code,
      receiptRef: 'TEST-D-003',
    }, staffId);

    const pageData = await BusinessService.getCustomerPageData(testDb, custA.personal_token);
    expect(pageData.totalPoints).toBe(200);
    expect(pageData.friendsReferred).toBe(2);
  });

  it('Scenario e: Referral limit enforced -> 3rd referral rejected when limit is 2', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;
    testDb.settings.referral_limit = 2;

    BusinessService.saveSale(testDb, {
      phone: '07700900001',
      name: 'Customer A',
      billAmountPounds: 60,
      receiptRef: 'TEST-E-001',
    }, staffId);

    const custA = testDb.customers.find((c) => c.phone === '+447700900001')!;
    const codeA = testDb.referral_codes.find((rc) => rc.owner_customer_id === custA.id)!;

    BusinessService.saveSale(testDb, {
      phone: '07700900002',
      name: 'Customer B',
      billAmountPounds: 20,
      referralCode: codeA.code,
      receiptRef: 'TEST-E-002',
    }, staffId);

    BusinessService.saveSale(testDb, {
      phone: '07700900003',
      name: 'Customer C',
      billAmountPounds: 20,
      referralCode: codeA.code,
      receiptRef: 'TEST-E-003',
    }, staffId);

    const checkLimit = BusinessService.validateReferralCode(testDb, codeA.code, '+447700900004', 20);
    expect(checkLimit.valid).toBe(false);
    expect(checkLimit.reason).toContain('referral limit');
  });

  it('Scenario f: Self-referral and existing customer referral code usage rejected', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    BusinessService.saveSale(testDb, {
      phone: '07700900001',
      name: 'Customer A',
      billAmountPounds: 60,
      receiptRef: 'TEST-F-001',
    }, staffId);

    const custA = testDb.customers.find((c) => c.phone === '+447700900001')!;
    const codeA = testDb.referral_codes.find((rc) => rc.owner_customer_id === custA.id)!;

    // Self-referral check
    const checkSelf = BusinessService.validateReferralCode(testDb, codeA.code, custA.phone, 20);
    expect(checkSelf.valid).toBe(false);
    expect(checkSelf.reason).toBe('You cannot use your own referral code');

    // Existing customer check
    const checkExisting = BusinessService.validateReferralCode(testDb, codeA.code, custA.phone, 20);
    expect(checkExisting.valid).toBe(false);
  });

  it('Scenario g: Duplicate receipt numbers rejected', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    BusinessService.saveSale(testDb, {
      phone: '07700900001',
      name: 'R1',
      receiptRef: 'REC-DUP-1',
      billAmountPounds: 30,
    }, staffId);

    let rejected = false;
    try {
      BusinessService.saveSale(testDb, {
        phone: '07700900002',
        name: 'R2',
        receiptRef: 'REC-DUP-1',
        billAmountPounds: 40,
      }, staffId);
    } catch (err: any) {
      rejected = err.message.includes('already exists');
    }
    expect(rejected).toBe(true);
  });

  it('Scenario h: Paused scheme rejects referral code', () => {
    const testDb = getDefaultDatabaseSchema();
    AuthService.populateSeed(testDb);
    const staffId = testDb.staff[0].id;

    BusinessService.saveSale(testDb, {
      phone: '07700900001',
      name: 'Customer A',
      billAmountPounds: 60,
      receiptRef: 'TEST-H-001',
    }, staffId);

    const custA = testDb.customers.find((c) => c.phone === '+447700900001')!;
    const codeA = testDb.referral_codes.find((rc) => rc.owner_customer_id === custA.id)!;

    testDb.settings.scheme_enabled = false;
    const checkPaused = BusinessService.validateReferralCode(testDb, codeA.code, '+447700900099', 20);
    expect(checkPaused.valid).toBe(false);
    expect(checkPaused.reason).toBe('Referral scheme is paused');
  });

  it('Scenario i: validateSettings rejects invalid values (referrer_points 0, string, referral_limit 0)', () => {
    expect(() => BusinessService.validateSettings({ referrer_points: 0 })).toThrow();
    expect(() => BusinessService.validateSettings({ referrer_points: 'abc' as any })).toThrow();
    expect(() => BusinessService.validateSettings({ referral_limit: 0 })).toThrow();
  });
});

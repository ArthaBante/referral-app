export interface StaffUser {
  id: string;
  name: string;
  username: string;
  role: 'owner' | 'cashier';
}

export interface CustomerDetail {
  id: string;
  name: string;
  phone: string;
  personal_token: string;
  marketing_consent: boolean;
  consent_at: string;
  opted_out_at: string | null;
  referred_by_customer_id: string | null;
  created_at: string;
}

export interface CustomerListItem {
  id: string;
  name: string;
  phone: string;
  activeCreditRupees: number;
  pendingCreditRupees: number;
  marketingConsent: boolean;
  joinedDate: string;
  referralCode: string;
  referralCodeUsed: boolean;
  personalToken: string;
}

export interface CustomerPortalData {
  shopName: string;
  firstName: string;
  fullName: string;
  personalToken: string;
  personalQrDataUri: string;
  totalActiveCreditRupees: number;
  activeLots: Array<{
    id: string;
    amountRupees: number;
    remainingRupees: number;
    expiresAt: string | null;
    daysLeft: number | null;
  }>;
  totalPendingCreditRupees: number;
  pendingLots: Array<{
    id: string;
    amountRupees: number;
    availableAt: string;
  }>;
  referralCode: {
    code: string;
    status: 'unused' | 'used';
    qrDataUri: string;
    whatsappShareUrl: string;
    bRewardLabel: string;
  } | null;
  marketingConsent: boolean;
  optedOut: boolean;
}

export interface OwnerDashboardData {
  totalCustomers: number;
  referralCustomers: number;
  referralCodesUsed: number;
  creditIssuedRupees: number;
  creditRedeemedRupees: number;
  creditOutstandingRupees: number;
  creditExpiredRupees: number;
  salesFromReferredCustomersRupees: number;
  topReferrers: Array<{
    customerId: string;
    name: string;
    phone: string;
    referralsCount: number;
  }>;
}

export interface SettingsData {
  scheme_enabled: boolean;
  b_discount_type: 'percent' | 'fixed';
  b_discount_value: number;
  b_discount_cap: number | null;
  a_credit_type: 'percent' | 'fixed';
  a_credit_value: number;
  min_bill_for_referral: number | null;
  pending_days: number;
  expiry_days: number;
  reminder_days_before: number;
  max_credit_share: number;
  shop_name: string;
  message_language: 'English' | 'Hindi' | 'both';
  updated_at: string;
  updated_by: string;
}

export interface SaleItem {
  id: string;
  customer_id: string;
  customerName: string;
  customerPhone: string;
  tally_bill_no: string;
  billAmountRupees: number;
  discountAmountRupees: number;
  creditUsedRupees: number;
  referral_code_id: string | null;
  staff_id: string;
  status: 'completed' | 'returned';
  returned_at: string | null;
  created_at: string;
}

export interface MessageItem {
  id: string;
  customer_id: string;
  kind: string;
  channel: string;
  body: string;
  status: 'queued' | 'sent' | 'failed';
  error: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface AuditItem {
  id: string;
  staff_id: string;
  action: string;
  details: any;
  created_at: string;
}

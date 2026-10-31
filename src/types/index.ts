export interface StaffUser {
  id: string;
  name: string;
  username: string;
  role: 'owner' | 'cashier';
}

export interface CustomerListItem {
  id: string;
  name: string;
  phone: string;
  activeCreditPounds: number;
  marketingConsent: boolean;
  joinedDate: string;
  referralCode: string;
  referralCodeUsed: boolean;
  promisedReturnPounds: number;
  personalToken: string;
}

export interface CustomerPortalData {
  shopName: string;
  firstName: string;
  fullName: string;
  personalToken: string;
  personalQrDataUri: string;
  totalActiveCreditPounds: number;
  activeLots: Array<{
    id: string;
    amountPounds: number;
    remainingPounds: number;
    source: string;
    expiresAt: string | null;
    daysLeft: number | null;
  }>;
  referralCode: {
    code: string;
    status: 'unused' | 'used';
    qrDataUri: string;
    whatsappShareUrl: string;
    friendDiscountPounds: number;
    referrerRewardPounds: number;
  } | null;
  marketingConsent: boolean;
  optedOut: boolean;
}

export interface OwnerDashboardData {
  totalCustomers: number;
  referralCustomers: number;
  referralCodesUsed: number;
  discountsGivenPounds: number;
  returnsPaidPounds: number;
  creditRedeemedPounds: number;
  creditOutstandingPounds: number;
  creditExpiredPounds: number;
  salesFromReferredCustomersPounds: number;
  topReferrers: Array<{
    customerId: string;
    name: string;
    phone: string;
    referralsCount: number;
  }>;
}

export interface SettingsData {
  scheme_enabled: boolean;
  friend_discount: number;
  referrer_reward: number;
  min_spend: number;
  expiry_days: number;
  reminder_days_before: number;
  max_credit_share: number;
  shop_name: string;
  updated_at: string;
  updated_by: string;
}

export interface SaleItem {
  id: string;
  customer_id: string;
  customerName: string;
  customerPhone: string;
  receipt_ref: string | null;
  billAmountPounds: number;
  discountAmountPounds?: number;
  creditUsedPounds: number;
  referral_code_id: string | null;
  staff_id: string;
  created_at: string;
}

export interface MessageItem {
  id: string;
  customer_id: string;
  kind: string;
  channel: string;
  body: string;
  status: 'sent' | 'failed';
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

export type MessageTemplateKind =
  | 'welcome_no_code'
  | 'welcome_with_code'
  | 'referral_return'
  | 'credit_expiring'
  | 'credit_used'
  | 'otp'
  | 'offer_footer';

export interface MessageTemplateItem {
  id: string;
  kind: MessageTemplateKind;
  body: string;
  updated_at: string;
  updated_by: string;
}

export interface TemplateConfigItem {
  kind: MessageTemplateKind;
  title: string;
  description: string;
  requiredPlaceholders: string[];
  supportedPlaceholders: string[];
  defaultEn: string;
}

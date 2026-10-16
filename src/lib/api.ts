import {
  StaffUser,
  CustomerPortalData,
  OwnerDashboardData,
  SettingsData,
  CustomerListItem,
  SaleItem,
  MessageItem,
  AuditItem,
} from '../types/index.ts';

const TOKEN_KEY = 'raigarh_staff_token';
const USER_KEY = 'raigarh_staff_user';

export class ApiClient {
  public static getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  public static getStoredUser(): StaffUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  public static saveSession(token: string, staff: StaffUser) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(staff));
  }

  public static clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  private static async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`/api${endpoint}`, {
      ...options,
      headers,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `HTTP error ${res.status}`);
    }
    return data as T;
  }

  // Auth
  public static async login(username: string, password: string): Promise<{ token: string; staff: StaffUser }> {
    const data = await this.request<{ token: string; staff: StaffUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    this.saveSession(data.token, data.staff);
    return data;
  }

  public static async logout(): Promise<void> {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } finally {
      this.clearSession();
    }
  }

  public static async getMe(): Promise<{ staff: StaffUser }> {
    return this.request<{ staff: StaffUser }>('/auth/me');
  }

  // Customer Portal (Public)
  public static async getCustomerPortal(token: string): Promise<CustomerPortalData> {
    return this.request<CustomerPortalData>(`/customer/by-token/${token}`);
  }

  public static async optOutCustomer(token: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(`/customer/opt-out/${token}`, {
      method: 'POST',
    });
  }

  // Cashier Endpoints
  public static async lookupCustomer(phone: string): Promise<{
    exists: boolean;
    formattedPhone: string;
    customerId?: string;
    name?: string;
    activeCreditRupees?: number;
    pendingCreditRupees?: number;
    marketingConsent?: boolean;
    personalToken?: string;
  }> {
    return this.request(`/cashier/lookup-customer?phone=${encodeURIComponent(phone)}`);
  }

  public static async validateReferral(code: string, buyerPhone: string, billAmountRupees?: number): Promise<{
    valid: boolean;
    reason?: string;
    code?: string;
    ownerName?: string;
    discountRupees?: number;
    creditRupees?: number;
  }> {
    return this.request('/cashier/validate-referral', {
      method: 'POST',
      body: JSON.stringify({ code, buyerPhone, billAmountRupees }),
    });
  }

  public static async requestOtp(customerId: string): Promise<{
    success: boolean;
    message: string;
    devOtp?: string;
    expiresAt: string;
  }> {
    return this.request('/cashier/request-otp', {
      method: 'POST',
      body: JSON.stringify({ customerId }),
    });
  }

  public static async verifyOtp(customerId: string, otp: string): Promise<{ verified: boolean }> {
    return this.request('/cashier/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ customerId, otp }),
    });
  }

  public static async verifyPersonalQr(customerId: string, scannedTokenOrUrl: string): Promise<{ verified: boolean }> {
    return this.request('/cashier/verify-personal-qr', {
      method: 'POST',
      body: JSON.stringify({ customerId, scannedTokenOrUrl }),
    });
  }

  public static async calculateBill(params: {
    phone: string;
    billAmountRupees: number;
    referralCode?: string;
    useCredit?: boolean;
  }): Promise<{
    billAmountRupees: number;
    discountRupees: number;
    creditUsedRupees: number;
    finalPayableRupees: number;
    instructions: string;
  }> {
    return this.request('/cashier/calculate-bill', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  public static async saveSale(payload: {
    phone: string;
    name?: string;
    marketingConsent?: boolean;
    tallyBillNo: string;
    billAmountRupees: number;
    referralCode?: string;
    useCredit?: boolean;
    verifiedCreditAuth?: 'personal_qr' | 'otp';
  }): Promise<any> {
    return this.request('/cashier/save-sale', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public static async findSales(query: string = ''): Promise<{ sales: SaleItem[] }> {
    return this.request(`/cashier/find-sale?query=${encodeURIComponent(query)}`);
  }

  public static async markReturned(saleId: string, reason?: string): Promise<any> {
    return this.request('/cashier/mark-returned', {
      method: 'POST',
      body: JSON.stringify({ saleId, reason }),
    });
  }

  // Owner Endpoints
  public static async getDashboard(from?: string, to?: string): Promise<OwnerDashboardData> {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return this.request<OwnerDashboardData>(`/owner/dashboard?${params.toString()}`);
  }

  public static async getSettings(): Promise<SettingsData> {
    return this.request<SettingsData>('/owner/settings');
  }

  public static async updateSettings(settings: Partial<SettingsData>): Promise<{ success: boolean; settings: SettingsData }> {
    return this.request('/owner/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    });
  }

  public static async getCustomers(query: string = ''): Promise<{ customers: CustomerListItem[] }> {
    return this.request(`/owner/customers?query=${encodeURIComponent(query)}`);
  }

  public static async getCustomerDetails(id: string): Promise<any> {
    return this.request(`/owner/customers/${id}`);
  }

  public static async adjustCredit(customerId: string, amountRupees: number, reason: string): Promise<any> {
    return this.request(`/owner/customers/${customerId}/credit-adjustment`, {
      method: 'POST',
      body: JSON.stringify({ amountRupees, reason }),
    });
  }

  public static async deleteCustomer(customerId: string): Promise<any> {
    return this.request(`/owner/customers/${customerId}`, {
      method: 'DELETE',
    });
  }

  public static async getOfferAudience(): Promise<{ eligibleCount: number; totalCustomers: number }> {
    return this.request('/owner/offers/audience');
  }

  public static async sendOffer(text: string): Promise<{ success: boolean; sentCount: number }> {
    return this.request('/owner/offers/send', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  }

  public static async getStaff(): Promise<{ staff: any[] }> {
    return this.request('/owner/staff');
  }

  public static async createStaff(payload: any): Promise<any> {
    return this.request('/owner/staff', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public static async updateStaff(id: string, payload: any): Promise<any> {
    return this.request(`/owner/staff/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  public static async getMessages(): Promise<{ messages: MessageItem[] }> {
    return this.request('/owner/messages');
  }

  public static async retryMessage(id: string): Promise<any> {
    return this.request(`/owner/messages/${id}/retry`, {
      method: 'POST',
    });
  }

  public static async getAuditLog(): Promise<{ auditLog: AuditItem[] }> {
    return this.request('/owner/audit-log');
  }

  public static async runDailyJob(): Promise<any> {
    return this.request('/owner/run-daily-job', {
      method: 'POST',
    });
  }

  // Acceptance Tests
  public static async runAllTests(): Promise<{
    allPassed: boolean;
    passedCount: number;
    total: number;
    scenarios: Array<{ scenario: number; title: string; passed: boolean; message: string; details?: any }>;
  }> {
    return this.request('/test/run-all-scenarios', {
      method: 'POST',
    });
  }
}

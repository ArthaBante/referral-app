import React, { useState, useEffect } from 'react';
import { ApiClient } from '../lib/api.ts';
import {
  OwnerDashboardData,
  SettingsData,
  CustomerListItem,
  MessageItem,
  AuditItem,
} from '../types/index.ts';
import {
  LayoutDashboard,
  Settings,
  Users,
  Send,
  UserPlus,
  MessageSquare,
  FileText,
  Clock,
  Sparkles,
  Download,
  AlertCircle,
  CheckCircle2,
  Edit3,
  Trash2,
  RefreshCw,
  Search,
  KeyRound,
  Shield,
  HelpCircle,
} from 'lucide-react';

interface OwnerPortalProps {
  onViewCustomerPortal: (token: string) => void;
}

export const OwnerPortal: React.FC<OwnerPortalProps> = ({ onViewCustomerPortal }) => {
  const [subTab, setSubTab] = useState<'dashboard' | 'settings' | 'customers' | 'offers' | 'staff' | 'messages' | 'audit'>('dashboard');

  // Dashboard Data
  const [dashboard, setDashboard] = useState<OwnerDashboardData | null>(null);
  const [dateFilter, setDateFilter] = useState<'all' | '30' | '90'>('all');
  const [dailyJobRunning, setDailyJobRunning] = useState(false);
  const [dailyJobMessage, setDailyJobMessage] = useState<string | null>(null);

  // Settings Data
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  // Customers Data
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedCustomerDetail, setSelectedCustomerDetail] = useState<any | null>(null);
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjLoading, setAdjLoading] = useState(false);

  // Send Offer Data
  const [offerText, setOfferText] = useState('Festive saree collection now in store! Visit this week for exclusive seasonal arrivals.');
  const [audienceCount, setAudienceCount] = useState<number>(0);
  const [sendingOffer, setSendingOffer] = useState(false);
  const [offerSuccessMsg, setOfferSuccessMsg] = useState<string | null>(null);

  // Staff Data
  const [staffList, setStaffList] = useState<any[]>([]);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffUsername, setNewStaffUsername] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('change-me');
  const [newStaffRole, setNewStaffRole] = useState<'cashier' | 'owner'>('cashier');

  // Messages Data
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Audit Log Data
  const [auditLogs, setAuditLogs] = useState<AuditItem[]>([]);

  // Loading States
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load Dashboard
  const loadDashboard = async () => {
    try {
      let from: string | undefined;
      if (dateFilter === '30') {
        from = new Date(Date.now() - 30 * 86400000).toISOString();
      } else if (dateFilter === '90') {
        from = new Date(Date.now() - 90 * 86400000).toISOString();
      }
      const data = await ApiClient.getDashboard(from);
      setDashboard(data);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // Load Settings
  const loadSettings = async () => {
    try {
      const data = await ApiClient.getSettings();
      setSettings(data);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // Load Customers
  const loadCustomers = async () => {
    try {
      const data = await ApiClient.getCustomers(customerSearch);
      setCustomers(data.customers);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // Load Customer Detail
  const loadCustomerDetail = async (id: string) => {
    try {
      const data = await ApiClient.getCustomerDetails(id);
      setSelectedCustomerDetail(data);
    } catch (err: any) {
      alert(`Error loading customer: ${err.message}`);
    }
  };

  // Load Offers Audience
  const loadOffersAudience = async () => {
    try {
      const data = await ApiClient.getOfferAudience();
      setAudienceCount(data.eligibleCount);
    } catch (err: any) {
      console.error(err);
    }
  };

  // Load Staff
  const loadStaff = async () => {
    try {
      const data = await ApiClient.getStaff();
      setStaffList(data.staff);
    } catch (err: any) {
      console.error(err);
    }
  };

  // Load Messages
  const loadMessages = async () => {
    try {
      const data = await ApiClient.getMessages();
      setMessages(data.messages);
    } catch (err: any) {
      console.error(err);
    }
  };

  // Load Audit
  const loadAudit = async () => {
    try {
      const data = await ApiClient.getAuditLog();
      setAuditLogs(data.auditLog);
    } catch (err: any) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (subTab === 'dashboard') loadDashboard();
    if (subTab === 'settings') loadSettings();
    if (subTab === 'customers') loadCustomers();
    if (subTab === 'offers') loadOffersAudience();
    if (subTab === 'staff') loadStaff();
    if (subTab === 'messages') loadMessages();
    if (subTab === 'audit') loadAudit();
  }, [subTab, dateFilter]);

  // Handle Settings Save
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSavingSettings(true);
    setSettingsSuccess(false);
    try {
      const res = await ApiClient.updateSettings(settings);
      setSettings(res.settings);
      setSettingsSuccess(true);
      setTimeout(() => setSettingsSuccess(false), 3000);
    } catch (err: any) {
      alert(`Save error: ${err.message}`);
    } finally {
      setSavingSettings(false);
    }
  };

  // Calculate live preview in settings
  const calculateLiveExample = () => {
    if (!settings) return '';
    const bill = 1000;
    let bDisc = 0;
    if (settings.b_discount_type === 'percent') {
      bDisc = Math.round((bill * settings.b_discount_value) / 100);
      if (settings.b_discount_cap) {
        bDisc = Math.min(bDisc, settings.b_discount_cap);
      }
    } else {
      bDisc = Math.min(settings.b_discount_value, bill);
    }

    let aCred = 0;
    if (settings.a_credit_type === 'percent') {
      aCred = Math.round((bill * settings.a_credit_value) / 100);
    } else {
      aCred = settings.a_credit_value;
    }

    return `If a friend spends ₹1,000: friend gets ₹${bDisc} off, referrer gets ₹${aCred} credit.`;
  };

  // Trigger Daily Job
  const handleRunDailyJob = async () => {
    setDailyJobRunning(true);
    setDailyJobMessage(null);
    try {
      const res = await ApiClient.runDailyJob();
      setDailyJobMessage(`Daily job finished: ${res.activated} credit lots activated, ${res.expired} expired, ${res.remindersSent} reminders sent.`);
      loadDashboard();
    } catch (err: any) {
      alert(`Job failed: ${err.message}`);
    } finally {
      setDailyJobRunning(false);
    }
  };

  // Manual Credit Adjustment
  const handleCreditAdjustment = async () => {
    if (!selectedCustomerId || !adjAmount || !adjReason.trim()) {
      alert('Please enter amount and reason');
      return;
    }
    setAdjLoading(true);
    try {
      await ApiClient.adjustCredit(selectedCustomerId, parseFloat(adjAmount), adjReason.trim());
      setAdjAmount('');
      setAdjReason('');
      loadCustomerDetail(selectedCustomerId);
      loadCustomers();
      alert('Credit adjustment saved!');
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setAdjLoading(false);
    }
  };

  // Delete / Anonymize Customer
  const handleDeleteCustomer = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete customer "${name}" upon their request? In compliance with privacy regulations, their personal name and phone number will be permanently erased while maintaining anonymized sales audit records.`)) {
      return;
    }
    try {
      await ApiClient.deleteCustomer(id);
      setSelectedCustomerId(null);
      setSelectedCustomerDetail(null);
      loadCustomers();
      alert('Customer record anonymized successfully.');
    } catch (err: any) {
      alert(`Delete error: ${err.message}`);
    }
  };

  // Send Offer Broadcast
  const handleSendOffer = async () => {
    if (!offerText.trim()) return;
    if (!confirm(`Broadcast this offer to ${audienceCount} opted-in customers?`)) return;
    setSendingOffer(true);
    setOfferSuccessMsg(null);
    try {
      const res = await ApiClient.sendOffer(offerText.trim());
      setOfferSuccessMsg(`Offer broadcast sent to ${res.sentCount} customers!`);
    } catch (err: any) {
      alert(`Offer error: ${err.message}`);
    } finally {
      setSendingOffer(false);
    }
  };

  // Create Staff
  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await ApiClient.createStaff({
        name: newStaffName,
        username: newStaffUsername,
        password: newStaffPassword,
        role: newStaffRole,
      });
      setNewStaffName('');
      setNewStaffUsername('');
      loadStaff();
      alert('New staff member added!');
    } catch (err: any) {
      alert(`Error creating staff: ${err.message}`);
    }
  };

  // Toggle Staff Active
  const handleToggleStaff = async (id: string, currentActive: boolean) => {
    try {
      await ApiClient.updateStaff(id, { active: !currentActive });
      loadStaff();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  // Retry message
  const handleRetryMessage = async (id: string) => {
    setRetryingId(id);
    try {
      await ApiClient.retryMessage(id);
      loadMessages();
    } catch (err: any) {
      alert(`Retry failed: ${err.message}`);
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-rose-900 text-amber-300 rounded-lg">
              <Shield className="w-5 h-5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-rose-950 tracking-tight">Owner Control Center</h1>
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">
            Reward rules, metrics, customer records, staff, and message broadcasts
          </p>
        </div>

        {/* Sub Navigation */}
        <div className="flex flex-wrap gap-1 bg-neutral-200/80 p-1 rounded-xl">
          <button
            onClick={() => setSubTab('dashboard')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              subTab === 'dashboard' ? 'bg-white text-rose-950 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </button>
          <button
            onClick={() => setSubTab('settings')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              subTab === 'settings' ? 'bg-white text-rose-950 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
          <button
            onClick={() => setSubTab('customers')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              subTab === 'customers' ? 'bg-white text-rose-950 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Customers</span>
          </button>
          <button
            onClick={() => setSubTab('offers')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              subTab === 'offers' ? 'bg-white text-rose-950 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send Offer</span>
          </button>
          <button
            onClick={() => setSubTab('staff')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              subTab === 'staff' ? 'bg-white text-rose-950 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Staff</span>
          </button>
          <button
            onClick={() => setSubTab('messages')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              subTab === 'messages' ? 'bg-white text-rose-950 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Messages</span>
          </button>
          <button
            onClick={() => setSubTab('audit')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              subTab === 'audit' ? 'bg-white text-rose-950 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Audit</span>
          </button>
        </div>
      </div>

      {/* SUB-VIEW 1: DASHBOARD */}
      {subTab === 'dashboard' && dashboard && (
        <div className="space-y-6">
          {/* Filter Bar & Daily Job trigger */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-neutral-200 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-neutral-500 uppercase">Period:</span>
              <div className="flex gap-1">
                {(['all', '30', '90'] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setDateFilter(opt)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                      dateFilter === opt ? 'bg-rose-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    {opt === 'all' ? 'All Time' : `Last ${opt} Days`}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleRunDailyJob}
              disabled={dailyJobRunning}
              className="py-1.5 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-rose-950 font-black text-xs shadow-xs transition flex items-center gap-1.5 self-start sm:self-auto"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${dailyJobRunning ? 'animate-spin' : ''}`} />
              <span>{dailyJobRunning ? 'Executing 09:00 IST Job...' : 'Run 09:00 IST Daily Job Now'}</span>
            </button>
          </div>

          {dailyJobMessage && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{dailyJobMessage}</span>
            </div>
          )}

          {/* Metric Cards Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-xs">
              <span className="text-xs font-semibold text-neutral-500 uppercase">Total Customers</span>
              <div className="text-2xl font-black text-rose-950 mt-1">{dashboard.totalCustomers}</div>
              <span className="text-[11px] text-neutral-400">Registered shoppers</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-rose-100 shadow-xs bg-rose-50/40">
              <span className="text-xs font-semibold text-rose-800 uppercase">Referred Customers</span>
              <div className="text-2xl font-black text-rose-900 mt-1">{dashboard.referralCustomers}</div>
              <span className="text-[11px] text-rose-600 font-medium">Brought by friends</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-xs">
              <span className="text-xs font-semibold text-neutral-500 uppercase">Codes Used</span>
              <div className="text-2xl font-black text-neutral-900 mt-1">{dashboard.referralCodesUsed}</div>
              <span className="text-[11px] text-neutral-400">Single-use redemptions</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-xs bg-emerald-50/40">
              <span className="text-xs font-semibold text-emerald-800 uppercase">Referred Sales (₹)</span>
              <div className="text-2xl font-black text-emerald-900 mt-1">₹{dashboard.salesFromReferredCustomersRupees}</div>
              <span className="text-[11px] text-emerald-700 font-medium">New customer revenue</span>
            </div>
          </div>

          {/* Credit Flow Summary */}
          <div className="bg-white rounded-2xl p-5 border border-neutral-200 shadow-xs">
            <h3 className="text-sm font-bold text-rose-950 uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Store Credit Financial Ledger</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200">
                <span className="text-[11px] font-bold text-amber-800 block">Total Issued</span>
                <span className="text-xl font-black text-amber-950 mt-0.5 block">₹{dashboard.creditIssuedRupees}</span>
                <span className="text-[10px] text-neutral-500">Gross earned by referrers</span>
              </div>

              <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200">
                <span className="text-[11px] font-bold text-emerald-800 block">Redeemed</span>
                <span className="text-xl font-black text-emerald-950 mt-0.5 block">₹{dashboard.creditRedeemedRupees}</span>
                <span className="text-[10px] text-neutral-500">Spent on repeat visits</span>
              </div>

              <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-200">
                <span className="text-[11px] font-bold text-blue-800 block">Outstanding</span>
                <span className="text-xl font-black text-blue-950 mt-0.5 block">₹{dashboard.creditOutstandingRupees}</span>
                <span className="text-[10px] text-neutral-500">Active waiting in wallets</span>
              </div>

              <div className="p-3 bg-neutral-100 rounded-xl border border-neutral-200">
                <span className="text-[11px] font-bold text-neutral-600 block">Expired</span>
                <span className="text-xl font-black text-neutral-800 mt-0.5 block">₹{dashboard.creditExpiredRupees}</span>
                <span className="text-[10px] text-neutral-500">Passed expiry cutoff</span>
              </div>
            </div>
          </div>

          {/* Top 10 Referrers Table */}
          <div className="bg-white rounded-2xl p-5 border border-neutral-200 shadow-xs">
            <h3 className="text-sm font-bold text-rose-950 uppercase tracking-wider mb-3">
              Top Referring Brand Ambassadors
            </h3>

            {dashboard.topReferrers.length === 0 ? (
              <p className="text-xs text-neutral-400">No referrals completed yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-neutral-50 text-neutral-500 font-bold uppercase border-b border-neutral-200">
                    <tr>
                      <th className="py-2.5 px-3">Rank</th>
                      <th className="py-2.5 px-3">Customer</th>
                      <th className="py-2.5 px-3">Mobile</th>
                      <th className="py-2.5 px-3 text-right">Friends Referred</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {dashboard.topReferrers.map((ref, idx) => (
                      <tr key={ref.customerId} className="hover:bg-neutral-50/80">
                        <td className="py-2.5 px-3 font-bold text-amber-700">#{idx + 1}</td>
                        <td className="py-2.5 px-3 font-bold text-neutral-900">{ref.name}</td>
                        <td className="py-2.5 px-3 text-neutral-600">{ref.phone}</td>
                        <td className="py-2.5 px-3 text-right font-black text-rose-950">
                          {ref.referralsCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-VIEW 2: SETTINGS (Full Section 5 Specs with Live Example) */}
      {subTab === 'settings' && settings && (
        <form onSubmit={handleSaveSettings} className="bg-white rounded-2xl border border-neutral-200 shadow-xs p-5 sm:p-7 space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
            <div>
              <h2 className="text-lg font-black text-rose-950">Referral Program Rules & Configuration</h2>
              <p className="text-xs text-neutral-500">Every change applies only to new referrals and is recorded in the audit log.</p>
            </div>
            {settingsSuccess && (
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Saved!</span>
              </span>
            )}
          </div>

          {/* Scheme Switch */}
          <div className="flex items-center justify-between p-4 bg-rose-50/60 rounded-xl border border-rose-200">
            <div>
              <div className="text-sm font-bold text-rose-950">Referral Scheme Status</div>
              <div className="text-xs text-neutral-600">If paused, new codes are rejected but existing credit remains spendable.</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.scheme_enabled}
                onChange={(e) => setSettings({ ...settings, scheme_enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-neutral-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {/* REWARD SETTINGS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Friend B's Discount */}
            <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/50 space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-rose-900">
                Friend (Customer B) First-Purchase Discount
              </h3>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-neutral-600 uppercase mb-1">Discount Type</label>
                  <select
                    value={settings.b_discount_type}
                    onChange={(e) => setSettings({ ...settings, b_discount_type: e.target.value as any })}
                    className="w-full p-2 rounded-lg border border-neutral-300 text-xs font-bold outline-none"
                  >
                    <option value="percent">Percentage (%)</option>
                    <option value="fixed">Fixed Rupees (₹)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-neutral-600 uppercase mb-1">
                    Value {settings.b_discount_type === 'percent' ? '(%)' : '(₹)'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={settings.b_discount_value}
                    onChange={(e) => setSettings({ ...settings, b_discount_value: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 rounded-lg border border-neutral-300 text-xs font-bold outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-neutral-600 uppercase mb-1">
                  Discount Cap in Rupees (Optional, empty for no cap)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 500"
                  value={settings.b_discount_cap ?? ''}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      b_discount_cap: e.target.value ? parseFloat(e.target.value) : null,
                    })
                  }
                  className="w-full p-2 rounded-lg border border-neutral-300 text-xs font-bold outline-none"
                />
              </div>
            </div>

            {/* Referrer A's Credit */}
            <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/50 space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-amber-900">
                Referrer (Customer A) Store Credit Reward
              </h3>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-neutral-600 uppercase mb-1">Credit Type</label>
                  <select
                    value={settings.a_credit_type}
                    onChange={(e) => setSettings({ ...settings, a_credit_type: e.target.value as any })}
                    className="w-full p-2 rounded-lg border border-neutral-300 text-xs font-bold outline-none"
                  >
                    <option value="percent">Percentage (%)</option>
                    <option value="fixed">Fixed Rupees (₹)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-neutral-600 uppercase mb-1">
                    Value {settings.a_credit_type === 'percent' ? '(%)' : '(₹)'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={settings.a_credit_value}
                    onChange={(e) => setSettings({ ...settings, a_credit_value: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 rounded-lg border border-neutral-300 text-xs font-bold outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-neutral-600 uppercase mb-1">
                  Min Bill To Qualify For Referral (₹, empty for none)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 500"
                  value={settings.min_bill_for_referral ?? ''}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      min_bill_for_referral: e.target.value ? parseFloat(e.target.value) : null,
                    })
                  }
                  className="w-full p-2 rounded-lg border border-neutral-300 text-xs font-bold outline-none"
                />
              </div>
            </div>
          </div>

          {/* REQUIRED SECTION 5 LIVE EXAMPLE BANNER */}
          <div className="p-4 rounded-xl bg-amber-50 border-2 border-amber-300 text-amber-950 flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                Live Reward Simulation:
              </div>
              <div className="text-sm font-black text-rose-950 mt-0.5">
                {calculateLiveExample()}
              </div>
            </div>
          </div>

          {/* LIFECYCLE & LIMITS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-neutral-600 uppercase mb-1">
                Pending Days (0–60)
              </label>
              <input
                type="number"
                min="0"
                max="60"
                value={settings.pending_days}
                onChange={(e) => setSettings({ ...settings, pending_days: parseInt(e.target.value) || 0 })}
                className="w-full p-2 rounded-lg border border-neutral-300 text-xs font-bold outline-none"
              />
              <span className="text-[10px] text-neutral-400">Return guarantee period</span>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-neutral-600 uppercase mb-1">
                Expiry Days (7–365)
              </label>
              <input
                type="number"
                min="7"
                max="365"
                value={settings.expiry_days}
                onChange={(e) => setSettings({ ...settings, expiry_days: parseInt(e.target.value) || 90 })}
                className="w-full p-2 rounded-lg border border-neutral-300 text-xs font-bold outline-none"
              />
              <span className="text-[10px] text-neutral-400">Active credit validity</span>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-neutral-600 uppercase mb-1">
                Reminder Days (0–30)
              </label>
              <input
                type="number"
                min="0"
                max="30"
                value={settings.reminder_days_before}
                onChange={(e) => setSettings({ ...settings, reminder_days_before: parseInt(e.target.value) || 0 })}
                className="w-full p-2 rounded-lg border border-neutral-300 text-xs font-bold outline-none"
              />
              <span className="text-[10px] text-neutral-400">Days before expiry</span>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-neutral-600 uppercase mb-1">
                Max Credit Share % (1–100)
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={settings.max_credit_share}
                onChange={(e) => setSettings({ ...settings, max_credit_share: parseInt(e.target.value) || 50 })}
                className="w-full p-2 rounded-lg border border-neutral-300 text-xs font-bold outline-none"
              />
              <span className="text-[10px] text-neutral-400">Cap per bill (default 50%)</span>
            </div>
          </div>

          {/* SHOP DETAILS & LANGUAGE */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-neutral-600 uppercase mb-1">Shop Name</label>
              <input
                type="text"
                value={settings.shop_name}
                onChange={(e) => setSettings({ ...settings, shop_name: e.target.value })}
                className="w-full p-2.5 rounded-lg border border-neutral-300 text-xs font-bold outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-neutral-600 uppercase mb-1">Message Language</label>
              <select
                value={settings.message_language}
                onChange={(e) => setSettings({ ...settings, message_language: e.target.value as any })}
                className="w-full p-2.5 rounded-lg border border-neutral-300 text-xs font-bold outline-none"
              >
                <option value="English">English</option>
                <option value="Hindi">Hindi</option>
                <option value="both">Both (English + Hindi)</option>
              </select>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={savingSettings}
              className="py-3 px-6 rounded-xl bg-rose-900 hover:bg-rose-800 text-white font-bold text-xs shadow-md transition disabled:opacity-50"
            >
              {savingSettings ? 'Saving...' : 'Save Settings & Update Audit Log'}
            </button>
          </div>
        </form>
      )}

      {/* SUB-VIEW 3: CUSTOMERS & LEDGER */}
      {subTab === 'customers' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-neutral-200 shadow-xs">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadCustomers()}
                placeholder="Search customers by name, phone or referral code..."
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-neutral-300 text-xs font-medium outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={loadCustomers}
                className="px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-xl text-xs font-bold"
              >
                Search
              </button>
              <a
                href="/api/owner/export-csv"
                download="raigarh-customers.csv"
                className="px-3 py-2 bg-rose-900 hover:bg-rose-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </a>
            </div>
          </div>

          {/* Customers Table */}
          <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-neutral-50 text-neutral-500 font-bold uppercase border-b border-neutral-200">
                  <tr>
                    <th className="py-3 px-4">Customer Name</th>
                    <th className="py-3 px-4">Mobile</th>
                    <th className="py-3 px-4">Active Credit</th>
                    <th className="py-3 px-4">Pending</th>
                    <th className="py-3 px-4">Referral Code</th>
                    <th className="py-3 px-4">Offers Consent</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {customers.map((c) => (
                    <tr key={c.id} className="hover:bg-neutral-50/80">
                      <td className="py-3 px-4 font-bold text-neutral-900">{c.name}</td>
                      <td className="py-3 px-4 text-neutral-600 font-mono">{c.phone}</td>
                      <td className="py-3 px-4 font-black text-amber-900">₹{c.activeCreditRupees}</td>
                      <td className="py-3 px-4 text-neutral-500">₹{c.pendingCreditRupees}</td>
                      <td className="py-3 px-4 font-mono font-bold text-rose-900">
                        {c.referralCode}{' '}
                        {c.referralCodeUsed && (
                          <span className="text-[10px] text-neutral-400 font-sans font-normal">(Used)</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            c.marketingConsent ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-500'
                          }`}
                        >
                          {c.marketingConsent ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          onClick={() => {
                            setSelectedCustomerId(c.id);
                            loadCustomerDetail(c.id);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-900 hover:bg-rose-100 font-bold text-[11px]"
                        >
                          Ledger
                        </button>
                        <button
                          onClick={() => onViewCustomerPortal(c.personalToken)}
                          className="px-2.5 py-1 rounded-lg border text-neutral-700 hover:bg-neutral-50 text-[11px]"
                        >
                          Pass
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* CUSTOMER DETAIL MODAL / DRAWER */}
          {selectedCustomerDetail && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
              <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-neutral-200 space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                  <div>
                    <h3 className="text-xl font-black text-rose-950">
                      {selectedCustomerDetail.customer.name}
                    </h3>
                    <p className="text-xs text-neutral-500">
                      {selectedCustomerDetail.customer.phone} · Joined {new Date(selectedCustomerDetail.customer.created_at).toLocaleDateString('en-IN')}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedCustomerDetail(null)}
                    className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700"
                  >
                    ✕
                  </button>
                </div>

                {/* Manual Credit Adjustment */}
                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 space-y-3">
                  <h4 className="text-xs font-black uppercase text-amber-950 tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                    <span>Manual Credit Adjustment</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <input
                        type="number"
                        placeholder="Amount in ₹ (+50 or -50)"
                        value={adjAmount}
                        onChange={(e) => setAdjAmount(e.target.value)}
                        className="w-full p-2 bg-white rounded-lg border border-neutral-300 text-xs font-bold outline-none"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Required Reason (e.g. Return compensation)"
                        value={adjReason}
                        onChange={(e) => setAdjReason(e.target.value)}
                        className="w-full p-2 bg-white rounded-lg border border-neutral-300 text-xs font-medium outline-none"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCreditAdjustment}
                    disabled={adjLoading}
                    className="py-2 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition"
                  >
                    {adjLoading ? 'Adjusting...' : 'Apply Credit Adjustment (+/-)'}
                  </button>
                </div>

                {/* Sales History */}
                <div>
                  <h4 className="text-xs font-bold text-neutral-700 uppercase mb-2">Purchase History</h4>
                  {selectedCustomerDetail.sales.length === 0 ? (
                    <p className="text-xs text-neutral-400">No purchases recorded.</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedCustomerDetail.sales.map((s: any) => (
                        <div key={s.id} className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-xs flex items-center justify-between">
                          <div>
                            <span className="font-mono font-bold text-neutral-900">{s.tally_bill_no}</span>
                            <span className="text-neutral-500 ml-2">
                              {new Date(s.created_at).toLocaleDateString('en-IN')}
                            </span>
                          </div>
                          <div className="font-semibold text-neutral-800">
                            Bill: ₹{s.billAmountRupees} | Discount: ₹{s.discountAmountRupees} | Credit Used: ₹{s.creditUsedRupees}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Credit Ledger History */}
                <div>
                  <h4 className="text-xs font-bold text-neutral-700 uppercase mb-2">Store Credit Ledger Lots</h4>
                  <div className="space-y-2">
                    {selectedCustomerDetail.credits.map((cr: any) => (
                      <div key={cr.id} className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-xs flex items-center justify-between">
                        <div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase mr-2 ${
                            cr.status === 'active' ? 'bg-emerald-100 text-emerald-800' : cr.status === 'pending' ? 'bg-blue-100 text-blue-800' : 'bg-neutral-200 text-neutral-600'
                          }`}>
                            {cr.status}
                          </span>
                          <span className="font-bold text-neutral-800">₹{cr.remainingRupees} / ₹{cr.amountRupees}</span>
                          {cr.reason && <span className="text-neutral-500 ml-2">({cr.reason})</span>}
                        </div>
                        <span className="text-[11px] text-neutral-400">
                          {cr.expires_at ? `Expires ${new Date(cr.expires_at).toLocaleDateString('en-IN')}` : `Unlocks ${new Date(cr.available_at).toLocaleDateString('en-IN')}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section 9 Privacy Delete Button */}
                <div className="pt-4 border-t border-neutral-200 flex justify-between items-center">
                  <span className="text-[11px] text-neutral-400">Section 9 GDPR / DPDP Privacy Compliance</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteCustomer(selectedCustomerDetail.customer.id, selectedCustomerDetail.customer.name)}
                    className="py-1.5 px-3 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Customer on Request</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUB-VIEW 4: SEND OFFER */}
      {subTab === 'offers' && (
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-xs p-6 max-w-2xl space-y-4">
          <h2 className="text-lg font-black text-rose-950">Send Promotional Broadcast</h2>
          <p className="text-xs text-neutral-500">
            Send an SMS/WhatsApp announcement. Only customers who opted in and have not opted out will receive it.
          </p>

          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 font-bold flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>Audience Target: {audienceCount} opted-in customers</span>
          </div>

          {offerSuccessMsg && (
            <div className="p-3 bg-emerald-100 border border-emerald-300 rounded-xl text-xs text-emerald-900 font-bold">
              {offerSuccessMsg}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-neutral-700 uppercase mb-1">Offer Text</label>
            <textarea
              rows={4}
              value={offerText}
              onChange={(e) => setOfferText(e.target.value)}
              className="w-full p-3 rounded-xl border border-neutral-300 text-sm font-medium outline-none focus:border-rose-600"
              placeholder="Write your shop offer here..."
            />
            <span className="text-[11px] text-neutral-400">
              Note: Unsubscribe link ("Reply STOP or use &lt;link&gt; to stop offers") will be appended automatically per compliance.
            </span>
          </div>

          <div className="pt-2">
            <button
              onClick={handleSendOffer}
              disabled={sendingOffer || audienceCount === 0 || !offerText.trim()}
              className="py-3 px-6 rounded-xl bg-rose-900 hover:bg-rose-800 text-white font-bold text-xs shadow-md transition disabled:opacity-40 flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span>{sendingOffer ? 'Broadcasting...' : `Confirm & Broadcast to ${audienceCount} Shoppers`}</span>
            </button>
          </div>
        </div>
      )}

      {/* SUB-VIEW 5: STAFF */}
      {subTab === 'staff' && (
        <div className="space-y-6 max-w-3xl">
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-xs p-5">
            <h2 className="text-base font-black text-rose-950 mb-3">Add Cashier / Staff Account</h2>
            <form onSubmit={handleCreateStaff} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <input
                type="text"
                placeholder="Full Name"
                required
                value={newStaffName}
                onChange={(e) => setNewStaffName(e.target.value)}
                className="p-2.5 rounded-xl border border-neutral-300 text-xs font-medium outline-none"
              />
              <input
                type="text"
                placeholder="Username"
                required
                value={newStaffUsername}
                onChange={(e) => setNewStaffUsername(e.target.value)}
                className="p-2.5 rounded-xl border border-neutral-300 text-xs font-medium outline-none"
              />
              <input
                type="password"
                placeholder="Password"
                required
                value={newStaffPassword}
                onChange={(e) => setNewStaffPassword(e.target.value)}
                className="p-2.5 rounded-xl border border-neutral-300 text-xs font-medium outline-none"
              />
              <button
                type="submit"
                className="py-2.5 px-4 bg-rose-900 text-white rounded-xl text-xs font-bold hover:bg-rose-800"
              >
                Create Account
              </button>
            </form>
          </div>

          <div className="bg-white rounded-2xl border border-neutral-200 shadow-xs p-5">
            <h2 className="text-base font-black text-rose-950 mb-3">Existing Staff Accounts</h2>
            <div className="space-y-2">
              {staffList.map((st) => (
                <div key={st.id} className="p-3 rounded-xl border border-neutral-200 bg-neutral-50 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-neutral-900">{st.name}</span>
                    <span className="text-neutral-500 ml-2 font-mono">(@{st.username})</span>
                    <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-900">
                      {st.role}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleStaff(st.id, st.active)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold ${
                        st.active ? 'bg-emerald-100 text-emerald-800 hover:bg-red-100 hover:text-red-800' : 'bg-red-100 text-red-800 hover:bg-emerald-100 hover:text-emerald-800'
                      }`}
                    >
                      {st.active ? 'Active' : 'Disabled'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 6: MESSAGES */}
      {subTab === 'messages' && (
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-xs p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-black text-rose-950">Transactional & Promo Messages Log</h2>
              <p className="text-xs text-neutral-500">Live feed of all customer SMS and WhatsApp notifications.</p>
            </div>
            <button
              onClick={loadMessages}
              className="p-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-50 text-neutral-500 font-bold uppercase border-b border-neutral-200">
                <tr>
                  <th className="py-2.5 px-3">Kind</th>
                  <th className="py-2.5 px-3">Channel</th>
                  <th className="py-2.5 px-3">Message Content</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Sent Time</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-mono text-[11px]">
                {messages.map((m) => (
                  <tr key={m.id} className="hover:bg-neutral-50">
                    <td className="py-2.5 px-3 font-bold uppercase text-rose-900">{m.kind}</td>
                    <td className="py-2.5 px-3 uppercase text-neutral-600">{m.channel}</td>
                    <td className="py-2.5 px-3 font-sans text-neutral-800 max-w-xs truncate">{m.body}</td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        m.status === 'sent' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {m.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-neutral-500">
                      {m.sent_at ? new Date(m.sent_at).toLocaleTimeString('en-IN') : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => handleRetryMessage(m.id)}
                        disabled={retryingId === m.id}
                        className="px-2 py-0.5 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-[10px]"
                      >
                        {retryingId === m.id ? 'Retrying...' : 'Retry'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-VIEW 7: AUDIT LOG */}
      {subTab === 'audit' && (
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-xs p-5">
          <h2 className="text-base font-black text-rose-950 mb-3">System Audit Log</h2>
          <div className="space-y-2">
            {auditLogs.map((log) => (
              <div key={log.id} className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-xs">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="font-bold text-rose-950 uppercase">{log.action}</span>
                  <span className="text-neutral-400">{new Date(log.created_at).toLocaleString('en-IN')}</span>
                </div>
                <div className="font-mono text-[10px] text-neutral-600 bg-white p-2 rounded border border-neutral-200 overflow-x-auto">
                  {JSON.stringify(log.details)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

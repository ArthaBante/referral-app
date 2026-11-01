import React, { useState, useEffect, useRef } from 'react';
import { ApiClient } from '../lib/api.ts';
import {
  OwnerDashboardData,
  SettingsData,
  CustomerListItem,
  MessageItem,
  AuditItem,
  MessageTemplateItem,
  TemplateConfigItem,
  MessageTemplateKind,
} from '../types/index.ts';
import {
  LayoutDashboard,
  Settings,
  Users,
  Send,
  UserPlus,
  MessageSquare,
  FileText,
  Sparkles,
  Download,
  CheckCircle2,
  RefreshCw,
  Search,
  Shield,
  RotateCcw,
} from 'lucide-react';

const getSamplePreviewData = (shopName?: string): Record<string, string> => ({
  shop: shopName || 'Your Business',
  name: 'Emma',
  amount: '100',
  earned_points: '100',
  points_balance: '1150',
  friend_points: '50',
  referrer_points: '100',
  min_spend: '10',
  expiry: '15 Jan',
  link: 'ref-frnd.uk/c/abc123',
});

const TEMPLATE_KINDS_ORDER: MessageTemplateKind[] = [
  'welcome_no_code',
  'welcome_with_code',
  'referral_return',
  'credit_expiring',
  'points_earned',
  'offer_footer',
];

const TEMPLATE_META: Record<
  MessageTemplateKind,
  { number: number; title: string; note: string }
> = {
  welcome_no_code: {
    number: 1,
    title: 'Welcome — new customer, no code',
    note: 'Sent to a new customer after their first purchase when they did not use a referral code.',
  },
  welcome_with_code: {
    number: 2,
    title: "Welcome — new customer who used a friend's code",
    note: "Sent to a new customer after their first purchase when they used a friend's referral code.",
  },
  referral_return: {
    number: 3,
    title: 'Referral return',
    note: 'Sent to Emma when her friend uses her code.',
  },
  credit_expiring: {
    number: 4,
    title: 'Points expiring reminder',
    note: 'Sent to a customer when their points are about to expire.',
  },
  points_earned: {
    number: 5,
    title: 'Points earned notification',
    note: 'Sent to a customer after each purchase when "Text customers the points they earn" is enabled.',
  },
  offer_footer: {
    number: 6,
    title: 'Offer footer',
    note: 'The line added to the end of every offer (the offer itself is still written by the owner each time on the Send offer screen).',
  },
};

function renderPreviewText(body: string, shopName?: string): string {
  const data = getSamplePreviewData(shopName);
  return (body || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    return data[key] !== undefined ? data[key] : match;
  });
}

import { StaffUser } from '../types/index.ts';

interface OwnerPortalProps {
  onViewCustomerPortal: (token: string) => void;
  setCurrentUser?: (user: StaffUser | null) => void;
  onSettingsUpdated?: (newShopName: string) => void;
  onOpenLogin?: () => void;
}

export const OwnerPortal: React.FC<OwnerPortalProps> = ({
  onViewCustomerPortal,
  setCurrentUser,
  onSettingsUpdated,
  onOpenLogin,
}) => {
  const [subTab, setSubTab] = useState<'dashboard' | 'settings' | 'customers' | 'offers' | 'staff' | 'messages' | 'audit'>('dashboard');

  const [dashboard, setDashboard] = useState<OwnerDashboardData | null>(null);
  const [dateFilter, setDateFilter] = useState<'all' | '30' | '90'>('all');

  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedCustomerDetail, setSelectedCustomerDetail] = useState<any | null>(null);
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjLoading, setAdjLoading] = useState(false);

  const [offerText, setOfferText] = useState('Exclusive seasonal discount now available! Visit this week for special offers.');
  const [audienceCount, setAudienceCount] = useState<number>(0);
  const [sendingOffer, setSendingOffer] = useState(false);
  const [offerSuccessMsg, setOfferSuccessMsg] = useState<string | null>(null);

  const [staffList, setStaffList] = useState<any[]>([]);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffUsername, setNewStaffUsername] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('change-me');
  const [newStaffRole, setNewStaffRole] = useState<'cashier' | 'owner'>('cashier');

  const [messagesSubTab, setMessagesSubTab] = useState<'log' | 'templates'>('log');
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const [templates, setTemplates] = useState<MessageTemplateItem[]>([]);
  const [templateConfigs, setTemplateConfigs] = useState<Record<string, TemplateConfigItem>>({});
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateEdits, setTemplateEdits] = useState<Record<string, { body: string }>>({});
  const [templateStatus, setTemplateStatus] = useState<Record<string, { error?: string; success?: string; saving?: boolean }>>({});
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const [auditLogs, setAuditLogs] = useState<AuditItem[]>([]);

  const handleAuthError = (err: any) => {
    const msg = err?.message || '';
    if (
      msg.includes('Authentication required') ||
      msg.includes('Owner') ||
      msg.includes('401') ||
      msg.includes('403') ||
      msg.includes('Access denied') ||
      msg.includes('Not authenticated') ||
      msg.includes('Invalid credentials')
    ) {
      ApiClient.clearSession();
      if (setCurrentUser) setCurrentUser(null);
      if (onOpenLogin) onOpenLogin();
      return true;
    }
    return false;
  };

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
      if (!handleAuthError(err)) {
        console.error(err);
      }
    }
  };

  const loadSettings = async () => {
    try {
      const data = await ApiClient.getSettings();
      setSettings(data);
    } catch (err: any) {
      if (!handleAuthError(err)) {
        console.error(err);
      }
    }
  };

  const loadCustomers = async () => {
    try {
      const data = await ApiClient.getCustomers(customerSearch);
      setCustomers(data.customers);
    } catch (err: any) {
      if (!handleAuthError(err)) {
        console.error(err);
      }
    }
  };

  const loadCustomerDetail = async (id: string) => {
    try {
      const data = await ApiClient.getCustomerDetails(id);
      setSelectedCustomerDetail(data);
    } catch (err: any) {
      if (!handleAuthError(err)) {
        alert(`Error loading customer: ${err.message}`);
      }
    }
  };

  const loadOffersAudience = async () => {
    try {
      const data = await ApiClient.getOfferAudience();
      setAudienceCount(data.eligibleCount);
    } catch (err: any) {
      if (!handleAuthError(err)) {
        console.error(err);
      }
    }
  };

  const loadStaff = async () => {
    try {
      const data = await ApiClient.getStaff();
      setStaffList(data.staff);
    } catch (err: any) {
      if (!handleAuthError(err)) {
        console.error(err);
      }
    }
  };

  const loadMessages = async () => {
    try {
      const data = await ApiClient.getMessages();
      setMessages(data.messages);
    } catch (err: any) {
      if (!handleAuthError(err)) {
        console.error(err);
      }
    }
  };

  const loadAudit = async () => {
    try {
      const data = await ApiClient.getAuditLog();
      setAuditLogs(data.auditLog);
    } catch (err: any) {
      if (!handleAuthError(err)) {
        console.error(err);
      }
    }
  };

  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const data = await ApiClient.getMessageTemplates();
      setTemplates(data.templates);
      setTemplateConfigs(data.configs);

      const edits: Record<string, { body: string }> = {};
      data.templates.forEach((t) => {
        const key = t.kind;
        edits[key] = {
          body: t.body,
        };
      });
      setTemplateEdits(edits);
    } catch (err: any) {
      console.error('Failed to load templates', err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const insertPlaceholder = (kind: MessageTemplateKind, ph: string) => {
    const el = textareaRefs.current[kind];
    const current = templateEdits[kind]?.body ?? '';
    const insertion = `{${ph}}`;

    if (!el) {
      setTemplateEdits((prev) => ({
        ...prev,
        [kind]: { ...prev[kind], body: current + insertion },
      }));
      return;
    }

    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const updated = current.slice(0, start) + insertion + current.slice(end);

    setTemplateEdits((prev) => ({
      ...prev,
      [kind]: { ...prev[kind], body: updated },
    }));

    setTimeout(() => {
      el.focus();
      const nextPos = start + insertion.length;
      el.setSelectionRange(nextPos, nextPos);
    }, 0);
  };

  const handleSaveTemplate = async (kind: MessageTemplateKind) => {
    const edit = templateEdits[kind];
    if (!edit) return;

    setTemplateStatus((prev) => ({
      ...prev,
      [kind]: { saving: true, error: undefined, success: undefined },
    }));

    try {
      const res = await ApiClient.updateMessageTemplate({
        kind,
        body: edit.body,
      });

      setTemplates((prev) => prev.map((t) => (t.kind === kind ? res.template : t)));
      setTemplateStatus((prev) => ({
        ...prev,
        [kind]: { saving: false, success: 'Template saved successfully!' },
      }));
      setTimeout(() => {
        setTemplateStatus((prev) => ({
          ...prev,
          [kind]: { ...prev[kind], success: undefined },
        }));
      }, 4000);
    } catch (err: any) {
      setTemplateStatus((prev) => ({
        ...prev,
        [kind]: { saving: false, error: err.message },
      }));
    }
  };

  const handleResetTemplate = async (kind: MessageTemplateKind) => {
    setTemplateStatus((prev) => ({
      ...prev,
      [kind]: { saving: true, error: undefined, success: undefined },
    }));

    try {
      const res = await ApiClient.resetMessageTemplate({ kind });
      setTemplates((prev) => prev.map((t) => (t.kind === kind ? res.template : t)));
      setTemplateEdits((prev) => ({
        ...prev,
        [kind]: { body: res.template.body, dlt_template_id: '' },
      }));
      setTemplateStatus((prev) => ({
        ...prev,
        [kind]: { saving: false, success: 'Reset to built-in default!' },
      }));
      setTimeout(() => {
        setTemplateStatus((prev) => ({
          ...prev,
          [kind]: { ...prev[kind], success: undefined },
        }));
      }, 4000);
    } catch (err: any) {
      setTemplateStatus((prev) => ({
        ...prev,
        [kind]: { saving: false, error: err.message },
      }));
    }
  };

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

  useEffect(() => {
    if (subTab === 'dashboard') loadDashboard();
    if (subTab === 'settings') loadSettings();
    if (subTab === 'customers') loadCustomers();
    if (subTab === 'offers') loadOffersAudience();
    if (subTab === 'staff') loadStaff();
    if (subTab === 'messages') {
      if (messagesSubTab === 'log') loadMessages();
      if (messagesSubTab === 'templates') loadTemplates();
    }
    if (subTab === 'audit') loadAudit();
  }, [subTab, messagesSubTab, dateFilter]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    setSavingSettings(true);
    setSettingsSuccess(false);
    try {
      const res = await ApiClient.updateSettings(settings);
      setSettings(res.settings);
      if (res.settings.shop_name && onSettingsUpdated) {
        onSettingsUpdated(res.settings.shop_name);
      }
      setSettingsSuccess(true);
      setTimeout(() => setSettingsSuccess(false), 3000);
    } catch (err: any) {
      alert(`Save error: ${err.message}`);
    } finally {
      setSavingSettings(false);
    }
  };

  const calculateLiveExample = () => {
    if (!settings) return '';
    const fp = settings.friend_points ?? 50;
    const rp = settings.referrer_points ?? 100;
    const ms = settings.min_spend ?? 10;
    return `If Sophie uses Emma's code: Sophie gets ${fp} welcome points, Emma gets ${rp} points when Sophie spends at least £${ms}.`;
  };

  const handlePointsAdjustment = async () => {
    if (!selectedCustomerId || !adjAmount || !adjReason.trim()) {
      alert('Please enter points adjustment amount and reason');
      return;
    }
    const val = parseFloat(adjAmount);
    if (isNaN(val) || !Number.isInteger(val) || val === 0) {
      alert('Points adjustment must be a non-zero whole number');
      return;
    }
    setAdjLoading(true);
    try {
      const res = await ApiClient.adjustPoints(selectedCustomerId, val, adjReason.trim());
      setAdjAmount('');
      setAdjReason('');
      await loadCustomerDetail(selectedCustomerId);
      await loadCustomers();
      if (res.message) {
        alert(res.message);
      } else {
        alert('Points adjustment saved!');
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setAdjLoading(false);
    }
  };

  const handleDeleteCustomer = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete customer "${name}"? Personal details will be anonymized.`)) {
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

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
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

      {subTab === 'dashboard' && dashboard && (
        <div className="space-y-6">
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
          </div>

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
              <span className="text-[11px] text-neutral-400">Friends who used a code</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-xs bg-emerald-50/40">
              <span className="text-xs font-semibold text-emerald-800 uppercase">Friends Referred</span>
              <div className="text-2xl font-black text-emerald-900 mt-1">{dashboard.friendsReferredTotal}</div>
              <span className="text-[11px] text-emerald-700 font-medium">Successful referrals</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-neutral-200 shadow-xs">
            <h3 className="text-sm font-bold text-rose-950 uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Points Program Ledger</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-center">
              <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200">
                <span className="text-[11px] font-bold text-amber-800 block">Points Given for Referrals</span>
                <span className="text-xl font-black text-amber-950 mt-0.5 block">{dashboard.pointsGivenReferrals}</span>
                <span className="text-[10px] text-neutral-500">Points rewarded to referrers</span>
              </div>

              <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-200">
                <span className="text-[11px] font-bold text-indigo-800 block">Welcome Points Given</span>
                <span className="text-xl font-black text-indigo-950 mt-0.5 block">{dashboard.welcomePointsGiven}</span>
                <span className="text-[10px] text-neutral-500">Welcome points to new friends</span>
              </div>

              <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200">
                <span className="text-[11px] font-bold text-emerald-800 block">Points Given for Purchases</span>
                <span className="text-xl font-black text-emerald-950 mt-0.5 block">{dashboard.pointsGivenPurchases || 0}</span>
                <span className="text-[10px] text-neutral-500">Points earned from spend</span>
              </div>

              <div className="p-3 bg-rose-50/60 rounded-xl border border-rose-200">
                <span className="text-[11px] font-bold text-rose-800 block">Points Outstanding</span>
                <span className="text-xl font-black text-rose-950 mt-0.5 block">{dashboard.pointsOutstanding || 0}</span>
                <span className="text-[10px] text-neutral-500">Active unexpired balance</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {subTab === 'settings' && settings && (
        <form onSubmit={handleSaveSettings} className="bg-white rounded-2xl border border-neutral-200 shadow-xs p-5 sm:p-7 space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
            <div>
              <h2 className="text-lg font-black text-rose-950">Referral & Purchase Reward Program Configuration</h2>
              <p className="text-xs text-neutral-500 font-medium">Every change applies only to future transactions and is recorded in the audit log.</p>
            </div>
            {settingsSuccess && (
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Saved!</span>
              </span>
            )}
          </div>

          <div className="flex items-center justify-between p-4 bg-rose-50/60 rounded-xl border border-rose-200">
            <div>
              <div className="text-sm font-bold text-rose-950">Referral Scheme Status</div>
              <div className="text-xs text-neutral-600">If paused, new referral codes are rejected.</div>
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

          <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-rose-950">Everyday Purchase Earn Rate</h3>
            <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-neutral-800">
              <span>Every £</span>
              <input
                type="number"
                min="1"
                step="1"
                value={settings.earn_spend_pounds ?? 10}
                onChange={(e) => setSettings({ ...settings, earn_spend_pounds: parseInt(e.target.value) || 1 })}
                className="w-20 p-2 rounded-lg border border-neutral-300 font-black text-rose-950 bg-white text-center"
              />
              <span>spent =</span>
              <input
                type="number"
                min="1"
                step="1"
                value={settings.earn_points ?? 100}
                onChange={(e) => setSettings({ ...settings, earn_points: parseInt(e.target.value) || 1 })}
                className="w-24 p-2 rounded-lg border border-neutral-300 font-black text-rose-950 bg-white text-center"
              />
              <span>points</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/50 space-y-2">
              <label className="block text-xs font-black uppercase tracking-wider text-amber-950">
                Points for each new friend
              </label>
              <p className="text-[11px] text-neutral-500">Referrer points for each friend</p>
              <input
                type="number"
                min="1"
                value={settings.referrer_points}
                onChange={(e) => setSettings({ ...settings, referrer_points: parseInt(e.target.value) || 0 })}
                className="w-full p-2.5 rounded-xl border border-neutral-300 text-sm font-bold outline-none bg-white"
              />
            </div>

            <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/50 space-y-2">
              <label className="block text-xs font-black uppercase tracking-wider text-rose-950">
                Welcome points for the new friend
              </label>
              <p className="text-[11px] text-neutral-500">Points for the friend on first purchase</p>
              <input
                type="number"
                min="1"
                value={settings.friend_points}
                onChange={(e) => setSettings({ ...settings, friend_points: parseInt(e.target.value) || 0 })}
                className="w-full p-2.5 rounded-xl border border-neutral-300 text-sm font-bold outline-none bg-white"
              />
            </div>

            <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/50 space-y-2">
              <label className="block text-xs font-black uppercase tracking-wider text-emerald-950">
                Friend must spend at least £__
              </label>
              <p className="text-[11px] text-neutral-500">Minimum purchase to use code</p>
              <input
                type="number"
                min="1"
                value={settings.min_spend}
                onChange={(e) => setSettings({ ...settings, min_spend: parseFloat(e.target.value) || 0 })}
                className="w-full p-2.5 rounded-xl border border-neutral-300 text-sm font-bold outline-none bg-white"
              />
            </div>
          </div>

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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-neutral-600 uppercase mb-1">
                Points expire after __ days
              </label>
              <input
                type="number"
                min="1"
                value={settings.points_expiry_days}
                onChange={(e) => setSettings({ ...settings, points_expiry_days: parseInt(e.target.value) || 365 })}
                className="w-full p-2 rounded-lg border border-neutral-300 text-xs font-bold outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-neutral-600 uppercase mb-1">
                Remind customers __ days before points expire (0 = off)
              </label>
              <input
                type="number"
                min="0"
                max="30"
                value={settings.reminder_days_before ?? 7}
                onChange={(e) => setSettings({ ...settings, reminder_days_before: parseInt(e.target.value) || 0 })}
                className="w-full p-2 rounded-lg border border-neutral-300 text-xs font-bold outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-neutral-600 uppercase mb-1">
                Max Friends per Customer (blank = unlimited)
              </label>
              <input
                type="number"
                min="1"
                value={settings.referral_limit ?? ''}
                onChange={(e) => setSettings({ ...settings, referral_limit: e.target.value ? parseInt(e.target.value) : null })}
                placeholder="Unlimited"
                className="w-full p-2 rounded-lg border border-neutral-300 text-xs font-bold outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 p-3.5 bg-neutral-50 rounded-xl border border-neutral-200">
            <input
              type="checkbox"
              id="points_earned_text"
              checked={settings.points_earned_text ?? false}
              onChange={(e) => setSettings({ ...settings, points_earned_text: e.target.checked })}
              className="w-4 h-4 text-rose-600 rounded border-neutral-300 focus:ring-rose-500"
            />
            <label htmlFor="points_earned_text" className="text-xs font-bold text-neutral-800 cursor-pointer">
              Text customers the points they earn after each purchase
            </label>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-neutral-600 uppercase mb-1">Shop Name</label>
            <input
              type="text"
              value={settings.shop_name}
              onChange={(e) => setSettings({ ...settings, shop_name: e.target.value })}
              className="w-full p-2.5 rounded-lg border border-neutral-300 text-xs font-bold outline-none"
            />
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
                download="reffrnd-customers.csv"
                className="px-3 py-2 bg-rose-900 hover:bg-rose-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </a>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-neutral-200 shadow-xs overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-50 text-neutral-500 font-bold uppercase border-b border-neutral-200">
                <tr>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Mobile</th>
                  <th className="py-3 px-4">Points</th>
                  <th className="py-3 px-4">Friends referred</th>
                  <th className="py-3 px-4">Referral Code</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-neutral-50/80">
                    <td className="py-3 px-4">
                      <div className="font-bold text-neutral-900">{c.name}</div>
                      <div className="text-[10px] text-neutral-400">Joined {new Date(c.joinedDate).toLocaleDateString('en-GB')}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-neutral-600">{c.phone}</td>
                    <td className="py-3 px-4 font-bold text-emerald-800">{c.totalPoints}</td>
                    <td className="py-3 px-4 font-bold text-neutral-800">{c.friendsReferred}</td>
                    <td className="py-3 px-4">
                      <span className="font-mono font-bold bg-neutral-100 px-2 py-0.5 rounded text-neutral-800">
                        {c.referralCode}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <button
                        onClick={() => {
                          setSelectedCustomerId(c.id);
                          loadCustomerDetail(c.id);
                        }}
                        className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-900 rounded-lg font-bold text-xs"
                      >
                        Ledger
                      </button>
                      <button
                        onClick={() => window.open(`/customer/${c.personalToken}`, '_blank')}
                        className="px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-lg font-bold text-xs"
                      >
                        View customer page
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedCustomerId && selectedCustomerDetail && (
            <div className="bg-white rounded-2xl border-2 border-rose-900 shadow-xl p-6 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
                <div>
                  <h3 className="text-lg font-black text-rose-950">
                    {selectedCustomerDetail.customer.name} Ledger
                  </h3>
                  <p className="text-xs text-neutral-500 font-mono">
                    {selectedCustomerDetail.customer.phone} · Token: {selectedCustomerDetail.customer.personal_token}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedCustomerId(null);
                    setSelectedCustomerDetail(null);
                  }}
                  className="text-xs font-bold text-neutral-500 hover:text-neutral-800"
                >
                  Close
                </button>
              </div>

              {/* Current Points Balance at top */}
              <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-amber-800">Current Points Balance</div>
                  <div className="text-3xl font-black text-rose-950">{selectedCustomerDetail.totalPoints?.toLocaleString()} points</div>
                </div>
              </div>

              {/* Point Lots list (newest first) */}
              <div className="space-y-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-rose-900">Point Lots (Newest First)</h4>
                <div className="overflow-x-auto border border-neutral-200 rounded-xl">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-neutral-50 text-neutral-500 font-bold uppercase border-b border-neutral-200">
                      <tr>
                        <th className="py-2.5 px-3">Source</th>
                        <th className="py-2.5 px-3">Points</th>
                        <th className="py-2.5 px-3">Remaining</th>
                        <th className="py-2.5 px-3">Date Added</th>
                        <th className="py-2.5 px-3">Expiry Date</th>
                        <th className="py-2.5 px-3">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 font-medium">
                      {(selectedCustomerDetail.credits || [])
                        .slice()
                        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                        .map((lot: any) => (
                          <tr key={lot.id} className="hover:bg-neutral-50">
                            <td className="py-2.5 px-3 font-bold capitalize text-rose-950">{lot.source}</td>
                            <td className="py-2.5 px-3 font-bold text-neutral-900">{lot.points}</td>
                            <td className="py-2.5 px-3 font-bold text-emerald-800">{lot.remaining}</td>
                            <td className="py-2.5 px-3 text-neutral-600">{new Date(lot.created_at).toLocaleDateString('en-GB')}</td>
                            <td className="py-2.5 px-3 text-neutral-600">
                              {lot.expires_at ? new Date(lot.expires_at).toLocaleDateString('en-GB') : 'No expiry'}
                            </td>
                            <td className="py-2.5 px-3 text-neutral-600 font-mono">
                              {lot.source === 'manual' ? lot.reason || '-' : '-'}
                            </td>
                          </tr>
                        ))}
                      {(!selectedCustomerDetail.credits || selectedCustomerDetail.credits.length === 0) && (
                        <tr>
                          <td colSpan={6} className="py-4 text-center text-neutral-400">No point lots recorded.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 space-y-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-rose-900">Add or remove points</h4>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="1"
                      value={adjAmount}
                      onChange={(e) => setAdjAmount(e.target.value)}
                      placeholder="e.g. 100 or -50"
                      className="w-32 p-2 rounded-lg border border-neutral-300 text-xs font-bold"
                    />
                    <input
                      type="text"
                      value={adjReason}
                      onChange={(e) => setAdjReason(e.target.value)}
                      placeholder="Reason (required)"
                      className="flex-1 p-2 rounded-lg border border-neutral-300 text-xs"
                    />
                    <button
                      type="button"
                      onClick={handlePointsAdjustment}
                      disabled={adjLoading}
                      className="px-4 py-2 bg-rose-900 hover:bg-rose-800 text-white rounded-lg text-xs font-bold"
                    >
                      Apply
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-red-50/60 rounded-xl border border-red-200 flex flex-col justify-between">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-red-900">Privacy / Delete Request</h4>
                    <p className="text-xs text-red-700 mt-1">Anonymizes personal details while preserving ledger compliance.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteCustomer(selectedCustomerDetail.customer.id, selectedCustomerDetail.customer.name)}
                    className="mt-3 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold w-fit"
                  >
                    Anonymize Customer
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {subTab === 'offers' && (
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-xs p-6 max-w-2xl mx-auto space-y-5">
          <div>
            <h2 className="text-lg font-black text-rose-950">Broadcast Marketing Offer</h2>
            <p className="text-xs text-neutral-500">
              Only sends to customers who have given offers consent (currently <strong>{audienceCount}</strong> eligible customers).
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700 uppercase mb-1">Offer Message Text</label>
            <textarea
              rows={4}
              value={offerText}
              onChange={(e) => setOfferText(e.target.value)}
              className="w-full p-3 rounded-xl border border-neutral-300 text-sm outline-none"
            />
            <span className="text-[11px] text-neutral-400 mt-1 block">
              Note: The automated offer footer with opt-out link is appended to every message automatically.
            </span>
          </div>

          {offerSuccessMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{offerSuccessMsg}</span>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSendOffer}
              disabled={sendingOffer || audienceCount === 0}
              className="py-3 px-6 rounded-xl bg-rose-900 hover:bg-rose-800 text-white font-bold text-xs shadow-md transition disabled:opacity-50"
            >
              {sendingOffer ? 'Broadcasting...' : `Send Offer to ${audienceCount} Customers`}
            </button>
          </div>
        </div>
      )}

      {subTab === 'staff' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-xs p-5 space-y-4">
            <h2 className="text-base font-black text-rose-950">Add Staff Account</h2>
            <form onSubmit={handleCreateStaff} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-neutral-600 uppercase mb-1">Name</label>
                <input
                  type="text"
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  placeholder="e.g. John Doe"
                  required
                  className="w-full p-2.5 rounded-lg border border-neutral-300 text-xs font-bold outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-neutral-600 uppercase mb-1">Username</label>
                <input
                  type="text"
                  value={newStaffUsername}
                  onChange={(e) => setNewStaffUsername(e.target.value)}
                  placeholder="e.g. cashier2"
                  required
                  className="w-full p-2.5 rounded-lg border border-neutral-300 text-xs font-bold outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-neutral-600 uppercase mb-1">Password</label>
                <input
                  type="text"
                  value={newStaffPassword}
                  onChange={(e) => setNewStaffPassword(e.target.value)}
                  required
                  className="w-full p-2.5 rounded-lg border border-neutral-300 text-xs font-bold outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-neutral-600 uppercase mb-1">Role</label>
                <select
                  value={newStaffRole}
                  onChange={(e) => setNewStaffRole(e.target.value as any)}
                  className="w-full p-2.5 rounded-lg border border-neutral-300 text-xs font-bold outline-none"
                >
                  <option value="cashier">Cashier</option>
                  <option value="owner">Owner</option>
                </select>
              </div>
              <button
                type="submit"
                className="w-full py-2.5 bg-rose-900 hover:bg-rose-800 text-white rounded-xl text-xs font-bold transition"
              >
                Create Staff Account
              </button>
            </form>
          </div>

          <div className="md:col-span-2 bg-white rounded-2xl border border-neutral-200 shadow-xs p-5">
            <h2 className="text-base font-black text-rose-950 mb-4">Active Staff Accounts</h2>
            <div className="space-y-2">
              {staffList.map((st) => (
                <div key={st.id} className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-neutral-900 text-sm">{st.name}</div>
                    <div className="text-xs text-neutral-500 font-mono">Username: {st.username} · Role: {st.role}</div>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${st.active ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                    {st.active ? 'Active' : 'Deactivated'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {subTab === 'messages' && (
        <div className="space-y-4">
          <div className="flex bg-neutral-200/80 p-1 rounded-xl w-fit">
            <button
              onClick={() => setMessagesSubTab('log')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${
                messagesSubTab === 'log' ? 'bg-white text-rose-950 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Message log
            </button>
            <button
              onClick={() => setMessagesSubTab('templates')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${
                messagesSubTab === 'templates' ? 'bg-white text-rose-950 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Templates
            </button>
          </div>

          {messagesSubTab === 'log' && (
            <div className="bg-white rounded-2xl border border-neutral-200 shadow-xs p-5">
              <h2 className="text-base font-black text-rose-950 mb-4">Recent Dispatched Messages</h2>
              <div className="space-y-2">
                {messages.map((m) => (
                  <div key={m.id} className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-rose-900 uppercase text-[10px]">
                        Kind: {m.kind} · Channel: {m.channel} · {new Date(m.created_at).toLocaleString('en-GB')}
                      </div>
                      <div className="font-mono text-neutral-800 mt-1">"{m.body}"</div>
                    </div>
                    {m.status === 'failed' && (
                      <button
                        onClick={() => handleRetryMessage(m.id)}
                        disabled={retryingId === m.id}
                        className="px-3 py-1 bg-amber-500 text-rose-950 rounded-lg font-bold text-xs self-start"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {messagesSubTab === 'templates' && (
            <div className="bg-white rounded-2xl border border-neutral-200 shadow-xs p-5 sm:p-7 space-y-6">
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 font-medium">
                Keep messages short: one SMS holds 160 characters.
              </div>

              {loadingTemplates ? (
                <div className="p-12 text-center text-neutral-400">Loading templates...</div>
              ) : (
                <div className="space-y-8">
                  {TEMPLATE_KINDS_ORDER.map((kind) => {
                    const meta = TEMPLATE_META[kind];
                    const config = templateConfigs[kind];
                    const edit = templateEdits[kind] || { body: '' };
                    const status = templateStatus[kind] || {};
                    const preview = renderPreviewText(edit.body, settings?.shop_name);
                    const charCount = preview.length;

                    return (
                      <div key={kind} className="p-5 rounded-2xl border border-neutral-200 bg-neutral-50/40 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-xs font-bold text-rose-900 uppercase">
                              #{meta.number} · {meta.title}
                            </div>
                            <div className="text-xs text-neutral-600 mt-0.5">{meta.note}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleResetTemplate(kind)}
                            className="px-3 py-1.5 rounded-lg bg-neutral-200 hover:bg-neutral-300 text-neutral-800 text-xs font-bold flex items-center gap-1"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Reset to default</span>
                          </button>
                        </div>

                        <div>
                          <div className="text-[11px] font-bold text-neutral-500 uppercase mb-1.5">
                            Allowed Placeholders (tap to insert):
                          </div>
                          <div className="flex gap-1.5 flex-wrap">
                            {config?.supportedPlaceholders.map((ph) => (
                              <button
                                key={ph}
                                type="button"
                                onClick={() => insertPlaceholder(kind, ph)}
                                className="px-2.5 py-1 rounded-lg bg-white border border-neutral-300 hover:border-rose-600 text-rose-950 text-xs font-mono font-bold shadow-xs transition"
                              >
                                {'{'}{ph}{'}'}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-neutral-700 uppercase mb-1">
                            English Template Body
                          </label>
                          <textarea
                            ref={(el) => {
                              textareaRefs.current[kind] = el;
                            }}
                            rows={3}
                            value={edit.body}
                            onChange={(e) =>
                              setTemplateEdits((prev) => ({
                                ...prev,
                                [kind]: { ...prev[kind], body: e.target.value },
                              }))
                            }
                            className="w-full p-3 rounded-xl border border-neutral-300 font-mono text-xs outline-none focus:border-rose-600 bg-white"
                          />
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-200">
                          <button
                            type="button"
                            onClick={() => handleResetTemplate(kind)}
                            disabled={status.saving}
                            className="text-xs text-neutral-500 hover:text-rose-900 font-bold underline"
                          >
                            Reset to default
                          </button>
                          <div className="flex items-center gap-2">
                            {status.success && <span className="text-xs font-bold text-emerald-700">{status.success}</span>}
                            {status.error && <span className="text-xs font-bold text-red-600">{status.error}</span>}
                            <button
                              type="button"
                              onClick={() => handleSaveTemplate(kind)}
                              disabled={status.saving}
                              className="px-5 py-2.5 bg-rose-900 hover:bg-rose-800 text-white rounded-xl text-xs font-bold transition"
                            >
                              {status.saving ? 'Saving...' : 'Save Template'}
                            </button>
                          </div>
                        </div>

                        <div className="p-3 bg-white rounded-xl border border-neutral-200 space-y-1">
                          <div className="flex items-center justify-between text-[11px] font-bold text-neutral-500 uppercase">
                            <span>Live Preview:</span>
                            <span className={charCount > 160 ? 'text-amber-600 font-bold' : 'text-neutral-500'}>
                              {charCount} chars {charCount > 160 && '(Warn: > 160 chars)'}
                            </span>
                          </div>
                          <div className="font-mono text-xs text-neutral-800 bg-neutral-50 p-2.5 rounded-lg border border-neutral-100">
                            "{preview}"
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {subTab === 'audit' && (
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-xs p-5">
          <h2 className="text-base font-black text-rose-950 mb-4">Immutable Audit Log</h2>
          <div className="space-y-2">
            {auditLogs.map((log) => (
              <div key={log.id} className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-xs font-mono">
                <div className="font-bold text-rose-900 text-[11px]">
                  Action: {log.action} · Staff: {log.staff_id} · {new Date(log.created_at).toLocaleString('en-GB')}
                </div>
                <pre className="text-[10px] text-neutral-600 mt-1 overflow-x-auto">
                  {JSON.stringify(log.details, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

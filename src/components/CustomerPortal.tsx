import React, { useState, useEffect } from 'react';
import { ApiClient } from '../lib/api.ts';
import { CustomerPortalData } from '../types/index.ts';
import {
  Sparkles,
  QrCode,
  Share2,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  Smartphone,
  Gift,
  BellOff,
} from 'lucide-react';

interface CustomerPortalProps {
  initialToken?: string;
  onSelectToken?: (token: string) => void;
}

export const CustomerPortal: React.FC<CustomerPortalProps> = ({ initialToken }) => {
  // Default to Sunita Sharma's token if none provided
  const [token, setToken] = useState<string>(initialToken || 'token-sunita-sharma-raigarh-789012345678');
  const [data, setData] = useState<CustomerPortalData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [optOutStatus, setOptOutStatus] = useState<string | null>(null);

  const fetchCustomerData = async (activeToken: string) => {
    if (!activeToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await ApiClient.getCustomerPortal(activeToken);
      setData(res);
      setOptOutStatus(null);
    } catch (err: any) {
      setError(err.message || 'Could not load customer pass');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialToken) {
      setToken(initialToken);
      fetchCustomerData(initialToken);
    } else {
      fetchCustomerData(token);
    }
  }, [initialToken]);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOptOut = async () => {
    if (!confirm('Are you sure you want to stop receiving promotional offers from our shop?')) {
      return;
    }
    try {
      const res = await ApiClient.optOutCustomer(token);
      setOptOutStatus(res.message);
      fetchCustomerData(token);
    } catch (err: any) {
      alert(`Opt-out error: ${err.message}`);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-6 min-h-screen pb-16">
      {/* Test Token Switcher Bar for Reviewers */}
      <div className="mb-4 p-2.5 bg-neutral-100 rounded-xl border border-neutral-300 text-xs">
        <div className="flex items-center justify-between mb-1.5 text-neutral-600 font-bold">
          <span className="flex items-center gap-1">
            <Smartphone className="w-3.5 h-3.5 text-rose-700" />
            <span>Customer Mobile Pass Link Simulator</span>
          </span>
          <span className="text-[10px] text-neutral-400">No password required</span>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => {
              const t = 'token-sunita-sharma-raigarh-789012345678';
              setToken(t);
              fetchCustomerData(t);
            }}
            className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition ${
              token.includes('sunita') ? 'bg-rose-900 text-white' : 'bg-white border text-neutral-700'
            }`}
          >
            Sunita (A)
          </button>
          <button
            onClick={() => {
              const t = 'token-priya-verma-raigarh-1234567890123';
              setToken(t);
              fetchCustomerData(t);
            }}
            className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition ${
              token.includes('priya') ? 'bg-rose-900 text-white' : 'bg-white border text-neutral-700'
            }`}
          >
            Priya (B)
          </button>
          <button
            onClick={() => {
              const t = 'token-anita-agrawal-raigarh-345678901234';
              setToken(t);
              fetchCustomerData(t);
            }}
            className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition ${
              token.includes('anita') ? 'bg-rose-900 text-white' : 'bg-white border text-neutral-700'
            }`}
          >
            Anita (Active Credit)
          </button>
        </div>
      </div>

      {loading && (
        <div className="p-12 text-center text-neutral-400">
          <div className="w-8 h-8 border-3 border-rose-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-xs font-semibold">Opening your store pass...</p>
        </div>
      )}

      {error && (
        <div className="p-5 bg-red-50 border border-red-200 rounded-2xl text-red-800 text-center">
          <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-2" />
          <div className="font-bold text-sm">Pass Not Found</div>
          <div className="text-xs text-red-600 mt-1">{error}</div>
        </div>
      )}

      {data && !loading && (
        <div className="space-y-4">
          {/* Header Card */}
          <div className="bg-gradient-to-br from-rose-950 via-rose-900 to-rose-950 text-white p-6 rounded-3xl shadow-xl border border-rose-800/60 relative overflow-hidden text-center">
            <div className="inline-block px-3 py-1 bg-amber-400/20 text-amber-300 border border-amber-400/30 rounded-full text-[11px] font-bold tracking-wider uppercase mb-2">
              Exclusive Member Pass
            </div>
            <h1 className="text-2xl font-black text-amber-200 tracking-tight">{data.shopName}</h1>
            <p className="text-sm text-rose-200 mt-1 font-medium">
              Namaste, <strong className="text-white">{data.firstName}</strong>!
            </p>

            {/* Credit Balance Display */}
            <div className="mt-5 grid grid-cols-2 gap-3 text-left">
              <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 block">
                  Active Store Credit
                </span>
                <span className="text-2xl font-black text-white">₹{data.totalActiveCreditRupees}</span>
                <span className="text-[10px] text-rose-200 block mt-0.5">Ready to use at counter</span>
              </div>
              <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-300 block">
                  Pending Credit
                </span>
                <span className="text-2xl font-black text-white">₹{data.totalPendingCreditRupees}</span>
                <span className="text-[10px] text-rose-200 block mt-0.5">Unlocks after return period</span>
              </div>
            </div>

            {/* Active Lots Expiry Breakdown */}
            {data.activeLots.length > 0 && (
              <div className="mt-3 text-left bg-black/20 p-2.5 rounded-xl border border-white/5 space-y-1">
                <div className="text-[10px] font-bold text-amber-300 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>Credit Expiry Timeline:</span>
                </div>
                {data.activeLots.map((lot) => (
                  <div key={lot.id} className="text-[11px] text-rose-100 flex items-center justify-between">
                    <span>₹{lot.remainingRupees} balance</span>
                    <span className="text-amber-300 font-medium">
                      Expires {lot.expiresAt ? new Date(lot.expiresAt).toLocaleDateString('en-IN') : 'Soon'} (
                      {lot.daysLeft} days)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* CARD 1: PERSONAL COUNTER QR CODE */}
          <div className="bg-white rounded-3xl p-6 shadow-md border border-neutral-200 text-center">
            <div className="flex items-center justify-center gap-1.5 text-xs font-black uppercase tracking-wider text-rose-900 mb-1">
              <QrCode className="w-4 h-4 text-rose-700" />
              <span>Personal Pass QR</span>
            </div>
            <p className="text-xs text-neutral-500 font-medium mb-4">
              Show this at the billing counter to redeem your store credit
            </p>

            <div className="inline-block p-3 bg-neutral-50 rounded-2xl border-2 border-neutral-200 shadow-inner">
              <img
                src={data.personalQrDataUri}
                alt="Personal QR Code"
                className="w-56 h-56 mx-auto object-contain"
              />
            </div>

            <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-emerald-800 font-semibold bg-emerald-50 py-1.5 px-3 rounded-full border border-emerald-200 w-fit mx-auto">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Secure Token Verification</span>
            </div>
          </div>

          {/* CARD 2: SINGLE-USE REFERRAL CODE & WHATSAPP SHARE */}
          {data.referralCode && (
            <div className="bg-white rounded-3xl p-6 shadow-md border-2 border-amber-300 relative text-center">
              <div className="inline-block px-3 py-1 bg-amber-100 text-amber-900 rounded-full text-[11px] font-black uppercase tracking-wider mb-2">
                Referral Reward
              </div>
              <h2 className="text-lg font-black text-rose-950">Give One Friend a Special Discount</h2>
              <p className="text-xs text-neutral-600 mt-1 max-w-xs mx-auto">
                Share your code with 1 friend. They get <strong>{data.referralCode.bRewardLabel} off</strong> their
                first purchase, and you earn store credit!
              </p>

              {/* Status Badge */}
              <div className="my-3">
                {data.referralCode.status === 'unused' ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Unused: Share with one friend</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-bold bg-neutral-200 text-neutral-700 px-3 py-1 rounded-full border border-neutral-300">
                    <span>Used: Thank you for referring!</span>
                  </span>
                )}
              </div>

              {/* Code Box */}
              <div className="bg-amber-50 p-3 rounded-2xl border border-amber-200 flex items-center justify-center gap-3 my-3">
                <span className="text-3xl font-mono font-black text-rose-950 tracking-widest">
                  {data.referralCode.code}
                </span>
                <button
                  onClick={() => handleCopyCode(data.referralCode!.code)}
                  className="p-2 rounded-xl bg-white hover:bg-neutral-50 border border-amber-200 text-rose-900 shadow-xs transition"
                  title="Copy Code"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              {copied && <p className="text-[11px] text-emerald-600 font-bold mb-2">Code copied to clipboard!</p>}

              {/* Referral QR */}
              {data.referralCode.qrDataUri && (
                <div className="mb-4">
                  <img
                    src={data.referralCode.qrDataUri}
                    alt="Referral QR Code"
                    className="w-36 h-36 mx-auto object-contain border border-neutral-200 rounded-xl p-1 bg-white"
                  />
                  <span className="text-[10px] text-neutral-400 mt-1 block">Friend can scan this at the counter</span>
                </div>
              )}

              {/* Big WhatsApp Share Button */}
              {data.referralCode.status === 'unused' && (
                <a
                  href={data.referralCode.whatsappShareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Share on WhatsApp</span>
                </a>
              )}
            </div>
          )}

          {/* Footer & Opt-Out */}
          <div className="text-center pt-2 pb-6 space-y-2">
            {optOutStatus ? (
              <div className="text-xs text-neutral-500 font-medium">{optOutStatus}</div>
            ) : (
              <button
                type="button"
                onClick={handleOptOut}
                className="text-xs text-neutral-400 hover:text-neutral-600 underline font-medium"
              >
                Stop offer messages
              </button>
            )}
            <div className="text-[11px] text-neutral-400">
              {data.shopName} · Raigarh, Chhattisgarh · Tally Verified
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

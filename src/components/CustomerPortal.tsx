import React, { useState, useEffect } from 'react';
import { ApiClient } from '../lib/api.ts';
import { CustomerPortalData } from '../types/index.ts';
import {
  QrCode,
  Share2,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Copy,
  Smartphone,
} from 'lucide-react';

interface CustomerPortalProps {
  initialToken?: string;
  onSelectToken?: (token: string) => void;
}

export const CustomerPortal: React.FC<CustomerPortalProps> = ({ initialToken }) => {
  const [token, setToken] = useState<string>(initialToken || '');
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
          <div className="bg-gradient-to-br from-rose-950 via-rose-900 to-rose-950 text-white p-6 rounded-3xl shadow-xl border border-rose-800/60 relative overflow-hidden text-center">
            <div className="inline-block px-3 py-1 bg-amber-400/20 text-amber-300 border border-amber-400/30 rounded-full text-[11px] font-bold tracking-wider uppercase mb-2">
              Exclusive Member Pass
            </div>
            <h1 className="text-2xl font-black text-amber-200 tracking-tight">{data.shopName}</h1>
            <p className="text-sm text-rose-200 mt-1 font-medium">
              Hello, <strong className="text-white">{data.firstName}</strong>!
            </p>

            <div className="mt-5 bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10 text-center">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300 block">
                Your points
              </span>
              <span className="text-3xl font-black text-white mt-1 block">{data.totalPoints} points</span>
              <span className="text-xs font-semibold text-amber-200 block mt-2">
                Every £{data.earnSpendPounds ?? 10} spent = {data.earnPoints ?? 100} points
              </span>
            </div>

            {data.activeLots && data.activeLots.length > 0 && (
              <div className="mt-3 text-left bg-black/20 p-2.5 rounded-xl border border-white/5 space-y-1">
                <div className="text-[10px] font-bold text-amber-300 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>Points Expiry Timeline:</span>
                </div>
                {data.activeLots.map((lot) => (
                  <div key={lot.id} className="text-[11px] text-rose-100 flex items-center justify-between">
                    <span>{lot.remaining} points ({lot.source})</span>
                    <span className="text-amber-300 font-medium">
                      Expires {lot.expiresAt ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(lot.expiresAt)) : 'Soon'} (
                      {lot.daysLeft} days)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-md border border-neutral-200 text-center">
            <div className="flex items-center justify-center gap-1.5 text-xs font-black uppercase tracking-wider text-rose-900 mb-1">
              <QrCode className="w-4 h-4 text-rose-700" />
              <span>Personal Pass QR</span>
            </div>
            <p className="text-xs text-neutral-500 font-medium mb-4">
              Show this at the billing counter when visiting
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
              <span>Member Card Active</span>
            </div>
          </div>

          {data.referralCode && (
            <div className="bg-white rounded-3xl p-6 shadow-md border-2 border-amber-300 relative text-center">
              <div className="inline-block px-3 py-1 bg-amber-100 text-amber-900 rounded-full text-[11px] font-black uppercase tracking-wider mb-2">
                Referral Reward
              </div>
              <h2 className="text-lg font-black text-rose-950">Refer Friends</h2>
              <p className="text-xs text-neutral-700 mt-1 max-w-xs mx-auto font-medium">
                {data.referralCode.minSpendPounds !== null
                  ? `Give friends ${data.referralCode.friendPoints} welcome points on their first visit. You get ${data.referralCode.referrerPoints} points when they spend at least £${data.referralCode.minSpendPounds}.`
                  : `Give friends ${data.referralCode.friendPoints} welcome points on their first visit. You get ${data.referralCode.referrerPoints} points when they shop with us.`}
              </p>

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

              {data.referralCode.qrDataUri && (
                <div className="mb-4">
                  <img
                    src={data.referralCode.qrDataUri}
                    alt="Referral QR Code"
                    className="w-36 h-36 mx-auto object-contain border border-neutral-200 rounded-xl p-1 bg-white"
                  />
                  <span className="text-[10px] text-neutral-400 mt-1 block">Friends can scan this at the counter</span>
                </div>
              )}

              <a
                href={data.referralCode.whatsappShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>Share on WhatsApp</span>
              </a>
            </div>
          )}

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
              {data.shopName} · RefFrnd Portal
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

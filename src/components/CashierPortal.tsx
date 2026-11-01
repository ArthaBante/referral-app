import React, { useState, useEffect } from 'react';
import { ApiClient } from '../lib/api.ts';
import { StaffUser, SaleItem } from '../types/index.ts';
import { QrScannerModal } from './QrScannerModal.tsx';
import {
  Phone,
  User,
  Tag,
  CreditCard,
  QrCode,
  CheckCircle2,
  Receipt,
  Sparkles,
  ArrowRight,
  Search,
  MessageSquare,
  AlertTriangle,
  KeyRound,
} from 'lucide-react';

interface CashierPortalProps {
  currentUser: StaffUser | null;
  onOpenLogin: () => void;
  onViewCustomerPortal: (token: string) => void;
}

export const CashierPortal: React.FC<CashierPortalProps> = ({
  currentUser,
  onOpenLogin,
  onViewCustomerPortal,
}) => {
  const [mode, setMode] = useState<'new_sale' | 'find_sale'>('new_sale');

  // Customer & Phone State
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneLookupDone, setPhoneLookupDone] = useState(false);
  const [customerExists, setCustomerExists] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [totalPoints, setTotalPoints] = useState(0);
  const [marketingConsent, setMarketingConsent] = useState(false);

  // Referral Code state
  const [showReferralInput, setShowReferralInput] = useState(false);
  const [referralCodeInput, setReferralCodeInput] = useState('');
  const [referralValid, setReferralValid] = useState<boolean | null>(null);
  const [referralReason, setReferralReason] = useState<string | null>(null);
  const [referralOwnerName, setReferralOwnerName] = useState<string | null>(null);
  const [friendPoints, setFriendPoints] = useState(0);
  const [referrerPoints, setReferrerPoints] = useState(0);

  // Bill & Receipt Ref fields
  const [billAmountInput, setBillAmountInput] = useState('');
  const [receiptRef, setReceiptRef] = useState('');

  // Status & Confirmation
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saleSavedResult, setSaleSavedResult] = useState<any | null>(null);

  // Find Sale
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SaleItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const handlePhoneLookup = async (phoneToLookup: string) => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await ApiClient.lookupCustomer(phoneToLookup);
      setPhoneLookupDone(true);
      setPhoneInput(res.formattedPhone);
      setCustomerExists(res.exists);

      if (res.exists) {
        setCustomerId(res.customerId || null);
        setCustomerName(res.name || '');
        setTotalPoints(res.totalPoints || 0);
        setMarketingConsent(Boolean(res.marketingConsent));
        setShowReferralInput(false);
        setReferralCodeInput('');
        setReferralValid(null);
      } else {
        setCustomerId(null);
        setCustomerName('');
        setTotalPoints(0);
        setMarketingConsent(false);
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleValidateReferral = async () => {
    if (!referralCodeInput.trim() || !phoneInput) return;
    setErrorMsg(null);
    try {
      const billNum = parseFloat(billAmountInput) || 0;
      const res = await ApiClient.validateReferral(
        referralCodeInput,
        phoneInput,
        billNum > 0 ? billNum : undefined
      );
      setReferralValid(res.valid);
      setReferralReason(res.reason || null);
      setReferralOwnerName(res.ownerName || null);
      setFriendPoints(res.friendPoints || 0);
      setReferrerPoints(res.referrerPoints || 0);
    } catch (err: any) {
      setReferralValid(false);
      setReferralReason(err.message);
    }
  };

  const handleSaveSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      onOpenLogin();
      return;
    }

    const billNum = parseFloat(billAmountInput);
    if (!billNum || billNum <= 0) {
      setErrorMsg('Please enter a valid bill amount');
      return;
    }

    if (!customerExists && !customerName.trim()) {
      setErrorMsg('Customer name is required for new customers');
      return;
    }

    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await ApiClient.saveSale({
        phone: phoneInput,
        name: !customerExists ? customerName : undefined,
        marketingConsent,
        receiptRef: receiptRef.trim() ? receiptRef.trim() : undefined,
        billAmountPounds: billNum,
        referralCode: referralValid ? referralCodeInput.trim() : undefined,
      });

      setSaleSavedResult(res);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleNextCustomer = () => {
    setPhoneInput('');
    setPhoneLookupDone(false);
    setCustomerExists(false);
    setCustomerId(null);
    setCustomerName('');
    setTotalPoints(0);
    setMarketingConsent(false);
    setShowReferralInput(false);
    setReferralCodeInput('');
    setReferralValid(null);
    setReferralReason(null);
    setReferralOwnerName(null);
    setFriendPoints(0);
    setReferrerPoints(0);
    setBillAmountInput('');
    setReceiptRef('');
    setErrorMsg(null);
    setSaleSavedResult(null);
  };

  const handleSearchSales = async () => {
    setSearchLoading(true);
    try {
      const res = await ApiClient.findSales(searchQuery);
      setSearchResults(res.sales);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSearchLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-rose-900 text-amber-300 rounded-xl">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-rose-950 tracking-tight">Billing Counter</h1>
            <p className="text-xs text-neutral-500">Record sales and apply referral codes</p>
          </div>
        </div>

        <div className="flex bg-neutral-200/80 p-1 rounded-xl self-start sm:self-auto">
          <button
            onClick={() => {
              setMode('new_sale');
              setSaleSavedResult(null);
            }}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              mode === 'new_sale' ? 'bg-white text-rose-950 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>New Sale</span>
          </button>
          <button
            onClick={() => {
              setMode('find_sale');
              handleSearchSales();
            }}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              mode === 'find_sale' ? 'bg-white text-rose-950 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Search className="w-4 h-4" />
            <span>Find Sale</span>
          </button>
        </div>
      </div>

      {saleSavedResult && (
        <div className="bg-white rounded-2xl border-2 border-emerald-500 shadow-xl p-5 sm:p-7 mb-6 animate-in zoom-in-95 duration-200">
          <div className="flex items-center gap-3 text-emerald-700 mb-4 pb-3 border-b border-emerald-100">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-7 h-7 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-xl font-black text-emerald-900">Sale Successfully Saved!</h2>
              <p className="text-xs text-emerald-700 font-medium">
                {saleSavedResult.receiptRef ? `Receipt #${saleSavedResult.receiptRef} · ` : ''}{saleSavedResult.customerName} ({saleSavedResult.customerPhone})
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 bg-neutral-50 p-4 rounded-xl mb-4 border border-neutral-200 text-center">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">Bill Total</div>
              <div className="text-lg font-bold text-neutral-900">£{saleSavedResult.billAmountPounds.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-emerald-700 font-semibold">Net Payable</div>
              <div className="text-xl font-black text-emerald-800">£{saleSavedResult.finalAmountPounds.toFixed(2)}</div>
            </div>
          </div>

          <div className="p-3.5 bg-amber-50 border-2 border-amber-300 rounded-xl mb-3 flex items-center gap-2.5 text-sm text-amber-950 font-black">
            <Sparkles className="w-5 h-5 text-amber-600 shrink-0" />
            <span>
              {saleSavedResult.customerName} earns {saleSavedResult.earnedPoints} points — balance {saleSavedResult.totalPoints.toLocaleString()}
            </span>
          </div>

          {saleSavedResult.friendPointsGiven > 0 && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl mb-2 flex items-center gap-2 text-xs text-emerald-900 font-bold">
              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{saleSavedResult.customerName} gets {saleSavedResult.friendPointsGiven} welcome points</span>
            </div>
          )}

          {saleSavedResult.referrerName && saleSavedResult.referrerPointsGiven > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl mb-4 flex items-center gap-2 text-xs text-amber-900 font-bold">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                {saleSavedResult.referrerName} gets {saleSavedResult.referrerPointsGiven} points — {saleSavedResult.referrerName} now has {saleSavedResult.referrerTotalPoints.toLocaleString()} points
              </span>
            </div>
          )}

          <div className="mb-6 bg-rose-50/60 border border-rose-100 rounded-xl p-3.5">
            <div className="text-xs font-bold text-rose-950 flex items-center gap-1.5 mb-2">
              <MessageSquare className="w-3.5 h-3.5 text-rose-700" />
              <span>Transactional Messages Dispatched:</span>
            </div>
            <div className="space-y-2">
              {saleSavedResult.messagesSent?.map((msg: any) => (
                <div key={msg.id} className="text-xs bg-white p-2.5 rounded-lg border border-rose-200 font-mono text-neutral-700">
                  <div className="text-[10px] font-bold text-rose-800 uppercase mb-1">
                    Kind: {msg.kind} · Status: {msg.status}
                  </div>
                  <div>"{msg.body}"</div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleNextCustomer}
              className="flex-1 py-3.5 px-6 rounded-xl bg-rose-900 hover:bg-rose-800 text-white font-black text-base shadow-lg transition flex items-center justify-center gap-2"
            >
              <span>Next Customer</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {mode === 'new_sale' && !saleSavedResult && (
        <form onSubmit={handleSaveSale} className="space-y-5">
          {errorMsg && (
            <div className="p-4 bg-red-50 border-2 border-red-300 rounded-xl flex items-center gap-3 text-red-800 text-sm font-medium">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* STEP 1: UK MOBILE LOOKUP */}
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-black uppercase tracking-wider text-rose-900 flex items-center gap-1.5">
                <Phone className="w-4 h-4 text-rose-700" />
                <span>Step 1: UK Mobile Number</span>
              </label>
              {phoneLookupDone && (
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                    customerExists ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {customerExists ? 'Existing Customer' : 'New Customer'}
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="tel"
                  value={phoneInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPhoneInput(val);
                    const digits = val.replace(/\D/g, '');
                    if (digits.length >= 10) {
                      handlePhoneLookup(val);
                    } else {
                      setPhoneLookupDone(false);
                    }
                  }}
                  placeholder="07700 900123"
                  className="w-full px-4 py-3 rounded-xl border-2 border-neutral-300 focus:border-rose-600 focus:ring-2 focus:ring-rose-500/20 text-lg font-bold tracking-wider outline-none transition"
                />
              </div>
              <button
                type="button"
                onClick={() => handlePhoneLookup(phoneInput)}
                disabled={loading || !phoneInput.trim()}
                className="px-5 py-3 rounded-xl bg-rose-900 hover:bg-rose-800 text-white font-bold text-sm shadow-sm transition disabled:opacity-40"
              >
                Lookup
              </button>
            </div>

            {phoneLookupDone && !customerExists && (
              <div className="mt-4 pt-4 border-t border-neutral-200 space-y-3 animate-in fade-in duration-150">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 uppercase mb-1">
                    Customer Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="e.g. Jessica Miller"
                      required
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-300 focus:border-rose-600 text-sm font-semibold outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="marketingConsent"
                    checked={marketingConsent}
                    onChange={(e) => setMarketingConsent(e.target.checked)}
                    className="w-4 h-4 text-rose-600 rounded border-neutral-300 focus:ring-rose-500"
                  />
                  <label htmlFor="marketingConsent" className="text-xs text-neutral-700 font-medium cursor-pointer">
                    Happy to receive offers from us? (Default No)
                  </label>
                </div>

                <div className="pt-2">
                  {!showReferralInput ? (
                    <button
                      type="button"
                      onClick={() => setShowReferralInput(true)}
                      className="w-full py-2.5 px-4 rounded-xl border-2 border-dashed border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-900 text-xs font-bold flex items-center justify-center gap-2 transition"
                    >
                      <Tag className="w-4 h-4 text-rose-700" />
                      <span>Has a Friend's Referral Code? Tap to Apply</span>
                    </button>
                  ) : (
                    <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-rose-950 uppercase flex items-center gap-1">
                          <Tag className="w-3.5 h-3.5 text-rose-700" />
                          <span>Friend's Referral Code</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setShowReferralInput(false);
                            setReferralCodeInput('');
                            setReferralValid(null);
                          }}
                          className="text-[11px] text-rose-600 hover:underline"
                        >
                          Remove
                        </button>
                      </div>

                      <div className="flex gap-2">
                        <input
                          type="text"
                          maxLength={6}
                          value={referralCodeInput}
                          onChange={(e) => {
                            setReferralCodeInput(e.target.value.toUpperCase());
                            setReferralValid(null);
                          }}
                          placeholder="e.g. EMM789"
                          className="w-full px-3 py-2 rounded-lg border border-neutral-300 uppercase tracking-widest font-mono font-bold text-base outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleValidateReferral}
                          className="px-4 py-2 bg-rose-900 hover:bg-rose-800 text-white rounded-lg text-xs font-bold"
                        >
                          Validate
                        </button>
                      </div>

                      {referralValid === true && (
                        <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 font-semibold space-y-1">
                          <div className="flex items-center gap-1.5 font-bold">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>Code valid. {customerName || 'Friend'} gets {friendPoints} welcome points. {referralOwnerName || 'Referrer'} gets {referrerPoints} points.</span>
                          </div>
                        </div>
                      )}

                      {referralValid === false && (
                        <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 font-semibold flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                          <span>Invalid Code: {referralReason}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {phoneLookupDone && customerExists && (
              <div className="mt-4 pt-4 border-t border-neutral-200 space-y-3 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-base font-black text-rose-950">{customerName}</div>
                    <div className="text-xs text-neutral-500 font-medium">{phoneInput}</div>
                  </div>
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-right">
                    <div className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
                      Points Balance
                    </div>
                    <div className="text-2xl font-black text-amber-950">{totalPoints}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* STEP 2: BILL DETAILS */}
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4 sm:p-5">
            <div className="mb-3">
              <label className="text-xs font-black uppercase tracking-wider text-rose-900 flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-rose-700" />
                <span>Step 2: Bill Details</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase mb-1">
                  Bill Amount (£) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-3 font-bold text-neutral-400 text-sm">£</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={billAmountInput}
                    onChange={(e) => setBillAmountInput(e.target.value)}
                    placeholder="60.00"
                    required
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-neutral-300 focus:border-rose-600 focus:ring-2 focus:ring-rose-500/20 text-lg font-black text-neutral-900 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase mb-1">
                  Receipt number (optional)
                </label>
                <input
                  type="text"
                  value={receiptRef}
                  onChange={(e) => setReceiptRef(e.target.value)}
                  placeholder="REC-001"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 focus:border-rose-600 text-base font-bold text-neutral-900 font-mono uppercase outline-none"
                />
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || !phoneLookupDone}
              className="w-full py-4 px-6 rounded-2xl bg-rose-900 hover:bg-rose-800 text-white font-black text-lg shadow-xl hover:shadow-2xl transition disabled:opacity-40 flex items-center justify-center gap-3 cursor-pointer"
            >
              {loading ? (
                <span>Recording Sale...</span>
              ) : (
                <>
                  <Receipt className="w-5 h-5 text-amber-300" />
                  <span>Save Sale</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {mode === 'find_sale' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search sales by receipt number or customer phone..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-300 text-sm font-medium outline-none"
                />
              </div>
              <button
                type="button"
                onClick={handleSearchSales}
                disabled={searchLoading}
                className="px-4 py-2.5 bg-rose-900 text-white rounded-xl text-xs font-bold hover:bg-rose-800"
              >
                Search
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {searchResults.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-2xl border border-neutral-200 text-neutral-400 text-sm font-medium">
                No matching sales found.
              </div>
            ) : (
              searchResults.map((sale) => (
                <div
                  key={sale.id}
                  className="p-4 bg-white rounded-2xl border border-neutral-200 transition shadow-xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2 pb-2 border-b border-neutral-100">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-rose-950">
                          {sale.receipt_ref || 'No Receipt Ref'}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          Completed
                        </span>
                      </div>
                      <div className="text-xs text-neutral-500 font-medium">
                        {sale.customerName} ({sale.customerPhone}) · {new Date(sale.created_at).toLocaleDateString('en-GB')}
                      </div>
                    </div>
                  </div>

                  <div className="text-xs font-bold text-neutral-800">
                    Bill Amount: £{sale.billAmountPounds.toFixed(2)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

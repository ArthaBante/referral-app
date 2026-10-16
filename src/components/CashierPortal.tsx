import React, { useState, useEffect } from 'react';
import { ApiClient } from '../lib/api.ts';
import { StaffUser, SaleItem } from '../types/index.ts';
import {
  Phone,
  User,
  Tag,
  CreditCard,
  QrCode,
  ShieldAlert,
  CheckCircle2,
  Receipt,
  RotateCcw,
  Sparkles,
  ArrowRight,
  Search,
  MessageSquare,
  AlertTriangle,
  KeyRound,
  ExternalLink,
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
  // Mode: 'new_sale' or 'find_sale'
  const [mode, setMode] = useState<'new_sale' | 'find_sale'>('new_sale');

  // Customer & Phone State
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneLookupDone, setPhoneLookupDone] = useState(false);
  const [customerExists, setCustomerExists] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPersonalToken, setCustomerPersonalToken] = useState('');
  const [activeCreditRupees, setActiveCreditRupees] = useState(0);
  const [pendingCreditRupees, setPendingCreditRupees] = useState(0);
  const [marketingConsent, setMarketingConsent] = useState(false); // default no

  // Referral Code state
  const [showReferralInput, setShowReferralInput] = useState(false);
  const [referralCodeInput, setReferralCodeInput] = useState('');
  const [referralValid, setReferralValid] = useState<boolean | null>(null);
  const [referralReason, setReferralReason] = useState<string | null>(null);
  const [referralOwnerName, setReferralOwnerName] = useState<string | null>(null);

  // Credit Usage state
  const [wantUseCredit, setWantUseCredit] = useState(false);
  const [creditAuthMethod, setCreditAuthMethod] = useState<'none' | 'qr' | 'otp'>('none');
  const [creditAuthVerified, setCreditAuthVerified] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);

  // Bill & Tally fields
  const [billAmountInput, setBillAmountInput] = useState('');
  const [tallyBillNo, setTallyBillNo] = useState('');

  // Live calculation breakdown
  const [calcDiscountRupees, setCalcDiscountRupees] = useState(0);
  const [calcCreditUsedRupees, setCalcCreditUsedRupees] = useState(0);
  const [calcFinalPayableRupees, setCalcFinalPayableRupees] = useState(0);
  const [instructions, setInstructions] = useState('');

  // Status & Confirmation
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saleSavedResult, setSaleSavedResult] = useState<any | null>(null);

  // Find Sale / Returns state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SaleItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [returnSuccessMsg, setReturnSuccessMsg] = useState<string | null>(null);

  // Auto-generate realistic Tally bill number helper
  useEffect(() => {
    if (!tallyBillNo && mode === 'new_sale') {
      const randomSeq = Math.floor(100 + Math.random() * 900);
      setTallyBillNo(`TL-26-${randomSeq}`);
    }
  }, [mode, tallyBillNo]);

  // Recalculate bill whenever bill amount, referral, or credit selection changes
  useEffect(() => {
    const billNum = parseFloat(billAmountInput);
    if (!phoneInput || isNaN(billNum) || billNum <= 0) {
      setCalcDiscountRupees(0);
      setCalcCreditUsedRupees(0);
      setCalcFinalPayableRupees(isNaN(billNum) ? 0 : billNum);
      setInstructions('');
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await ApiClient.calculateBill({
          phone: phoneInput,
          billAmountRupees: billNum,
          referralCode: referralValid ? referralCodeInput.trim() : undefined,
          useCredit: wantUseCredit && creditAuthVerified,
        });
        setCalcDiscountRupees(res.discountRupees);
        setCalcCreditUsedRupees(res.creditUsedRupees);
        setCalcFinalPayableRupees(res.finalPayableRupees);
        setInstructions(res.instructions);
      } catch (e) {
        // Silent catch during typing
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [billAmountInput, phoneInput, referralValid, referralCodeInput, wantUseCredit, creditAuthVerified]);

  // Phone lookup handler
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
        setCustomerPersonalToken(res.personalToken || '');
        setActiveCreditRupees(res.activeCreditRupees || 0);
        setPendingCreditRupees(res.pendingCreditRupees || 0);
        setMarketingConsent(Boolean(res.marketingConsent));
        // Reset referral code (referral codes are only for new customers)
        setShowReferralInput(false);
        setReferralCodeInput('');
        setReferralValid(null);
      } else {
        setCustomerId(null);
        setCustomerName('');
        setCustomerPersonalToken('');
        setActiveCreditRupees(0);
        setPendingCreditRupees(0);
        setMarketingConsent(false);
        setWantUseCredit(false);
        setCreditAuthVerified(false);
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Referral code validation
  const handleValidateReferral = async () => {
    if (!referralCodeInput.trim() || !phoneInput) return;
    setErrorMsg(null);
    try {
      const billNum = parseFloat(billAmountInput) || 0;
      const res = await ApiClient.validateReferral(referralCodeInput, phoneInput, billNum > 0 ? billNum : undefined);
      setReferralValid(res.valid);
      setReferralReason(res.reason || null);
      setReferralOwnerName(res.ownerName || null);
    } catch (err: any) {
      setReferralValid(false);
      setReferralReason(err.message);
    }
  };

  // Credit Auth: Request OTP
  const handleRequestOtp = async () => {
    if (!customerId) return;
    setOtpError(null);
    try {
      const res = await ApiClient.requestOtp(customerId);
      setOtpSent(true);
      if (res.devOtp) {
        setDevOtpHint(res.devOtp);
      }
    } catch (err: any) {
      setOtpError(err.message);
    }
  };

  // Credit Auth: Verify OTP
  const handleVerifyOtp = async () => {
    if (!customerId || !otpInput.trim()) return;
    setOtpError(null);
    try {
      const res = await ApiClient.verifyOtp(customerId, otpInput);
      if (res.verified) {
        setCreditAuthVerified(true);
        setCreditAuthMethod('otp');
      }
    } catch (err: any) {
      setOtpError(err.message);
    }
  };

  // Credit Auth: Verify QR (or customer personal token)
  const handleVerifyQr = async (scannedValue: string) => {
    if (!customerId) return;
    try {
      const res = await ApiClient.verifyPersonalQr(customerId, scannedValue);
      if (res.verified) {
        setCreditAuthVerified(true);
        setCreditAuthMethod('qr');
      }
    } catch (err: any) {
      alert(`QR verification failed: ${err.message}`);
    }
  };

  // Save Sale Handler
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

    if (!tallyBillNo.trim()) {
      setErrorMsg('Tally bill number is required');
      return;
    }

    if (!customerExists && !customerName.trim()) {
      setErrorMsg('Customer name is required for new customers');
      return;
    }

    if (wantUseCredit && !creditAuthVerified) {
      setErrorMsg('Store credit requires OTP or Personal QR verification before saving.');
      return;
    }

    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await ApiClient.saveSale({
        phone: phoneInput,
        name: !customerExists ? customerName : undefined,
        marketingConsent,
        tallyBillNo: tallyBillNo.trim(),
        billAmountRupees: billNum,
        referralCode: referralValid ? referralCodeInput.trim() : undefined,
        useCredit: wantUseCredit && creditAuthVerified,
        verifiedCreditAuth: wantUseCredit ? creditAuthMethod as any : undefined,
      });

      setSaleSavedResult(res);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Reset to next customer (under 2 seconds reset)
  const handleNextCustomer = () => {
    setPhoneInput('');
    setPhoneLookupDone(false);
    setCustomerExists(false);
    setCustomerId(null);
    setCustomerName('');
    setCustomerPersonalToken('');
    setActiveCreditRupees(0);
    setPendingCreditRupees(0);
    setMarketingConsent(false);
    setShowReferralInput(false);
    setReferralCodeInput('');
    setReferralValid(null);
    setReferralReason(null);
    setReferralOwnerName(null);
    setWantUseCredit(false);
    setCreditAuthMethod('none');
    setCreditAuthVerified(false);
    setOtpSent(false);
    setOtpInput('');
    setDevOtpHint(null);
    setBillAmountInput('');
    const randomSeq = Math.floor(100 + Math.random() * 900);
    setTallyBillNo(`TL-26-${randomSeq}`);
    setCalcDiscountRupees(0);
    setCalcCreditUsedRupees(0);
    setCalcFinalPayableRupees(0);
    setInstructions('');
    setErrorMsg(null);
    setSaleSavedResult(null);
  };

  // Find Sales Search
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

  // Mark Returned
  const handleMarkReturned = async (saleId: string) => {
    if (!confirm('Are you sure you want to mark this sale as returned? If referral credit is still pending, it will be cancelled.')) {
      return;
    }
    try {
      const res = await ApiClient.markReturned(saleId);
      setReturnSuccessMsg(`Sale ${res.tallyBillNo} marked returned.`);
      if (res.referralCancelled) {
        setReturnSuccessMsg(`Sale ${res.tallyBillNo} returned. Referrer pending credit cancelled and code restored to unused.`);
      }
      handleSearchSales();
    } catch (err: any) {
      alert(`Return error: ${err.message}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
      {/* Top Counter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-rose-900 text-amber-300 rounded-xl">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-rose-950 tracking-tight">Billing Counter</h1>
            <p className="text-xs text-neutral-500">Record Tally sale, apply referral discounts & redeem credit</p>
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
            <span>Find Sale / Returns</span>
          </button>
        </div>
      </div>

      {/* VIEW: SALE SAVED CONFIRMATION (Under 30s flow completion) */}
      {saleSavedResult && (
        <div className="bg-white rounded-2xl border-2 border-emerald-500 shadow-xl p-5 sm:p-7 mb-6 animate-in zoom-in-95 duration-200">
          <div className="flex items-center gap-3 text-emerald-700 mb-4 pb-3 border-b border-emerald-100">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-7 h-7 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-xl font-black text-emerald-900">Sale Successfully Saved!</h2>
              <p className="text-xs text-emerald-700 font-medium">
                Tally Bill #{saleSavedResult.tallyBillNo} · {saleSavedResult.customerName} ({saleSavedResult.customerPhone})
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-neutral-50 p-4 rounded-xl mb-4 border border-neutral-200 text-center">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">Bill Total</div>
              <div className="text-lg font-bold text-neutral-900">₹{saleSavedResult.billAmountRupees}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-rose-600 font-semibold">Discount Given</div>
              <div className="text-lg font-bold text-rose-700">₹{saleSavedResult.discountRupees}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-amber-600 font-semibold">Credit Used</div>
              <div className="text-lg font-bold text-amber-700">₹{saleSavedResult.creditUsedRupees}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-emerald-700 font-semibold">Tally Net Cash</div>
              <div className="text-xl font-black text-emerald-800">₹{saleSavedResult.finalAmountRupees}</div>
            </div>
          </div>

          {/* Referral Credit notice if applied */}
          {saleSavedResult.referrerName && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl mb-4 flex items-center gap-2 text-xs text-amber-900">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Referrer <strong>{saleSavedResult.referrerName}</strong> earned{' '}
                <strong>₹{saleSavedResult.referrerPendingCreditRupees} store credit</strong> (Pending for 7 days).
              </span>
            </div>
          )}

          {/* Customer Messages Dispatched */}
          <div className="mb-6 bg-rose-50/60 border border-rose-100 rounded-xl p-3.5">
            <div className="text-xs font-bold text-rose-950 flex items-center gap-1.5 mb-2">
              <MessageSquare className="w-3.5 h-3.5 text-rose-700" />
              <span>Transactional Messages Dispatched (Dev Mode):</span>
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
            {customerPersonalToken && (
              <button
                type="button"
                onClick={() => onViewCustomerPortal(customerPersonalToken)}
                className="py-3 px-4 rounded-xl border border-rose-300 text-rose-900 hover:bg-rose-50 text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Open Customer's Pass</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* VIEW: NEW SALE FORM */}
      {mode === 'new_sale' && !saleSavedResult && (
        <form onSubmit={handleSaveSale} className="space-y-5">
          {errorMsg && (
            <div className="p-4 bg-red-50 border-2 border-red-300 rounded-xl flex items-center gap-3 text-red-800 text-sm font-medium">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* STEP 1: PHONE NUMBER LOOKUP */}
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-black uppercase tracking-wider text-rose-900 flex items-center gap-1.5">
                <Phone className="w-4 h-4 text-rose-700" />
                <span>Step 1: Customer Mobile (10-Digit)</span>
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
                <span className="absolute left-3.5 top-3.5 font-bold text-neutral-400 text-sm">+91</span>
                <input
                  type="tel"
                  maxLength={10}
                  value={phoneInput.replace('+91', '')}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '');
                    setPhoneInput(digits);
                    if (digits.length === 10) {
                      handlePhoneLookup(digits);
                    } else {
                      setPhoneLookupDone(false);
                    }
                  }}
                  placeholder="9827100001"
                  className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-neutral-300 focus:border-rose-600 focus:ring-2 focus:ring-rose-500/20 text-lg font-bold tracking-wider outline-none transition"
                />
              </div>
              <button
                type="button"
                onClick={() => handlePhoneLookup(phoneInput)}
                disabled={loading || phoneInput.length < 10}
                className="px-5 py-3 rounded-xl bg-rose-900 hover:bg-rose-800 text-white font-bold text-sm shadow-sm transition disabled:opacity-40"
              >
                Lookup
              </button>
            </div>

            {/* Quick Test Number Chips */}
            <div className="mt-3 flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-neutral-400 font-semibold flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                Quick Samples:
              </span>
              <button
                type="button"
                onClick={() => {
                  setPhoneInput('9827100001');
                  handlePhoneLookup('9827100001');
                }}
                className="text-[11px] bg-rose-50 hover:bg-rose-100 text-rose-900 px-2 py-0.5 rounded-lg border border-rose-200 font-medium"
              >
                Sunita (+919827100001)
              </button>
              <button
                type="button"
                onClick={() => {
                  setPhoneInput('9827100003');
                  handlePhoneLookup('9827100003');
                }}
                className="text-[11px] bg-amber-50 hover:bg-amber-100 text-amber-900 px-2 py-0.5 rounded-lg border border-amber-200 font-medium"
              >
                Anita (+919827100003 - ₹150 credit)
              </button>
              <button
                type="button"
                onClick={() => {
                  const randomDigits = Math.floor(6000000000 + Math.random() * 3999999999).toString();
                  setPhoneInput(randomDigits);
                  handlePhoneLookup(randomDigits);
                }}
                className="text-[11px] bg-neutral-100 hover:bg-neutral-200 text-neutral-700 px-2 py-0.5 rounded-lg border border-neutral-300 font-medium"
              >
                + Fresh New Customer
              </button>
            </div>

            {/* IF NEW CUSTOMER: Form */}
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
                      placeholder="e.g. Rekha Soni"
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

                {/* Apply Referral Code Button for New Customer */}
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
                          placeholder="e.g. SUN789"
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
                        <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 font-semibold flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>
                            Valid referral from <strong>{referralOwnerName}</strong>! Friend gets 10% discount.
                          </span>
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

            {/* IF EXISTING CUSTOMER: Details & Credit Balance */}
            {phoneLookupDone && customerExists && (
              <div className="mt-4 pt-4 border-t border-neutral-200 space-y-3 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-base font-black text-rose-950">{customerName}</div>
                    <div className="text-xs text-neutral-500 font-medium">{phoneInput}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onViewCustomerPortal(customerPersonalToken)}
                    className="text-xs text-rose-800 hover:text-rose-900 font-bold underline flex items-center gap-1"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>View Pass</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <div className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
                      Active Store Credit
                    </div>
                    <div className="text-2xl font-black text-amber-950">₹{activeCreditRupees}</div>
                    <div className="text-[10px] text-amber-700">Spendable in-store</div>
                  </div>
                  <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl">
                    <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                      Pending Credit
                    </div>
                    <div className="text-2xl font-black text-neutral-700">₹{pendingCreditRupees}</div>
                    <div className="text-[10px] text-neutral-500">Unlocks after return period</div>
                  </div>
                </div>

                {/* Redeem Credit Options */}
                {activeCreditRupees > 0 && (
                  <div className="pt-1">
                    {!wantUseCredit ? (
                      <button
                        type="button"
                        onClick={() => setWantUseCredit(true)}
                        className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-rose-950 font-black text-xs shadow-xs flex items-center justify-center gap-2 transition"
                      >
                        <CreditCard className="w-4 h-4" />
                        <span>Use ₹{activeCreditRupees} Store Credit On This Bill</span>
                      </button>
                    ) : (
                      <div className="p-3.5 bg-amber-50/80 border border-amber-300 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-black text-amber-950 uppercase flex items-center gap-1.5">
                            <KeyRound className="w-4 h-4 text-amber-700" />
                            <span>Verify Customer To Redeem Credit</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setWantUseCredit(false);
                              setCreditAuthVerified(false);
                            }}
                            className="text-[11px] text-neutral-600 hover:underline"
                          >
                            Cancel
                          </button>
                        </div>

                        {creditAuthVerified ? (
                          <div className="p-2.5 bg-emerald-100 border border-emerald-300 rounded-lg text-xs font-bold text-emerald-900 flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>Customer Verified ({creditAuthMethod.toUpperCase()}). Credit will be applied!</span>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              {/* Option A: Personal QR verification */}
                              <button
                                type="button"
                                onClick={() => handleVerifyQr(customerPersonalToken)}
                                className="p-2.5 bg-white border border-neutral-300 hover:border-rose-600 rounded-xl text-left transition"
                              >
                                <div className="text-xs font-bold text-neutral-900 flex items-center gap-1">
                                  <QrCode className="w-3.5 h-3.5 text-rose-700" />
                                  <span>Scan Customer QR</span>
                                </div>
                                <div className="text-[10px] text-neutral-500 mt-0.5">Show personal pass QR</div>
                              </button>

                              {/* Option B: Send OTP */}
                              <button
                                type="button"
                                onClick={handleRequestOtp}
                                className="p-2.5 bg-white border border-neutral-300 hover:border-amber-600 rounded-xl text-left transition"
                              >
                                <div className="text-xs font-bold text-neutral-900 flex items-center gap-1">
                                  <Phone className="w-3.5 h-3.5 text-amber-700" />
                                  <span>Send OTP to Mobile</span>
                                </div>
                                <div className="text-[10px] text-neutral-500 mt-0.5">6-digit SMS code</div>
                              </button>
                            </div>

                            {/* OTP Entry Box */}
                            {otpSent && (
                              <div className="p-2.5 bg-white rounded-xl border border-neutral-300 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-bold text-neutral-600">Enter 6-digit OTP:</span>
                                  {devOtpHint && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOtpInput(devOtpHint);
                                      }}
                                      className="text-[10px] text-amber-800 bg-amber-100 px-2 py-0.5 rounded font-mono font-bold"
                                    >
                                      Dev Auto-fill: {devOtpHint}
                                    </button>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    maxLength={6}
                                    value={otpInput}
                                    onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                                    placeholder="123456"
                                    className="w-full px-3 py-1.5 rounded-lg border border-neutral-300 text-center font-mono font-bold tracking-widest text-base"
                                  />
                                  <button
                                    type="button"
                                    onClick={handleVerifyOtp}
                                    className="px-4 py-1.5 bg-rose-900 hover:bg-rose-800 text-white rounded-lg text-xs font-bold"
                                  >
                                    Verify
                                  </button>
                                </div>
                                {otpError && <div className="text-[11px] text-red-600 font-semibold">{otpError}</div>}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* STEP 2: BILL DETAILS */}
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4 sm:p-5">
            <div className="mb-3">
              <label className="text-xs font-black uppercase tracking-wider text-rose-900 flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-rose-700" />
                <span>Step 2: Tally Bill Details</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase mb-1">
                  Bill Amount (₹) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-3 font-bold text-neutral-400 text-sm">₹</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={billAmountInput}
                    onChange={(e) => setBillAmountInput(e.target.value)}
                    placeholder="1000"
                    required
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-neutral-300 focus:border-rose-600 focus:ring-2 focus:ring-rose-500/20 text-lg font-black text-neutral-900 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase mb-1">
                  Tally Bill Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={tallyBillNo}
                  onChange={(e) => setTallyBillNo(e.target.value)}
                  placeholder="TL-2026-001"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 focus:border-rose-600 text-base font-bold text-neutral-900 font-mono uppercase outline-none"
                />
              </div>
            </div>

            {/* LIVE TALLY SUMMARY BANNER */}
            {instructions && (
              <div className="mt-4 p-4 rounded-xl bg-amber-50 border-2 border-amber-400 text-amber-950 animate-in fade-in duration-150">
                <div className="text-xs font-bold uppercase tracking-wider text-amber-800 mb-1 flex items-center gap-1">
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  <span>Exact Counter Action For Tally:</span>
                </div>
                <div className="text-xl sm:text-2xl font-black text-rose-950 leading-tight">
                  {instructions}
                </div>
                <div className="mt-2 pt-2 border-t border-amber-200/80 flex items-center justify-between text-xs font-semibold text-neutral-700">
                  <span>Gross: ₹{billAmountInput || 0}</span>
                  {calcDiscountRupees > 0 && <span className="text-rose-700">Discount: -₹{calcDiscountRupees}</span>}
                  {calcCreditUsedRupees > 0 && <span className="text-amber-800">Credit: -₹{calcCreditUsedRupees}</span>}
                  <span className="text-emerald-800 font-bold text-sm">Collect: ₹{calcFinalPayableRupees}</span>
                </div>
              </div>
            )}
          </div>

          {/* STEP 3: SUBMIT BUTTON */}
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
                  <span>Save Sale & Send Customer SMS</span>
                </>
              )}
            </button>
            <p className="text-center text-xs text-neutral-400 mt-2">
              Validates referral code, issues store credit, sends SMS/WhatsApp pass link in 1 tap.
            </p>
          </div>
        </form>
      )}

      {/* VIEW: FIND SALE / RETURNS */}
      {mode === 'find_sale' && (
        <div className="space-y-4">
          {returnSuccessMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{returnSuccessMsg}</span>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by Tally bill number or customer phone..."
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
                  className={`p-4 bg-white rounded-2xl border transition shadow-xs ${
                    sale.status === 'returned' ? 'border-neutral-200 bg-neutral-50/70 opacity-70' : 'border-rose-100'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2 pb-2 border-b border-neutral-100">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-rose-950">
                          {sale.tally_bill_no}
                        </span>
                        {sale.status === 'returned' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-200 text-neutral-700">
                            Returned
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            Completed
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-neutral-500 font-medium">
                        {sale.customerName} ({sale.customerPhone}) · {new Date(sale.created_at).toLocaleDateString('en-IN')}
                      </div>
                    </div>

                    {sale.status !== 'returned' && (
                      <button
                        type="button"
                        onClick={() => handleMarkReturned(sale.id)}
                        className="px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold flex items-center gap-1 self-start sm:self-auto"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Mark Returned</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-neutral-400 block text-[10px]">Bill Amount</span>
                      <span className="font-bold text-neutral-800">₹{sale.billAmountRupees}</span>
                    </div>
                    <div>
                      <span className="text-neutral-400 block text-[10px]">Discount</span>
                      <span className="font-bold text-rose-700">₹{sale.discountAmountRupees}</span>
                    </div>
                    <div>
                      <span className="text-neutral-400 block text-[10px]">Credit Used</span>
                      <span className="font-bold text-amber-800">₹{sale.creditUsedRupees}</span>
                    </div>
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

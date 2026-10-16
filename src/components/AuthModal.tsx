import React, { useState } from 'react';
import { ApiClient } from '../lib/api.ts';
import { StaffUser } from '../types/index.ts';
import { Lock, User, AlertCircle, X, Shield, Sparkles } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: StaffUser) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onLoginSuccess }) => {
  const [username, setUsername] = useState('cashier');
  const [password, setPassword] = useState('change-me');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await ApiClient.login(username, password);
      onLoginSuccess(res.staff);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const fillCredentials = (user: string, pass: string) => {
    setUsername(user);
    setPassword(pass);
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-rose-100">
        <div className="bg-rose-950 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-400 text-rose-950 flex items-center justify-center font-bold">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-amber-200">Staff Portal Login</h3>
              <p className="text-xs text-rose-200">Raigarh Counter & Admin Access</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-rose-300 hover:text-white hover:bg-rose-900 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-1.5">
              Username
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-300 focus:border-rose-600 focus:ring-2 focus:ring-rose-500/20 text-sm font-medium outline-none transition"
                placeholder="owner or cashier"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-300 focus:border-rose-600 focus:ring-2 focus:ring-rose-500/20 text-sm font-medium outline-none transition"
                placeholder="change-me"
              />
            </div>
          </div>

          {/* Quick Credential Chips for Test ease */}
          <div className="pt-1">
            <span className="text-[11px] font-semibold text-neutral-500 flex items-center gap-1 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              One-Tap Test Accounts:
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => fillCredentials('cashier', 'change-me')}
                className="p-2 text-left rounded-xl border border-rose-200 bg-rose-50/60 hover:bg-rose-100 transition text-xs"
              >
                <div className="font-bold text-rose-950">Cashier Counter</div>
                <div className="text-[11px] text-neutral-500">cashier / change-me</div>
              </button>
              <button
                type="button"
                onClick={() => fillCredentials('owner', 'change-me')}
                className="p-2 text-left rounded-xl border border-amber-200 bg-amber-50/60 hover:bg-amber-100 transition text-xs"
              >
                <div className="font-bold text-amber-950">Shop Owner</div>
                <div className="text-[11px] text-neutral-500">owner / change-me</div>
              </button>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-rose-900 hover:bg-rose-800 text-white font-bold text-sm shadow-md transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <span>Authenticating...</span>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Log in to Counter</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

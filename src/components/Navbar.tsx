import React from 'react';
import { StaffUser } from '../types/index.ts';
import { ApiClient } from '../lib/api.ts';
import { ShoppingBag, ShieldCheck, Smartphone, LogOut, LogIn } from 'lucide-react';

interface NavbarProps {
  currentTab: 'cashier' | 'owner' | 'customer';
  setCurrentTab: (tab: 'cashier' | 'owner' | 'customer') => void;
  currentUser: StaffUser | null;
  setCurrentUser: (user: StaffUser | null) => void;
  onOpenLogin: () => void;
  shopName: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  setCurrentTab,
  currentUser,
  setCurrentUser,
  onOpenLogin,
  shopName,
}) => {
  const handleLogout = async () => {
    await ApiClient.logout();
    setCurrentUser(null);
    setCurrentTab('cashier');
  };

  return (
    <header className="bg-rose-950 text-white shadow-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-3 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Brand */}
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 rounded-xl bg-amber-400 text-rose-950 flex items-center justify-center font-bold shadow-sm">
              <ShoppingBag className="w-5 h-5 text-rose-950" />
            </div>
            <div>
              <div className="font-bold text-base sm:text-lg leading-tight tracking-tight text-amber-200">
                {shopName || 'Your Business'}
              </div>
              <div className="text-xs text-rose-200 flex items-center gap-1 font-medium">
                <span>RefFrnd Portal</span>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span className="text-[11px] text-emerald-300">UK Ready</span>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center space-x-1 sm:space-x-2 overflow-x-auto py-1">
            <button
              onClick={() => setCurrentTab('cashier')}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
                currentTab === 'cashier'
                  ? 'bg-amber-400 text-rose-950 shadow-sm font-semibold'
                  : 'text-rose-100 hover:bg-rose-900/60'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              <span>Counter Billing</span>
            </button>

            <button
              onClick={() => {
                if (currentUser?.role === 'owner') {
                  setCurrentTab('owner');
                } else {
                  onOpenLogin();
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
                currentTab === 'owner'
                  ? 'bg-amber-400 text-rose-950 shadow-sm font-semibold'
                  : 'text-rose-100 hover:bg-rose-900/60'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Owner Admin</span>
            </button>
          </nav>

          {/* User Account / Role Status */}
          <div className="flex items-center space-x-2">
            {currentUser ? (
              <div className="flex items-center space-x-2">
                <div className="hidden md:flex flex-col text-right">
                  <span className="text-xs font-semibold text-white leading-tight">
                    {currentUser.name}
                  </span>
                  <span className="text-[10px] text-amber-300 uppercase tracking-wider font-bold">
                    Role: {currentUser.role}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  title="Log out"
                  className="p-1.5 sm:px-2.5 sm:py-1 rounded-lg bg-rose-900 hover:bg-rose-800 text-rose-200 text-xs font-medium flex items-center gap-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            ) : (
              <button
                onClick={onOpenLogin}
                className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-rose-950 text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-sm transition"
              >
                <LogIn className="w-4 h-4" />
                <span>Staff Login</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

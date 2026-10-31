import React, { useState, useEffect } from 'react';
import { StaffUser } from './types/index.ts';
import { ApiClient } from './lib/api.ts';
import { Navbar } from './components/Navbar.tsx';
import { CashierPortal } from './components/CashierPortal.tsx';
import { OwnerPortal } from './components/OwnerPortal.tsx';
import { CustomerPortal } from './components/CustomerPortal.tsx';
import { AuthModal } from './components/AuthModal.tsx';

export default function App() {
  const [currentTab, setCurrentTab] = useState<'cashier' | 'owner' | 'customer'>('cashier');
  const [currentUser, setCurrentUser] = useState<StaffUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [selectedCustomerToken, setSelectedCustomerToken] = useState<string>('');
  const [shopName, setShopName] = useState('Your Business');
  const [isCustomerOnly, setIsCustomerOnly] = useState(false);

  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/customer/')) {
      const token = path.replace('/customer/', '').trim();
      if (token) {
        setSelectedCustomerToken(token);
        setCurrentTab('customer');
        setIsCustomerOnly(true);
      }
    }
  }, []);

  useEffect(() => {
    const initApp = async () => {
      const stored = ApiClient.getStoredUser();
      if (stored && ApiClient.getToken()) {
        setCurrentUser(stored);
      }

      try {
        const res = await ApiClient.getShopName();
        if (res.shopName) setShopName(res.shopName);
      } catch {}
    };

    initApp();
  }, []);

  const handleViewCustomerPortal = (token: string) => {
    setSelectedCustomerToken(token);
    setCurrentTab('customer');
    setIsCustomerOnly(true);
  };

  if (isCustomerOnly || currentTab === 'customer') {
    return (
      <div className="min-h-screen bg-neutral-100/70 text-neutral-900 flex flex-col font-sans antialiased selection:bg-rose-200 selection:text-rose-950">
        <main className="flex-1">
          <CustomerPortal initialToken={selectedCustomerToken} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-100/70 text-neutral-900 flex flex-col font-sans antialiased selection:bg-rose-200 selection:text-rose-950">
      <Navbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        currentUser={currentUser}
        setCurrentUser={setCurrentUser}
        onOpenLogin={() => setAuthModalOpen(true)}
        shopName={shopName}
      />

      <main className="flex-1">
        {currentTab === 'cashier' && (
          <CashierPortal
            currentUser={currentUser}
            onOpenLogin={() => setAuthModalOpen(true)}
            onViewCustomerPortal={handleViewCustomerPortal}
          />
        )}

        {currentTab === 'owner' && (
          <OwnerPortal
            onViewCustomerPortal={handleViewCustomerPortal}
            setCurrentUser={setCurrentUser}
            onSettingsUpdated={(newShopName: string) => setShopName(newShopName)}
          />
        )}
      </main>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          if (user.role === 'owner') {
            setCurrentTab('owner');
          }
        }}
      />
    </div>
  );
}

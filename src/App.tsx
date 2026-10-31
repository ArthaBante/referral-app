import React, { useState, useEffect } from 'react';
import { StaffUser } from './types/index.ts';
import { ApiClient } from './lib/api.ts';
import { Navbar } from './components/Navbar.tsx';
import { CashierPortal } from './components/CashierPortal.tsx';
import { OwnerPortal } from './components/OwnerPortal.tsx';
import { CustomerPortal } from './components/CustomerPortal.tsx';
import { AcceptanceTestRunner } from './components/AcceptanceTestRunner.tsx';
import { AuthModal } from './components/AuthModal.tsx';

export default function App() {
  const [currentTab, setCurrentTab] = useState<'cashier' | 'owner' | 'customer' | 'tests'>('cashier');
  const [currentUser, setCurrentUser] = useState<StaffUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [selectedCustomerToken, setSelectedCustomerToken] = useState<string>('');
  const [shopName, setShopName] = useState('Demo Salon');

  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/customer/')) {
      const token = path.replace('/customer/', '').trim();
      if (token) {
        setSelectedCustomerToken(token);
        setCurrentTab('customer');
      }
    }
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      const stored = ApiClient.getStoredUser();
      if (stored && ApiClient.getToken()) {
        setCurrentUser(stored);
      } else {
        try {
          const res = await ApiClient.login('cashier', 'change-me');
          setCurrentUser(res.staff);
        } catch {
          // Fallback
        }
      }

      try {
        const res = await fetch('/api/customer/by-token/token-emma-smith-uk-789012345678');
        if (res.ok) {
          const d = await res.json();
          if (d.shopName) setShopName(d.shopName);
        }
      } catch {}
    };

    initAuth();
  }, []);

  const handleViewCustomerPortal = (token: string) => {
    setSelectedCustomerToken(token);
    setCurrentTab('customer');
  };

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
          <OwnerPortal onViewCustomerPortal={handleViewCustomerPortal} />
        )}

        {currentTab === 'customer' && (
          <CustomerPortal initialToken={selectedCustomerToken} />
        )}

        {currentTab === 'tests' && <AcceptanceTestRunner />}
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

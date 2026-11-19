import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../shared/lib/api';
import { AdminHeader } from './components/AdminHeader';
import { AdminSidebar } from './components/AdminSidebar';
import { AdminAnalytics } from './pages/AdminAnalytics';
import { AdminCatalog } from './pages/AdminCatalog';
import { AdminInventory } from './pages/AdminInventory';
import { AdminOrders } from './pages/AdminOrders';
import { AdminBilling } from './pages/AdminBilling';
import { AdminMachineAnalytics } from './pages/AdminMachineAnalytics';
import { AdminDestinations } from './pages/AdminDestinations';
import { AdminSettings } from './pages/AdminSettings';

export const AdminPortal: React.FC = () => {
  const getTabFromPath = (): string => {
    const path = window.location.pathname.toLowerCase();
    const sub = path.replace(/^\/admin\/?/, '').split('/')[0];
    if (sub === 'bins' || sub === 'destinations') return 'destinations';
    if (sub === 'analytics' || sub === 'overview') return 'overview';
    const validTabs = ['overview', 'catalog', 'inventory', 'orders', 'billing', 'machine-analytics', 'destinations', 'settings'];
    if (validTabs.includes(sub)) return sub;
    return 'overview';
  };

  const [activeTab, setActiveTab] = useState<string>(getTabFromPath);
  const [lowStockCount, setLowStockCount] = useState<number>(0);

  // Sync with browser URL navigation
  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(getTabFromPath());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleSelectTab = (tab: string) => {
    setActiveTab(tab);
    let targetUrl = `/admin/${tab}`;
    if (tab === 'overview') targetUrl = '/admin';
    else if (tab === 'destinations') targetUrl = '/admin/bins';
    if (window.location.pathname.toLowerCase() !== targetUrl) {
      window.history.pushState(null, '', targetUrl);
    }
  };

  const fetchLowStockCount = () => {
    apiFetch<any>('/analytics/dashboard')
      .then(d => {
        if (d?.overview?.lowStockCount) {
          setLowStockCount(d.overview.lowStockCount);
        }
      })
      .catch(console.error);
  };

  useEffect(() => {
    fetchLowStockCount();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-100 flex flex-col">
      <AdminHeader onRefresh={fetchLowStockCount} />

      <div className="flex-1 flex flex-col md:flex-row">
        <AdminSidebar
          activeTab={activeTab === 'bins' ? 'destinations' : activeTab === 'analytics' ? 'overview' : activeTab}
          onSelectTab={handleSelectTab}
          lowStockCount={lowStockCount}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto max-w-7xl w-full">
          {(activeTab === 'overview' || activeTab === 'analytics') && <AdminAnalytics />}
          {activeTab === 'catalog' && <AdminCatalog />}
          {activeTab === 'inventory' && <AdminInventory />}
          {activeTab === 'orders' && <AdminOrders />}
          {activeTab === 'billing' && <AdminBilling />}
          {activeTab === 'machine-analytics' && <AdminMachineAnalytics />}
          {(activeTab === 'destinations' || activeTab === 'bins') && <AdminDestinations />}
          {activeTab === 'settings' && <AdminSettings />}
        </main>
      </div>
    </div>
  );
};

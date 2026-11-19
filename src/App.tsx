import React, { useEffect } from 'react';
import { AuthProvider, useAuth } from './shared/store/authContext';
import { ToastProvider } from './shared/store/toastContext';
import { PortalSwitcherHeader } from './shared/layouts/PortalSwitcherHeader';
import { CustomerPortal } from './portals/customer/CustomerPortal';
import { OperatorPortal } from './portals/operator/OperatorPortal';
import { AdminPortal } from './portals/admin/AdminPortal';
import { LoginPage } from './portals/auth/LoginPage';
import { initSocket } from './shared/lib/socket';

const MainApp: React.FC = () => {
  const { user, activeRole } = useAuth();

  useEffect(() => {
    initSocket();
  }, []);

  // Strict route guards
  useEffect(() => {
    const handleRouteGuards = () => {
      const path = window.location.pathname.toLowerCase();

      if (!user) {
        // Anyone not logged in who tries any portal URL lands on the Login screen first, always
        if (path !== '/login') {
          window.history.replaceState(null, '', '/login');
        }
        return;
      }

      // Customer session can only reach customer routes
      if (user.role === 'customer') {
        if (path.startsWith('/operator') || path.startsWith('/admin') || path.startsWith('/warehouse') || path === '/login') {
          window.history.replaceState(null, '', '/customer');
        }
      } 
      // Operator session can only reach operator routes
      else if (user.role === 'operator') {
        if (path.startsWith('/admin') || path.startsWith('/customer') || path.startsWith('/store') || path === '/' || path === '/login') {
          window.history.replaceState(null, '', '/operator');
        }
      } 
      // Admin session can only reach admin routes
      else if (user.role === 'admin') {
        if (path.startsWith('/operator') || path.startsWith('/warehouse') || path.startsWith('/customer') || path.startsWith('/store') || path === '/' || path === '/login') {
          window.history.replaceState(null, '', '/admin');
        }
      }
    };

    handleRouteGuards();
    window.addEventListener('popstate', handleRouteGuards);
    return () => window.removeEventListener('popstate', handleRouteGuards);
  }, [user]);

  // If not logged in, render real Login screen as the very first thing anyone sees
  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 text-zinc-900 font-sans antialiased selection:bg-orange-500/20 selection:text-orange-950">
      <div className="flex-1 flex flex-col">
        {activeRole === 'customer' && <CustomerPortal />}
        {activeRole === 'operator' && <OperatorPortal />}
        {activeRole === 'admin' && <AdminPortal />}
      </div>
    </div>
  );
};

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </ToastProvider>
  );
}


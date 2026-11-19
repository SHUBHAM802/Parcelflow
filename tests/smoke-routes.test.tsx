import { describe, it, expect, vi, beforeAll } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

// Mock contexts
import { ToastProvider } from '../src/shared/store/toastContext';
import { OperatorPortal } from '../src/portals/operator/OperatorPortal';
import { AdminPortal } from '../src/portals/admin/AdminPortal';
import { CustomerPortal } from '../src/portals/customer/CustomerPortal';
import { LoginPage } from '../src/portals/auth/LoginPage';

// Individual pages
import { OperatorDashboard } from '../src/portals/operator/pages/OperatorDashboard';
import { OperatorOrdersQueue } from '../src/portals/operator/pages/OperatorOrdersQueue';
import { OperatorPicking } from '../src/portals/operator/pages/OperatorPicking';
import { OperatorPacking } from '../src/portals/operator/pages/OperatorPacking';
import { OperatorLabels } from '../src/portals/operator/pages/OperatorLabels';
import { OperatorConveyor } from '../src/portals/operator/pages/OperatorConveyor';
import { OperatorInventory } from '../src/portals/operator/pages/OperatorInventory';
import { OperatorAlerts } from '../src/portals/operator/pages/OperatorAlerts';
import { OperatorLogs } from '../src/portals/operator/pages/OperatorLogs';

import { AdminAnalytics } from '../src/portals/admin/pages/AdminAnalytics';
import { AdminCatalog } from '../src/portals/admin/pages/AdminCatalog';
import { AdminInventory } from '../src/portals/admin/pages/AdminInventory';
import { AdminOrders } from '../src/portals/admin/pages/AdminOrders';
import { AdminBilling } from '../src/portals/admin/pages/AdminBilling';
import { AdminMachineAnalytics } from '../src/portals/admin/pages/AdminMachineAnalytics';
import { AdminDestinations } from '../src/portals/admin/pages/AdminDestinations';
import { AdminSettings } from '../src/portals/admin/pages/AdminSettings';

import { CustomerHome } from '../src/portals/customer/pages/CustomerHome';
import { CustomerCatalog } from '../src/portals/customer/pages/CustomerCatalog';
import { CustomerOrders } from '../src/portals/customer/pages/CustomerOrders';
import { CustomerWishlist } from '../src/portals/customer/pages/CustomerWishlist';
import { CustomerProfile } from '../src/portals/customer/pages/CustomerProfile';
import { CustomerCheckout } from '../src/portals/customer/pages/CustomerCheckout';
import { CustomerTracking } from '../src/portals/customer/pages/CustomerTracking';

// Mock API and Socket
vi.mock('../src/shared/lib/api', () => ({
  apiFetch: vi.fn().mockImplementation((url: string) => {
    if (url.includes('/warehouse/queue')) {
      return Promise.resolve({
        newOrders: [],
        picking: [],
        packing: [],
        ready: [],
        conveyor: [],
        dispatched: []
      });
    }
    if (url.includes('/warehouse/conveyor/state')) {
      return Promise.resolve({
        conveyor: 'RUNNING',
        sensor: 'CLEAR',
        robot: 'IDLE',
        esp32: 'ONLINE',
        wifi: 'CONNECTED',
        motorRpm: 120,
        cameraFps: 30
      });
    }
    if (url.includes('/warehouse/alerts')) return Promise.resolve([]);
    if (url.includes('/warehouse/audit-logs')) return Promise.resolve([]);
    if (url.includes('/inventory/products') || url.includes('/catalog/products')) return Promise.resolve([]);
    if (url.includes('/catalog/categories')) return Promise.resolve([]);
    if (url.includes('/cart')) return Promise.resolve({ items: [], subtotal: 0, gst: 0, total: 0 });
    if (url.includes('/admin/bins')) return Promise.resolve([]);
    if (url.includes('/analytics/dashboard')) return Promise.resolve({ overview: { lowStockCount: 0 } });
    if (url.includes('/orders')) return Promise.resolve([]);
    return Promise.resolve({});
  })
}));

vi.mock('../src/shared/lib/socket', () => ({
  getSocket: () => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn()
  }),
  initSocket: vi.fn()
}));

vi.mock('../src/shared/store/authContext', () => ({
  useAuth: () => ({
    user: { id: 'usr-test', name: 'Test User', email: 'test@parcelflow.com', role: 'operator' },
    activeRole: 'operator',
    login: vi.fn(),
    logout: vi.fn(),
    loginWithGoogle: vi.fn(),
    register: vi.fn(),
    isLoading: false
  }),
  AuthProvider: ({ children }: any) => children
}));

describe('Portal Route & Component Smoke Tests', () => {
  const dummyMachineState: any = {
    conveyor: 'RUNNING',
    sensor: 'CLEAR',
    robot: 'IDLE',
    esp32: 'ONLINE',
    wifi: 'CONNECTED',
    motorRpm: 120,
    cameraFps: 30,
    activeOrderId: null,
    activeOrderCity: null,
    activeOrderBin: null
  };

  const dummyQueue: any = {
    newOrders: [],
    picking: [],
    packing: [],
    ready: [],
    conveyor: [],
    dispatched: []
  };

  function renderWithToast(ui: React.ReactElement) {
    return renderToString(
      <ToastProvider>
        {ui}
      </ToastProvider>
    );
  }

  describe('Operator Portal Routes & Pages', () => {
    it('renders OperatorDashboard without throwing', () => {
      const html = renderWithToast(
        <OperatorDashboard
          queue={dummyQueue}
          machineState={dummyMachineState}
          onNavigate={() => {}}
          onSendToConveyor={() => {}}
        />
      );
      expect(html).toBeTruthy();
    });

    it('renders OperatorOrdersQueue without throwing', () => {
      const html = renderWithToast(
        <OperatorOrdersQueue
          queue={dummyQueue}
          onAction={() => {}}
          onNavigateToPicking={() => {}}
          onNavigateToPacking={() => {}}
          onSendToConveyor={() => {}}
        />
      );
      expect(html).toBeTruthy();
    });

    it('renders OperatorPicking without throwing', () => {
      const html = renderWithToast(
        <OperatorPicking onPickingCompleted={() => {}} />
      );
      expect(html).toBeTruthy();
    });

    it('renders OperatorPacking without throwing', () => {
      const html = renderWithToast(
        <OperatorPacking onPackingCompleted={() => {}} />
      );
      expect(html).toBeTruthy();
    });

    it('renders OperatorLabels Studio without throwing', () => {
      const html = renderWithToast(<OperatorLabels />);
      expect(html).toBeTruthy();
    });

    it('renders OperatorConveyor without throwing even when no webcam exists', () => {
      const html = renderWithToast(
        <OperatorConveyor
          machineState={dummyMachineState}
          onMachineStateChange={() => {}}
        />
      );
      expect(html).toBeTruthy();
    });

    it('renders OperatorInventory without throwing', () => {
      const html = renderWithToast(<OperatorInventory />);
      expect(html).toBeTruthy();
    });

    it('renders OperatorAlerts without throwing', () => {
      const html = renderWithToast(<OperatorAlerts />);
      expect(html).toBeTruthy();
    });

    it('renders OperatorLogs without throwing', () => {
      const html = renderWithToast(<OperatorLogs />);
      expect(html).toBeTruthy();
    });

    it('renders OperatorPortal with /operator/conveyor path without throwing', () => {
      // Mock window location
      (global as any).window = {
        location: { pathname: '/operator/conveyor' },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        history: { pushState: vi.fn(), replaceState: vi.fn() }
      };
      const html = renderWithToast(<OperatorPortal />);
      expect(html).toBeTruthy();
    });

    it('renders OperatorPortal with /operator/labels path without throwing', () => {
      (global as any).window.location.pathname = '/operator/labels';
      const html = renderWithToast(<OperatorPortal />);
      expect(html).toBeTruthy();
    });
  });

  describe('Admin Portal Routes & Pages', () => {
    it('renders AdminAnalytics without throwing', () => {
      const html = renderWithToast(<AdminAnalytics />);
      expect(html).toBeTruthy();
    });

    it('renders AdminCatalog without throwing', () => {
      const html = renderWithToast(<AdminCatalog />);
      expect(html).toBeTruthy();
    });

    it('renders AdminInventory without throwing', () => {
      const html = renderWithToast(<AdminInventory />);
      expect(html).toBeTruthy();
    });

    it('renders AdminOrders without throwing', () => {
      const html = renderWithToast(<AdminOrders />);
      expect(html).toBeTruthy();
    });

    it('renders AdminBilling without throwing', () => {
      const html = renderWithToast(<AdminBilling />);
      expect(html).toBeTruthy();
    });

    it('renders AdminMachineAnalytics without throwing', () => {
      const html = renderWithToast(<AdminMachineAnalytics />);
      expect(html).toBeTruthy();
    });

    it('renders AdminDestinations (Destination Bins) without throwing', () => {
      const html = renderWithToast(<AdminDestinations />);
      expect(html).toBeTruthy();
    });

    it('renders AdminSettings without throwing', () => {
      const html = renderWithToast(<AdminSettings />);
      expect(html).toBeTruthy();
    });

    it('renders AdminPortal on /admin/bins without throwing', () => {
      (global as any).window.location.pathname = '/admin/bins';
      const html = renderWithToast(<AdminPortal />);
      expect(html).toBeTruthy();
    });

    it('renders AdminPortal on /admin/analytics without throwing', () => {
      (global as any).window.location.pathname = '/admin/analytics';
      const html = renderWithToast(<AdminPortal />);
      expect(html).toBeTruthy();
    });
  });

  describe('Customer Portal Routes & Pages', () => {
    it('renders CustomerHome without throwing', () => {
      const html = renderWithToast(
        <CustomerHome
          onNavigate={() => {}}
          onAddToCart={() => {}}
          onToggleWishlist={() => {}}
          wishlistIds={new Set()}
        />
      );
      expect(html).toBeTruthy();
    });

    it('renders CustomerCatalog without throwing', () => {
      const html = renderWithToast(
        <CustomerCatalog
          initialCategory="all"
          searchQuery=""
          onNavigate={() => {}}
          onAddToCart={() => {}}
          onToggleWishlist={() => {}}
          wishlistIds={new Set()}
        />
      );
      expect(html).toBeTruthy();
    });

    it('renders CustomerOrders without throwing', () => {
      const html = renderWithToast(
        <CustomerOrders
          onTrackOrder={() => {}}
          onViewInvoice={() => {}}
          onNavigateToCatalog={() => {}}
        />
      );
      expect(html).toBeTruthy();
    });

    it('renders CustomerWishlist without throwing', () => {
      const html = renderWithToast(
        <CustomerWishlist
          onAddToCart={() => {}}
          onNavigateToCatalog={() => {}}
          onNavigateToProduct={() => {}}
          onToggleWishlist={() => {}}
          wishlistIds={new Set()}
        />
      );
      expect(html).toBeTruthy();
    });

    it('renders CustomerProfile without throwing', () => {
      const html = renderWithToast(<CustomerProfile />);
      expect(html).toBeTruthy();
    });

    it('renders CustomerCheckout without throwing', () => {
      const html = renderWithToast(
        <CustomerCheckout
          cartItems={[]}
          subtotal={0}
          gst={0}
          total={0}
          onOrderPlaced={() => {}}
          onBackToShopping={() => {}}
        />
      );
      expect(html).toBeTruthy();
    });

    it('renders CustomerTracking without throwing', () => {
      const html = renderWithToast(
        <CustomerTracking
          orderId="ORD-TEST-123"
          onBack={() => {}}
          onViewInvoice={() => {}}
        />
      );
      expect(html).toBeTruthy();
    });

    it('renders CustomerPortal on /customer/catalog without throwing', () => {
      (global as any).window.location.pathname = '/customer/catalog';
      const html = renderWithToast(<CustomerPortal />);
      expect(html).toBeTruthy();
    });

    it('renders CustomerPortal on /customer/orders without throwing', () => {
      (global as any).window.location.pathname = '/customer/orders';
      const html = renderWithToast(<CustomerPortal />);
      expect(html).toBeTruthy();
    });
  });

  describe('Auth Pages', () => {
    it('renders LoginPage without throwing', () => {
      const html = renderWithToast(<LoginPage />);
      expect(html).toBeTruthy();
    });
  });
});

import React, { useState, useEffect } from 'react';
import { Product, CartItem, Order } from '../../types';
import { apiFetch } from '../../shared/lib/api';
import { ParcelFlowLogo } from '../../shared/components/ParcelFlowLogo';
import { CustomerHeader } from './components/CustomerHeader';
import { CartDrawer } from './components/CartDrawer';
import { CustomerHome } from './pages/CustomerHome';
import { CustomerCatalog } from './pages/CustomerCatalog';
import { CustomerProductDetail } from './pages/CustomerProductDetail';
import { CustomerCheckout } from './pages/CustomerCheckout';
import { CustomerOrders } from './pages/CustomerOrders';
import { CustomerTracking } from './pages/CustomerTracking';
import { CustomerInvoice } from './pages/CustomerInvoice';
import { CustomerWishlist } from './pages/CustomerWishlist';
import { CustomerProfile } from './pages/CustomerProfile';
import { useToast } from '../../shared/store/toastContext';
import { ShieldCheck, Truck, RotateCcw, HelpCircle, Package, ArrowRight } from 'lucide-react';

export const CustomerPortal: React.FC = () => {
  const { showToast } = useToast();

  const parseCustomerRoute = (): { page: string; param: string } => {
    const pathname = window.location.pathname;
    const sub = pathname.replace(/^\/customer\/?/i, '');
    const parts = sub.split('/').filter(Boolean);
    const validPages = ['home', 'catalog', 'product', 'checkout', 'orders', 'tracking', 'invoice', 'wishlist', 'profile'];
    const p = parts[0]?.toLowerCase() || 'home';
    const param = parts[1] ? decodeURIComponent(parts[1]) : '';
    if (p === 'store') return { page: 'home', param: '' };
    if (validPages.includes(p)) return { page: p, param };
    return { page: 'home', param: '' };
  };

  const initialRoute = parseCustomerRoute();
  const [activePage, setActivePage] = useState<string>(initialRoute.page);
  const [selectedProductId, setSelectedProductId] = useState<string>(initialRoute.page === 'product' ? initialRoute.param : '');
  const [selectedOrderId, setSelectedOrderId] = useState<string>(['tracking', 'invoice'].includes(initialRoute.page) ? initialRoute.param : '');
  const [initialCatalogCategory, setInitialCatalogCategory] = useState<string>(initialRoute.page === 'catalog' ? initialRoute.param || 'all' : 'all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Sync with browser URL navigation and deep-links
  useEffect(() => {
    const handlePopState = () => {
      const { page, param } = parseCustomerRoute();
      setActivePage(page);
      if (page === 'product' && param) setSelectedProductId(param);
      if ((page === 'tracking' || page === 'invoice') && param) setSelectedOrderId(param);
      if (page === 'catalog' && param) setInitialCatalogCategory(param);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set());

  const fetchCart = () => {
    apiFetch<{ items: CartItem[]; subtotal: number; gst: number; total: number }>('/cart')
      .then(data => {
        setCartItems(data.items || []);
      })
      .catch(console.error);
  };

  const fetchWishlist = () => {
    apiFetch<any[]>('/wishlist')
      .then(items => {
        if (Array.isArray(items)) {
          setWishlistIds(new Set(items.map(i => i.id || i.product_id)));
        }
      })
      .catch(console.error);
  };

  useEffect(() => {
    fetchCart();
    fetchWishlist();
  }, []);

  const handleAddToCart = async (product: Product, quantity = 1) => {
    try {
      await apiFetch('/cart/items', {
        method: 'POST',
        body: JSON.stringify({ productId: product.id, quantity })
      });
      showToast(`Added "${product.name}" to cart`, 'success');
      fetchCart();
    } catch (err: any) {
      showToast(err.message || 'Failed to add to cart', 'error');
    }
  };

  const handleBuyNow = async (product: Product, quantity = 1) => {
    try {
      await apiFetch('/cart/items', {
        method: 'POST',
        body: JSON.stringify({ productId: product.id, quantity })
      });
      await fetchCart();
      showToast(`Added "${product.name}" to cart`, 'success');
      handleNavigate('checkout');
    } catch (err: any) {
      showToast(err.message || 'Failed to prepare item for checkout', 'error');
    }
  };

  const handleUpdateQuantity = async (cartItemId: string, qty: number) => {
    try {
      await apiFetch(`/cart/items/${cartItemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity: qty })
      });
      fetchCart();
    } catch (err: any) {
      showToast(err.message || 'Failed to update quantity', 'error');
    }
  };

  const handleRemoveFromCart = async (cartItemId: string) => {
    try {
      await apiFetch(`/cart/items/${cartItemId}`, { method: 'DELETE' });
      fetchCart();
    } catch (err: any) {
      showToast(err.message || 'Failed to remove item', 'error');
    }
  };

  const handleToggleWishlist = async (product: Product) => {
    // Optimistic toggle
    setWishlistIds(prev => {
      const next = new Set(prev);
      if (next.has(product.id)) next.delete(product.id);
      else next.add(product.id);
      return next;
    });

    try {
      const res = await apiFetch<{ inWishlist: boolean }>('/wishlist/toggle', {
        method: 'POST',
        body: JSON.stringify({ productId: product.id })
      });
      if (res.inWishlist) {
        showToast(`Saved "${product.name}" to wishlist`, 'success');
      } else {
        showToast(`Removed "${product.name}" from wishlist`, 'info');
      }
      fetchWishlist();
    } catch (err: any) {
      showToast(err.message || 'Failed to update wishlist', 'error');
      fetchWishlist();
    }
  };

  const handleNavigate = (page: string, param?: any) => {
    let targetUrl = '/customer';

    if (page === 'product' && typeof param === 'string') {
      setSelectedProductId(param);
      setActivePage('product');
      targetUrl = `/customer/product/${encodeURIComponent(param)}`;
    } else if (page === 'catalog') {
      if (param) setInitialCatalogCategory(param);
      setActivePage('catalog');
      targetUrl = param && param !== 'all' ? `/customer/catalog/${encodeURIComponent(param)}` : '/customer/catalog';
    } else if (page === 'tracking' && typeof param === 'string') {
      setSelectedOrderId(param);
      setActivePage('tracking');
      targetUrl = `/customer/tracking/${encodeURIComponent(param)}`;
    } else if (page === 'invoice' && typeof param === 'string') {
      setSelectedOrderId(param);
      setActivePage('invoice');
      targetUrl = `/customer/invoice/${encodeURIComponent(param)}`;
    } else {
      setActivePage(page);
      targetUrl = page === 'home' ? '/customer' : `/customer/${page}`;
    }

    if (window.location.pathname.toLowerCase() !== targetUrl.toLowerCase()) {
      window.history.pushState(null, '', targetUrl);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOrderPlaced = (order: Order | any) => {
    fetchCart();
    const oid = order.id || order.orderId;
    setSelectedOrderId(oid);
    handleNavigate('tracking', oid);
  };

  // Calculate totals
  const subtotal = cartItems.reduce((acc, i) => acc + i.price * i.quantity, 0);
  const gst = Math.round(subtotal * 0.18 * 100) / 100;
  const total = subtotal + gst;
  const totalCartCount = cartItems.reduce((acc, i) => acc + i.quantity, 0);

  return (
    <div className="min-h-screen bg-stone-50/70 text-stone-900 flex flex-col font-sans antialiased">
      <CustomerHeader
        activePage={activePage}
        onNavigate={handleNavigate}
        cartCount={totalCartCount}
        wishlistCount={wishlistIds.size}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenCart={() => setIsCartOpen(true)}
      />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 pt-6 sm:pt-8">
        {activePage === 'home' && (
          <CustomerHome
            onNavigate={handleNavigate}
            onAddToCart={handleAddToCart}
            onToggleWishlist={handleToggleWishlist}
            wishlistIds={wishlistIds}
          />
        )}

        {activePage === 'catalog' && (
          <CustomerCatalog
            initialCategory={initialCatalogCategory}
            searchQuery={searchQuery}
            onNavigate={handleNavigate}
            onAddToCart={handleAddToCart}
            onToggleWishlist={handleToggleWishlist}
            wishlistIds={wishlistIds}
          />
        )}

        {activePage === 'product' && (
          <CustomerProductDetail
            productId={selectedProductId}
            onBack={() => handleNavigate('catalog')}
            onNavigate={handleNavigate}
            onAddToCart={handleAddToCart}
            onBuyNow={handleBuyNow}
            onToggleWishlist={handleToggleWishlist}
            wishlistIds={wishlistIds}
          />
        )}

        {activePage === 'checkout' && (
          <CustomerCheckout
            cartItems={cartItems}
            subtotal={subtotal}
            gst={gst}
            total={total}
            onOrderPlaced={handleOrderPlaced}
            onBackToShopping={() => handleNavigate('catalog')}
          />
        )}

        {activePage === 'orders' && (
          <CustomerOrders
            onTrackOrder={(id) => handleNavigate('tracking', id)}
            onViewInvoice={(id) => handleNavigate('invoice', id)}
            onNavigateToCatalog={() => handleNavigate('catalog')}
          />
        )}

        {activePage === 'tracking' && (
          <CustomerTracking
            orderId={selectedOrderId}
            onBack={() => handleNavigate('orders')}
            onViewInvoice={(id) => handleNavigate('invoice', id)}
          />
        )}

        {activePage === 'invoice' && (
          <CustomerInvoice
            orderId={selectedOrderId}
            onBack={() => handleNavigate('orders')}
          />
        )}

        {activePage === 'wishlist' && (
          <CustomerWishlist
            onAddToCart={handleAddToCart}
            onNavigateToCatalog={() => handleNavigate('catalog')}
            onNavigateToProduct={(id) => handleNavigate('product', id)}
            onToggleWishlist={handleToggleWishlist}
            wishlistIds={wishlistIds}
          />
        )}

        {activePage === 'profile' && <CustomerProfile />}
      </main>

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        subtotal={subtotal}
        gst={gst}
        total={total}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveFromCart}
        onCheckout={() => {
          setIsCartOpen(false);
          handleNavigate('checkout');
        }}
      />

      {/* Complete Branded Footer */}
      <footer className="bg-white border-t border-stone-200 mt-16 text-stone-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
            {/* Col 1: Brand Info */}
            <div className="space-y-3 md:col-span-1">
              <ParcelFlowLogo variant="full" size="md" />
              <p className="text-xs text-stone-500 leading-relaxed pt-2">
                Every parcel has a clear path. Intelligent e-commerce order processing synchronized with smart industrial warehouse automation.
              </p>
              <div className="flex items-center gap-2 pt-1 text-[11px] text-teal-700 font-medium">
                <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                <span>Pune Fulfillment Hub 01 &bull; Live Telemetry</span>
              </div>
            </div>

            {/* Col 2: Customer Journey */}
            <div className="space-y-2.5 text-xs">
              <h4 className="font-semibold text-stone-900 uppercase tracking-wider text-[11px]">Shopping &amp; Orders</h4>
              <ul className="space-y-2 text-stone-600">
                <li>
                  <button onClick={() => handleNavigate('catalog')} className="hover:text-amber-700 transition-colors cursor-pointer">
                    Product Catalog
                  </button>
                </li>
                <li>
                  <button onClick={() => handleNavigate('orders')} className="hover:text-amber-700 transition-colors cursor-pointer">
                    Order History &amp; Status
                  </button>
                </li>
                <li>
                  <button onClick={() => handleNavigate('wishlist')} className="hover:text-amber-700 transition-colors cursor-pointer">
                    Saved Wishlist
                  </button>
                </li>
                <li>
                  <button onClick={() => handleNavigate('profile')} className="hover:text-amber-700 transition-colors cursor-pointer">
                    Delivery Addresses &amp; Profile
                  </button>
                </li>
              </ul>
            </div>

            {/* Col 3: Fulfillment & Support */}
            <div className="space-y-2.5 text-xs">
              <h4 className="font-semibold text-stone-900 uppercase tracking-wider text-[11px]">Fulfillment &amp; Support</h4>
              <ul className="space-y-2 text-stone-600">
                <li className="flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                  <span>Real-time optical barcode sorting</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                  <span>GST-itemized tax invoicing</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                  <span>7-day return policy for delivered orders</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                  <span>Demo platform for educational automation</span>
                </li>
              </ul>
            </div>

            {/* Col 4: Prototype System Status */}
            <div className="space-y-2.5 text-xs">
              <h4 className="font-semibold text-stone-900 uppercase tracking-wider text-[11px]">System Architecture</h4>
              <p className="text-[11px] text-stone-500 leading-normal">
                Connected to digital twin simulator with ESP32 microcontroller API endpoints, bidirectional Socket.IO events, and deterministic order state transitions.
              </p>
              <div className="p-2.5 rounded-lg bg-stone-100 border border-stone-200 text-[11px] font-mono text-stone-600">
                <span>Demo GSTIN: 27AABCP1234F1Z9</span>
              </div>
            </div>
          </div>

          <div className="border-t border-stone-200/80 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-stone-500">
            <p>&copy; {new Date().getFullYear()} ParcelFlow Systems. Every parcel has a clear path.</p>
            <p className="text-[11px]">Pune Logistics Hub &bull; Maharashtra &bull; India</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

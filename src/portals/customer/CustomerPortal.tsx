import React, { useState, useEffect } from 'react';
import { Product, CartItem, Order } from '../../types';
import { apiFetch } from '../../shared/lib/api';
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

export const CustomerPortal: React.FC = () => {
  const { showToast } = useToast();

  const getPageFromPath = (): string => {
    const path = window.location.pathname.toLowerCase();
    const sub = path.replace(/^\/customer\/?/, '').split('/')[0];
    const validPages = ['home', 'catalog', 'product', 'checkout', 'orders', 'tracking', 'invoice', 'wishlist', 'profile'];
    if (sub === 'store') return 'home';
    if (validPages.includes(sub)) return sub;
    return 'home';
  };

  const [activePage, setActivePage] = useState<string>(getPageFromPath);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [initialCatalogCategory, setInitialCatalogCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Sync with browser URL navigation
  useEffect(() => {
    const handlePopState = () => {
      setActivePage(getPageFromPath());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(() => {
    try {
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('parcelflow_wishlist');
        return saved ? new Set(JSON.parse(saved)) : new Set(['prod-1', 'prod-3']);
      }
    } catch {}
    return new Set(['prod-1', 'prod-3']);
  });

  const fetchCart = () => {
    apiFetch<{ items: CartItem[]; subtotal: number; gst: number; total: number }>('/cart')
      .then(data => {
        setCartItems(data.items || []);
      })
      .catch(console.error);
  };

  useEffect(() => {
    fetchCart();
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
    await handleAddToCart(product, quantity);
    setActivePage('checkout');
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

  const handleToggleWishlist = (product: Product) => {
    setWishlistIds(prev => {
      const next = new Set(prev);
      if (next.has(product.id)) {
        next.delete(product.id);
        showToast(`Removed from wishlist`, 'info');
      } else {
        next.add(product.id);
        showToast(`Saved to wishlist`, 'success');
      }
      localStorage.setItem('parcelflow_wishlist', JSON.stringify(Array.from(next)));
      return next;
    });
  };

  const handleNavigate = (page: string, param?: any) => {
    if (page === 'product' && typeof param === 'string') {
      setSelectedProductId(param);
      setActivePage('product');
    } else if (page === 'catalog') {
      if (param) setInitialCatalogCategory(param);
      setActivePage('catalog');
    } else if (page === 'tracking' && typeof param === 'string') {
      setSelectedOrderId(param);
      setActivePage('tracking');
    } else if (page === 'invoice' && typeof param === 'string') {
      setSelectedOrderId(param);
      setActivePage('invoice');
    } else {
      setActivePage(page);
    }

    const targetUrl = page === 'home' ? '/customer' : `/customer/${page}`;
    if (window.location.pathname.toLowerCase() !== targetUrl) {
      window.history.pushState(null, '', targetUrl);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOrderPlaced = (order: Order) => {
    fetchCart();
    setSelectedOrderId(order.id);
    setActivePage('tracking');
  };

  // Calculate totals
  const subtotal = cartItems.reduce((acc, i) => acc + i.price * i.quantity, 0);
  const gst = Math.round(subtotal * 0.18);
  const total = subtotal + gst;
  const totalCartCount = cartItems.reduce((acc, i) => acc + i.quantity, 0);

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
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
            onBack={() => setActivePage('catalog')}
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
            onBackToShopping={() => setActivePage('catalog')}
          />
        )}

        {activePage === 'orders' && (
          <CustomerOrders
            onTrackOrder={(id) => handleNavigate('tracking', id)}
            onViewInvoice={(id) => handleNavigate('invoice', id)}
            onNavigateToCatalog={() => setActivePage('catalog')}
          />
        )}

        {activePage === 'tracking' && (
          <CustomerTracking
            orderId={selectedOrderId}
            onBack={() => setActivePage('orders')}
            onViewInvoice={(id) => handleNavigate('invoice', id)}
          />
        )}

        {activePage === 'invoice' && (
          <CustomerInvoice
            orderId={selectedOrderId}
            onBack={() => setActivePage('orders')}
          />
        )}

        {activePage === 'wishlist' && (
          <CustomerWishlist
            onAddToCart={handleAddToCart}
            onNavigateToCatalog={() => setActivePage('catalog')}
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
        onCheckout={() => setActivePage('checkout')}
      />

      {/* Footer */}
      <footer className="bg-white border-t border-zinc-200 mt-auto py-8 text-xs text-zinc-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-zinc-900">ParcelFlow</span>
            <span>&bull; Automated E-Commerce &amp; Warehouse Robotics</span>
          </div>
          <div className="flex items-center gap-6">
            <span>GSTIN: 27AABCP1234F1Z9</span>
            <span>Pune Fulfillment Hub 01</span>
            <span>&copy; {new Date().getFullYear()} ParcelFlow</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

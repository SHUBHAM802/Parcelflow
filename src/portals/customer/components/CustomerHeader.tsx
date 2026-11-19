import React, { useState, useEffect } from 'react';
import { Search, ShoppingCart, Heart, Package, User as UserIcon, LogOut, X } from 'lucide-react';
import { useAuth } from '../../../shared/store/authContext';
import { apiFetch } from '../../../shared/lib/api';
import { Category } from '../../../types';
import { ParcelFlowLogo } from '../../../shared/components/ParcelFlowLogo';

interface CustomerHeaderProps {
  onNavigate: (page: string, param?: any) => void;
  activePage: string;
  cartCount: number;
  wishlistCount: number;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenCart: () => void;
}

export const CustomerHeader: React.FC<CustomerHeaderProps> = ({
  onNavigate,
  activePage,
  cartCount,
  wishlistCount,
  searchQuery,
  onSearchChange,
  onOpenCart
}) => {
  const { user, logout } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    apiFetch<Category[]>('/catalog/categories').then(setCategories).catch(() => {});
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200/90 shadow-2xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Main top bar */}
        <div className="flex items-center justify-between h-16 gap-4 sm:gap-6">
          {/* Left: Custom ParcelFlow Brand Mark */}
          <div
            onClick={() => onNavigate('home')}
            className="flex items-center gap-2 cursor-pointer shrink-0 py-1 group"
            title="ParcelFlow Home"
          >
            <ParcelFlowLogo variant="full" size="md" theme="light" />
          </div>

          {/* Search bar */}
          <div className="flex-1 max-w-xl relative">
            <div className="relative">
              <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => onSearchChange(e.target.value)}
                onFocus={() => {
                  if (activePage !== 'catalog') onNavigate('catalog');
                }}
                placeholder="Search products by name, category, or specs..."
                className="w-full h-10 pl-10 pr-9 bg-stone-100/90 hover:bg-stone-100 focus:bg-white text-sm text-stone-900 placeholder:text-stone-400 rounded-lg border border-transparent focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all shadow-2xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {/* Wishlist */}
            <button
              onClick={() => onNavigate('wishlist')}
              className={`p-2 rounded-lg text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors relative cursor-pointer ${
                activePage === 'wishlist' ? 'bg-amber-50 text-amber-700 font-semibold' : ''
              }`}
              title="Saved Wishlist"
              aria-label="Wishlist"
            >
              <Heart className={`w-5 h-5 ${activePage === 'wishlist' ? 'fill-current' : ''}`} />
              {wishlistCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-amber-600 text-white text-[10px] font-bold flex items-center justify-center font-mono">
                  {wishlistCount}
                </span>
              )}
            </button>

            {/* My Orders */}
            <button
              onClick={() => onNavigate('orders')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                activePage === 'orders'
                  ? 'bg-amber-50 text-amber-800 font-semibold border border-amber-200'
                  : 'text-stone-700 hover:bg-stone-100 hover:text-stone-900'
              }`}
            >
              <Package className="w-4 h-4 text-stone-500" />
              <span className="hidden md:inline">Orders</span>
            </button>

            {/* Cart Button */}
            <button
              onClick={onOpenCart}
              className="flex items-center gap-2 h-10 px-3.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-lg font-medium text-sm transition-all shadow-xs cursor-pointer"
            >
              <ShoppingCart className="w-4 h-4" />
              <span className="hidden sm:inline">Cart</span>
              <span className="px-1.5 py-0.2 rounded-full bg-white text-amber-700 font-bold text-xs font-mono">
                {cartCount}
              </span>
            </button>

            {/* Profile */}
            <button
              onClick={() => onNavigate('profile')}
              className={`flex items-center gap-2 p-1.5 sm:px-3 sm:py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                activePage === 'profile' ? 'bg-stone-200 text-stone-900' : 'text-stone-700 hover:bg-stone-100'
              }`}
              title="View Account Profile"
            >
              <div className="w-7 h-7 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center font-semibold text-xs border border-stone-300">
                {user?.name ? user.name[0].toUpperCase() : 'U'}
              </div>
              <span className="hidden lg:inline text-xs font-medium text-stone-800 truncate max-w-[90px]">
                {user?.name || 'Account'}
              </span>
            </button>

            {/* Quick Log Out */}
            <button
              id="customer-header-logout-btn"
              onClick={logout}
              className="p-2 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              title="Log out of account"
              aria-label="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Categories Strip */}
        <div className="flex items-center gap-1 overflow-x-auto py-2 border-t border-stone-100 no-scrollbar text-xs">
          <button
            onClick={() => onNavigate('catalog', 'all')}
            className={`px-3 py-1 rounded-md whitespace-nowrap font-medium transition-colors cursor-pointer ${
              activePage === 'catalog'
                ? 'text-amber-700 font-semibold bg-amber-50'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
            }`}
          >
            All Products
          </button>
          {categories.map(c => (
            <button
              key={c.id}
              onClick={() => onNavigate('catalog', c.slug)}
              className="px-3 py-1 rounded-md whitespace-nowrap font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors cursor-pointer"
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
};

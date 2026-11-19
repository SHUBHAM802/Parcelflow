import React, { useState, useEffect } from 'react';
import { Search, ShoppingCart, Heart, Package, User as UserIcon, LogOut } from 'lucide-react';
import { useAuth } from '../../../shared/store/authContext';
import { apiFetch } from '../../../shared/lib/api';
import { Category } from '../../../types';

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
    <header className="sticky top-0 z-40 bg-white border-b border-zinc-200/80 shadow-2xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Main top bar */}
        <div className="flex items-center justify-between h-16 gap-4 sm:gap-6">
          {/* Left: Storefront Navigation */}
          <div
            onClick={() => onNavigate('home')}
            className="flex items-center gap-2 cursor-pointer shrink-0 py-1"
            title="Storefront Home"
          >
            <span className="text-lg font-bold tracking-tight text-zinc-900 hover:text-orange-600 transition-colors">
              Store
            </span>
          </div>

          {/* Search bar */}
          <div className="flex-1 max-w-xl relative">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => onSearchChange(e.target.value)}
                onFocus={() => {
                  if (activePage !== 'catalog') onNavigate('catalog');
                }}
                placeholder="Search products, brands, categories..."
                className="w-full h-10 pl-10 pr-4 bg-zinc-100/80 hover:bg-zinc-100 focus:bg-white text-sm text-zinc-900 placeholder:text-zinc-400 rounded-lg border border-transparent focus:border-orange-500 focus:outline-none transition-all shadow-2xs"
              />
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {/* Wishlist */}
            <button
              onClick={() => onNavigate('wishlist')}
              className={`p-2 rounded-lg text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition-colors relative cursor-pointer ${
                activePage === 'wishlist' ? 'bg-zinc-100 text-orange-600' : ''
              }`}
              title="Wishlist"
            >
              <Heart className="w-5 h-5" />
              {wishlistCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-zinc-900 text-white text-[10px] font-bold flex items-center justify-center font-mono">
                  {wishlistCount}
                </span>
              )}
            </button>

            {/* My Orders */}
            <button
              onClick={() => onNavigate('orders')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                activePage === 'orders'
                  ? 'bg-orange-50 text-orange-700'
                  : 'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900'
              }`}
            >
              <Package className="w-4 h-4 text-zinc-500" />
              <span className="hidden md:inline">Orders</span>
            </button>

            {/* Cart Button */}
            <button
              onClick={onOpenCart}
              className="flex items-center gap-2 h-10 px-3.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium text-sm transition-all shadow-xs active:scale-[0.99] cursor-pointer"
            >
              <ShoppingCart className="w-4 h-4" />
              <span className="hidden sm:inline">Cart</span>
              <span className="px-1.5 py-0.5 rounded-full bg-white text-orange-700 font-bold text-xs font-mono">
                {cartCount}
              </span>
            </button>

            {/* Profile */}
            <button
              onClick={() => onNavigate('profile')}
              className={`flex items-center gap-2 p-1.5 sm:px-3 sm:py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                activePage === 'profile' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-zinc-100'
              }`}
              title="View Account Profile"
            >
              <div className="w-7 h-7 rounded-full bg-zinc-200 text-zinc-700 flex items-center justify-center font-semibold text-xs">
                {user?.name ? user.name[0].toUpperCase() : 'U'}
              </div>
              <span className="hidden lg:inline text-xs font-medium text-zinc-800 truncate max-w-[90px]">
                {user?.name || 'Account'}
              </span>
            </button>

            {/* Quick Log Out */}
            <button
              id="customer-header-logout-btn"
              onClick={logout}
              className="p-2 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              title="Log out of account"
              aria-label="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Categories Strip */}
        <div className="flex items-center gap-1 overflow-x-auto py-2 border-t border-zinc-100 no-scrollbar text-xs">
          <button
            onClick={() => onNavigate('catalog', 'all')}
            className={`px-3 py-1 rounded-md whitespace-nowrap font-medium transition-colors cursor-pointer ${
              activePage === 'catalog'
                ? 'text-orange-600 font-semibold bg-orange-50'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
            }`}
          >
            All Products
          </button>
          {categories.map(c => (
            <button
              key={c.id}
              onClick={() => onNavigate('catalog', c.slug)}
              className="px-3 py-1 rounded-md whitespace-nowrap font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer"
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
};

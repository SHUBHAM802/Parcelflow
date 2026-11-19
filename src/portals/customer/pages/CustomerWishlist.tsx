import React, { useState, useEffect } from 'react';
import { Product } from '../../../types';
import { apiFetch } from '../../../shared/lib/api';
import { formatINR } from '../../../shared/lib/formatters';
import { Button } from '../../../shared/components/Button';
import { EmptyState } from '../../../shared/components/EmptyState';
import { Heart, ShoppingCart, Trash2, ArrowLeft } from 'lucide-react';

interface CustomerWishlistProps {
  onAddToCart: (product: Product) => void;
  onNavigateToCatalog: () => void;
  onNavigateToProduct: (productId: string) => void;
  onToggleWishlist: (product: Product) => void;
  wishlistIds: Set<string>;
}

export const CustomerWishlist: React.FC<CustomerWishlistProps> = ({
  onAddToCart,
  onNavigateToCatalog,
  onNavigateToProduct,
  onToggleWishlist,
  wishlistIds
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchWishlistProducts = () => {
    setIsLoading(true);
    apiFetch<Product[]>('/wishlist')
      .then(items => {
        setProducts(items || []);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchWishlistProducts();
  }, [wishlistIds.size]);

  const handleRemove = (prod: Product) => {
    onToggleWishlist(prod);
    setProducts(prev => prev.filter(p => p.id !== prod.id));
  };

  return (
    <div className="space-y-6 pb-16">
      <div className="flex items-center justify-between pb-4 border-b border-stone-200">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight">Saved Wishlist</h1>
          <p className="text-xs text-stone-500 mt-1">
            Personal items saved to your account ({products.length})
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onNavigateToCatalog} icon={<ArrowLeft className="w-3.5 h-3.5" />}>
          Explore Catalog
        </Button>
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-stone-500 space-y-3">
          <div className="w-8 h-8 mx-auto border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs">Loading saved wishlist items...</p>
        </div>
      ) : products.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-12">
          <EmptyState
            icon={<Heart className="w-10 h-10 text-stone-400 stroke-1" />}
            title="Your wishlist is empty"
            message="Save items you're interested in by tapping the heart icon on any product."
            action={
              <Button variant="orange" size="sm" onClick={onNavigateToCatalog}>
                Browse Products
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {products.map(prod => (
            <div
              key={prod.id}
              className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-2xs hover:shadow-sm hover:border-stone-300 transition-all flex flex-col justify-between group"
            >
              <div
                className="relative aspect-square bg-stone-100 cursor-pointer"
                onClick={() => onNavigateToProduct(prod.id)}
              >
                <img
                  src={prod.image_url}
                  alt={prod.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(prod);
                  }}
                  className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/95 text-rose-600 shadow-xs flex items-center justify-center hover:bg-white transition-colors cursor-pointer"
                  title="Remove from wishlist"
                  aria-label="Remove from wishlist"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3">
                <div>
                  <span className="text-[11px] text-stone-400 uppercase tracking-wider">{prod.category_name}</span>
                  <h3
                    onClick={() => onNavigateToProduct(prod.id)}
                    className="text-sm font-semibold text-stone-900 truncate hover:text-amber-700 transition-colors cursor-pointer mt-0.5"
                  >
                    {prod.name}
                  </h3>
                </div>

                <div className="pt-2 border-t border-stone-100 flex items-center justify-between">
                  <span className="text-base font-bold text-stone-900 font-mono">
                    {formatINR(prod.price)}
                  </span>
                  <Button
                    variant="orange"
                    size="sm"
                    onClick={() => onAddToCart(prod)}
                    icon={<ShoppingCart className="w-3.5 h-3.5" />}
                  >
                    Add to Cart
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

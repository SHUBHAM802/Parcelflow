import React, { useState, useEffect } from 'react';
import { Product, Review } from '../../../types';
import { apiFetch } from '../../../shared/lib/api';
import { formatINR, formatDate } from '../../../shared/lib/formatters';
import { Button } from '../../../shared/components/Button';
import { Tabs } from '../../../shared/components/Tabs';
import { useAuth } from '../../../shared/store/authContext';
import { useToast } from '../../../shared/store/toastContext';
import { Star, Heart, ShoppingCart, ArrowLeft, Truck, ShieldCheck, MapPin, CheckCircle2, MessageSquarePlus } from 'lucide-react';

interface CustomerProductDetailProps {
  productId: string;
  onBack: () => void;
  onNavigate: (page: string, param?: any) => void;
  onAddToCart: (product: Product, quantity?: number) => void;
  onBuyNow: (product: Product, quantity?: number) => void;
  onToggleWishlist: (product: Product) => void;
  wishlistIds: Set<string>;
}

export const CustomerProductDetail: React.FC<CustomerProductDetailProps> = ({
  productId,
  onBack,
  onNavigate,
  onAddToCart,
  onBuyNow,
  onToggleWishlist,
  wishlistIds
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [product, setProduct] = useState<Product | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [related, setRelated] = useState<Product[]>([]);
  const [quantity, setQuantity] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<'description' | 'reviews'>('description');
  const [selectedImageIdx, setSelectedImageIdx] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Write review state
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>('');
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);

  const [galleryImages, setGalleryImages] = useState<string[]>([]);

  useEffect(() => {
    setIsLoading(true);
    apiFetch<{ product: Product; reviews: Review[]; related: Product[] }>(`/catalog/products/${productId}`)
      .then(data => {
        setProduct(data.product);
        setReviews(data.reviews || []);
        setRelated(data.related || []);
        if (data.product) {
          const base = data.product.image_url;
          setGalleryImages([
            base,
            `${base}&auto=format&fit=crop&w=700&q=85`,
            `${base}&auto=format&fit=crop&w=900&q=90`
          ]);
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [productId]);

  if (isLoading) {
    return (
      <div className="py-24 text-center text-zinc-500 space-y-3">
        <div className="w-8 h-8 mx-auto border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm">Loading product information...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="py-24 text-center text-zinc-600 space-y-4 max-w-md mx-auto">
        <h3 className="text-lg font-bold text-zinc-900">Product Not Found</h3>
        <p className="text-xs text-zinc-500">The product you are looking for is unavailable or has been unlisted.</p>
        <Button variant="secondary" size="sm" onClick={onBack} icon={<ArrowLeft className="w-3.5 h-3.5" />}>
          Back to Catalog
        </Button>
      </div>
    );
  }

  const inWishlist = wishlistIds.has(product.id);
  const isOutOfStock = product.stock_quantity <= 0;
  const isLowStock = product.stock_quantity > 0 && product.stock_quantity <= 5;

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewComment.trim()) {
      showToast('Please enter a review comment', 'error');
      return;
    }
    setIsSubmittingReview(true);
    try {
      await apiFetch('/catalog/reviews', {
        method: 'POST',
        body: JSON.stringify({
          productId: product.id,
          rating: reviewRating,
          comment: reviewComment.trim()
        })
      });
      showToast('Review submitted successfully!', 'success');
      setReviewComment('');
      // Reload reviews
      const updated = await apiFetch<{ reviews: Review[] }>(`/catalog/products/${product.id}`);
      if (updated.reviews) setReviews(updated.reviews);
    } catch (err: any) {
      showToast(err.message || 'Failed to submit review', 'error');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  return (
    <div className="space-y-10 pb-16">
      {/* Back button */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-600 hover:text-zinc-900 transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Catalog</span>
      </button>

      {/* Main product view */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 bg-white border border-zinc-200/80 rounded-2xl p-6 sm:p-8 shadow-xs">
        {/* Gallery */}
        <div className="space-y-4">
          <div className="aspect-square rounded-xl overflow-hidden bg-zinc-100 border border-zinc-200/60 relative">
            <img
              src={galleryImages[selectedImageIdx] || product.image_url}
              alt={product.name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover transition-opacity duration-200"
            />
            {product.discount_percent > 0 && (
              <span className="absolute top-4 left-4 bg-amber-600 text-white font-bold text-xs px-2.5 py-1 rounded-md shadow-xs">
                {product.discount_percent}% OFF
              </span>
            )}
          </div>
          {/* Thumbnails */}
          <div className="flex items-center gap-3">
            {(galleryImages.length > 0 ? galleryImages : [product.image_url]).map((imgUrl, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedImageIdx(idx)}
                aria-label={`View image perspective ${idx + 1}`}
                className={`w-20 h-20 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                  selectedImageIdx === idx ? 'border-amber-600 ring-2 ring-amber-100 opacity-100' : 'border-zinc-200 opacity-70 hover:opacity-100'
                }`}
              >
                <img
                  src={imgUrl}
                  alt={`Thumbnail ${idx + 1}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>

        {/* Product Details */}
        <div className="flex flex-col justify-between space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span className="font-semibold uppercase tracking-wider text-orange-600 bg-orange-50 px-2 py-0.5 rounded">
                {product.category_name}
              </span>
              <span className="font-mono text-zinc-400">SKU: {product.id}</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 tracking-tight leading-tight">
              {product.name}
            </h1>

            {/* Rating */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-amber-50 text-amber-700 font-semibold px-2 py-0.5 rounded-md text-xs border border-amber-200">
                <Star className="w-3.5 h-3.5 fill-current" />
                <span>{product.rating}</span>
              </div>
              <span className="text-xs text-zinc-500">
                Based on {product.rating_count} verified reviews
              </span>
            </div>

            {/* Price section */}
            <div className="pt-2 flex items-baseline gap-3">
              <span className="text-3xl font-extrabold text-zinc-900 font-mono">
                {formatINR(product.price)}
              </span>
              {product.discount_percent > 0 && (
                <>
                  <span className="text-base text-zinc-400 line-through font-mono">
                    {formatINR(Math.round(product.price * (1 + product.discount_percent / 100)))}
                  </span>
                  <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Save {product.discount_percent}%
                  </span>
                </>
              )}
            </div>
            <p className="text-[11px] text-zinc-400">Inclusive of all taxes &bull; Free Express Shipping on orders over ₹499</p>

            {/* Stock Availability */}
            <div className="pt-3 border-t border-zinc-100 flex items-center gap-2 text-xs">
              {isOutOfStock ? (
                <div className="flex items-center gap-1.5 text-red-600 font-medium">
                  <span className="w-2 h-2 rounded-full bg-red-600" />
                  <span>Out of stock — replenishment in progress</span>
                </div>
              ) : isLowStock ? (
                <div className="flex items-center gap-1.5 text-amber-600 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span>Low stock — only {product.stock_quantity} units remaining</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-emerald-600 font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>In Stock — {product.stock_quantity} units ready for immediate dispatch</span>
                </div>
              )}
            </div>

            {/* Fulfillment metadata */}
            <div className="grid grid-cols-2 gap-3 pt-2 text-xs text-zinc-600">
              <div className="p-3 bg-stone-50 rounded-lg border border-stone-200/80 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Dispatch: <strong className="text-zinc-800">Smart Hub Fulfillment</strong></span>
              </div>
              <div className="p-3 bg-stone-50 rounded-lg border border-stone-200/80 flex items-center gap-2">
                <Truck className="w-4 h-4 text-teal-600 shrink-0" />
                <span>Parcel Weight: <strong className="text-zinc-800">{product.weight_grams}g</strong></span>
              </div>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="space-y-4 pt-4 border-t border-zinc-100">
            <div className="flex items-center gap-4">
              <span className="text-xs font-semibold text-zinc-700">Quantity:</span>
              <div className="flex items-center border border-zinc-200 rounded-lg overflow-hidden bg-zinc-50">
                <button
                  disabled={quantity <= 1}
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  className="px-3 py-1.5 hover:bg-zinc-200 text-zinc-600 disabled:opacity-40 cursor-pointer font-bold"
                >
                  -
                </button>
                <span className="px-4 text-xs font-semibold text-zinc-900 font-mono">{quantity}</span>
                <button
                  disabled={quantity >= product.stock_quantity}
                  onClick={() => setQuantity(q => q + 1)}
                  className="px-3 py-1.5 hover:bg-zinc-200 text-zinc-600 disabled:opacity-40 cursor-pointer font-bold"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="orange"
                size="lg"
                className="flex-1"
                disabled={isOutOfStock}
                onClick={() => onAddToCart(product, quantity)}
                icon={<ShoppingCart className="w-4 h-4" />}
              >
                Add to Cart
              </Button>

              <Button
                variant="primary"
                size="lg"
                className="flex-1 bg-zinc-900 hover:bg-zinc-800"
                disabled={isOutOfStock}
                onClick={() => onBuyNow(product, quantity)}
              >
                Buy Now
              </Button>

              <Button
                variant="secondary"
                size="lg"
                className="px-3.5"
                onClick={() => onToggleWishlist(product)}
                icon={<Heart className={`w-4 h-4 ${inWishlist ? 'fill-red-600 text-red-600' : 'text-zinc-600'}`} />}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs: Description & Reviews */}
      <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex gap-4 border-b border-zinc-200">
          <button
            onClick={() => setActiveTab('description')}
            className={`pb-3 text-sm font-semibold transition-colors border-b-2 -mb-px cursor-pointer ${
              activeTab === 'description' ? 'border-orange-600 text-orange-600' : 'border-transparent text-zinc-500 hover:text-zinc-900'
            }`}
          >
            Product Description
          </button>
          <button
            onClick={() => setActiveTab('reviews')}
            className={`pb-3 text-sm font-semibold transition-colors border-b-2 -mb-px cursor-pointer flex items-center gap-2 ${
              activeTab === 'reviews' ? 'border-orange-600 text-orange-600' : 'border-transparent text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <span>Customer Reviews</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700 font-mono">
              {reviews.length}
            </span>
          </button>
        </div>

        {activeTab === 'description' ? (
          <div className="text-sm text-zinc-600 space-y-3 leading-relaxed">
            <p>{product.description}</p>
            <div className="mt-4 p-4 rounded-xl bg-zinc-50 border border-zinc-100">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-700 mb-2">Automated Handling Specs</h4>
              <ul className="list-disc pl-5 space-y-1 text-xs text-zinc-500">
                <li>Compatible with conveyor sensor triggers &amp; barcode alignment</li>
                <li>Packaged in Grade-A tamper-evident corrugated boxes</li>
                <li>Real-time bin allocation based on city destination hub</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Reviews List */}
            <div className="space-y-4">
              {reviews.length === 0 ? (
                <p className="text-xs text-zinc-500">No reviews yet for this product. Be the first to share your experience!</p>
              ) : (
                reviews.map(rev => (
                  <div key={rev.id} className="p-4 bg-zinc-50/70 border border-zinc-100 rounded-xl space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-900">{rev.customer_name}</span>
                      <span className="text-[11px] font-mono text-zinc-400">{formatDate(rev.created_at)}</span>
                    </div>
                    <div className="flex items-center text-amber-500">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`w-3 h-3 ${i < rev.rating ? 'fill-current' : 'text-zinc-300'}`} />
                      ))}
                    </div>
                    <p className="text-xs text-zinc-600 mt-1">{rev.comment}</p>
                  </div>
                ))
              )}
            </div>

            {/* Write a review form */}
            <form onSubmit={handleSubmitReview} className="p-5 bg-zinc-50 border border-zinc-200/80 rounded-xl space-y-4">
              <h4 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
                <MessageSquarePlus className="w-4 h-4 text-orange-600" />
                <span>Write a Review</span>
              </h4>

              <div className="space-y-1">
                <label className="text-xs text-zinc-600 font-medium">Rating</label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      type="button"
                      key={star}
                      onClick={() => setReviewRating(star)}
                      className="p-1 text-amber-500 hover:scale-110 transition-transform cursor-pointer"
                    >
                      <Star className={`w-5 h-5 ${star <= reviewRating ? 'fill-current' : 'text-zinc-300'}`} />
                    </button>
                  ))}
                  <span className="ml-2 text-xs font-semibold text-zinc-700">{reviewRating} out of 5</span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-zinc-600 font-medium">Your Feedback</label>
                <textarea
                  rows={3}
                  value={reviewComment}
                  onChange={e => setReviewComment(e.target.value)}
                  placeholder="Share details of delivery quality, packaging, and performance..."
                  className="w-full p-3 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-orange-500 text-zinc-900"
                />
              </div>

              <Button
                type="submit"
                variant="orange"
                size="sm"
                isLoading={isSubmittingReview}
              >
                Post Review
              </Button>
            </form>
          </div>
        )}
      </div>

      {/* Related Products */}
      {related.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-bold text-zinc-900">You May Also Like</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {related.map(rel => (
              <div
                key={rel.id}
                onClick={() => onNavigate('product', rel.id)}
                className="bg-white border border-zinc-200/80 rounded-xl p-3.5 hover:border-zinc-300 hover:shadow-2xs transition-all cursor-pointer flex flex-col justify-between"
              >
                <div className="aspect-square rounded-lg bg-zinc-100 overflow-hidden mb-3">
                  <img
                    src={rel.image_url}
                    alt={rel.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-zinc-900 truncate">{rel.name}</h4>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm font-bold text-zinc-900 font-mono">{formatINR(rel.price)}</span>
                    <span className="text-[10px] text-zinc-400">In Stock</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

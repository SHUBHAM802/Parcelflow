import React, { useState, useEffect } from 'react';
import { Address, CartItem, Order } from '../../../types';
import { apiFetch } from '../../../shared/lib/api';
import { formatINR } from '../../../shared/lib/formatters';
import { Button } from '../../../shared/components/Button';
import { Stepper } from '../../../shared/components/Stepper';
import { Modal } from '../../../shared/components/Modal';
import { useToast } from '../../../shared/store/toastContext';
import { MapPin, Plus, CheckCircle2, CreditCard, QrCode, Banknote, ShieldCheck, ArrowRight, ArrowLeft } from 'lucide-react';

interface CustomerCheckoutProps {
  cartItems: CartItem[];
  subtotal: number;
  gst: number;
  total: number;
  onOrderPlaced: (order: Order) => void;
  onBackToShopping: () => void;
}

export const CustomerCheckout: React.FC<CustomerCheckoutProps> = ({
  cartItems,
  subtotal,
  gst,
  total,
  onOrderPlaced,
  onBackToShopping
}) => {
  const { showToast } = useToast();
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'UPI' | 'CARD' | 'COD'>('UPI');
  const [isPlacingOrder, setIsPlacingOrder] = useState<boolean>(false);

  // Address Modal State
  const [isAddAddressOpen, setIsAddAddressOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('Home');
  const [newFullName, setNewFullName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newLine1, setNewLine1] = useState('');
  const [newCity, setNewCity] = useState('Pune');
  const [newState, setNewState] = useState('Maharashtra');
  const [newPincode, setNewPincode] = useState('411001');

  // Payment Form States
  const [upiId, setUpiId] = useState('rahul@okhdfcbank');
  const [cardNumber, setCardNumber] = useState('4532 8901 2345 6789');
  const [cardExpiry, setCardExpiry] = useState('08/29');
  const [cardCvv, setCardCvv] = useState('321');

  const steps = [
    { id: 'address', title: 'Shipping Address' },
    { id: 'payment', title: 'Payment Method' },
    { id: 'review', title: 'Review & Place' }
  ];

  useEffect(() => {
    apiFetch<Address[]>('/auth/addresses')
      .then(addrs => {
        setAddresses(addrs);
        if (addrs.length > 0) {
          const def = addrs.find(a => a.is_default === 1) || addrs[0];
          setSelectedAddressId(def.id);
        }
      })
      .catch(console.error);
  }, []);

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFullName || !newPhone || !newLine1 || !newCity || !newPincode) {
      showToast('Please fill all required address fields', 'error');
      return;
    }

    try {
      const added = await apiFetch<Address>('/auth/addresses', {
        method: 'POST',
        body: JSON.stringify({
          label: newLabel,
          fullName: newFullName,
          phone: newPhone,
          line1: newLine1,
          city: newCity,
          state: newState,
          pincode: newPincode,
          isDefault: addresses.length === 0 ? 1 : 0
        })
      });
      setAddresses(prev => [...prev, added]);
      setSelectedAddressId(added.id);
      setIsAddAddressOpen(false);
      showToast('New address saved successfully', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to save address', 'error');
    }
  };

  const handlePlaceOrder = async () => {
    if (!selectedAddressId) {
      showToast('Please select a delivery address', 'error');
      setCurrentStep(0);
      return;
    }

    setIsPlacingOrder(true);

    try {
      // If UPI or Card, simulate a smooth 1-second verification
      if (paymentMethod === 'UPI' || paymentMethod === 'CARD') {
        await new Promise(r => setTimeout(r, 1000));
      }

      const order = await apiFetch<Order>('/orders/checkout', {
        method: 'POST',
        body: JSON.stringify({
          addressId: selectedAddressId,
          paymentMethod,
          items: cartItems.map(i => ({
            productId: i.id,
            quantity: i.quantity,
            unitPrice: i.price
          }))
        })
      });

      showToast('Order confirmed! Sending to smart warehouse conveyor...', 'success');
      onOrderPlaced(order);
    } catch (err: any) {
      showToast(err.message || 'Failed to place order', 'error');
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const selectedAddress = addresses.find(a => a.id === selectedAddressId);

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16">
      {/* Stepper Header */}
      <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 shadow-xs">
        <Stepper steps={steps} currentStepIndex={currentStep} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Step Body */}
        <div className="lg:col-span-2 space-y-6">
          {/* STEP 1: ADDRESS */}
          {currentStep === 0 && (
            <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 shadow-xs space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-zinc-900">Select Delivery Address</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">Automated sorting bins are assigned based on destination city.</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsAddAddressOpen(true)}
                  icon={<Plus className="w-3.5 h-3.5" />}
                >
                  Add Address
                </Button>
              </div>

              <div className="space-y-3">
                {addresses.map(addr => {
                  const isSelected = addr.id === selectedAddressId;
                  return (
                    <div
                      key={addr.id}
                      onClick={() => setSelectedAddressId(addr.id)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-3.5 ${
                        isSelected
                          ? 'border-orange-600 bg-orange-50/40 ring-2 ring-orange-100'
                          : 'border-zinc-200 hover:border-zinc-300 bg-white'
                      }`}
                    >
                      <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center ${
                        isSelected ? 'border-orange-600 bg-orange-600' : 'border-zinc-300'
                      }`}>
                        {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>

                      <div className="flex-1 text-xs space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-zinc-900 text-sm">{addr.full_name}</span>
                          <span className="bg-zinc-100 text-zinc-600 px-1.5 py-0.2 rounded uppercase text-[10px] font-bold">
                            {addr.label}
                          </span>
                          {addr.is_default === 1 && (
                            <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.2 rounded text-[10px] font-medium border border-emerald-200">
                              Default
                            </span>
                          )}
                        </div>
                        <p className="text-zinc-600">{addr.line1}{addr.line2 ? `, ${addr.line2}` : ''}</p>
                        <p className="text-zinc-700 font-medium">
                          {addr.city}, {addr.state} — <span className="font-mono">{addr.pincode}</span>
                        </p>
                        <p className="text-zinc-500 font-mono">Phone: {addr.phone}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-4 border-t border-zinc-100 flex justify-end">
                <Button
                  variant="orange"
                  size="md"
                  disabled={!selectedAddressId}
                  onClick={() => setCurrentStep(1)}
                  icon={<ArrowRight className="w-4 h-4" />}
                >
                  Proceed to Payment
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: PAYMENT */}
          {currentStep === 1 && (
            <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 shadow-xs space-y-6">
              <div>
                <h3 className="text-base font-semibold text-zinc-900">Choose Payment Method</h3>
                <p className="text-xs text-zinc-500 mt-0.5">Transactions are securely processed with 256-bit encryption.</p>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                <span><strong>Demo payment</strong> &mdash; no real transaction is processed. Do not enter real card details.</span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('UPI')}
                  className={`p-3.5 rounded-xl border flex flex-col items-center gap-2 text-center transition-all cursor-pointer ${
                    paymentMethod === 'UPI'
                      ? 'border-orange-600 bg-orange-50/50 text-orange-950 ring-2 ring-orange-100'
                      : 'border-zinc-200 text-zinc-600 hover:border-zinc-300'
                  }`}
                >
                  <QrCode className="w-6 h-6 text-orange-600" />
                  <span className="text-xs font-semibold">UPI / QR</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('CARD')}
                  className={`p-3.5 rounded-xl border flex flex-col items-center gap-2 text-center transition-all cursor-pointer ${
                    paymentMethod === 'CARD'
                      ? 'border-orange-600 bg-orange-50/50 text-orange-950 ring-2 ring-orange-100'
                      : 'border-zinc-200 text-zinc-600 hover:border-zinc-300'
                  }`}
                >
                  <CreditCard className="w-6 h-6 text-orange-600" />
                  <span className="text-xs font-semibold">Credit/Debit Card</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('COD')}
                  className={`p-3.5 rounded-xl border flex flex-col items-center gap-2 text-center transition-all cursor-pointer ${
                    paymentMethod === 'COD'
                      ? 'border-orange-600 bg-orange-50/50 text-orange-950 ring-2 ring-orange-100'
                      : 'border-zinc-200 text-zinc-600 hover:border-zinc-300'
                  }`}
                >
                  <Banknote className="w-6 h-6 text-orange-600" />
                  <span className="text-xs font-semibold">Cash on Delivery</span>
                </button>
              </div>

              {/* Sub-form based on payment method */}
              {paymentMethod === 'UPI' && (
                <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-3">
                  <span className="text-xs font-semibold text-zinc-800 block">Instant UPI Verification</span>
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-500">Enter Virtual Payment Address (VPA / UPI ID)</label>
                    <input
                      type="text"
                      value={upiId}
                      onChange={e => setUpiId(e.target.value)}
                      placeholder="e.g. mobile@upi or username@okhdfcbank"
                      className="w-full h-10 px-3 text-xs bg-white border border-zinc-300 rounded-lg text-zinc-900 focus:outline-none focus:border-orange-500 font-mono"
                    />
                  </div>
                  <p className="text-[11px] text-zinc-500">Auto-approved instant payment confirmation enabled for demo simulation.</p>
                </div>
              )}

              {paymentMethod === 'CARD' && (
                <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-3">
                  <span className="text-xs font-semibold text-zinc-800 block">Debit / Credit Card Details</span>
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-500">Card Number</label>
                    <input
                      type="text"
                      value={cardNumber}
                      onChange={e => setCardNumber(e.target.value)}
                      placeholder="16-digit card number"
                      className="w-full h-10 px-3 text-xs bg-white border border-zinc-300 rounded-lg text-zinc-900 font-mono focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-zinc-500">Expiry (MM/YY)</label>
                      <input
                        type="text"
                        value={cardExpiry}
                        onChange={e => setCardExpiry(e.target.value)}
                        placeholder="MM/YY"
                        className="w-full h-10 px-3 text-xs bg-white border border-zinc-300 rounded-lg text-zinc-900 font-mono focus:outline-none focus:border-orange-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-zinc-500">CVV</label>
                      <input
                        type="password"
                        maxLength={3}
                        value={cardCvv}
                        onChange={e => setCardCvv(e.target.value)}
                        placeholder="•••"
                        className="w-full h-10 px-3 text-xs bg-white border border-zinc-300 rounded-lg text-zinc-900 font-mono focus:outline-none focus:border-orange-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {paymentMethod === 'COD' && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
                  <span className="font-semibold block">Cash on Delivery</span>
                  <p>Pay cash or UPI upon receiving the parcel from the delivery agent at your doorstep.</p>
                </div>
              )}

              <div className="pt-4 border-t border-zinc-100 flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => setCurrentStep(0)}
                  icon={<ArrowLeft className="w-4 h-4" />}
                >
                  Back
                </Button>
                <Button
                  variant="orange"
                  size="md"
                  onClick={() => setCurrentStep(2)}
                  icon={<ArrowRight className="w-4 h-4" />}
                >
                  Review Order
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: REVIEW & PLACE */}
          {currentStep === 2 && (
            <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 shadow-xs space-y-6">
              <div>
                <h3 className="text-base font-semibold text-zinc-900">Review Your Order</h3>
                <p className="text-xs text-zinc-500 mt-0.5">Please review shipping destination and parcel contents before dispatch.</p>
              </div>

              {/* Delivery destination summary */}
              {selectedAddress && (
                <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-100 flex items-start justify-between text-xs">
                  <div className="space-y-1">
                    <span className="font-semibold text-zinc-500 uppercase tracking-wider text-[10px]">Deliver To:</span>
                    <p className="font-bold text-zinc-900">{selectedAddress.full_name} ({selectedAddress.phone})</p>
                    <p className="text-zinc-600">{selectedAddress.line1}, {selectedAddress.city}, {selectedAddress.state} - {selectedAddress.pincode}</p>
                    <p className="text-orange-600 font-medium">Destination Hub: {selectedAddress.city}</p>
                  </div>
                  <button
                    onClick={() => setCurrentStep(0)}
                    className="text-xs text-orange-600 hover:text-orange-700 font-medium cursor-pointer"
                  >
                    Change
                  </button>
                </div>
              )}

              {/* Payment method summary */}
              <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-zinc-500 uppercase tracking-wider text-[10px]">Payment Method:</span>
                  <p className="font-bold text-zinc-900 mt-0.5">{paymentMethod}</p>
                </div>
                <button
                  onClick={() => setCurrentStep(1)}
                  className="text-xs text-orange-600 hover:text-orange-700 font-medium cursor-pointer"
                >
                  Change
                </button>
              </div>

              {/* Line items review */}
              <div className="space-y-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Cart Items ({cartItems.length})
                </span>
                <div className="divide-y divide-zinc-100 border border-zinc-200/80 rounded-xl overflow-hidden">
                  {cartItems.map(item => (
                    <div key={item.cart_item_id} className="p-3 bg-white flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={item.image_url}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-md object-cover bg-zinc-100 shrink-0 border border-zinc-200/60"
                        />
                        <div className="truncate">
                          <p className="font-medium text-zinc-900 truncate">{item.name}</p>
                          <p className="text-[11px] text-zinc-400">Qty: {item.quantity} &bull; Rack: {item.warehouse_rack_location}</p>
                        </div>
                      </div>
                      <span className="font-bold text-zinc-900 font-mono shrink-0">
                        {formatINR(item.price * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-100 flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => setCurrentStep(1)}
                  icon={<ArrowLeft className="w-4 h-4" />}
                >
                  Back
                </Button>
                <Button
                  variant="orange"
                  size="lg"
                  isLoading={isPlacingOrder}
                  onClick={handlePlaceOrder}
                  icon={<ShieldCheck className="w-4 h-4" />}
                >
                  Confirm &amp; Place Order ({formatINR(total)})
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Order Summary Sidebar */}
        <div className="space-y-6">
          <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 shadow-xs space-y-4">
            <h4 className="text-sm font-semibold text-zinc-900 border-b border-zinc-100 pb-3">
              Order Summary
            </h4>

            <div className="space-y-2 text-xs text-zinc-600">
              <div className="flex justify-between">
                <span>Items Subtotal</span>
                <span className="font-mono text-zinc-900 font-medium">{formatINR(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>GST Tax (18%)</span>
                <span className="font-mono text-zinc-900 font-medium">{formatINR(gst)}</span>
              </div>
              <div className="flex justify-between">
                <span>Warehouse Express Delivery</span>
                <span className="text-emerald-600 font-semibold uppercase text-[10px]">Free</span>
              </div>
              <div className="pt-2 border-t border-zinc-200/80 flex justify-between text-sm font-bold text-zinc-900">
                <span>Total Due</span>
                <span className="font-mono text-orange-600 font-extrabold text-base">{formatINR(total)}</span>
              </div>
            </div>

            <div className="pt-2">
              <p className="text-[11px] text-zinc-400 leading-normal">
                By placing this order, you agree to automated parcel conveyor handling, robotic sorting allocation, and GST compliant invoicing.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Add Address Modal */}
      <Modal
        isOpen={isAddAddressOpen}
        onClose={() => setIsAddAddressOpen(false)}
        title="Add New Delivery Address"
        subtitle="Provide recipient information for parcel labeling."
        maxWidth="lg"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setIsAddAddressOpen(false)}>
              Cancel
            </Button>
            <Button variant="orange" size="sm" onClick={handleSaveAddress}>
              Save Address
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveAddress} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-zinc-600 font-medium">Address Tag</label>
              <select
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                className="w-full h-9 px-3 bg-white border border-zinc-300 rounded-lg text-zinc-800"
              >
                <option value="Home">Home</option>
                <option value="Office">Office</option>
                <option value="Warehouse">Warehouse</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-zinc-600 font-medium">Recipient Full Name *</label>
              <input
                type="text"
                required
                value={newFullName}
                onChange={e => setNewFullName(e.target.value)}
                placeholder="e.g. Rahul Sharma"
                className="w-full h-9 px-3 bg-white border border-zinc-300 rounded-lg text-zinc-800"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-zinc-600 font-medium">Contact Phone Number *</label>
            <input
              type="tel"
              required
              value={newPhone}
              onChange={e => setNewPhone(e.target.value)}
              placeholder="+91 98765 43210"
              className="w-full h-9 px-3 bg-white border border-zinc-300 rounded-lg text-zinc-800"
            />
          </div>

          <div className="space-y-1">
            <label className="text-zinc-600 font-medium">Address Line 1 (Flat, Building, Street) *</label>
            <input
              type="text"
              required
              value={newLine1}
              onChange={e => setNewLine1(e.target.value)}
              placeholder="e.g. Flat 402, Green Valley Apartments"
              className="w-full h-9 px-3 bg-white border border-zinc-300 rounded-lg text-zinc-800"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-zinc-600 font-medium">City *</label>
              <select
                value={newCity}
                onChange={e => setNewCity(e.target.value)}
                className="w-full h-9 px-3 bg-white border border-zinc-300 rounded-lg text-zinc-800 font-medium"
              >
                <option value="Pune">Pune (Box A)</option>
                <option value="Delhi">Delhi (Box B)</option>
                <option value="Mumbai">Mumbai (Box C)</option>
                <option value="Bengaluru">Bengaluru (Box D)</option>
                <option value="Hyderabad">Hyderabad (Box E)</option>
                <option value="Chennai">Chennai (Box E)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-zinc-600 font-medium">State *</label>
              <input
                type="text"
                required
                value={newState}
                onChange={e => setNewState(e.target.value)}
                className="w-full h-9 px-3 bg-white border border-zinc-300 rounded-lg text-zinc-800"
              />
            </div>
            <div className="space-y-1">
              <label className="text-zinc-600 font-medium">Pincode *</label>
              <input
                type="text"
                required
                value={newPincode}
                onChange={e => setNewPincode(e.target.value)}
                className="w-full h-9 px-3 bg-white border border-zinc-300 rounded-lg text-zinc-800 font-mono"
              />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};

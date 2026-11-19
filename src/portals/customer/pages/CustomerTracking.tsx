import React, { useState, useEffect } from 'react';
import { Order, OrderItem, OrderStatusHistory } from '../../../types';
import { apiFetch } from '../../../shared/lib/api';
import { formatINR, formatDateTime } from '../../../shared/lib/formatters';
import { OrderTimeline } from '../../../shared/components/Stepper';
import { StatusPill } from '../../../shared/components/StatusPill';
import { Button } from '../../../shared/components/Button';
import { getSocket } from '../../../shared/lib/socket';
import { ArrowLeft, FileText, Ban, RotateCcw, Truck, MapPin, Cpu, CheckCircle2, PackageSearch } from 'lucide-react';
import { useToast } from '../../../shared/store/toastContext';

interface CustomerTrackingProps {
  orderId: string;
  onBack: () => void;
  onViewInvoice: (orderId: string) => void;
}

export const CustomerTracking: React.FC<CustomerTrackingProps> = ({
  orderId,
  onBack,
  onViewInvoice
}) => {
  const { showToast } = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [history, setHistory] = useState<OrderStatusHistory[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTracking = () => {
    if (!orderId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    apiFetch<{ order: Order; items: OrderItem[]; history: OrderStatusHistory[] }>(`/orders/${orderId}`)
      .then(data => {
        setOrder(data.order);
        setItems(data.items || []);
        setHistory(data.history || []);
      })
      .catch((err: any) => {
        setError(err.message || 'Failed to load order tracking details');
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchTracking();

    if (!orderId) return;

    // Listen for live updates via Socket.io (support both event names)
    const socket = getSocket();
    const handleStatusUpdate = (data: { orderId: string; status: any; note?: string; changedAt: string }) => {
      if (data.orderId === orderId) {
        showToast(`Order status updated to: ${data.status}`, 'info');
        setOrder(prev => prev ? { ...prev, status: data.status } : prev);
        setHistory(prev => [
          ...prev,
          { id: `hist-${Date.now()}`, order_id: orderId, status: data.status, note: data.note, changed_at: data.changedAt }
        ]);
      }
    };

    socket.on('order:status:changed', handleStatusUpdate);
    socket.on('order:status_changed', handleStatusUpdate);

    return () => {
      socket.off('order:status:changed', handleStatusUpdate);
      socket.off('order:status_changed', handleStatusUpdate);
    };
  }, [orderId]);

  if (!orderId) {
    return (
      <div className="max-w-md mx-auto py-20 text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-full bg-stone-100 flex items-center justify-center text-stone-500">
          <PackageSearch className="w-6 h-6 stroke-1" />
        </div>
        <h3 className="text-base font-bold text-stone-900">No Order Selected</h3>
        <p className="text-xs text-stone-500">Please select an order from your order history to view real-time tracking.</p>
        <Button variant="secondary" size="sm" onClick={onBack} icon={<ArrowLeft className="w-3.5 h-3.5" />}>
          Go to Order History
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="py-24 text-center text-stone-500 space-y-3">
        <div className="w-8 h-8 mx-auto border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs">Loading live dispatch &amp; tracking data...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-md mx-auto py-20 text-center space-y-4">
        <h3 className="text-base font-bold text-stone-900">Unable to Load Order</h3>
        <p className="text-xs text-stone-500">{error || 'Order record not found or inaccessible.'}</p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button variant="secondary" size="sm" onClick={onBack} icon={<ArrowLeft className="w-3.5 h-3.5" />}>
            Back to Orders
          </Button>
          <Button variant="orange" size="sm" onClick={fetchTracking}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const isConveyorActive = ['ON_CONVEYOR', 'DETECTED', 'SORTING'].includes(order.status);

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-stone-200">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-semibold text-stone-600 hover:text-stone-900 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to My Orders</span>
        </button>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onViewInvoice(order.id)}
            icon={<FileText className="w-3.5 h-3.5" />}
          >
            View Tax Invoice
          </Button>
          <Button variant="secondary" size="sm" onClick={fetchTracking}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Main Order Card */}
      <div className="bg-white border border-stone-200/90 rounded-2xl p-6 shadow-2xs space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-stone-100">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-stone-900 font-mono">{order.id}</h2>
              <StatusPill status={order.status} />
            </div>
            <p className="text-xs text-stone-400 mt-1">Placed on {formatDateTime(order.created_at)}</p>
          </div>

          <div className="text-right">
            <span className="text-xs text-stone-400">Total Order Value</span>
            <div className="text-xl font-bold text-stone-900 font-mono">{formatINR(order.total_amount)}</div>
          </div>
        </div>

        {/* Live Conveyor / Hardware Active Alert Banner */}
        {isConveyorActive && (
          <div className="p-4 rounded-xl bg-teal-50/80 border border-teal-200 text-teal-900 flex items-center justify-between gap-4 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-teal-700 text-white flex items-center justify-center shrink-0">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold">Live Warehouse Automation Active</h4>
                <p className="text-xs text-teal-800 mt-0.5">
                  Your parcel is on the motorized conveyor belt undergoing infrared scanning and robotic arm sorting for {order.destination_city}.
                </p>
              </div>
            </div>
            {order.assigned_bin && (
              <span className="bg-white text-teal-900 font-bold px-3 py-1 rounded-lg text-xs border border-teal-200 shrink-0 font-mono">
                Target: {order.assigned_bin}
              </span>
            )}
          </div>
        )}

        {/* Tracking Timeline and Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
          {/* Left: Timeline */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
              Live Fulfillment Stages
            </h3>
            <OrderTimeline currentStatus={order.status} history={history} />
          </div>

          {/* Right: Destination & Items breakdown */}
          <div className="space-y-6">
            {/* Delivery address */}
            <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/80 space-y-2 text-xs">
              <div className="flex items-center gap-1.5 text-stone-500 font-semibold uppercase text-[10px] tracking-wider">
                <MapPin className="w-3.5 h-3.5" />
                <span>Delivery Address</span>
              </div>
              <p className="font-bold text-stone-900 text-sm">{order.recipient_name || order.customer_name}</p>
              <p className="text-stone-600">{order.line1}{order.line2 ? `, ${order.line2}` : ''}</p>
              <p className="text-stone-700 font-medium">
                {order.city}, {order.state} - <span className="font-mono">{order.pincode}</span>
              </p>
              <p className="text-stone-500 font-mono">Contact: {order.recipient_phone || order.customer_phone}</p>
              <div className="pt-2 border-t border-stone-200/60 flex items-center justify-between text-stone-700">
                <span>Destination Sorting Bin:</span>
                <span className="font-mono font-bold text-amber-700">{order.assigned_bin || 'Allocating...'}</span>
              </div>
            </div>

            {/* Line items without internal rack exposure */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                Package Contents ({items.length})
              </h4>
              <div className="divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden bg-white">
                {items.map(item => (
                  <div key={item.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={item.image_url}
                        alt={item.name}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-lg object-cover bg-stone-100 shrink-0 border border-stone-200"
                      />
                      <div className="truncate">
                        <p className="font-medium text-stone-900 truncate">{item.name}</p>
                        <p className="text-[11px] text-stone-400">Qty: {item.quantity} &bull; {formatINR(item.unit_price)} each</p>
                      </div>
                    </div>
                    <span className="font-bold text-stone-900 font-mono shrink-0">
                      {formatINR(item.unit_price * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

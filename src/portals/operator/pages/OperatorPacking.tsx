import React, { useState, useEffect } from 'react';
import { Order, OrderItem } from '../../../types';
import { apiFetch } from '../../../shared/lib/api';
import { Button } from '../../../shared/components/Button';
import { Modal } from '../../../shared/components/Modal';
import { EmptyState } from '../../../shared/components/EmptyState';
import { useToast } from '../../../shared/store/toastContext';
import { ShippingLabel } from '../components/ShippingLabel';
import { Boxes, CheckSquare, Square, Printer, Barcode, ArrowRight, ShieldCheck, Loader2 } from 'lucide-react';

interface OperatorPackingProps {
  selectedOrderId?: string;
  onPackingCompleted: (orderId: string) => void;
}

export const OperatorPacking: React.FC<OperatorPackingProps> = ({
  selectedOrderId,
  onPackingCompleted
}) => {
  const { showToast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeOrderId, setActiveOrderId] = useState<string>(selectedOrderId || '');
  const [activeItems, setActiveItems] = useState<OrderItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Packing Form
  const [verifiedItems, setVerifiedItems] = useState<Record<string, boolean>>({});
  const [weightGrams, setWeightGrams] = useState<number>(480);
  const [dimensions, setDimensions] = useState<string>('24x18x12 cm');

  // Label Modal & generated label data
  const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);
  const [labelData, setLabelData] = useState<any>(null);
  const [labelLoading, setLabelLoading] = useState(false);

  const fetchPackingQueue = async () => {
    setIsLoading(true);
    try {
      const queue = await apiFetch<any>('/warehouse/queue');
      const packingList: Order[] = queue.packing || [];
      setOrders(packingList);

      const targetId = selectedOrderId || (packingList.length > 0 ? packingList[0].id : '');
      if (targetId) {
        setActiveOrderId(targetId);
        loadOrderDetails(targetId);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadOrderDetails = async (id: string) => {
    try {
      const data = await apiFetch<any>(`/orders/${id}`);
      setActiveItems(data.items || []);
      const verObj: Record<string, boolean> = {};
      (data.items || []).forEach((i: OrderItem) => {
        verObj[i.id] = false;
      });
      setVerifiedItems(verObj);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchPackingQueue();
  }, [selectedOrderId]);

  const handleToggleItemVerify = (itemId: string) => {
    setVerifiedItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  const allItemsVerified =
    activeItems.length > 0 &&
    activeItems.every(i => verifiedItems[i.id]);

  const handleConfirmPacked = async () => {
    if (!allItemsVerified) {
      showToast('Please check and verify all items before sealing carton', 'error');
      return;
    }

    try {
      await apiFetch(`/warehouse/orders/${activeOrderId}/packed`, {
        method: 'POST',
        body: JSON.stringify({
          weightGrams,
          dimensions
        })
      });
      showToast(`Carton sealed and labeled for ${activeOrderId}! Ready for Conveyor.`, 'success');
      onPackingCompleted(activeOrderId);
      fetchPackingQueue();
    } catch (err: any) {
      showToast(err.message || 'Failed to mark packed', 'error');
    }
  };

  const currentOrder = orders.find(o => o.id === activeOrderId);

  return (
    <div className="space-y-6 pb-16">
      <div className="flex items-center justify-between pb-4 border-b border-zinc-200/80">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Packing &amp; Barcode Station</h1>
          <p className="text-xs text-zinc-500 mt-1">
            Perform physical inspection, seal corrugated box, weigh parcel, and apply shipping barcode.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={fetchPackingQueue}>
          Refresh Station
        </Button>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-12">
          <EmptyState
            icon={<Boxes className="w-10 h-10 text-zinc-400 stroke-1" />}
            title="Packing table is clear"
            message="No orders currently awaiting packing and barcoding."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Orders in packing queue */}
          <div className="bg-white border border-zinc-200/80 rounded-2xl p-5 shadow-xs space-y-3 h-fit">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 pb-2 border-b border-zinc-100">
              Orders at Packing Bay ({orders.length})
            </h3>
            <div className="space-y-2">
              {orders.map(ord => {
                const isSelected = ord.id === activeOrderId;
                return (
                  <div
                    key={ord.id}
                    onClick={() => {
                      setActiveOrderId(ord.id);
                      loadOrderDetails(ord.id);
                    }}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      isSelected
                        ? 'border-teal-600 bg-teal-50/50 ring-2 ring-teal-100'
                        : 'border-zinc-200 hover:border-zinc-300 bg-zinc-50/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-zinc-900">{ord.id}</span>
                      <span className="bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded text-[10px] font-bold">
                        {ord.destination_city}
                      </span>
                    </div>
                    <p className="text-zinc-600 mt-1 truncate">
                      {ord.recipient_name || ord.customer_name}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Active Packing Workbench */}
          {currentOrder && (
            <div className="lg:col-span-2 bg-white border border-zinc-200/80 rounded-2xl p-6 shadow-xs space-y-6">
              {/* Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-100">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-lg text-zinc-900">{currentOrder.id}</span>
                    <span className="bg-teal-900 text-teal-100 font-mono font-bold text-xs px-2.5 py-0.5 rounded">
                      HUB: {currentOrder.destination_city.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">
                    Customer: {currentOrder.recipient_name || currentOrder.customer_name} ({currentOrder.city})
                  </p>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    setLabelLoading(true);
                    try {
                      const res = await apiFetch<any>('/warehouse/labels/generate', {
                        method: 'POST',
                        body: JSON.stringify({ orderId: activeOrderId })
                      });
                      setLabelData(res);
                      setIsLabelModalOpen(true);
                    } catch (err: any) {
                      showToast(err.message || 'Failed to generate label', 'error');
                    } finally {
                      setLabelLoading(false);
                    }
                  }}
                  disabled={labelLoading}
                  icon={labelLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Barcode className="w-3.5 h-3.5" />}
                >
                  {labelLoading ? 'Generating...' : 'Generate & Preview Label'}
                </Button>
              </div>

              {/* Item checklist */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Physical Verification Checklist
                  </span>
                  <span className="text-xs text-zinc-500">
                    {Object.values(verifiedItems).filter(Boolean).length} of {activeItems.length} verified
                  </span>
                </div>

                <div className="space-y-2">
                  {activeItems.map(item => {
                    const isChecked = !!verifiedItems[item.id];
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleToggleItemVerify(item.id)}
                        className={`p-3.5 rounded-xl border flex items-center justify-between gap-4 cursor-pointer transition-all ${
                          isChecked
                            ? 'bg-emerald-50/50 border-emerald-200 text-emerald-950'
                            : 'bg-zinc-50 border-zinc-200 text-zinc-700'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <button className="shrink-0 text-emerald-600">
                            {isChecked ? (
                              <CheckSquare className="w-5 h-5 fill-current text-emerald-600 bg-white" />
                            ) : (
                              <Square className="w-5 h-5 text-zinc-400" />
                            )}
                          </button>
                          <div className="min-w-0">
                            <h4 className="text-sm font-semibold text-zinc-900 truncate">{item.name}</h4>
                            <p className="text-xs text-zinc-500">Qty required: <strong className="text-zinc-800 font-mono">{item.quantity}</strong> &bull; Rack: {item.warehouse_rack_location}</p>
                          </div>
                        </div>

                        <span className="text-xs font-mono font-medium text-zinc-500 shrink-0">
                          {item.weight_grams ? `${item.weight_grams}g` : '350g'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Box Measurements Form */}
              <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-700 block">
                  Package Specifications &amp; Gross Weight
                </span>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1">
                    <label className="text-zinc-600 font-medium">Gross Scaled Weight (grams)</label>
                    <input
                      type="number"
                      value={weightGrams}
                      onChange={e => setWeightGrams(Number(e.target.value))}
                      className="w-full h-9 px-3 bg-white border border-zinc-300 rounded-lg font-mono text-zinc-900 font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-zinc-600 font-medium">Carton Dimensions (L x W x H)</label>
                    <input
                      type="text"
                      value={dimensions}
                      onChange={e => setDimensions(e.target.value)}
                      placeholder="e.g. 24x18x12 cm"
                      className="w-full h-9 px-3 bg-white border border-zinc-300 rounded-lg font-mono text-zinc-900"
                    />
                  </div>
                </div>
              </div>

              {/* Action Bar */}
              <div className="pt-4 border-t border-zinc-100 flex items-center justify-between">
                <span className="text-xs text-zinc-400">
                  {allItemsVerified ? (
                    <span className="text-emerald-600 font-semibold flex items-center gap-1">
                      <ShieldCheck className="w-4 h-4" /> Ready to seal carton
                    </span>
                  ) : (
                    'Verify all contents above to proceed'
                  )}
                </span>

                <Button
                  variant="teal"
                  size="lg"
                  disabled={!allItemsVerified}
                  onClick={handleConfirmPacked}
                  icon={<Boxes className="w-4 h-4" />}
                >
                  Seal &amp; Mark as Packed
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Shipping Label Preview Modal — Real QR Code */}
      {currentOrder && labelData && (
        <Modal
          isOpen={isLabelModalOpen}
          onClose={() => setIsLabelModalOpen(false)}
          title="Fulfillment Shipping Label"
          subtitle={`Parcel ${labelData.parcel?.id || ''} — scannable QR code`}
          maxWidth="md"
          footer={
            <Button variant="secondary" size="sm" onClick={() => setIsLabelModalOpen(false)}>
              Close
            </Button>
          }
        >
          <ShippingLabel
            orderId={currentOrder.id}
            parcelId={labelData.parcel?.id || ''}
            labelPayload={labelData.labelPayload || ''}
            recipientName={currentOrder.recipient_name || currentOrder.customer_name}
            addressLine1={currentOrder.line1 || ''}
            city={currentOrder.city || currentOrder.destination_city}
            state={currentOrder.state || 'Maharashtra'}
            pincode={currentOrder.pincode || ''}
            phone={currentOrder.recipient_phone || currentOrder.customer_phone || ''}
            weight={weightGrams}
            dimensions={dimensions}
            binLabel={labelData.bin?.label || 'AUTO'}
            binNumber={labelData.bin?.number || 0}
            categoryName={labelData.bin?.category || 'Unknown'}
            paymentMethod={currentOrder.payment_method || 'N/A'}
            onPrint={async () => {
              try {
                await apiFetch('/warehouse/labels/printed', {
                  method: 'POST',
                  body: JSON.stringify({ parcelId: labelData.parcel?.id })
                });
                showToast('Print recorded', 'success');
              } catch {}
            }}
          />
        </Modal>
      )}
    </div>
  );
};

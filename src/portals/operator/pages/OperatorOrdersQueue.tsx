import React, { useState } from 'react';
import { WarehouseQueue, Order } from '../../../types';
import { Tabs } from '../../../shared/components/Tabs';
import { StatusPill } from '../../../shared/components/StatusPill';
import { Button } from '../../../shared/components/Button';
import { EmptyState } from '../../../shared/components/EmptyState';
import { formatINR, formatDateTime } from '../../../shared/lib/formatters';
import { Play, ScanLine, Boxes, Truck, CheckCircle2, ListOrdered, ArrowRight } from 'lucide-react';

interface OperatorOrdersQueueProps {
  queue: WarehouseQueue;
  onAction: (action: string, orderId: string) => void;
  onNavigateToPicking: (orderId: string) => void;
  onNavigateToPacking: (orderId: string) => void;
  onSendToConveyor: (orderId: string) => void;
}

export const OperatorOrdersQueue: React.FC<OperatorOrdersQueueProps> = ({
  queue,
  onAction,
  onNavigateToPicking,
  onNavigateToPacking,
  onSendToConveyor
}) => {
  const [activeTab, setActiveTab] = useState<string>('all');

  const tabs = [
    {
      id: 'all',
      label: 'All Active Queue',
      count:
        queue.newOrders.length +
        queue.picking.length +
        queue.packing.length +
        queue.ready.length +
        queue.conveyor.length
    },
    { id: 'new', label: '1. New Orders', count: queue.newOrders.length },
    { id: 'picking', label: '2. In Picking', count: queue.picking.length },
    { id: 'packing', label: '3. At Packing Bay', count: queue.packing.length },
    { id: 'ready', label: '4. Ready for Conveyor', count: queue.ready.length },
    { id: 'conveyor', label: '5. On Conveyor', count: queue.conveyor.length },
    { id: 'dispatched', label: '6. Dispatched', count: queue.dispatched.length }
  ];

  let displayOrders: Order[] = [];
  if (activeTab === 'all') {
    displayOrders = [
      ...queue.newOrders,
      ...queue.picking,
      ...queue.packing,
      ...queue.ready,
      ...queue.conveyor
    ];
  } else if (activeTab === 'new') displayOrders = queue.newOrders;
  else if (activeTab === 'picking') displayOrders = queue.picking;
  else if (activeTab === 'packing') displayOrders = queue.packing;
  else if (activeTab === 'ready') displayOrders = queue.ready;
  else if (activeTab === 'conveyor') displayOrders = queue.conveyor;
  else if (activeTab === 'dispatched') displayOrders = queue.dispatched;

  return (
    <div className="space-y-6 pb-16">
      <div className="pb-4 border-b border-zinc-200/80">
        <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Warehouse Orders Queue</h1>
        <p className="text-xs text-zinc-500 mt-1">
          Monitor and advance parcels across the 5 automated fulfillment pipeline stages.
        </p>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {displayOrders.length === 0 ? (
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-12">
          <EmptyState
            icon={<ListOrdered className="w-10 h-10 text-zinc-400 stroke-1" />}
            title="Queue is clear"
            message="No orders currently residing in this fulfillment stage."
          />
        </div>
      ) : (
        <div className="space-y-3">
          {displayOrders.map(order => {
            const isNew = ['PLACED', 'CONFIRMED'].includes(order.status);
            const isPicking = order.status === 'PICKING';
            const isPacking = order.status === 'PACKING';
            const isReady = order.status === 'PACKED';
            const isConveyor = ['ON_CONVEYOR', 'SCANNED', 'DETECTED', 'SORTING'].includes(order.status);
            const isSorted = order.status === 'SORTED';
            const isDispatched = order.status === 'DISPATCHED';

            return (
              <div
                key={order.id}
                className="bg-white border border-zinc-200/80 rounded-xl p-4 shadow-2xs hover:border-zinc-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono font-bold text-sm text-zinc-900">{order.id}</span>
                    <StatusPill status={order.status} size="sm" />
                    {order.assigned_bin && (
                      <span className="bg-teal-50 text-teal-800 border border-teal-200 px-2 py-0.5 rounded font-mono font-bold text-[11px]">
                        Target: {order.assigned_bin}
                      </span>
                    )}
                  </div>
                  <p className="text-zinc-600">
                    Recipient: <strong className="text-zinc-900">{order.recipient_name || order.customer_name}</strong> &bull; City: <strong className="text-zinc-900">{order.destination_city}</strong>
                  </p>
                  <p className="text-zinc-400 text-[11px]">
                    Created: {formatDateTime(order.created_at)} &bull; Value: <span className="font-mono font-bold text-zinc-800">{formatINR(order.total_amount)}</span>
                  </p>
                </div>

                {/* Stage Action Buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  {isNew && (
                    <Button
                      variant="teal"
                      size="sm"
                      onClick={() => onNavigateToPicking(order.id)}
                      icon={<ScanLine className="w-3.5 h-3.5" />}
                    >
                      Start Picking
                    </Button>
                  )}

                  {isPicking && (
                    <Button
                      variant="teal"
                      size="sm"
                      onClick={() => onAction('picked', order.id)}
                      icon={<Boxes className="w-3.5 h-3.5" />}
                    >
                      Mark Picked
                    </Button>
                  )}

                  {isPacking && (
                    <Button
                      variant="teal"
                      size="sm"
                      onClick={() => onNavigateToPacking(order.id)}
                      icon={<Boxes className="w-3.5 h-3.5" />}
                    >
                      Open Packing Station
                    </Button>
                  )}

                  {isReady && (
                    <Button
                      variant="teal"
                      size="sm"
                      onClick={() => onSendToConveyor(order.id)}
                      icon={<Play className="w-3.5 h-3.5 fill-current" />}
                    >
                      Infeed to Conveyor
                    </Button>
                  )}

                  {isConveyor && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 font-medium text-xs border border-blue-200 animate-pulse">
                      <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                      <span>Sorting on Conveyor...</span>
                    </span>
                  )}

                  {isSorted && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onAction('dispatch', order.id)}
                      icon={<Truck className="w-3.5 h-3.5 text-zinc-600" />}
                    >
                      Dispatch Parcel
                    </Button>
                  )}

                  {isDispatched && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onAction('deliver', order.id)}
                      icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                    >
                      Confirm Delivery
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { Check } from 'lucide-react';
import { OrderStatusHistory } from '../../types';
import { formatDateTime } from '../lib/formatters';

export interface StepItem {
  id: string;
  title: string;
  description?: string;
}

export interface StepperProps {
  steps: StepItem[];
  currentStepIndex: number;
  className?: string;
}

export const Stepper: React.FC<StepperProps> = ({
  steps,
  currentStepIndex,
  className = ''
}) => {
  return (
    <div className={`flex items-center justify-between w-full max-w-2xl mx-auto ${className}`}>
      {steps.map((step, idx) => {
        const isCompleted = idx < currentStepIndex;
        const isCurrent = idx === currentStepIndex;

        return (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center text-center relative group">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center font-semibold text-xs transition-colors duration-200 ${
                  isCompleted
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : isCurrent
                    ? 'bg-zinc-900 text-white ring-4 ring-zinc-100 shadow-xs'
                    : 'bg-zinc-100 text-zinc-400 border border-zinc-200'
                }`}
              >
                {isCompleted ? <Check className="w-4 h-4 stroke-[2.5]" /> : idx + 1}
              </div>
              <span
                className={`mt-2 text-xs font-medium max-w-[100px] leading-tight ${
                  isCurrent ? 'text-zinc-900 font-semibold' : isCompleted ? 'text-zinc-700' : 'text-zinc-400'
                }`}
              >
                {step.title}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-2 -mt-6 transition-colors duration-200 ${
                  idx < currentStepIndex ? 'bg-emerald-600' : 'bg-zinc-200'
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export interface OrderTimelineProps {
  currentStatus: string;
  history: OrderStatusHistory[];
  className?: string;
}

export const OrderTimeline: React.FC<OrderTimelineProps> = ({
  currentStatus,
  history,
  className = ''
}) => {
  // Key lifecycle milestones
  const milestoneStages = [
    { key: 'PLACED', label: 'Order Placed', desc: 'Received & logged in system' },
    { key: 'CONFIRMED', label: 'Payment Confirmed', desc: 'Payment verified & invoiced' },
    { key: 'PICKED', label: 'Items Picked', desc: 'Retrieved from warehouse racks' },
    { key: 'PACKED', label: 'Packed & Labeled', desc: 'Carton sealed with QR label applied' },
    { key: 'SCANNED', label: 'QR Scanned', desc: 'QR code verified on conveyor belt' },
    { key: 'SORTED', label: 'Automated Sorting', desc: 'Robotic arm sorted to destination bin' },
    { key: 'DISPATCHED', label: 'Dispatched', desc: 'Handed to outbound transport carrier' },
    { key: 'DELIVERED', label: 'Delivered', desc: 'Successfully delivered to customer' }
  ];

  const stageOrder = [
    'PLACED', 'CONFIRMED', 'PICKING', 'PICKED', 'PACKING', 'PACKED',
    'ON_CONVEYOR', 'SCANNED', 'DETECTED', 'SORTING', 'SORTED', 'DISPATCHED', 'DELIVERED'
  ];

  const currentIndex = stageOrder.indexOf(currentStatus);

  // Map history to milestones
  const getHistoryForStage = (key: string) => {
    return history.find(h => h.status === key);
  };

  return (
    <div className={`space-y-6 relative pl-6 before:absolute before:left-[11px] before:top-2.5 before:bottom-2.5 before:w-0.5 before:bg-zinc-200 ${className}`}>
      {milestoneStages.map((stage) => {
        const stageIdx = stageOrder.indexOf(stage.key);
        const isPassed = currentIndex >= stageIdx;
        const isCurrent = currentStatus === stage.key || (
          // Group intermediate states
          (stage.key === 'PICKED' && currentStatus === 'PICKING') ||
          (stage.key === 'PACKED' && currentStatus === 'PACKING') ||
          (stage.key === 'SORTED' && ['ON_CONVEYOR', 'DETECTED', 'SORTING'].includes(currentStatus))
        );

        const histItem = getHistoryForStage(stage.key);

        return (
          <div key={stage.key} className="relative flex items-start gap-4">
            <div
              className={`absolute -left-6 mt-1 w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all ${
                isPassed && !isCurrent
                  ? 'bg-emerald-600 text-white ring-4 ring-white'
                  : isCurrent
                  ? 'bg-blue-600 text-white ring-4 ring-blue-100 animate-pulse'
                  : 'bg-zinc-200 text-zinc-500 ring-4 ring-white'
              }`}
            >
              {isPassed && !isCurrent ? (
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-current" />
              )}
            </div>

            <div className="flex-1 bg-white p-3.5 rounded-xl border border-zinc-200/70 shadow-2xs">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h4 className={`text-sm font-semibold ${isCurrent ? 'text-blue-700' : isPassed ? 'text-zinc-900' : 'text-zinc-400'}`}>
                  {stage.label}
                </h4>
                {histItem && (
                  <span className="text-xs font-mono text-zinc-400">
                    {formatDateTime(histItem.changed_at)}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500 mt-1">{stage.desc}</p>
              {histItem?.note && (
                <p className="text-xs font-mono text-zinc-600 mt-1.5 bg-zinc-50 p-1.5 rounded border border-zinc-100">
                  {histItem.note}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

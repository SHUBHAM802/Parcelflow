import React from 'react';
import {
  LayoutDashboard,
  ListOrdered,
  ScanLine,
  Boxes,
  QrCode,
  Cpu,
  PackageCheck,
  AlertTriangle,
  History
} from 'lucide-react';

interface OperatorSidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  badgeCounts?: {
    queue?: number;
    picking?: number;
    packing?: number;
    alerts?: number;
  };
}

export const OperatorSidebar: React.FC<OperatorSidebarProps> = ({
  activeTab,
  onSelectTab,
  badgeCounts
}) => {
  const counts = badgeCounts || {};
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    {
      id: 'queue',
      label: 'Orders Queue',
      icon: <ListOrdered className="w-4 h-4" />,
      count: counts.queue
    },
    {
      id: 'picking',
      label: 'Picking Screen',
      icon: <ScanLine className="w-4 h-4" />,
      count: counts.picking
    },
    {
      id: 'packing',
      label: 'Packing Bay',
      icon: <Boxes className="w-4 h-4" />,
      count: counts.packing
    },
    {
      id: 'labels',
      label: 'Label Studio',
      icon: <QrCode className="w-4 h-4 text-teal-400" />
    },
    {
      id: 'conveyor',
      label: 'Conveyor & Robot',
      icon: <Cpu className="w-4 h-4 text-teal-400" />,
      highlight: true
    },
    { id: 'inventory', label: 'Floor Inventory', icon: <PackageCheck className="w-4 h-4" /> },
    {
      id: 'alerts',
      label: 'System Alerts',
      icon: <AlertTriangle className="w-4 h-4" />,
      count: counts.alerts,
      countVariant: 'danger'
    },
    { id: 'logs', label: 'Audit Logs', icon: <History className="w-4 h-4" /> }
  ];

  return (
    <aside className="w-60 bg-zinc-950 text-zinc-300 border-r border-zinc-800 flex flex-col shrink-0 min-h-[calc(100vh-80px)] p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 px-3 py-2">
        Warehouse Operations
      </div>

      <nav className="space-y-1 flex-1">
        {menuItems.map(item => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                isActive
                  ? 'bg-teal-600 text-white shadow-xs font-semibold'
                  : item.highlight
                  ? 'text-teal-300 hover:bg-zinc-900 hover:text-white'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {item.icon}
                <span>{item.label}</span>
              </div>

              {item.count !== undefined && item.count > 0 && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.2 rounded font-mono ${
                    item.countVariant === 'danger'
                      ? 'bg-red-950 text-red-400 border border-red-800'
                      : isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-zinc-800 text-zinc-300'
                  }`}
                >
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="pt-4 border-t border-zinc-800/80 px-3 py-2 text-[11px] text-zinc-500 space-y-1">
        <p>ESP32 Firmware: <strong className="text-zinc-400 font-mono">v2.4.1</strong></p>
        <p>Servo Controller: <strong className="text-teal-400 font-mono">PCA9685</strong></p>
      </div>
    </aside>
  );
};

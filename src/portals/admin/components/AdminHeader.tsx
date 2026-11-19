import React from 'react';
import { useAuth } from '../../../shared/store/authContext';
import { ShieldCheck, BarChart3, RefreshCw, LogOut } from 'lucide-react';

interface AdminHeaderProps {
  onRefresh?: () => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({ onRefresh }) => {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-[37px] z-40 bg-zinc-900 border-b border-zinc-800 text-white px-4 sm:px-6 py-2.5 shadow-md">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
            PF
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight flex items-center gap-2">
              <span>ParcelFlow Executive Hub</span>
              <span className="text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-800/80 px-2 py-0.5 rounded font-mono">
                Admin Console
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">Enterprise Logistics, Automated Billing &amp; Warehouse Robotics Analytics</p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <div className="hidden sm:flex items-center gap-2 bg-zinc-800 px-2.5 py-1 rounded-md border border-zinc-700 font-mono text-[11px]">
            <span className="text-zinc-500">GSTIN:</span>
            <span className="text-zinc-200 font-bold">27AABCP1234F1Z9</span>
          </div>

          <div className="flex items-center gap-2 bg-zinc-800 px-2.5 py-1 rounded-md border border-zinc-700 text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-zinc-200 font-medium">{user?.name || 'Administrator'}</span>
          </div>

          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer"
              title="Refresh Analytics"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={logout}
            className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
            title="Log out"
            aria-label="Log out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};

import React from 'react';
import { MachineState } from '../../../types';
import { StatusDotPill } from '../../../shared/components/StatusDotPill';
import { useAuth } from '../../../shared/store/authContext';
import { Cpu, Wifi, Video, Activity, Bot, RefreshCw, LogOut } from 'lucide-react';

interface OperatorHeaderProps {
  machineState: MachineState;
  onRefresh?: () => void;
}

export const OperatorHeader: React.FC<OperatorHeaderProps> = ({ machineState, onRefresh }) => {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-[37px] z-40 bg-zinc-900 border-b border-zinc-800 text-white px-4 sm:px-6 py-2.5 shadow-md">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Title */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
            WH
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight flex items-center gap-2">
              <span>Warehouse Floor Control</span>
              <span className="text-[10px] bg-teal-950 text-teal-300 border border-teal-800/80 px-2 py-0.5 rounded font-mono">
                Bay 01 - Pune Hub
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">ESP32 Telemetry &bull; Automated Conveyor Belt &bull; Robotic Sorter</p>
          </div>
        </div>

        {/* 5 Live Machine Status Pills */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          <StatusDotPill
            label="ESP32"
            state={machineState.esp32 === 'ONLINE' ? 'online' : 'offline'}
            className="bg-zinc-800 border-zinc-700 text-zinc-200"
          />
          <StatusDotPill
            label="Wi-Fi"
            state={machineState.wifi === 'CONNECTED' ? 'online' : 'offline'}
            className="bg-zinc-800 border-zinc-700 text-zinc-200"
          />
          <StatusDotPill
            label="Camera"
            state="online"
            detail={`${machineState.cameraFps} FPS`}
            className="bg-zinc-800 border-zinc-700 text-zinc-200"
          />
          <StatusDotPill
            label="IR Sensor"
            state={machineState.sensor === 'ACTIVE' ? 'active' : 'idle'}
            className="bg-zinc-800 border-zinc-700 text-zinc-200"
          />
          <StatusDotPill
            label="Robot Arm"
            state={
              machineState.robot === 'FAULT'
                ? 'offline'
                : machineState.robot === 'BUSY'
                ? 'busy'
                : 'ready'
            }
            className="bg-zinc-800 border-zinc-700 text-zinc-200"
          />
        </div>

        {/* Right Info */}
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer"
              title="Refresh queue"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
          <div className="hidden md:flex items-center gap-2 bg-zinc-800/80 px-2.5 py-1 rounded-md border border-zinc-700/60">
            <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
            <span className="font-mono text-zinc-300 text-[11px]">{machineState.motorRpm} RPM</span>
          </div>
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

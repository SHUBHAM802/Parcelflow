import React, { useState, useEffect } from 'react';
import { MachineState, SortingLog, Destination, Order } from '../../../types';
import { apiFetch } from '../../../shared/lib/api';
import { Button } from '../../../shared/components/Button';
import { StatusPill } from '../../../shared/components/StatusPill';
import { useToast } from '../../../shared/store/toastContext';
import { getSocket } from '../../../shared/lib/socket';
import { BarcodeScanner } from '../components/BarcodeScanner';
import {
  Play,
  Square,
  Pause,
  AlertOctagon,
  Video,
  Activity,
  Cpu,
  Wifi,
  WifiOff,
  Bot,
  Layers,
  RotateCcw,
  Zap,
  Box,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';

interface OperatorConveyorProps {
  machineState: MachineState;
  onMachineStateChange?: (state: MachineState) => void;
}

export const OperatorConveyor: React.FC<OperatorConveyorProps> = ({
  machineState,
  onMachineStateChange
}) => {
  const { showToast } = useToast();
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [logs, setLogs] = useState<SortingLog[]>([]);
  const [readyOrders, setReadyOrders] = useState<Order[]>([]);
  const [selectedInfeedOrderId, setSelectedInfeedOrderId] = useState<string>('');
  const [flashBin, setFlashBin] = useState<string | null>(null);

  const fetchDestinations = () => {
    apiFetch<Destination[]>('/warehouse/destinations').then(setDestinations).catch(console.error);
  };

  const fetchLogs = () => {
    apiFetch<SortingLog[]>('/warehouse/sorting-logs').then(setLogs).catch(console.error);
  };

  const fetchReadyOrders = () => {
    apiFetch<any>('/warehouse/queue').then(q => {
      const r = q.ready || [];
      setReadyOrders(r);
      if (r.length > 0 && !selectedInfeedOrderId) {
        setSelectedInfeedOrderId(r[0].id);
      }
    }).catch(console.error);
  };

  useEffect(() => {
    fetchDestinations();
    fetchLogs();
    fetchReadyOrders();

    const socket = getSocket();

    // Listen for real-time sorting events
    const handleSortCompleted = (log: SortingLog) => {
      setLogs(prev => [log, ...prev.slice(0, 40)]);
      setFlashBin(log.assigned_bin);
      setTimeout(() => setFlashBin(null), 2500);
      fetchDestinations();
      fetchReadyOrders();
      showToast(`Robotic Sorter assigned ${log.order_id} to ${log.assigned_bin} (${log.destination_city})`, 'success');
    };

    socket.on('robot:action', (data) => {
      if (data.action === 'SORT_COMPLETE' && data.log) {
        handleSortCompleted(data.log);
      }
    });

    return () => {
      socket.off('robot:action');
    };
  }, []);

  const handleMachineControl = async (action: 'START' | 'STOP' | 'PAUSE' | 'EMERGENCY_STOP') => {
    try {
      const res = await apiFetch<MachineState>('/warehouse/conveyor/control', {
        method: 'POST',
        body: JSON.stringify({ action })
      });
      if (onMachineStateChange) onMachineStateChange(res);
      if (action === 'EMERGENCY_STOP') {
        showToast('EMERGENCY STOP TRIGGERED: Motors killed immediately', 'error');
      } else {
        showToast(`Conveyor machine state changed to: ${action}`, 'info');
      }
    } catch (err: any) {
      showToast(err.message || 'Machine command failed', 'error');
    }
  };

  const handleInfeed = async (orderId?: string) => {
    const id = orderId || selectedInfeedOrderId;
    if (!id) {
      showToast('No packed parcel available to infeed', 'error');
      return;
    }
    try {
      await apiFetch('/warehouse/conveyor/infeed', {
        method: 'POST',
        body: JSON.stringify({ orderId: id })
      });
      showToast(`Parcel ${id} placed on conveyor belt! Tracking live...`, 'success');
      fetchReadyOrders();
    } catch (err: any) {
      showToast(err.message || 'Failed to infeed parcel', 'error');
    }
  };

  const handleSimulateFault = async (faultType: string) => {
    try {
      await apiFetch('/warehouse/conveyor/simulate-fault', {
        method: 'POST',
        body: JSON.stringify({ faultType })
      });
      if (faultType === 'NORMAL') {
        showToast('All hardware faults cleared. Normal telemetry restored.', 'success');
      } else {
        showToast(`Simulation: Injected hardware condition "${faultType}"`, 'warning');
      }
    } catch (err: any) {
      showToast(err.message || 'Fault injection failed', 'error');
    }
  };

  // Calculate animated position along the belt
  const isEmergency = machineState.conveyor === 'EMERGENCY_STOPPED';
  const isRunning = machineState.conveyor === 'RUNNING';

  return (
    <div className="space-y-8 pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200/80">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight flex items-center gap-3">
            <span>Conveyor &amp; Robotic Arm Telemetry</span>
            <span className={`text-xs px-2.5 py-0.5 rounded font-mono font-bold ${
              isRunning ? 'bg-emerald-100 text-emerald-800' : isEmergency ? 'bg-red-100 text-red-800 animate-pulse' : 'bg-zinc-200 text-zinc-800'
            }`}>
              {machineState.conveyor}
            </span>
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Bay 01 Automated Infeed &bull; Dual-Beam Infrared Scanner &bull; 4-DOF Robotic Servo Sorter
          </p>
        </div>

        {/* Machine Control Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="teal"
            size="sm"
            disabled={isRunning}
            onClick={() => handleMachineControl('START')}
            icon={<Play className="w-3.5 h-3.5 fill-current" />}
          >
            Start
          </Button>

          <Button
            variant="secondary"
            size="sm"
            disabled={machineState.conveyor === 'PAUSED'}
            onClick={() => handleMachineControl('PAUSE')}
            icon={<Pause className="w-3.5 h-3.5" />}
          >
            Pause
          </Button>

          <Button
            variant="secondary"
            size="sm"
            disabled={machineState.conveyor === 'STOPPED'}
            onClick={() => handleMachineControl('STOP')}
            icon={<Square className="w-3.5 h-3.5 fill-current" />}
          >
            Stop
          </Button>

          <Button
            variant="danger"
            size="sm"
            onClick={() => handleMachineControl('EMERGENCY_STOP')}
            icon={<AlertOctagon className="w-4 h-4" />}
            className="font-bold tracking-wide"
          >
            E-STOP
          </Button>
        </div>
      </div>

      {/* Center Grid: Live Camera Feed & Machine Hardware Readouts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Live Simulated Camera Feed */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-zinc-950 text-zinc-100 rounded-2xl border border-zinc-800 overflow-hidden shadow-xl">
            {/* Camera Header Bar */}
            <div className="px-4 py-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping shrink-0" />
                <span className="font-mono font-bold text-red-400">● LIVE CAM 01</span>
                <span className="text-zinc-600">|</span>
                <span className="text-zinc-400 font-mono">1080p @ {machineState.cameraFps} FPS</span>
              </div>
              <div className="flex items-center gap-3 font-mono text-[11px] text-zinc-400">
                <span>CONV: {machineState.motorRpm} RPM</span>
                <span className="text-zinc-600">|</span>
                <span>ESP32: {machineState.esp32}</span>
              </div>
            </div>

            {/* Video Viewport */}
            <div className="relative aspect-16/9 bg-zinc-950 flex flex-col items-center justify-center overflow-hidden select-none">
              {/* Grid HUD Overlay */}
              <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

              {/* Optical Targeting Box */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-32 border border-teal-500/40 rounded pointer-events-none flex items-center justify-center">
                <div className="w-3 h-3 border-t-2 border-l-2 border-teal-400 absolute top-0 left-0" />
                <div className="w-3 h-3 border-t-2 border-r-2 border-teal-400 absolute top-0 right-0" />
                <div className="w-3 h-3 border-b-2 border-l-2 border-teal-400 absolute bottom-0 left-0" />
                <div className="w-3 h-3 border-b-2 border-r-2 border-teal-400 absolute bottom-0 right-0" />
                <span className="text-[10px] font-mono text-teal-400/70">IR DETECTION ZONE</span>
              </div>

              {/* Animated Conveyor Track Graphic */}
              <div className="w-full h-28 bg-zinc-900 border-y border-zinc-800 relative flex items-center justify-between px-8">
                {/* Rollers */}
                <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent,transparent_24px,rgba(255,255,255,0.04)_24px,rgba(255,255,255,0.04)_26px)] animate-pulse" />

                {/* Laser line */}
                <div className="absolute left-[45%] top-0 bottom-0 w-0.5 bg-red-500 shadow-[0_0_12px_rgba(239,68,68,1)] z-10">
                  <span className="absolute -top-4 -left-6 text-[9px] bg-red-950 text-red-400 px-1 rounded font-mono">
                    IR LASER
                  </span>
                </div>

                {/* Robotic Arm Representation */}
                <div className="absolute left-[70%] top-2 bottom-2 w-16 bg-teal-950/80 border border-teal-600 rounded flex flex-col items-center justify-center z-10 text-[9px] font-mono text-teal-300">
                  <Bot className="w-5 h-5 text-teal-400 mb-1 animate-bounce" />
                  <span>ARM {machineState.robot}</span>
                </div>

                {/* Parcel Box on Belt */}
                {machineState.activeOrderId ? (
                  <div
                    className="absolute z-20 top-4 h-20 w-36 bg-gradient-to-br from-amber-500 to-amber-600 text-zinc-950 rounded-lg shadow-2xl flex flex-col items-center justify-center p-2 font-mono transition-all duration-700"
                    style={{
                      left:
                        machineState.robot === 'BUSY'
                          ? '68%'
                          : machineState.sensor === 'ACTIVE'
                          ? '42%'
                          : '12%'
                    }}
                  >
                    <span className="font-black text-xs">{machineState.activeOrderId}</span>
                    <span className="text-[10px] font-bold bg-black/30 text-white px-2 py-0.5 rounded mt-1">
                      {machineState.activeOrderCity || 'SORTING'}
                    </span>
                    <div className="mt-1 w-full h-1 bg-black/20 rounded overflow-hidden">
                      <div className="h-full bg-white animate-pulse" />
                    </div>
                  </div>
                ) : (
                  <div className="w-full text-center font-mono text-xs text-zinc-500 tracking-wider">
                    [ CONVEYOR BELT ACTIVE &bull; SCANNING FEED READY ]
                  </div>
                )}
              </div>

              {/* Real-time OSD Telemetry Banner */}
              <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-[11px] font-mono text-zinc-400 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-lg border border-zinc-800">
                <span>MOTOR: {isRunning ? `${machineState.motorRpm} RPM` : '0 RPM (STOPPED)'}</span>
                <span>IR: {machineState.sensor}</span>
                <span>ROBOT: {machineState.robot}</span>
                <span>BIN: {machineState.activeOrderBin || 'NONE'}</span>
              </div>
            </div>
          </div>

          {/* Live QR Scanner Panel */}
          <div className="bg-white border border-zinc-200/80 rounded-2xl p-5 shadow-xs">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 pb-3 border-b border-zinc-100 mb-4">Live QR Scanner</h3>
            <BarcodeScanner
              onScanResult={(result) => {
                if (result.result === 'ACCEPTED') {
                  fetchReadyOrders();
                  fetchLogs();
                  fetchDestinations();
                }
              }}
            />
          </div>

          {/* Quick Infeed Bar */}
          <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <span className="text-xs font-semibold text-zinc-700 whitespace-nowrap">
                Infeed Ready Parcel:
              </span>
              <select
                value={selectedInfeedOrderId}
                onChange={e => setSelectedInfeedOrderId(e.target.value)}
                disabled={readyOrders.length === 0}
                className="h-9 px-3 bg-zinc-50 border border-zinc-300 rounded-lg text-xs font-mono text-zinc-900 w-full sm:w-64"
              >
                {readyOrders.length === 0 ? (
                  <option value="">No parcels in packed queue</option>
                ) : (
                  readyOrders.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.id} &bull; {o.destination_city} ({o.recipient_name || 'Customer'})
                    </option>
                  ))
                )}
              </select>
            </div>

            <Button
              variant="teal"
              size="md"
              disabled={readyOrders.length === 0 || machineState.activeOrderId !== null}
              onClick={() => handleInfeed()}
              icon={<Play className="w-4 h-4 fill-current" />}
            >
              {machineState.activeOrderId ? 'Belt Occupied' : 'Drop onto Conveyor'}
            </Button>
          </div>
        </div>

        {/* Right 1 Col: Destination Bins & Hardware Fault Sim */}
        <div className="space-y-6">
          {/* Destination Bin Allocations (Section 10.5) */}
          <div className="bg-white border border-zinc-200/80 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <h3 className="text-sm font-bold text-zinc-900">Destination Bins</h3>
              <span className="text-[11px] text-zinc-400 font-mono">5 Bins Configured</span>
            </div>

            <div className="space-y-2.5">
              {destinations.map(d => {
                const isHighlighted = flashBin === d.bin_label;
                return (
                  <div
                    key={d.id}
                    className={`p-3 rounded-xl border transition-all flex items-center justify-between ${
                      isHighlighted
                        ? 'bg-teal-50 border-teal-500 ring-4 ring-teal-200 shadow-md scale-102'
                        : 'bg-zinc-50/70 border-zinc-200 hover:border-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold text-xs ${
                        isHighlighted ? 'bg-teal-600 text-white' : 'bg-zinc-200 text-zinc-800'
                      }`}>
                        {d.bin_label.replace('BOX ', '')}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-zinc-900">{d.city}</h4>
                        <span className="text-[10px] text-zinc-500 font-mono">{d.bin_label}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-bold font-mono text-zinc-900">
                        {d.countToday || 0}
                      </span>
                      <span className="text-[10px] text-zinc-400 block">sorted today</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Simulation & Fault Injection Debug Panel */}
          <div className="bg-zinc-950 text-white border border-zinc-800 rounded-2xl p-5 shadow-md space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
              <Zap className="w-4 h-4 text-amber-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                Hardware Fault Simulator
              </h4>
            </div>
            <p className="text-[11px] text-zinc-400">
              Inject edge-case telemetry errors to test operator recovery and safety protocols.
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <button
                onClick={() => handleSimulateFault('WIFI_DROP')}
                className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-amber-400 transition-colors text-left flex items-center gap-2 cursor-pointer"
              >
                <WifiOff className="w-3.5 h-3.5 shrink-0" />
                <span>Wi-Fi Drop</span>
              </button>

              <button
                onClick={() => handleSimulateFault('SENSOR_FAULT')}
                className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-amber-400 transition-colors text-left flex items-center gap-2 cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Sensor Jam</span>
              </button>

              <button
                onClick={() => handleSimulateFault('ROBOT_JAM')}
                className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-red-400 transition-colors text-left flex items-center gap-2 cursor-pointer"
              >
                <Bot className="w-3.5 h-3.5 shrink-0" />
                <span>Arm Stall</span>
              </button>

              <button
                onClick={() => handleSimulateFault('NORMAL')}
                className="p-2 rounded-lg bg-teal-950 hover:bg-teal-900 border border-teal-800 text-teal-300 transition-colors text-left flex items-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span>Reset All</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Live Scrolling Sorting Activity Log Table */}
      <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
          <div>
            <h3 className="text-base font-bold text-zinc-900">Live Sorting Event Stream</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Automated robotic arm allocation records emitted via ESP32 telemetry.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={fetchLogs}>
            Refresh Logs
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-500 font-semibold uppercase tracking-wider">
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Order ID</th>
                <th className="py-2.5 px-3">Destination City</th>
                <th className="py-2.5 px-3">Assigned Bin</th>
                <th className="py-2.5 px-3">Duration</th>
                <th className="py-2.5 px-3">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 font-mono">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-zinc-400 font-sans">
                    No sorting events logged yet. Infeed a parcel above to trigger robotic sorting.
                  </td>
                </tr>
              ) : (
                logs.slice(0, 15).map(log => (
                  <tr key={log.id} className="hover:bg-zinc-50/60 transition-colors">
                    <td className="py-2.5 px-3 text-zinc-500">{log.detected_at}</td>
                    <td className="py-2.5 px-3 font-bold text-zinc-900">{log.order_id}</td>
                    <td className="py-2.5 px-3 font-sans font-medium text-zinc-800">{log.destination_city}</td>
                    <td className="py-2.5 px-3 text-teal-700 font-bold">{log.assigned_bin}</td>
                    <td className="py-2.5 px-3 text-zinc-500">{log.duration_ms} ms</td>
                    <td className="py-2.5 px-3 font-sans">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        log.sort_result === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700'
                      }`}>
                        {log.sort_result}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

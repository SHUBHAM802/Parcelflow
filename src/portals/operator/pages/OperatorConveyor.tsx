import React, { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '../../../shared/lib/api';
import { getSocket } from '../../../shared/lib/socket';
import { useToast } from '../../../shared/store/toastContext';
import { Button } from '../../../shared/components/Button';
import { StatusPill } from '../../../shared/components/StatusPill';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { PipelineSnapshot, DeviceHeartbeatRecord } from '../../../shared/events';
import { HardwareCommand, MachineState, PipelineFault, ScanEvent } from '../../../types';
import {
  Play,
  Square,
  Pause,
  AlertOctagon,
  RotateCcw,
  Camera,
  Cpu,
  Wifi,
  WifiOff,
  Bot,
  Boxes,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Clock,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Sliders,
  ShieldAlert,
  Zap,
  RefreshCw,
  SlidersHorizontal,
  Layers
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

  // Unified pipeline snapshot state
  const [snapshot, setSnapshot] = useState<PipelineSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // E-Stop confirmation modal
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [resettingEstop, setResettingEstop] = useState<boolean>(false);

  // Scan log filter
  const [scanFilter, setScanFilter] = useState<string>('ALL');

  // Controls drawer open/closed
  const [controlsExpanded, setControlsExpanded] = useState<boolean>(false);

  // Ready orders available for quick infeed
  const [readyOrders, setReadyOrders] = useState<any[]>([]);
  const [selectedInfeedOrderId, setSelectedInfeedOrderId] = useState<string>('');

  // Fetch full state snapshot
  const fetchSnapshot = useCallback(async () => {
    try {
      const data = await apiFetch<PipelineSnapshot>('/operator/pipeline/state');
      setSnapshot(data);
      setError(null);
      if (onMachineStateChange) {
        onMachineStateChange({
          ...machineState,
          conveyor: (data.conveyor.machineConveyor as any) || (data.conveyor.desiredState === 'RUN' ? 'RUNNING' : 'STOPPED'),
          motorRpm: data.conveyor.motorRpm || (data.conveyor.desiredState === 'RUN' ? 120 : 0),
          robot: data.robotArm.state,
          sensor: (data.irSensors.ir1 === 'ACTIVE' || data.irSensors.ir2 === 'ACTIVE') ? 'ACTIVE' : 'IDLE',
          activeOrderId: data.currentParcel?.order_id || null,
          activeOrderBin: data.currentParcel?.bin_label || null
        });
      }
    } catch (err: any) {
      console.error('Failed to fetch pipeline snapshot:', err);
      setError(err.message || 'Failed to load pipeline state');
    } finally {
      setLoading(false);
    }
  }, [machineState, onMachineStateChange]);

  const fetchReadyOrders = useCallback(async () => {
    try {
      const q = await apiFetch<any>('/warehouse/queue');
      const r = q.ready || [];
      setReadyOrders(r);
      if (r.length > 0 && !selectedInfeedOrderId) {
        setSelectedInfeedOrderId(r[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch ready orders:', err);
    }
  }, [selectedInfeedOrderId]);

  useEffect(() => {
    fetchSnapshot();
    fetchReadyOrders();

    const socket = getSocket();

    // Listen to real pipeline events
    const handleSnapshotUpdate = () => {
      fetchSnapshot();
    };

    const handleScanResult = (res: any) => {
      fetchSnapshot();
      fetchReadyOrders();
      if (res.result === 'ACCEPTED') {
        showToast(`Scan ACCEPTED: Parcel ${res.parcelId} routing to ${res.bin?.label || 'Target Bin'}`, 'success');
      } else if (res.result === 'DUPLICATE') {
        showToast(`Duplicate Scan: ${res.parcelId} already registered`, 'warning');
      } else {
        showToast(`Scan Rejected: ${res.result}`, 'error');
      }
    };

    const handleDesiredConveyor = (data: { state: 'RUN' | 'HOLD' | 'STOP' }) => {
      setSnapshot(prev => prev ? {
        ...prev,
        conveyor: {
          ...prev.conveyor,
          desiredState: data.state
        }
      } : prev);
    };

    const handleFaultCreated = (fault: PipelineFault) => {
      fetchSnapshot();
      showToast(`HARDWARE FAULT: ${fault.type} - ${fault.detail || 'Action required'}`, 'error');
    };

    const handleFaultAcked = () => {
      fetchSnapshot();
      showToast('Fault acknowledged by operator', 'info');
    };

    const handleSortingCompleted = (data: any) => {
      fetchSnapshot();
      fetchReadyOrders();
      showToast(`Robotic Sort Complete: Placed in ${data.bin} (${data.durationMs}ms)`, 'success');
    };

    socket.on('pipeline:state', handleSnapshotUpdate);
    socket.on('scan:result', handleScanResult);
    socket.on('conveyor:desired', handleDesiredConveyor);
    socket.on('fault:created', handleFaultCreated);
    socket.on('fault:acked', handleFaultAcked);
    socket.on('sorting:completed', handleSortingCompleted);
    socket.on('device:heartbeat', handleSnapshotUpdate);
    socket.on('parcel:at_pick_point', handleSnapshotUpdate);

    // Periodic polling as fallback only when tab is visible
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchSnapshot();
      }
    }, 4000);

    return () => {
      socket.off('pipeline:state', handleSnapshotUpdate);
      socket.off('scan:result', handleScanResult);
      socket.off('conveyor:desired', handleDesiredConveyor);
      socket.off('fault:created', handleFaultCreated);
      socket.off('fault:acked', handleFaultAcked);
      socket.off('sorting:completed', handleSortingCompleted);
      socket.off('device:heartbeat', handleSnapshotUpdate);
      socket.off('parcel:at_pick_point', handleSnapshotUpdate);
      clearInterval(interval);
    };
  }, [fetchSnapshot, fetchReadyOrders, showToast]);

  // Conveyor Control Actions
  const handleConveyorAction = async (action: 'START' | 'STOP' | 'PAUSE' | 'RESUME') => {
    try {
      await apiFetch('/operator/conveyor/control', {
        method: 'POST',
        body: JSON.stringify({ action })
      });
      showToast(`Conveyor command issued: ${action}`, 'info');
      fetchSnapshot();
    } catch (err: any) {
      showToast(err.message || 'Conveyor command failed', 'error');
    }
  };

  // E-Stop: STOP is 1-click immediate
  const handleTriggerEstop = async () => {
    try {
      await apiFetch('/operator/estop', { method: 'POST' });
      showToast('EMERGENCY STOP TRIGGERED: Motors killed, active commands cancelled', 'error');
      fetchSnapshot();
    } catch (err: any) {
      showToast(err.message || 'Emergency Stop failed', 'error');
    }
  };

  // Reset E-Stop: Requires confirmation modal
  const handleConfirmResetEstop = async () => {
    setResettingEstop(true);
    try {
      await apiFetch('/operator/estop/reset', {
        method: 'POST',
        body: JSON.stringify({ confirm: true })
      });
      showToast('Emergency Stop cleared. Conveyor held in HOLD status.', 'success');
      setShowResetConfirm(false);
      fetchSnapshot();
    } catch (err: any) {
      showToast(err.message || 'Failed to reset Emergency Stop', 'error');
    } finally {
      setResettingEstop(false);
    }
  };

  // Fault Acknowledgment
  const handleAcknowledgeFault = async (faultId: string) => {
    try {
      await apiFetch(`/warehouse/pipeline-faults/${faultId}/ack`, { method: 'POST' });
      showToast('Fault acknowledged. Resuming safety interlock...', 'info');
      fetchSnapshot();
    } catch (err: any) {
      showToast(err.message || 'Failed to acknowledge fault', 'error');
    }
  };

  // Infeed parcel
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
      showToast(`Parcel ${id} placed on conveyor!`, 'success');
      fetchReadyOrders();
      fetchSnapshot();
    } catch (err: any) {
      showToast(err.message || 'Failed to infeed parcel', 'error');
    }
  };

  // Simulator helper events
  const handleSimTriggerIr = async (sensorId: 'IR1' | 'IR2') => {
    try {
      await apiFetch('/hardware/ir-event', {
        method: 'POST',
        headers: { 'X-Device-Token': 'parcelflow-hardware-device-token-secret-2026' },
        body: JSON.stringify({
          deviceId: 'conveyor-esp32',
          sensorId,
          state: 'TRIGGERED',
          seq: Date.now() % 100000,
          ts: Date.now()
        })
      });
      showToast(`[SIMULATOR] Injected ${sensorId} TRIGGERED event`, 'info');
      fetchSnapshot();
    } catch (err: any) {
      showToast(err.message || 'Simulated IR trigger failed', 'error');
    }
  };

  const handleSimArmComplete = async () => {
    if (!snapshot?.commands || snapshot.commands.length === 0) {
      showToast('No active command to complete', 'warning');
      return;
    }
    const activeCmd = snapshot.commands.find(c => c.status === 'RELEASED' || c.status === 'SENT' || c.status === 'ACKED');
    if (!activeCmd) {
      showToast('No command in flight', 'warning');
      return;
    }
    try {
      await apiFetch(`/hardware/commands/${activeCmd.id}/complete`, {
        method: 'POST',
        headers: { 'X-Device-Token': 'parcelflow-hardware-device-token-secret-2026' },
        body: JSON.stringify({ durationMs: 2100 })
      });
      showToast(`[SIMULATOR] Completed arm command ${activeCmd.id.slice(0, 8)}`, 'success');
      fetchSnapshot();
    } catch (err: any) {
      showToast(err.message || 'Failed to complete command', 'error');
    }
  };

  const handleSimInjectFault = async (faultType: string) => {
    try {
      await apiFetch('/warehouse/conveyor/simulate-fault', {
        method: 'POST',
        body: JSON.stringify({ faultType })
      });
      showToast(`[SIMULATOR] Injected fault: ${faultType}`, 'warning');
      fetchSnapshot();
    } catch (err: any) {
      showToast(err.message || 'Fault injection failed', 'error');
    }
  };

  const isEmergency = snapshot?.conveyor.desiredState === 'STOP' || snapshot?.activeFaults?.some(f => f.type === 'ESTOP');
  const isRunning = snapshot?.conveyor.desiredState === 'RUN';
  const isHold = snapshot?.conveyor.desiredState === 'HOLD';
  const isSimulator = snapshot?.mode === 'simulator';

  // Digital twin parcel position:
  // ON_BELT -> 14%, SCANNED -> 42%, AT_PICK_POINT -> 68%, SORTING -> 76%, SORTED -> in target bin
  const parcelStatus = snapshot?.currentParcel?.status;
  const parcelLeftPct =
    parcelStatus === 'SORTING' ? 76 :
    parcelStatus === 'AT_PICK_POINT' ? 68 :
    parcelStatus === 'SCANNED' ? 42 :
    parcelStatus ? 14 : 0;

  // Filtered scan log
  const filteredScans = (snapshot?.recentScans || []).filter(s => {
    if (scanFilter === 'ALL') return true;
    return s.result === scanFilter;
  });

  return (
    <div className="space-y-6 pb-20">
      {/* ──────────────────────────────────────────────────────────── */}
      {/* ROW 0: HARDWARE TELEMETRY STATUS BAR & E-STOP BUTTON        */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-zinc-200/90 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Device Health Chips */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Mode Badge (honest simulator vs live) */}
          <span className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold tracking-wider flex items-center gap-1.5 ${
            isSimulator ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isSimulator ? 'bg-amber-500 animate-pulse' : 'bg-emerald-600'}`} />
            {isSimulator ? 'SIMULATOR MODE' : 'LIVE HARDWARE'}
          </span>

          {/* Conveyor ESP32 Chip */}
          {snapshot?.devices?.map(dev => (
            <div
              key={dev.device_id}
              className={`flex items-center gap-2 px-3 py-1 rounded-lg border text-xs font-mono transition-colors ${
                dev.is_online
                  ? 'bg-zinc-50 border-zinc-200 text-zinc-800'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              <Cpu className={`w-3.5 h-3.5 ${dev.is_online ? 'text-teal-600' : 'text-red-500'}`} />
              <span className="font-semibold">{dev.device_id}</span>
              <span className="text-[10px] text-zinc-400">
                {dev.is_online ? (dev.rssi ? `${dev.rssi}dBm` : 'ONLINE') : 'OFFLINE'}
              </span>
            </div>
          ))}

          {/* Conveyor Desired State Chip */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-zinc-100 border border-zinc-200 text-xs font-mono">
            <Activity className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-zinc-500">CONVEYOR:</span>
            <span className={`font-bold ${
              isRunning ? 'text-emerald-700' : isEmergency ? 'text-red-600 animate-pulse' : 'text-amber-700'
            }`}>
              {snapshot?.conveyor.desiredState || 'STOP'} ({snapshot?.conveyor.motorRpm || 0} RPM)
            </span>
          </div>
        </div>

        {/* Machine Controls & Big Distinct Emergency Stop */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="teal"
            size="sm"
            disabled={isRunning || isEmergency}
            onClick={() => handleConveyorAction('START')}
            icon={<Play className="w-3.5 h-3.5 fill-current" />}
          >
            Start Belt
          </Button>

          <Button
            variant="secondary"
            size="sm"
            disabled={isHold || isEmergency}
            onClick={() => handleConveyorAction('PAUSE')}
            icon={<Pause className="w-3.5 h-3.5" />}
          >
            Hold
          </Button>

          <Button
            variant="secondary"
            size="sm"
            disabled={!isRunning}
            onClick={() => handleConveyorAction('STOP')}
            icon={<Square className="w-3.5 h-3.5 fill-current" />}
          >
            Stop
          </Button>

          {/* Visual Emergency Stop — Stop is 1 click, Reset requires confirmation */}
          {isEmergency ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowResetConfirm(true)}
              icon={<RotateCcw className="w-4 h-4 text-amber-600" />}
              className="bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100 font-bold"
            >
              Reset E-Stop
            </Button>
          ) : (
            <Button
              variant="danger"
              size="md"
              onClick={handleTriggerEstop}
              icon={<AlertOctagon className="w-4 h-4 fill-current" />}
              className="font-bold tracking-wider px-4 shadow-sm hover:scale-102 transition-transform"
            >
              E-STOP
            </Button>
          )}
        </div>
      </div>

      {/* Active Fault Alert Banner (if any) */}
      {snapshot?.activeFaults && snapshot.activeFaults.length > 0 && (
        <div
          role="alert"
          aria-live="polite"
          className="p-4 rounded-2xl bg-red-50 border-2 border-red-300 text-red-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md"
        >
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-6 h-6 text-red-600 shrink-0" />
            <div>
              <h4 className="font-bold text-sm text-red-900 flex items-center gap-2">
                <span>PIPELINE INTERLOCK ENGAGED: {snapshot.activeFaults[0].type}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-200 text-red-800">
                  {snapshot.activeFaults.length} unresolved fault(s)
                </span>
              </h4>
              <p className="text-xs text-red-800 mt-0.5">
                {snapshot.activeFaults[0].detail || 'Belt held for safety. Inspect physical conveyor or remove parcel before resuming.'}
              </p>
            </div>
          </div>

          <Button
            variant="danger"
            size="sm"
            onClick={() => handleAcknowledgeFault(snapshot.activeFaults[0].id)}
            icon={<CheckCircle2 className="w-3.5 h-3.5" />}
          >
            Acknowledge &amp; Clear
          </Button>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* ROW 1: REAL CAMERA SCANNER (LEFT 62%) + CURRENT PARCEL &     */}
      {/* PIPELINE STEPPER (RIGHT 38%)                                */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7/12 ~ 58-62%): Real Browser Camera Panel */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white border border-zinc-200/90 rounded-2xl p-5 shadow-xs">
            <BarcodeScanner
              onScanResult={(res) => {
                fetchSnapshot();
              }}
            />
          </div>

          {/* Quick Infeed Drop-bar */}
          <div className="bg-white border border-zinc-200/90 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <span className="text-xs font-semibold text-zinc-700 whitespace-nowrap">
                Infeed Packed Parcel:
              </span>
              <select
                value={selectedInfeedOrderId}
                onChange={e => setSelectedInfeedOrderId(e.target.value)}
                disabled={readyOrders.length === 0}
                className="h-9 px-3 bg-zinc-50 border border-zinc-300 rounded-lg text-xs font-mono text-zinc-900 w-full sm:w-64"
              >
                {readyOrders.length === 0 ? (
                  <option value="">No packed parcels awaiting infeed</option>
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
              disabled={readyOrders.length === 0 || !!snapshot?.currentParcel}
              onClick={() => handleInfeed()}
              icon={<Play className="w-3.5 h-3.5 fill-current" />}
            >
              {snapshot?.currentParcel ? 'Conveyor In Flight' : 'Infeed to Conveyor'}
            </Button>
          </div>
        </div>

        {/* Right Column (5/12 ~ 38%): Current Parcel Card + Real Pipeline Stepper */}
        <div className="lg:col-span-5 space-y-6">
          {/* 1. Current Parcel in Flight */}
          <div className="bg-white border border-zinc-200/90 rounded-2xl p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Active Parcel in Pipeline
              </h3>
              {snapshot?.currentParcel ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 animate-pulse font-mono">
                  ● ACTIVE
                </span>
              ) : (
                <span className="text-[11px] text-zinc-400 font-sans">Belt Clear</span>
              )}
            </div>

            {snapshot?.currentParcel ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">PARCEL ID</span>
                    <span className="text-base font-bold font-mono text-zinc-900 tracking-wider">
                      {snapshot.currentParcel.id}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">DESTINATION BIN</span>
                    <span className="px-3 py-1 rounded-lg bg-teal-600 text-white font-mono font-bold text-sm shadow-xs inline-block">
                      {snapshot.currentParcel.bin_label || 'BIN 1'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-zinc-100">
                  <div>
                    <span className="text-[10px] text-zinc-400 block">ORDER ID</span>
                    <span className="font-mono font-semibold text-zinc-800">{snapshot.currentParcel.order_id}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">DESTINATION CITY</span>
                    <span className="font-semibold text-zinc-800">{snapshot.currentParcel.destination_city || 'Regional Hub'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">SCANNED AT</span>
                    <span className="font-mono text-zinc-600">{snapshot.currentParcel.scanned_at?.slice(11, 19) || 'Pending'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">STATUS</span>
                    <StatusPill status={snapshot.currentParcel.status} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-zinc-400 text-xs">
                <Boxes className="w-8 h-8 text-zinc-300 mx-auto mb-2 stroke-1" />
                No parcel currently on the conveyor. Infeed a parcel or place one before IR1.
              </div>
            )}
          </div>

          {/* 2. Real Pipeline Stepper (bound to actual event milestones) */}
          <div className="bg-white border border-zinc-200/90 rounded-2xl p-5 shadow-xs space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 pb-2 border-b border-zinc-100">
              Pipeline Milestones
            </h3>

            <div className="space-y-3 pt-1">
              {[
                {
                  key: 'LABELED',
                  label: 'Label Printed',
                  desc: 'QR label applied to carton',
                  done: !!snapshot?.currentParcel,
                  active: false
                },
                {
                  key: 'ON_BELT',
                  label: 'On Conveyor Belt',
                  desc: 'Infeed sensor engaged',
                  done: !!snapshot?.currentParcel,
                  active: snapshot?.currentParcel?.status === 'LABELED'
                },
                {
                  key: 'SCANNED',
                  label: 'QR Scanned & Verified',
                  desc: 'Cryptographic MAC validated',
                  done: ['SCANNED', 'AT_PICK_POINT', 'SORTING', 'SORTED'].includes(snapshot?.currentParcel?.status || ''),
                  active: snapshot?.currentParcel?.status === 'SCANNED'
                },
                {
                  key: 'AT_PICK_POINT',
                  label: 'At Pick Point (IR2)',
                  desc: 'Detected by IR2 beam',
                  done: ['AT_PICK_POINT', 'SORTING', 'SORTED'].includes(snapshot?.currentParcel?.status || ''),
                  active: snapshot?.currentParcel?.status === 'AT_PICK_POINT'
                },
                {
                  key: 'SORTING',
                  label: 'Robotic Arm Sorting',
                  desc: '4-DOF arm actuated to bin',
                  done: snapshot?.currentParcel?.status === 'SORTED',
                  active: snapshot?.currentParcel?.status === 'SORTING'
                },
                {
                  key: 'SORTED',
                  label: 'Sorted & Dispatched',
                  desc: 'Bin parcel count incremented',
                  done: snapshot?.currentParcel?.status === 'SORTED',
                  active: false
                }
              ].map((step, idx, arr) => (
                <div key={step.key} className="flex items-start gap-3 text-xs">
                  <div className="flex flex-col items-center">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center font-mono text-[10px] font-bold ${
                      step.done
                        ? 'bg-teal-600 text-white'
                        : step.active
                        ? 'bg-teal-100 text-teal-800 ring-4 ring-teal-200 animate-pulse'
                        : 'bg-zinc-100 text-zinc-400 border border-zinc-200'
                    }`}>
                      {step.done ? '✓' : idx + 1}
                    </div>
                    {idx < arr.length - 1 && (
                      <div className={`w-0.5 h-6 ${step.done ? 'bg-teal-600' : 'bg-zinc-200'}`} />
                    )}
                  </div>

                  <div className="flex-1 pb-1">
                    <div className={`font-semibold ${step.done ? 'text-zinc-900' : step.active ? 'text-teal-700 font-bold' : 'text-zinc-400'}`}>
                      {step.label}
                    </div>
                    <div className="text-[11px] text-zinc-500">{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* ROW 2: DIGITAL TWIN (CLEAN SVG, DRIVEN ONLY BY REAL EVENTS)  */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div className="bg-zinc-950 text-white border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4 overflow-hidden">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-500 animate-ping" />
            <h3 className="text-sm font-bold tracking-tight text-zinc-100">
              Digital Twin &bull; Physical Conveyor Sorter (Bay 01)
            </h3>
            <span className="text-[11px] font-mono text-zinc-400">
              IR1: {snapshot?.irSensors.ir1 || 'IDLE'} | IR2: {snapshot?.irSensors.ir2 || 'IDLE'} | ARM: {snapshot?.robotArm.state || 'READY'}
            </span>
          </div>

          <span className="text-xs font-mono text-teal-400 bg-teal-950/60 px-2.5 py-1 rounded border border-teal-800">
            ARM POSE: {snapshot?.robotArm.currentAction || 'HOME'}
          </span>
        </div>

        {/* Top-down SVG digital twin layout */}
        <div className="relative w-full h-56 bg-zinc-900/90 rounded-xl border border-zinc-800 overflow-hidden flex items-center justify-center p-4 select-none">
          {/* Subtle grid lines */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

          {/* Belt Track */}
          <div className="relative w-full max-w-4xl h-24 bg-zinc-950 border-y-2 border-zinc-700 rounded-lg flex items-center px-4 shadow-inner">
            {/* Belt Rollers pattern */}
            <div className={`absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent,transparent_20px,rgba(255,255,255,0.04)_20px,rgba(255,255,255,0.04)_22px)] ${
              isRunning ? 'animate-pulse' : ''
            }`} />

            {/* Infeed Start Marker */}
            <div className="absolute left-4 top-2 bottom-2 w-14 border border-dashed border-zinc-700 rounded flex flex-col items-center justify-center text-[9px] font-mono text-zinc-500">
              <span>INFEED</span>
            </div>

            {/* IR1 Inspection Zone (Camera Station) */}
            <div className="absolute left-[38%] top-0 bottom-0 w-1 bg-red-600/60 shadow-[0_0_12px_rgba(239,68,68,0.8)] z-10">
              <span className={`absolute -top-5 -left-8 text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                snapshot?.irSensors.ir1 === 'ACTIVE'
                  ? 'bg-red-600 text-white font-bold animate-pulse'
                  : 'bg-zinc-800 text-zinc-400 border-zinc-700'
              }`}>
                IR1 CAM
              </span>
            </div>

            {/* IR2 Pick Point Zone */}
            <div className="absolute left-[66%] top-0 bottom-0 w-1 bg-teal-500/80 shadow-[0_0_12px_rgba(20,184,166,0.8)] z-10">
              <span className={`absolute -top-5 -left-8 text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                snapshot?.irSensors.ir2 === 'ACTIVE'
                  ? 'bg-teal-500 text-zinc-950 font-bold animate-pulse'
                  : 'bg-zinc-800 text-zinc-400 border-zinc-700'
              }`}>
                IR2 PICK
              </span>
            </div>

            {/* Robotic Arm Representation (4-DOF Servo) */}
            <div className="absolute left-[68%] -top-4 w-20 h-28 bg-zinc-900 border-2 border-teal-500 rounded-xl flex flex-col items-center justify-center p-2 text-center z-20 shadow-xl">
              <Bot className={`w-6 h-6 text-teal-400 mb-1 ${snapshot?.robotArm.state === 'BUSY' ? 'animate-bounce' : ''}`} />
              <span className="text-[10px] font-mono font-bold text-teal-300">
                {snapshot?.robotArm.state === 'BUSY' ? 'SORTING' : 'READY'}
              </span>
              <span className="text-[8px] text-zinc-400 font-mono mt-0.5">
                {snapshot?.robotArm.targetBin || 'HOME'}
              </span>
            </div>

            {/* Real Parcel Box on Belt (rendered only when parcel exists) */}
            {snapshot?.currentParcel && (
              <div
                className="absolute z-30 h-16 w-32 bg-gradient-to-br from-amber-500 to-amber-600 text-zinc-950 rounded-lg shadow-2xl flex flex-col items-center justify-center p-1.5 font-mono transition-all duration-700"
                style={{ left: `${parcelLeftPct}%` }}
              >
                <span className="font-bold text-[11px] truncate max-w-[120px]">
                  {snapshot.currentParcel.id}
                </span>
                <span className="text-[9px] font-bold bg-black/40 text-white px-2 py-0.5 rounded mt-0.5">
                  {snapshot.currentParcel.bin_label || 'ROUTING'}
                </span>
              </div>
            )}
          </div>

          {/* 4 Destination Bins Container */}
          <div className="absolute bottom-2 left-6 right-6 flex items-center justify-around gap-3 pt-2">
            {(snapshot?.bins || []).map(b => (
              <div
                key={b.id}
                className={`flex-1 p-2 rounded-lg border text-center transition-all ${
                  snapshot?.currentParcel?.assigned_bin_id === b.id
                    ? 'bg-teal-950/80 border-teal-500 ring-2 ring-teal-400 shadow-md'
                    : 'bg-zinc-900 border-zinc-800'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="font-bold text-teal-400">{b.label}</span>
                  <span className="text-zinc-400">{b.category_name || 'Overflow'}</span>
                </div>
                <div className="text-sm font-bold font-mono text-zinc-100 mt-0.5">
                  {b.parcel_count} <span className="text-[9px] text-zinc-500 font-sans">sorted</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* ROW 3: SCAN LOG TABLE (LEFT) + HARDWARE COMMAND QUEUE (RIGHT) */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel 1: Scan Log */}
        <div className="bg-white border border-zinc-200/90 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
            <div>
              <h3 className="text-sm font-bold text-zinc-900">Scan Event Log</h3>
              <p className="text-[11px] text-zinc-500">Authoritative audit trail from camera &amp; sensor decodes</p>
            </div>

            {/* Filter */}
            <select
              value={scanFilter}
              onChange={e => setScanFilter(e.target.value)}
              className="text-xs h-8 px-2 bg-zinc-50 border border-zinc-300 rounded-lg font-mono text-zinc-800"
            >
              <option value="ALL">All Outcomes</option>
              <option value="ACCEPTED">ACCEPTED</option>
              <option value="DUPLICATE">DUPLICATE</option>
              <option value="BAD_CHECKSUM">BAD_CHECKSUM</option>
              <option value="INVALID_FORMAT">INVALID_FORMAT</option>
              <option value="WRONG_STATE">WRONG_STATE</option>
            </select>
          </div>

          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-50 text-zinc-500 font-semibold uppercase tracking-wider text-[10px] border-b border-zinc-200">
                  <th className="py-2 px-2.5">Time</th>
                  <th className="py-2 px-2.5">Parcel / Order</th>
                  <th className="py-2 px-2.5">Result</th>
                  <th className="py-2 px-2.5">Source</th>
                  <th className="py-2 px-2.5 text-right">Decode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 font-mono text-[11px]">
                {filteredScans.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-zinc-400 font-sans">
                      No scan events matching filter
                    </td>
                  </tr>
                ) : (
                  filteredScans.map(scan => (
                    <tr key={scan.id} className="hover:bg-zinc-50/80 transition-colors">
                      <td className="py-2 px-2.5 text-zinc-500">{scan.created_at?.slice(11, 19)}</td>
                      <td className="py-2 px-2.5">
                        <span className="font-bold text-zinc-900">{scan.parcel_id || 'UNKNOWN'}</span>
                        {scan.reason && (
                          <span className="text-[10px] text-zinc-500 block truncate max-w-[140px] font-sans">
                            {scan.reason}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          scan.result === 'ACCEPTED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : scan.result === 'DUPLICATE'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}>
                          {scan.result}
                        </span>
                      </td>
                      <td className="py-2 px-2.5 text-zinc-600 font-sans">{scan.source}</td>
                      <td className="py-2 px-2.5 text-right text-zinc-500">
                        {scan.decode_ms ? `${scan.decode_ms}ms` : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Panel 2: Command Queue */}
        <div className="bg-white border border-zinc-200/90 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
            <div>
              <h3 className="text-sm font-bold text-zinc-900">ESP32 Hardware Command Queue</h3>
              <p className="text-[11px] text-zinc-500">Robotic arm commands dispatched over device API</p>
            </div>
            <span className="text-[11px] font-mono text-zinc-400">
              {snapshot?.commands?.length || 0} recent
            </span>
          </div>

          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-50 text-zinc-500 font-semibold uppercase tracking-wider text-[10px] border-b border-zinc-200">
                  <th className="py-2 px-2.5">Command ID</th>
                  <th className="py-2 px-2.5">Type &amp; Device</th>
                  <th className="py-2 px-2.5">Bin</th>
                  <th className="py-2 px-2.5">Status</th>
                  <th className="py-2 px-2.5 text-right">Age</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 font-mono text-[11px]">
                {(!snapshot?.commands || snapshot.commands.length === 0) ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-zinc-400 font-sans">
                      Command queue is idle
                    </td>
                  </tr>
                ) : (
                  snapshot.commands.map(cmd => (
                    <tr key={cmd.id} className="hover:bg-zinc-50/80 transition-colors">
                      <td className="py-2 px-2.5 font-bold text-zinc-900">{cmd.id.slice(0, 8)}...</td>
                      <td className="py-2 px-2.5">
                        <span className="font-semibold text-zinc-800">{cmd.type}</span>
                        <span className="text-[10px] text-zinc-400 block font-sans">{cmd.device_id}</span>
                      </td>
                      <td className="py-2 px-2.5 text-teal-700 font-bold">{cmd.bin_id || 'AUTO'}</td>
                      <td className="py-2 px-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          cmd.status === 'DONE'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : cmd.status === 'QUEUED' || cmd.status === 'RELEASED'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : cmd.status === 'SENT' || cmd.status === 'ACKED'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}>
                          {cmd.status}
                        </span>
                      </td>
                      <td className="py-2 px-2.5 text-right text-zinc-500">
                        {cmd.created_at?.slice(11, 19)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* ROW 4: CONTROLS & CALIBRATION (COLLAPSIBLE DRAWER)           */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-zinc-200/90 rounded-2xl shadow-xs overflow-hidden">
        <button
          onClick={() => setControlsExpanded(prev => !prev)}
          className="w-full px-6 py-4 flex items-center justify-between bg-zinc-50 hover:bg-zinc-100/80 transition-colors cursor-pointer text-left"
        >
          <div className="flex items-center gap-3">
            <SlidersHorizontal className="w-5 h-5 text-teal-600" />
            <div>
              <h3 className="text-sm font-bold text-zinc-900">Calibration &amp; Hardware Diagnostics Drawer</h3>
              <p className="text-xs text-zinc-500">Safety interlocks, simulator triggers, and optical diagnostics</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-500">
              {controlsExpanded ? 'Collapse' : 'Expand Controls'}
            </span>
            {controlsExpanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
          </div>
        </button>

        {controlsExpanded && (
          <div className="p-6 space-y-6 border-t border-zinc-200/80">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Conveyor & Safety Interlocks */}
              <div className="p-4 rounded-xl border border-zinc-200 bg-zinc-50/50 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-700">Conveyor Motor Telemetry</h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Desired State:</span>
                    <span className="font-mono font-bold text-zinc-900">{snapshot?.conveyor.desiredState}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Speed Target:</span>
                    <span className="font-mono font-bold text-zinc-900">{snapshot?.conveyor.speedPct}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">State Revision:</span>
                    <span className="font-mono text-zinc-700">rev #{snapshot?.conveyor.revision}</span>
                  </div>
                </div>

                <div className="pt-2 flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => handleConveyorAction('START')}>
                    Resume Run
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => handleConveyorAction('STOP')}>
                    Halt Belt
                  </Button>
                </div>
              </div>

              {/* In Simulator Mode: Dedicated Trigger Card */}
              {isSimulator && (
                <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 space-y-3">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-600" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                      Simulator Event Injection
                    </h4>
                  </div>
                  <p className="text-[11px] text-amber-800">
                    Manually trigger physical sensor pulses and arm completions to demonstrate sorting without physical ESP32 connected:
                  </p>

                  <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                    <Button variant="secondary" size="sm" onClick={() => handleSimTriggerIr('IR1')}>
                      Pulse IR1 Sensor
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => handleSimTriggerIr('IR2')}>
                      Pulse IR2 Sensor
                    </Button>
                    <Button variant="secondary" size="sm" onClick={handleSimArmComplete}>
                      Complete Arm Sort
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => handleSimInjectFault('ROBOT_JAM')}>
                      Inject Arm Stall
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* E-Stop Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-zinc-200 space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-base font-bold text-zinc-900">Confirm Emergency Stop Reset</h3>
            </div>

            <p className="text-xs text-zinc-600 leading-relaxed">
              Before resetting the Emergency Stop interlock, verify visually that:
            </p>

            <ul className="text-xs text-zinc-700 list-disc list-inside space-y-1 bg-zinc-50 p-3 rounded-lg border border-zinc-200">
              <li>All personnel are clear of the conveyor and 4-DOF arm</li>
              <li>Any jammed cartons or foreign objects have been removed</li>
              <li>The conveyor belt will remain in <strong>HOLD</strong> until you explicitly press Start</li>
            </ul>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
              <Button variant="secondary" size="sm" onClick={() => setShowResetConfirm(false)}>
                Cancel
              </Button>
              <Button
                variant="teal"
                size="sm"
                disabled={resettingEstop}
                onClick={handleConfirmResetEstop}
                icon={<CheckCircle2 className="w-3.5 h-3.5" />}
              >
                {resettingEstop ? 'Clearing...' : 'Confirm Reset to HOLD'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

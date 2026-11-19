/**
 * ParcelFlow — Shared Typed Socket.io Events
 * Shared contract between backend server and frontend clients.
 */

import { Bin, HardwareCommand, MachineState, Parcel, PipelineFault, ScanEvent, SortingLog } from '../types';

export interface ServerToClientEvents {
  // Machine & Hardware Telemetry
  'machine:status': (state: MachineState) => void;
  'device:heartbeat': (data: { deviceId: string; firmware?: string; rssi?: number; state?: any; timestamp: string }) => void;
  'sensor:triggered': (data: { orderId?: string; parcelId?: string; sensorId?: string }) => void;
  'robot:action': (data: { orderId?: string; parcelId?: string; action: string; targetBin?: string; log?: SortingLog }) => void;
  'conveyor:desired': (data: { state: 'RUN' | 'HOLD' | 'STOP'; speedPct?: number; revision?: number }) => void;

  // Pipeline Events
  'parcel:label_created': (data: { parcelId: string; orderId: string; binNumber: number; labelPayload: string }) => void;
  'scan:result': (data: {
    result: string;
    parcelId?: string;
    orderId?: string;
    bin?: { number: number; label: string; category?: string } | null;
    source: string;
    timestamp: string;
  }) => void;
  'parcel:at_pick_point': (data: { parcelId: string; orderId: string }) => void;
  'command:updated': (command: HardwareCommand) => void;
  'sorting:completed': (data: { orderId: string; bin: string; result: 'SUCCESS' | 'FAILED'; durationMs: number }) => void;

  // Faults & Alerts
  'fault:created': (fault: PipelineFault) => void;
  'fault:acked': (data: { id: string; ackedBy?: string; ackedAt: string }) => void;
  'alert:created': (alert: any) => void;
  'alert:resolved': (data: { id: string }) => void;

  // Orders
  'order:status_changed': (data: { orderId: string; status: string; note?: string; timestamp?: string }) => void;
  'order:status:changed': (data: { orderId: string; status: string; note?: string; timestamp?: string }) => void;

  // Pipeline State Snapshot
  'pipeline:state': (snapshot: PipelineSnapshot) => void;
}

export interface ClientToServerEvents {
  'pipeline:subscribe': () => void;
  'pipeline:unsubscribe': () => void;
}

export interface DeviceHeartbeatRecord {
  device_id: string;
  last_seen_at: string;
  firmware: string | null;
  rssi: number | null;
  state_json: string | null;
  is_online: boolean;
}

export interface PipelineSnapshot {
  mode: 'simulator' | 'real';
  devices: DeviceHeartbeatRecord[];
  conveyor: {
    desiredState: 'RUN' | 'HOLD' | 'STOP';
    speedPct: number;
    revision: number;
    machineConveyor: string;
    motorRpm: number;
  };
  irSensors: {
    ir1: 'IDLE' | 'ACTIVE';
    ir2: 'IDLE' | 'ACTIVE';
  };
  robotArm: {
    state: 'READY' | 'BUSY' | 'IDLE' | 'FAULT';
    currentAction: string;
    targetBin: string | null;
  };
  currentParcel: (Parcel & {
    order_status?: string;
    destination_city?: string;
    customer_name?: string;
  }) | null;
  recentScans: ScanEvent[];
  commands: HardwareCommand[];
  activeFaults: PipelineFault[];
  bins: Bin[];
}

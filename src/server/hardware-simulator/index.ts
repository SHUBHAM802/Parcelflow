import { Server as SocketIOServer } from 'socket.io';
import { run } from '../db';
import { getConfig } from '../config';
import {
  getNextCommandForDevice,
  acknowledgeCommand,
  completeCommand,
  setDesiredConveyor,
  triggerEmergencyStop,
  resetEmergencyStop,
  handleIrEvent
} from '../services/hardwareService';
import { processScan } from '../services/scanService';

export interface MachineState {
  esp32: 'ONLINE' | 'OFFLINE';
  wifi: 'CONNECTED' | 'DISCONNECTED';
  sensor: 'ACTIVE' | 'IDLE';
  conveyor: 'RUNNING' | 'STOPPED' | 'PAUSED' | 'EMERGENCY_STOPPED';
  robot: 'READY' | 'BUSY' | 'IDLE' | 'FAULT';
  motorRpm: number;
  activeOrderId: string | null;
  activeOrderCity: string | null;
  activeOrderBin: string | null;
  cameraFps: number;
  cameraResolution: string;
}

let ioInstance: SocketIOServer | null = null;
let statusBroadcastInterval: NodeJS.Timeout | null = null;
let armWorkerInterval: NodeJS.Timeout | null = null;
let isArmBusy = false;
let irSequenceCounter = 1000;

export const machineState: MachineState = {
  esp32: 'ONLINE',
  wifi: 'CONNECTED',
  sensor: 'IDLE',
  conveyor: 'RUNNING',
  robot: 'READY',
  motorRpm: 120,
  activeOrderId: null,
  activeOrderCity: null,
  activeOrderBin: null,
  cameraFps: 30,
  cameraResolution: '1920x1080 60Hz'
};

/**
 * Initialize hardware simulator.
 * Stays completely INERT if HARDWARE_MODE=real.
 * In simulator mode: runs virtual robotic arm command worker that processes
 * authoritative commands released by genuine IR2 events.
 * Does NOT auto-sort ON_CONVEYOR orders and does NOT emit fake camera:frame events.
 */
export function initHardwareSimulator(io: SocketIOServer) {
  ioInstance = io;

  let cfg;
  try {
    cfg = getConfig();
  } catch {
    // Config not yet loaded
    return;
  }

  // Ground Rule & Requirement 2: Stay inert in HARDWARE_MODE=real
  if (cfg.HARDWARE_MODE === 'real') {
    console.log('[ParcelFlow] HARDWARE_MODE is "real". Hardware simulator is INERT.');
    stopSimulatorIntervals();
    return;
  }

  console.log('[ParcelFlow] HARDWARE_MODE is "simulator". Virtual digital twin worker active.');

  // 1. Broadcast telemetry every 2 seconds with slight RPM jitter if running
  if (statusBroadcastInterval) clearInterval(statusBroadcastInterval);
  statusBroadcastInterval = setInterval(() => {
    if (machineState.conveyor === 'RUNNING') {
      machineState.motorRpm = Math.floor(118 + Math.random() * 6);
    } else {
      machineState.motorRpm = 0;
    }
    io.emit('machine:status', machineState);
  }, 2000);

  // 2. Virtual Robotic Arm worker:
  // ONLY processes commands that were explicitly RELEASED by an authentic IR2 event.
  // Calls the EXACT same services (getNextCommandForDevice, acknowledgeCommand, completeCommand)
  // as the physical arm-esp32 REST client.
  if (armWorkerInterval) clearInterval(armWorkerInterval);
  armWorkerInterval = setInterval(async () => {
    if (isArmBusy) return;
    if (machineState.conveyor === 'EMERGENCY_STOPPED') return;
    if (machineState.robot === 'FAULT') return;

    // Check for released arm command
    const cmd = getNextCommandForDevice('arm-esp32');
    if (!cmd) return;

    isArmBusy = true;

    if (cmd.type === 'TEST_JOINT') {
      try {
        acknowledgeCommand(cmd.commandId, ioInstance);
        await sleep(400);
        completeCommand(cmd.commandId, 400, ioInstance);
      } finally {
        isArmBusy = false;
      }
      return;
    }

    machineState.robot = 'BUSY';
    machineState.activeOrderId = cmd.orderId || null;
    machineState.activeOrderBin = cmd.bin?.label || null;

    try {
      // 1. Acknowledge command (same as POST /api/hardware/commands/:id/ack)
      acknowledgeCommand(cmd.commandId, ioInstance);
      ioInstance?.emit('robot:action', { orderId: cmd.orderId, parcelId: cmd.parcelId, action: 'PICKING' });
      await sleep(800);

      ioInstance?.emit('robot:action', { orderId: cmd.orderId, parcelId: cmd.parcelId, action: 'MOVING', targetBin: cmd.bin?.label });
      await sleep(800);

      ioInstance?.emit('robot:action', { orderId: cmd.orderId, parcelId: cmd.parcelId, action: 'PLACING', targetBin: cmd.bin?.label });
      await sleep(600);

      // 2. Complete command (same as POST /api/hardware/commands/:id/complete)
      const durationMs = 2200;
      completeCommand(cmd.commandId, durationMs, ioInstance);

      ioInstance?.emit('robot:action', { orderId: cmd.orderId, parcelId: cmd.parcelId, action: 'DONE', targetBin: cmd.bin?.label });
      machineState.robot = 'READY';
      machineState.activeOrderId = null;
      machineState.activeOrderBin = null;
    } catch (err: any) {
      console.error('[ParcelFlow Simulator] Error executing virtual arm command:', err);
    } finally {
      isArmBusy = false;
    }
  }, 1000);
}

export function stopSimulatorIntervals() {
  if (statusBroadcastInterval) {
    clearInterval(statusBroadcastInterval);
    statusBroadcastInterval = null;
  }
  if (armWorkerInterval) {
    clearInterval(armWorkerInterval);
    armWorkerInterval = null;
  }
}

export function getMachineState(): MachineState {
  return { ...machineState };
}

export function startConveyor() {
  setDesiredConveyor('RUN', 'Conveyor started by operator', ioInstance);
  machineState.conveyor = 'RUNNING';
  machineState.motorRpm = 120;
  if (machineState.robot === 'FAULT') machineState.robot = 'READY';
  ioInstance?.emit('machine:status', machineState);
  logMachineStatus();
}

export function stopConveyor() {
  setDesiredConveyor('STOP', 'Conveyor stopped by operator', ioInstance);
  machineState.conveyor = 'STOPPED';
  machineState.motorRpm = 0;
  ioInstance?.emit('machine:status', machineState);
  logMachineStatus();
}

export function pauseConveyor() {
  setDesiredConveyor('HOLD', 'Conveyor paused by operator', ioInstance);
  machineState.conveyor = 'PAUSED';
  machineState.motorRpm = 0;
  ioInstance?.emit('machine:status', machineState);
  logMachineStatus();
}

export function emergencyStop() {
  triggerEmergencyStop('operator-simulator-estop', ioInstance);
  machineState.conveyor = 'EMERGENCY_STOPPED';
  machineState.motorRpm = 0;
  machineState.sensor = 'IDLE';
  machineState.robot = 'IDLE';
  isArmBusy = false;
  machineState.activeOrderId = null;
  machineState.activeOrderBin = null;

  ioInstance?.emit('machine:status', machineState);
  logMachineStatus();
}

export function resetEmergencyStopUi() {
  resetEmergencyStop('operator-simulator-reset', ioInstance);
  machineState.conveyor = 'PAUSED';
  machineState.motorRpm = 0;
  machineState.robot = 'READY';
  ioInstance?.emit('machine:status', machineState);
  logMachineStatus();
}

export function simulateFault(target: 'wifi' | 'sensor' | 'robot' | 'clear') {
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

  if (target === 'clear') {
    machineState.wifi = 'CONNECTED';
    machineState.esp32 = 'ONLINE';
    machineState.sensor = 'IDLE';
    machineState.robot = 'READY';
    if (machineState.conveyor === 'EMERGENCY_STOPPED') machineState.conveyor = 'RUNNING';
    ioInstance?.emit('machine:status', machineState);
    return;
  }

  if (target === 'wifi') {
    machineState.wifi = machineState.wifi === 'CONNECTED' ? 'DISCONNECTED' : 'CONNECTED';
    if (machineState.wifi === 'DISCONNECTED') {
      const alertId = `alt-wf-${Date.now()}`;
      run(
        `INSERT INTO alerts (id, type, severity, message, resolved, created_at)
         VALUES (?, 'MACHINE_OFFLINE', 'warning', 'ESP32 Wi-Fi Signal Dropped on AP-Industrial-5GHz.', 0, ?)`,
        [alertId, now]
      );
      ioInstance?.emit('alert:created', { id: alertId, type: 'MACHINE_OFFLINE', severity: 'warning', message: 'ESP32 Wi-Fi Signal Dropped on AP-Industrial-5GHz.', created_at: now });
    }
  } else if (target === 'sensor') {
    machineState.sensor = 'ACTIVE'; // Stuck active
    const alertId = `alt-sn-${Date.now()}`;
    run(
      `INSERT INTO alerts (id, type, severity, message, resolved, created_at)
       VALUES (?, 'SORT_FAILED', 'warning', 'IR Sensor optical beam occluded or reflection threshold anomaly.', 0, ?)`,
      [alertId, now]
    );
    ioInstance?.emit('alert:created', { id: alertId, type: 'SORT_FAILED', severity: 'warning', message: 'IR Sensor optical beam occluded or reflection threshold anomaly.', created_at: now });
  } else if (target === 'robot') {
    machineState.robot = 'FAULT';
    const alertId = `alt-rb-${Date.now()}`;
    run(
      `INSERT INTO alerts (id, type, severity, message, resolved, created_at)
       VALUES (?, 'SORT_FAILED', 'critical', 'Robotic Arm Servo 3 Torque Limit Exceeded. Actuator paused.', 0, ?)`,
      [alertId, now]
    );
    ioInstance?.emit('alert:created', { id: alertId, type: 'SORT_FAILED', severity: 'critical', message: 'Robotic Arm Servo 3 Torque Limit Exceeded. Actuator paused.', created_at: now });
  }

  ioInstance?.emit('machine:status', machineState);
}

/**
 * Trigger an optical scan through authoritative scanService
 */
export function simulateScan(payload: string) {
  return processScan({ payload, source: 'simulator' }, ioInstance);
}

/**
 * Trigger an IR break-beam sensor through authoritative hardwareService
 */
export function simulateIrEvent(sensorId: 'IR1' | 'IR2', state: 'TRIGGERED' | 'CLEAR' = 'TRIGGERED') {
  irSequenceCounter++;
  return handleIrEvent({
    deviceId: 'conveyor-esp32',
    sensorId,
    state,
    seq: irSequenceCounter,
    ts: Date.now()
  }, ioInstance);
}

function logMachineStatus() {
  const logId = `msl-${Date.now()}`;
  run(
    `INSERT INTO machine_status_log (id, esp32_status, wifi_status, sensor_status, conveyor_status, robot_status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [logId, machineState.esp32, machineState.wifi, machineState.sensor, machineState.conveyor, machineState.robot]
  );
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

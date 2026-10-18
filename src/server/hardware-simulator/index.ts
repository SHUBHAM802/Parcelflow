import { Server as SocketIOServer } from 'socket.io';
import { query, queryOne, run } from '../db';
import { transitionOrderStatus } from '../orderStateMachine';

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
let simulationInterval: NodeJS.Timeout | null = null;
let statusBroadcastInterval: NodeJS.Timeout | null = null;
let isProcessingOrder = false;

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

export function initHardwareSimulator(io: SocketIOServer) {
  ioInstance = io;

  // Broadcast machine state every 2 seconds
  if (statusBroadcastInterval) clearInterval(statusBroadcastInterval);
  statusBroadcastInterval = setInterval(() => {
    // Add realistic motor RPM fluctuations if running
    if (machineState.conveyor === 'RUNNING') {
      machineState.motorRpm = Math.floor(118 + Math.random() * 6);
    } else {
      machineState.motorRpm = 0;
    }
    io.emit('machine:status', machineState);
  }, 2000);

  // Main conveyor processing loop (every 3.5 seconds)
  if (simulationInterval) clearInterval(simulationInterval);
  simulationInterval = setInterval(async () => {
    if (machineState.conveyor !== 'RUNNING') return;
    if (machineState.esp32 !== 'ONLINE' || machineState.wifi !== 'CONNECTED') return;
    if (isProcessingOrder) return;

    await processNextOrder();
  }, 3500);
}

export function getMachineState(): MachineState {
  return { ...machineState };
}

export function startConveyor() {
  machineState.conveyor = 'RUNNING';
  machineState.motorRpm = 120;
  if (machineState.robot === 'FAULT') machineState.robot = 'READY';
  ioInstance?.emit('machine:status', machineState);
  logMachineStatus();
}

export function stopConveyor() {
  machineState.conveyor = 'STOPPED';
  machineState.motorRpm = 0;
  ioInstance?.emit('machine:status', machineState);
  logMachineStatus();
}

export function pauseConveyor() {
  machineState.conveyor = 'PAUSED';
  machineState.motorRpm = 0;
  ioInstance?.emit('machine:status', machineState);
  logMachineStatus();
}

export function emergencyStop() {
  machineState.conveyor = 'EMERGENCY_STOPPED';
  machineState.motorRpm = 0;
  machineState.sensor = 'IDLE';
  machineState.robot = 'IDLE';
  isProcessingOrder = false;
  machineState.activeOrderId = null;

  // Create an alert
  const alertId = `alt-es-${Date.now()}`;
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  run(`INSERT INTO alerts (id, type, severity, message, resolved, created_at)
    VALUES (?, 'MACHINE_OFFLINE', 'critical', 'EMERGENCY STOP BUTTON ENGAGED on Conveyor Floor 1. All motors halted.', 0, ?)`,
    [alertId, now]);

  ioInstance?.emit('alert:created', {
    id: alertId,
    type: 'MACHINE_OFFLINE',
    severity: 'critical',
    message: 'EMERGENCY STOP BUTTON ENGAGED on Conveyor Floor 1. All motors halted.',
    created_at: now
  });

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
      run(`INSERT INTO alerts (id, type, severity, message, resolved, created_at)
        VALUES (?, 'MACHINE_OFFLINE', 'warning', 'ESP32 Wi-Fi Signal Dropped on AP-Industrial-5GHz.', 0, ?)`,
        [alertId, now]);
      ioInstance?.emit('alert:created', { id: alertId, type: 'MACHINE_OFFLINE', severity: 'warning', message: 'ESP32 Wi-Fi Signal Dropped on AP-Industrial-5GHz.', created_at: now });
    }
  } else if (target === 'sensor') {
    machineState.sensor = 'ACTIVE'; // Stuck active
    const alertId = `alt-sn-${Date.now()}`;
    run(`INSERT INTO alerts (id, type, severity, message, resolved, created_at)
      VALUES (?, 'SORT_FAILED', 'warning', 'IR Sensor optical beam occluded or reflection threshold anomaly.', 0, ?)`,
      [alertId, now]);
    ioInstance?.emit('alert:created', { id: alertId, type: 'SORT_FAILED', severity: 'warning', message: 'IR Sensor optical beam occluded or reflection threshold anomaly.', created_at: now });
  } else if (target === 'robot') {
    machineState.robot = 'FAULT';
    const alertId = `alt-rb-${Date.now()}`;
    run(`INSERT INTO alerts (id, type, severity, message, resolved, created_at)
      VALUES (?, 'SORT_FAILED', 'critical', 'Robotic Arm Servo 3 Torque Limit Exceeded. Actuator paused.', 0, ?)`,
      [alertId, now]);
    ioInstance?.emit('alert:created', { id: alertId, type: 'SORT_FAILED', severity: 'critical', message: 'Robotic Arm Servo 3 Torque Limit Exceeded. Actuator paused.', created_at: now });
  }

  ioInstance?.emit('machine:status', machineState);
}

async function processNextOrder() {
  // Priority 1: Check hardware command queue for SORT_TO_BIN commands (from QR scan results)
  const queuedCmd = queryOne<{ id: string; parcel_id: string; bin_id: string; payload_json: string }>(
    "SELECT id, parcel_id, bin_id, payload_json FROM hardware_commands WHERE type = 'SORT_TO_BIN' AND status = 'QUEUED' ORDER BY created_at ASC LIMIT 1"
  );

  if (queuedCmd) {
    await processQueuedCommand(queuedCmd);
    return;
  }

  // Priority 2: Legacy — find oldest order in ON_CONVEYOR status (non-scanned parcels)
  const order = queryOne<{ id: string; destination_city: string }>(
    "SELECT id, destination_city FROM orders WHERE status = 'ON_CONVEYOR' ORDER BY updated_at ASC LIMIT 1"
  );

  if (!order) return;

  isProcessingOrder = true;
  const orderId = order.id;
  const city = order.destination_city;

  // Lookup bin
  const dest = queryOne<{ bin_label: string }>(
    "SELECT bin_label FROM destinations WHERE city = ?", [city]
  ) || queryOne<{ bin_label: string }>("SELECT bin_label FROM destinations WHERE city = 'Other'");

  const assignedBin = dest ? dest.bin_label : 'BOX E';

  machineState.activeOrderId = orderId;
  machineState.activeOrderCity = city;
  machineState.activeOrderBin = assignedBin;
  ioInstance?.emit('machine:status', machineState);

  // Step 1: Conveyor movement & IR Sensor trigger
  await sleep(1800);
  machineState.sensor = 'ACTIVE';
  ioInstance?.emit('sensor:triggered', { orderId });
  ioInstance?.emit('machine:status', machineState);

  // Transition status to DETECTED
  updateOrderStatus(orderId, 'DETECTED', 'Parcel detected at IR Sensor Station 1');

  // Step 2: Camera Capture
  await sleep(800);
  ioInstance?.emit('camera:frame', {
    orderId,
    timestamp: Date.now(),
    destinationCity: city,
    dimensions: '22x16x8 cm',
    barcode: `PF-${orderId.replace('ORD-', '')}-IN`
  });

  // Step 3: Robot Arm sorting sequence
  updateOrderStatus(orderId, 'SORTING', `ESP32 commanding Robotic Arm to ${assignedBin}`);
  machineState.sensor = 'IDLE';

  // Robot: PICKING
  machineState.robot = 'BUSY';
  ioInstance?.emit('robot:action', { orderId, action: 'PICKING' });
  ioInstance?.emit('machine:status', machineState);
  await sleep(1000);

  // Robot: MOVING
  ioInstance?.emit('robot:action', { orderId, action: 'MOVING', targetBin: assignedBin });
  await sleep(1000);

  // Robot: PLACING
  ioInstance?.emit('robot:action', { orderId, action: 'PLACING', targetBin: assignedBin });
  await sleep(900);

  // Check if robot is in FAULT state
  if ((machineState.robot as any) === 'FAULT') {
    // Record sort failure
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    run(`INSERT INTO sorting_logs (id, order_id, detected_at, destination_city, assigned_bin, sort_result, duration_ms)
      VALUES (?, ?, ?, ?, ?, 'FAILED', ?)`,
      [`sort-fail-${Date.now()}`, orderId, now, city, assignedBin, 2900]);

    ioInstance?.emit('sorting:completed', { orderId, bin: assignedBin, result: 'FAILED', durationMs: 2900 });
    isProcessingOrder = false;
    machineState.activeOrderId = null;
    ioInstance?.emit('machine:status', machineState);
    return;
  }

  // Robot: DONE
  ioInstance?.emit('robot:action', { orderId, action: 'DONE', targetBin: assignedBin });
  machineState.robot = 'READY';

  // Step 4: Sort completed!
  const durationMs = 1350 + Math.floor(Math.random() * 200);
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

  run(`INSERT INTO sorting_logs (id, order_id, detected_at, destination_city, assigned_bin, sort_result, duration_ms)
    VALUES (?, ?, ?, ?, ?, 'SUCCESS', ?)`,
    [`sort-${orderId}-${Date.now()}`, orderId, now, city, assignedBin, durationMs]);

  run(`UPDATE orders SET assigned_bin = ? WHERE id = ?`, [assignedBin, orderId]);
  updateOrderStatus(orderId, 'SORTED', `Sorted successfully into ${assignedBin} (${city})`);

  ioInstance?.emit('sorting:completed', { orderId, bin: assignedBin, result: 'SUCCESS', durationMs });

  // Brief delay before DISPATCHED
  await sleep(2500);
  updateOrderStatus(orderId, 'DISPATCHED', `Dispatched from Fulfillment Hub Bay 4 to ${city}`);

  machineState.activeOrderId = null;
  machineState.activeOrderCity = null;
  machineState.activeOrderBin = null;
  ioInstance?.emit('machine:status', machineState);
  isProcessingOrder = false;
}

/**
 * Process a QUEUED hardware command from the scan pipeline.
 * This simulates the physical sequence: IR detect → arm pick → sort → complete.
 */
async function processQueuedCommand(cmd: { id: string; parcel_id: string; bin_id: string; payload_json: string }) {
  isProcessingOrder = true;
  const now = () => new Date().toISOString().replace('T', ' ').substring(0, 19);

  // Mark command as SENT
  run("UPDATE hardware_commands SET status = 'SENT', attempts = attempts + 1, updated_at = ? WHERE id = ?", [now(), cmd.id]);

  // Get parcel and order info
  const parcel = queryOne<{ order_id: string }>("SELECT order_id FROM parcels WHERE id = ?", [cmd.parcel_id]);
  if (!parcel) {
    run("UPDATE hardware_commands SET status = 'FAILED', failure_reason = 'Parcel not found', updated_at = ? WHERE id = ?", [now(), cmd.id]);
    isProcessingOrder = false;
    return;
  }

  const order = queryOne<{ destination_city: string }>("SELECT destination_city FROM orders WHERE id = ?", [parcel.order_id]);
  const bin = queryOne<{ bin_number: number; label: string }>("SELECT bin_number, label FROM bins WHERE id = ?", [cmd.bin_id]);
  const binLabel = bin?.label || 'BIN ?';
  const city = order?.destination_city || 'Unknown';

  machineState.activeOrderId = parcel.order_id;
  machineState.activeOrderCity = city;
  machineState.activeOrderBin = binLabel;
  ioInstance?.emit('machine:status', machineState);

  // Mark command as ACKED (ESP32 acknowledged)
  run("UPDATE hardware_commands SET status = 'ACKED', updated_at = ? WHERE id = ?", [now(), cmd.id]);
  ioInstance?.emit('hardware:command_acked', { commandId: cmd.id, parcelId: cmd.parcel_id });

  // Step 1: IR sensor triggers — parcel at pick point
  await sleep(1500);
  machineState.sensor = 'ACTIVE';
  ioInstance?.emit('sensor:triggered', { orderId: parcel.order_id, parcelId: cmd.parcel_id });
  ioInstance?.emit('machine:status', machineState);

  // Update parcel to AT_PICK_POINT
  run("UPDATE parcels SET status = 'AT_PICK_POINT', at_pick_point_at = ?, updated_at = ? WHERE id = ?", [now(), now(), cmd.parcel_id]);
  ioInstance?.emit('parcel:at_pick_point', { parcelId: cmd.parcel_id, orderId: parcel.order_id });

  // Step 2: Robot arm sorting sequence
  updateOrderStatus(parcel.order_id, 'SORTING', `Robot arm sorting to ${binLabel}`);
  machineState.sensor = 'IDLE';

  // Robot: PICKING
  machineState.robot = 'BUSY';
  ioInstance?.emit('robot:action', { orderId: parcel.order_id, parcelId: cmd.parcel_id, action: 'PICKING' });
  ioInstance?.emit('machine:status', machineState);
  run("UPDATE parcels SET status = 'SORTING', updated_at = ? WHERE id = ?", [now(), cmd.parcel_id]);
  await sleep(1000);

  // Robot: MOVING to bin
  ioInstance?.emit('robot:action', { orderId: parcel.order_id, parcelId: cmd.parcel_id, action: 'MOVING', targetBin: binLabel });
  await sleep(1000);

  // Robot: PLACING in bin
  ioInstance?.emit('robot:action', { orderId: parcel.order_id, parcelId: cmd.parcel_id, action: 'PLACING', targetBin: binLabel });
  await sleep(900);

  // Check for fault
  if ((machineState.robot as any) === 'FAULT') {
    run("UPDATE hardware_commands SET status = 'FAILED', failure_reason = 'Robot arm fault during sort', completed_at = ?, updated_at = ? WHERE id = ?", [now(), now(), cmd.id]);
    run("UPDATE parcels SET status = 'FAILED', updated_at = ? WHERE id = ?", [now(), cmd.parcel_id]);

    const faultId = `fault-${Date.now()}`;
    run("INSERT INTO pipeline_faults (id, type, parcel_id, detail, created_at) VALUES (?, 'ARM_FAULT', ?, 'Robot arm fault during sorting', ?)", [faultId, cmd.parcel_id, now()]);
    ioInstance?.emit('fault:created', { id: faultId, type: 'ARM_FAULT', parcelId: cmd.parcel_id });

    isProcessingOrder = false;
    machineState.activeOrderId = null;
    ioInstance?.emit('machine:status', machineState);
    return;
  }

  // Robot: DONE
  ioInstance?.emit('robot:action', { orderId: parcel.order_id, parcelId: cmd.parcel_id, action: 'DONE', targetBin: binLabel });
  machineState.robot = 'READY';

  // Sort completed
  const durationMs = 1350 + Math.floor(Math.random() * 200);

  // Update parcel to SORTED
  run("UPDATE parcels SET status = 'SORTED', sorted_at = ?, updated_at = ? WHERE id = ?", [now(), now(), cmd.parcel_id]);

  // Update bin count
  run("UPDATE bins SET parcel_count = parcel_count + 1, updated_at = ? WHERE id = ?", [now(), cmd.bin_id]);

  // Log the sort
  run(`INSERT INTO sorting_logs (id, order_id, detected_at, destination_city, assigned_bin, sort_result, duration_ms)
    VALUES (?, ?, ?, ?, ?, 'SUCCESS', ?)`,
    [`sort-${cmd.parcel_id}-${Date.now()}`, parcel.order_id, now(), city, binLabel, durationMs]);

  run(`UPDATE orders SET assigned_bin = ? WHERE id = ?`, [binLabel, parcel.order_id]);

  // Mark command DONE
  run("UPDATE hardware_commands SET status = 'DONE', completed_at = ?, updated_at = ? WHERE id = ?", [now(), now(), cmd.id]);

  updateOrderStatus(parcel.order_id, 'SORTED', `Sorted into ${binLabel} (${city})`);
  ioInstance?.emit('sorting:completed', { orderId: parcel.order_id, parcelId: cmd.parcel_id, bin: binLabel, result: 'SUCCESS', durationMs });
  ioInstance?.emit('hardware:command_done', { commandId: cmd.id, parcelId: cmd.parcel_id, binLabel });

  // Delay then dispatch
  await sleep(2500);
  updateOrderStatus(parcel.order_id, 'DISPATCHED', `Dispatched from Bay 1 to ${city}`);

  machineState.activeOrderId = null;
  machineState.activeOrderCity = null;
  machineState.activeOrderBin = null;
  ioInstance?.emit('machine:status', machineState);
  isProcessingOrder = false;
}

export function updateOrderStatus(orderId: string, newStatus: string, note?: string) {
  transitionOrderStatus(orderId, newStatus, note || `Status updated to ${newStatus}`, ioInstance, true);
}

function logMachineStatus() {
  const logId = `msl-${Date.now()}`;
  run(`INSERT INTO machine_status_log (id, esp32_status, wifi_status, sensor_status, conveyor_status, robot_status)
    VALUES (?, ?, ?, ?, ?, ?)`,
    [logId, machineState.esp32, machineState.wifi, machineState.sensor, machineState.conveyor, machineState.robot]);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

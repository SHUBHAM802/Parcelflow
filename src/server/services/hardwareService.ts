import crypto from 'crypto';
import { query, queryOne, run, transaction } from '../db';
import { getConfig } from '../config';
import { transitionOrderStatus } from '../orderStateMachine';
import { Server as SocketIOServer } from 'socket.io';
import { Bin, HardwareCommand, MachineState, Parcel, PipelineFault, ScanEvent } from '../../types';
import { DeviceHeartbeatRecord, PipelineSnapshot } from '../../shared/events';
import { machineState } from '../hardware-simulator';

// In-memory state tracking for sensors, sequence numbers, and debouncing
const lastIrEvents: Record<string, { state: string; ts: number; seq: number }> = {};
let currentIr1State: 'IDLE' | 'ACTIVE' = 'IDLE';
let currentIr2State: 'IDLE' | 'ACTIVE' = 'IDLE';

export function resetIrSensorHistory() {
  for (const k of Object.keys(lastIrEvents)) {
    delete lastIrEvents[k];
  }
}

export interface HeartbeatPayload {
  deviceId: string;
  firmware?: string;
  rssi?: number;
  state?: {
    conveyor?: string;
    ir1?: string;
    ir2?: string;
    arm?: string;
  };
}

export interface IrEventPayload {
  deviceId: string;
  sensorId: 'IR1' | 'IR2';
  state: 'TRIGGERED' | 'CLEAR';
  seq: number;
  ts?: number;
}

/**
 * Handle incoming ESP32 heartbeat. Upserts device_heartbeats table.
 */
export function recordHeartbeat(payload: HeartbeatPayload, io?: SocketIOServer | null) {
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const stateJson = payload.state ? JSON.stringify(payload.state) : null;

  run(
    `INSERT INTO device_heartbeats (device_id, last_seen_at, firmware, rssi, state_json)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(device_id) DO UPDATE SET
       last_seen_at = excluded.last_seen_at,
       firmware = COALESCE(excluded.firmware, device_heartbeats.firmware),
       rssi = COALESCE(excluded.rssi, device_heartbeats.rssi),
       state_json = COALESCE(excluded.state_json, device_heartbeats.state_json)`,
    [payload.deviceId, now, payload.firmware || null, payload.rssi ?? null, stateJson]
  );

  if (io) {
    io.emit('device:heartbeat', {
      deviceId: payload.deviceId,
      firmware: payload.firmware,
      rssi: payload.rssi,
      state: payload.state,
      timestamp: now
    });
  }

  return { success: true, timestamp: now };
}

/**
 * Handle IR sensor event from ESP32 conveyor controller.
 * Implements debouncing, sequence tracking, and FIFO parcel matching.
 */
export function handleIrEvent(payload: IrEventPayload, io?: SocketIOServer | null) {
  const cfg = getConfig();
  const nowMs = Date.now();
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const key = `${payload.deviceId}:${payload.sensorId}`;

  // Check debounce and sequence
  const last = lastIrEvents[key];
  if (last) {
    // Ignore sequence number lower than last seen
    if (payload.seq <= last.seq && (nowMs - last.ts < 10000)) {
      return { success: true, ignored: true, reason: 'Duplicate or old sequence number' };
    }
    // Ignore repeated TRIGGERED within debounce window
    if (payload.state === 'TRIGGERED' && last.state === 'TRIGGERED' && (nowMs - last.ts < cfg.IR_DEBOUNCE_MS)) {
      return { success: true, ignored: true, reason: 'Debounce window active' };
    }
  }

  lastIrEvents[key] = { state: payload.state, ts: nowMs, seq: payload.seq };

  // Update in-memory visual sensor state
  if (payload.sensorId === 'IR1') {
    currentIr1State = payload.state === 'TRIGGERED' ? 'ACTIVE' : 'IDLE';
  } else if (payload.sensorId === 'IR2') {
    currentIr2State = payload.state === 'TRIGGERED' ? 'ACTIVE' : 'IDLE';
  }

  // Handle sensor logic
  if (payload.sensorId === 'IR1') {
    if (payload.state === 'TRIGGERED') {
      if (cfg.SCAN_MODE === 'stop_and_scan') {
        // Stop belt to allow clean scan without motion blur
        setDesiredConveyor('HOLD', 'IR1 triggered (stop_and_scan window opened)', io);
      }
      if (io) io.emit('sensor:triggered', { sensorId: 'IR1' });
    }
    return { success: true };
  }

  if (payload.sensorId === 'IR2') {
    if (payload.state === 'CLEAR') {
      return { success: true };
    }

    // IR2 TRIGGERED at pick point — Find oldest SCANNED parcel (FIFO)
    return transaction(() => {
      const parcel = queryOne<{ id: string; order_id: string; scanned_at: string; assigned_bin_id: string }>(
        "SELECT id, order_id, scanned_at, assigned_bin_id FROM parcels WHERE status = 'SCANNED' ORDER BY scanned_at ASC LIMIT 1"
      );

      if (!parcel) {
        // UNEXPECTED OBJECT at pick point without matching scanned parcel!
        const faultId = `fault-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
        run(
          "INSERT INTO pipeline_faults (id, type, detail, created_at) VALUES (?, 'UNEXPECTED_OBJECT', ?, ?)",
          [faultId, 'Object detected at pick point (IR2) with no preceding valid scan', now]
        );
        setDesiredConveyor('HOLD', 'Unexpected object at pick point', io);

        if (io) {
          io.emit('fault:created', {
            id: faultId,
            type: 'UNEXPECTED_OBJECT',
            parcel_id: null,
            detail: 'Object detected at pick point with no valid scan in flight',
            created_at: now,
            acked_at: null,
            acked_by: null
          });
          io.emit('sensor:triggered', { sensorId: 'IR2' });
        }

        return { success: false, fault: 'UNEXPECTED_OBJECT', message: 'Unexpected object detected at pick point' };
      }

      // MATCH FOUND: Parcel reached pick point
      run("UPDATE parcels SET status = 'AT_PICK_POINT', at_pick_point_at = ?, updated_at = ? WHERE id = ?", [now, now, parcel.id]);

      // Transition order status to DETECTED
      transitionOrderStatus(parcel.order_id, 'DETECTED', 'Detected by IR2 at robotic pick point', io, true);

      // Release the queued SORT_TO_BIN command to the arm
      run(
        "UPDATE hardware_commands SET status = 'RELEASED', updated_at = ? WHERE parcel_id = ? AND status = 'QUEUED'",
        [now, parcel.id]
      );

      // Hold conveyor while robotic arm picks the parcel
      setDesiredConveyor('HOLD', 'Parcel at pick point — arm sorting', io);

      if (io) {
        io.emit('sensor:triggered', { sensorId: 'IR2', orderId: parcel.order_id, parcelId: parcel.id });
        io.emit('parcel:at_pick_point', { parcelId: parcel.id, orderId: parcel.order_id });
      }

      return { success: true, parcelId: parcel.id, orderId: parcel.order_id };
    });
  }

  return { success: true };
}

/**
 * Get current desired conveyor state and revision.
 */
export function getDesiredConveyorState() {
  const desired = queryOne<{ value: string }>("SELECT value FROM pipeline_state WHERE key = 'conveyor_desired'")?.value || 'RUN';
  const rev = Number(queryOne<{ value: string }>("SELECT value FROM pipeline_state WHERE key = 'conveyor_revision'")?.value || 1);
  return {
    state: desired as 'RUN' | 'HOLD' | 'STOP',
    speedPct: desired === 'RUN' ? 100 : 0,
    revision: rev
  };
}

/**
 * Set desired conveyor state and increment revision.
 */
export function setDesiredConveyor(state: 'RUN' | 'HOLD' | 'STOP', reason?: string, io?: SocketIOServer | null) {
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  run("UPDATE pipeline_state SET value = ?, updated_at = ? WHERE key = 'conveyor_desired'", [state, now]);
  run("UPDATE pipeline_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = ? WHERE key = 'conveyor_revision'", [now]);

  // Update simulator machineState for consistency
  if (state === 'STOP') {
    machineState.conveyor = 'STOPPED';
    machineState.motorRpm = 0;
  } else if (state === 'HOLD') {
    machineState.conveyor = 'PAUSED';
    machineState.motorRpm = 0;
  } else if (state === 'RUN') {
    machineState.conveyor = 'RUNNING';
    machineState.motorRpm = 120;
  }

  const { revision } = getDesiredConveyorState();
  if (io) {
    io.emit('conveyor:desired', { state, speedPct: state === 'RUN' ? 100 : 0, revision });
    io.emit('machine:status', machineState);
  }
}

/**
 * Fetch the next command ready for a device (e.g. arm-esp32) and mark it SENT.
 */
export function getNextCommandForDevice(deviceId: string) {
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  return transaction(() => {
    const cmd = queryOne<{
      id: string; device_id: string; type: string; parcel_id: string; bin_id: string; payload_json: string;
    }>(
      "SELECT id, device_id, type, parcel_id, bin_id, payload_json FROM hardware_commands WHERE device_id = ? AND status = 'RELEASED' ORDER BY created_at ASC LIMIT 1",
      [deviceId]
    );

    if (!cmd) return null;

    // Mark as SENT
    run("UPDATE hardware_commands SET status = 'SENT', attempts = attempts + 1, updated_at = ? WHERE id = ?", [now, cmd.id]);

    let bin = null;
    let servoPreset = null;
    if (cmd.bin_id) {
      const b = queryOne<{ bin_number: number; label: string; servo_preset_json: string }>(
        "SELECT bin_number, label, servo_preset_json FROM bins WHERE id = ?", [cmd.bin_id]
      );
      if (b) {
        bin = { number: b.bin_number, label: b.label };
        try { servoPreset = JSON.parse(b.servo_preset_json); } catch {}
      }
    }

    return {
      commandId: cmd.id,
      type: cmd.type,
      parcelId: cmd.parcel_id,
      bin,
      servoPreset,
      expiresAt: new Date(Date.now() + 20000).toISOString()
    };
  });
}

/**
 * Device acknowledges command receipt.
 */
export function acknowledgeCommand(commandId: string, io?: SocketIOServer | null) {
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  return transaction(() => {
    const cmd = queryOne<{ id: string; parcel_id: string }>("SELECT id, parcel_id FROM hardware_commands WHERE id = ?", [commandId]);
    if (!cmd) return { success: false, error: 'Command not found' };

    run("UPDATE hardware_commands SET status = 'ACKED', updated_at = ? WHERE id = ?", [now, commandId]);

    if (cmd.parcel_id) {
      run("UPDATE parcels SET status = 'SORTING', updated_at = ? WHERE id = ?", [now, cmd.parcel_id]);
      const p = queryOne<{ order_id: string }>("SELECT order_id FROM parcels WHERE id = ?", [cmd.parcel_id]);
      if (p) {
        transitionOrderStatus(p.order_id, 'SORTING', 'ESP32 arm sorting parcel to bin', io, true);
      }
    }

    return { success: true };
  });
}

/**
 * Device completes command execution successfully.
 */
export function completeCommand(commandId: string, durationMs: number = 2000, io?: SocketIOServer | null) {
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  return transaction(() => {
    const cmd = queryOne<{ id: string; parcel_id: string; bin_id: string }>(
      "SELECT id, parcel_id, bin_id FROM hardware_commands WHERE id = ?", [commandId]
    );
    if (!cmd) return { success: false, error: 'Command not found' };

    // Update command
    run("UPDATE hardware_commands SET status = 'DONE', completed_at = ?, updated_at = ? WHERE id = ?", [now, now, commandId]);

    if (cmd.parcel_id) {
      // Update parcel
      run("UPDATE parcels SET status = 'SORTED', sorted_at = ?, updated_at = ? WHERE id = ?", [now, now, cmd.parcel_id]);

      const parcel = queryOne<{ order_id: string }>("SELECT order_id FROM parcels WHERE id = ?", [cmd.parcel_id]);
      if (parcel) {
        // Update bin count
        if (cmd.bin_id) {
          run("UPDATE bins SET parcel_count = parcel_count + 1 WHERE id = ?", [cmd.bin_id]);
        }

        const bin = cmd.bin_id ? queryOne<{ label: string }>("SELECT label FROM bins WHERE id = ?", [cmd.bin_id]) : null;
        const binLabel = bin?.label || 'BIN';

        // Order transition
        transitionOrderStatus(parcel.order_id, 'SORTED', `Robotic sort complete into ${binLabel}`, io, true);

        // Sorting log
        const order = queryOne<{ destination_city: string }>("SELECT destination_city FROM orders WHERE id = ?", [parcel.order_id]);
        const city = order?.destination_city || 'Warehouse Hub';
        const logId = `sort-${parcel.order_id}-${Date.now()}`;
        run(
          `INSERT INTO sorting_logs (id, order_id, detected_at, destination_city, assigned_bin, sort_result, duration_ms)
           VALUES (?, ?, ?, ?, ?, 'SUCCESS', ?)`,
          [logId, parcel.order_id, now, city, binLabel, durationMs]
        );

        if (io) {
          io.emit('sorting:completed', { orderId: parcel.order_id, bin: binLabel, result: 'SUCCESS', durationMs });
        }
      }
    }

    // Resume conveyor if no pending faults
    const activeFaults = queryOne<{ cnt: number }>("SELECT COUNT(*) as cnt FROM pipeline_faults WHERE acked_at IS NULL")?.cnt || 0;
    if (activeFaults === 0) {
      setDesiredConveyor('RUN', 'Sort completed successfully', io);
    }

    return { success: true };
  });
}

/**
 * Device reports command failure.
 */
export function failCommand(commandId: string, reason: string, io?: SocketIOServer | null) {
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  return transaction(() => {
    const cmd = queryOne<{ id: string; parcel_id: string }>("SELECT id, parcel_id FROM hardware_commands WHERE id = ?", [commandId]);
    if (!cmd) return { success: false, error: 'Command not found' };

    run("UPDATE hardware_commands SET status = 'FAILED', failure_reason = ?, completed_at = ?, updated_at = ? WHERE id = ?", [reason, now, now, commandId]);

    if (cmd.parcel_id) {
      run("UPDATE parcels SET status = 'FAILED', updated_at = ? WHERE id = ?", [now, cmd.parcel_id]);
      const faultId = `fault-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      run("INSERT INTO pipeline_faults (id, type, parcel_id, detail, created_at) VALUES (?, 'ARM_FAULT', ?, ?, ?)", [faultId, cmd.parcel_id, reason, now]);

      if (io) {
        io.emit('fault:created', { id: faultId, type: 'ARM_FAULT', parcel_id: cmd.parcel_id, detail: reason, created_at: now, acked_at: null, acked_by: null });
      }
    }

    setDesiredConveyor('HOLD', `Arm failed: ${reason}`, io);
    return { success: true };
  });
}

/**
 * Emergency Stop Trigger.
 */
export function triggerEmergencyStop(operatorId?: string, io?: SocketIOServer | null) {
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  return transaction(() => {
    // 1. Immediately halt conveyor
    setDesiredConveyor('STOP', 'Emergency stop triggered', io);
    machineState.conveyor = 'EMERGENCY_STOPPED';

    // 2. Cancel all queued or released commands
    run("UPDATE hardware_commands SET status = 'CANCELLED', failure_reason = 'E-STOP engaged', updated_at = ? WHERE status IN ('QUEUED', 'RELEASED')", [now]);

    // 3. Insert pipeline fault
    const faultId = `estop-${Date.now()}`;
    run("INSERT INTO pipeline_faults (id, type, detail, created_at) VALUES (?, 'ESTOP', 'Emergency Stop engaged by operator', ?)", [faultId, now]);

    // 4. Alert log
    const alertId = `alt-es-${Date.now()}`;
    run("INSERT INTO alerts (id, type, severity, message, resolved, created_at) VALUES (?, 'MACHINE_OFFLINE', 'critical', 'EMERGENCY STOP ENGAGED on Sorter. All motion arrested.', 0, ?)", [alertId, now]);

    if (io) {
      io.emit('fault:created', { id: faultId, type: 'ESTOP', parcel_id: null, detail: 'Emergency Stop engaged by operator', created_at: now, acked_at: null, acked_by: null });
      io.emit('machine:status', machineState);
    }

    return { success: true, faultId };
  });
}

/**
 * Emergency Stop Reset (Requires explicit operator confirmation).
 */
export function resetEmergencyStop(operatorId?: string, io?: SocketIOServer | null) {
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  return transaction(() => {
    // Acknowledge ESTOP faults
    run("UPDATE pipeline_faults SET acked_at = ?, acked_by = ? WHERE type = 'ESTOP' AND acked_at IS NULL", [now, operatorId || 'operator']);
    run("UPDATE alerts SET resolved = 1 WHERE type = 'MACHINE_OFFLINE' AND message LIKE '%EMERGENCY STOP%'");

    // Put conveyor in HOLD status (operator must explicitly press START to resume motion)
    setDesiredConveyor('HOLD', 'E-STOP reset by operator', io);
    machineState.conveyor = 'STOPPED';

    if (io) {
      io.emit('conveyor:desired', { state: 'HOLD' });
      io.emit('machine:status', machineState);
    }

    return { success: true, message: 'Emergency Stop cleared. Conveyor placed in HOLD — press Start when clear.' };
  });
}

/**
 * Get unified pipeline state snapshot for Operator page.
 */
export function getPipelineSnapshot(): PipelineSnapshot {
  const cfg = getConfig();
  const nowMs = Date.now();
  const heartbeatTimeout = cfg.HEARTBEAT_TIMEOUT_MS;

  // 1. Devices and heartbeats
  const rawDevices = query<any>("SELECT * FROM device_heartbeats");
  const devices: DeviceHeartbeatRecord[] = ['conveyor-esp32', 'arm-esp32'].map(devId => {
    const found = rawDevices.find((d: any) => d.device_id === devId);
    const lastSeenMs = found ? new Date(found.last_seen_at).getTime() : 0;
    const isOnline = cfg.HARDWARE_MODE === 'simulator' ? true : (found ? (nowMs - lastSeenMs < heartbeatTimeout) : false);

    return {
      device_id: devId,
      last_seen_at: found ? found.last_seen_at : 'Never',
      firmware: found ? found.firmware : 'v1.4.2-esp32',
      rssi: found ? found.rssi : -58,
      state_json: found ? found.state_json : null,
      is_online: isOnline
    };
  });

  // 2. Conveyor state
  const { state: desiredState, speedPct, revision } = getDesiredConveyorState();

  // 3. Current parcel in flight
  const currentParcel = queryOne<any>(`
    SELECT p.*, o.destination_city, o.status as order_status, u.name as customer_name,
           b.label as bin_label, b.bin_number
    FROM parcels p
    JOIN orders o ON p.order_id = o.id
    LEFT JOIN users u ON o.customer_id = u.id
    LEFT JOIN bins b ON p.assigned_bin_id = b.id
    WHERE p.status IN ('SCANNED', 'AT_PICK_POINT', 'SORTING')
    ORDER BY p.scanned_at DESC
    LIMIT 1
  `) || null;

  // 4. Recent scans
  const recentScans = query<ScanEvent>(`
    SELECT se.*, p.order_id
    FROM scan_events se
    LEFT JOIN parcels p ON se.parcel_id = p.id
    ORDER BY se.created_at DESC
    LIMIT 20
  `);

  // 5. Active and recent commands
  const commands = query<HardwareCommand>(`
    SELECT hc.*, b.label as bin_label, b.bin_number
    FROM hardware_commands hc
    LEFT JOIN bins b ON hc.bin_id = b.id
    ORDER BY hc.created_at DESC
    LIMIT 20
  `);

  // 6. Active faults
  const activeFaults = query<PipelineFault>(`
    SELECT * FROM pipeline_faults
    WHERE acked_at IS NULL
    ORDER BY created_at DESC
    LIMIT 10
  `);

  // 7. Bins
  const bins = query<Bin>(`
    SELECT b.*, c.name as category_name
    FROM bins b
    LEFT JOIN categories c ON b.category_id = c.id
    ORDER BY b.bin_number ASC
  `);

  return {
    mode: cfg.HARDWARE_MODE,
    devices,
    conveyor: {
      desiredState,
      speedPct,
      revision,
      machineConveyor: machineState.conveyor,
      motorRpm: machineState.motorRpm
    },
    irSensors: {
      ir1: currentIr1State,
      ir2: currentIr2State
    },
    robotArm: {
      state: machineState.robot,
      currentAction: machineState.robot === 'BUSY' ? 'SORTING_TO_BIN' : 'IDLE',
      targetBin: machineState.activeOrderBin
    },
    currentParcel,
    recentScans,
    commands,
    activeFaults,
    bins
  };
}

/**
 * Watchdog timer check: flags offline devices and sets conveyor to HOLD.
 */
export function checkDeviceWatchdog(io?: SocketIOServer | null) {
  const cfg = getConfig();
  if (cfg.HARDWARE_MODE === 'simulator') return; // Do not flag offline in simulator mode

  const timeoutMs = cfg.HEARTBEAT_TIMEOUT_MS;
  const cutoff = new Date(Date.now() - timeoutMs).toISOString().replace('T', ' ').substring(0, 19);

  const offlineDevices = query<{ device_id: string }>(
    "SELECT device_id FROM device_heartbeats WHERE last_seen_at < ?",
    [cutoff]
  );

  for (const dev of offlineDevices) {
    const existing = queryOne<{ id: string }>(
      "SELECT id FROM pipeline_faults WHERE type = 'DEVICE_OFFLINE' AND detail LIKE ? AND acked_at IS NULL",
      [`%${dev.device_id}%`]
    );

    if (!existing) {
      const faultId = `fault-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
      run(
        "INSERT INTO pipeline_faults (id, type, detail, created_at) VALUES (?, 'DEVICE_OFFLINE', ?, ?)",
        [faultId, `Device ${dev.device_id} heartbeat lost (> ${timeoutMs}ms)`, now]
      );
      setDesiredConveyor('HOLD', `Device ${dev.device_id} went offline`, io);

      if (io) {
        io.emit('fault:created', {
          id: faultId,
          type: 'DEVICE_OFFLINE',
          parcel_id: null,
          detail: `Device ${dev.device_id} heartbeat lost`,
          created_at: now,
          acked_at: null,
          acked_by: null
        });
      }
    }
  }
}

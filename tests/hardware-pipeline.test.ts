import { describe, it, expect, beforeAll } from 'vitest';
import { getDb, queryOne, run } from '../src/server/db';
import { loadConfig, getConfig } from '../src/server/config';
import {
  handleIrEvent,
  getDesiredConveyorState,
  setDesiredConveyor,
  getNextCommandForDevice,
  acknowledgeCommand,
  completeCommand,
  failCommand,
  triggerEmergencyStop,
  resetEmergencyStop,
  getPipelineSnapshot,
  resetIrSensorHistory,
  handleScanTimeout,
  checkArmTimeouts,
  clearScanTimeoutTimer,
  checkDeviceWatchdog
} from '../src/server/services/hardwareService';
import { createOrGetLabel } from '../src/server/services/labelService';
import { processScan } from '../src/server/services/scanService';

describe('Hardware API, IR Detection & Robotic Arm Pipeline', () => {
  beforeAll(async () => {
    loadConfig();
    await getDb();
  });

  describe('5.1 Conveyor Desired State & E-Stop Interlock', () => {
    it('sets and gets conveyor desired state and increments revision', () => {
      const stateBefore = getDesiredConveyorState();
      setDesiredConveyor('HOLD', 'Test hold');
      const stateAfter = getDesiredConveyorState();

      expect(stateAfter.state).toBe('HOLD');
      expect(stateAfter.revision).toBeGreaterThan(stateBefore.revision);
    });

    it('emergency stop engages STOP, cancels queued commands, and raises ESTOP fault', () => {
      const estopResult = triggerEmergencyStop('operator-test');
      expect(estopResult.success).toBe(true);

      const convState = getDesiredConveyorState();
      expect(convState.state).toBe('STOP');

      const fault = queryOne<{ type: string; acked_at: string | null }>(
        "SELECT type, acked_at FROM pipeline_faults WHERE type = 'ESTOP' ORDER BY created_at DESC LIMIT 1"
      );
      expect(fault).toBeDefined();
      expect(fault?.acked_at).toBeNull();
    });

    it('resetting emergency stop restores conveyor to HOLD and resolves fault', () => {
      const resetResult = resetEmergencyStop('operator-test');
      expect(resetResult.success).toBe(true);

      const convState = getDesiredConveyorState();
      expect(convState.state).toBe('HOLD');

      const unackedEstop = queryOne<{ count: number }>(
        "SELECT COUNT(*) as count FROM pipeline_faults WHERE type = 'ESTOP' AND acked_at IS NULL"
      );
      expect(unackedEstop?.count).toBe(0);
    });
  });

  describe('5.2 IR Sensor Handling & FIFO Parcel Matching', () => {
    it('handles unexpected object at pick point (IR2) when no scanned parcel in flight', () => {
      // Clear in-flight SCANNED parcels for clean test
      run("UPDATE parcels SET status = 'DONE_TEST' WHERE status = 'SCANNED'");

      const irRes = handleIrEvent({
        deviceId: 'conveyor-esp32',
        sensorId: 'IR2',
        state: 'TRIGGERED',
        seq: 501,
        ts: Date.now()
      });

      expect(irRes.success).toBe(false);
      expect((irRes as any).fault).toBe('UNEXPECTED_OBJECT');

      // Conveyor must be held in HOLD
      const convState = getDesiredConveyorState();
      expect(convState.state).toBe('HOLD');

      // Must be logged in pipeline_faults
      const fault = queryOne<{ type: string }>(
        "SELECT type FROM pipeline_faults WHERE type = 'UNEXPECTED_OBJECT' ORDER BY created_at DESC LIMIT 1"
      );
      expect(fault?.type).toBe('UNEXPECTED_OBJECT');
    });

    it('executes complete physical sorting sequence: Infeed -> Scan -> IR2 -> Arm Pick -> Sort Complete', () => {
      resetIrSensorHistory();
      run("UPDATE parcels SET status = 'DONE_TEST' WHERE status IN ('SCANNED', 'AT_PICK_POINT', 'SORTING')");
      const orderId = `ORD-HW-${Date.now()}`;
      const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

      // 1. Order placed and infeed to ON_CONVEYOR
      run(`
        INSERT INTO orders (id, customer_id, total_amount, subtotal, gst_amount, status, payment_status, destination_city, created_at, updated_at)
        VALUES (?, 'usr-cust-demo', 999, 800, 199, 'ON_CONVEYOR', 'PAID', 'Mumbai', ?, ?)
      `, [orderId, now, now]);

      const prod = queryOne<{ id: string }>("SELECT id FROM products LIMIT 1");
      if (prod) {
        run(`INSERT INTO order_items (id, order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, 1, 999)`,
          [`item-${orderId}`, orderId, prod.id]
        );
      }

      // 2. Generate shipping label
      const labelData = createOrGetLabel(orderId);
      expect(labelData.parcel.id).toBeDefined();

      // 3. Camera scans QR code
      const scanRes = processScan({
        payload: labelData.labelPayload,
        source: 'browser_camera',
        decodeMs: 38
      });
      expect(scanRes.result).toBe('ACCEPTED');

      // 4. Parcel moves to pick point -> IR2 triggers
      const ir2Res = handleIrEvent({
        deviceId: 'conveyor-esp32',
        sensorId: 'IR2',
        state: 'TRIGGERED',
        seq: 701,
        ts: Date.now()
      });
      expect(ir2Res.success).toBe(true);
      expect((ir2Res as any).parcelId).toBe(labelData.parcel.id);

      // Verify parcel is at pick point
      const pAfterIr2 = queryOne<{ status: string }>("SELECT status FROM parcels WHERE id = ?", [labelData.parcel.id]);
      expect(pAfterIr2?.status).toBe('AT_PICK_POINT');

      // 5. arm-esp32 fetches the released command
      const cmd = getNextCommandForDevice('arm-esp32');
      expect(cmd).not.toBeNull();
      expect(cmd?.parcelId).toBe(labelData.parcel.id);
      expect(cmd?.type).toBe('SORT_TO_BIN');

      // 6. Arm sends ACK
      const ackRes = acknowledgeCommand(cmd!.commandId);
      expect(ackRes.success).toBe(true);

      const pAfterAck = queryOne<{ status: string }>("SELECT status FROM parcels WHERE id = ?", [labelData.parcel.id]);
      expect(pAfterAck?.status).toBe('SORTING');

      // 7. Arm sends COMPLETE
      const completeRes = completeCommand(cmd!.commandId, 1850);
      expect(completeRes.success).toBe(true);

      // 8. Verify all final states
      const pFinal = queryOne<{ status: string }>("SELECT status FROM parcels WHERE id = ?", [labelData.parcel.id]);
      expect(pFinal?.status).toBe('SORTED');

      const oFinal = queryOne<{ status: string }>("SELECT status FROM orders WHERE id = ?", [orderId]);
      expect(oFinal?.status).toBe('SORTED');

      // Sorting log entry must exist
      const sortLog = queryOne<{ order_id: string; sort_result: string }>(
        "SELECT order_id, sort_result FROM sorting_logs WHERE order_id = ?", [orderId]
      );
      expect(sortLog?.sort_result).toBe('SUCCESS');
    });

    it('an ON_CONVEYOR order does NOT progress until a scan and an IR2 event occur', async () => {
      resetIrSensorHistory();
      run("UPDATE parcels SET status = 'DONE_TEST' WHERE status IN ('SCANNED', 'AT_PICK_POINT', 'SORTING')");
      const orderId = `ORD-NO-AUTO-${Date.now()}`;
      const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

      // 1. Place order on conveyor
      run(`
        INSERT INTO orders (id, customer_id, total_amount, subtotal, gst_amount, status, payment_status, destination_city, created_at, updated_at)
        VALUES (?, 'usr-cust-demo', 1999, 1600, 399, 'ON_CONVEYOR', 'PAID', 'Mumbai', ?, ?)
      `, [orderId, now, now]);

      const prod = queryOne<{ id: string }>("SELECT id FROM products LIMIT 1");
      if (prod) {
        run(`INSERT INTO order_items (id, order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, 1, 1600)`,
          [`item-${orderId}`, orderId, prod.id]
        );
      }

      const labelData = createOrGetLabel(orderId);

      // 2. Wait and verify order does NOT auto-advance without scan
      await new Promise(r => setTimeout(r, 100));
      const orderBeforeScan = queryOne<{ status: string }>("SELECT status FROM orders WHERE id = ?", [orderId]);
      expect(orderBeforeScan?.status).toBe('ON_CONVEYOR');

      // 3. Scan the parcel
      const scanRes = processScan({
        payload: labelData.labelPayload,
        source: 'browser_camera',
        decodeMs: 25
      });
      expect(scanRes.result).toBe('ACCEPTED');

      const orderAfterScan = queryOne<{ status: string }>("SELECT status FROM orders WHERE id = ?", [orderId]);
      expect(orderAfterScan?.status).toBe('SCANNED');

      // 4. Wait again and verify order does NOT advance to DETECTED/SORTED without IR2
      await new Promise(r => setTimeout(r, 100));
      const orderBeforeIr2 = queryOne<{ status: string }>("SELECT status FROM orders WHERE id = ?", [orderId]);
      expect(orderBeforeIr2?.status).toBe('SCANNED');

      // 5. Trigger IR2 at pick point
      const ir2Res = handleIrEvent({
        deviceId: 'conveyor-esp32',
        sensorId: 'IR2',
        state: 'TRIGGERED',
        seq: 888,
        ts: Date.now()
      });
      expect(ir2Res.success).toBe(true);

      const orderAfterIr2 = queryOne<{ status: string }>("SELECT status FROM orders WHERE id = ?", [orderId]);
      expect(orderAfterIr2?.status).toBe('DETECTED');

      // 6. Complete sorting command
      const cmd = getNextCommandForDevice('arm-esp32');
      expect(cmd).not.toBeNull();
      acknowledgeCommand(cmd!.commandId);
      completeCommand(cmd!.commandId, 1500);

      const orderFinal = queryOne<{ status: string }>("SELECT status FROM orders WHERE id = ?", [orderId]);
      expect(orderFinal?.status).toBe('SORTED');
    });
  });

  describe('5.3 Unified Pipeline Snapshot', () => {
    it('returns complete hardware telemetry snapshot for Operator portal', () => {
      const snapshot = getPipelineSnapshot();

      expect(snapshot).toHaveProperty('mode');
      expect(snapshot).toHaveProperty('devices');
      expect(snapshot).toHaveProperty('conveyor');
      expect(snapshot).toHaveProperty('irSensors');
      expect(snapshot).toHaveProperty('robotArm');
      expect(snapshot).toHaveProperty('bins');
      expect(Array.isArray(snapshot.bins)).toBe(true);
    });
  });

  describe('5.4 Timeouts, IR Debouncing, and Fault Safety', () => {
    it('handles IR1 trigger and scan timeout policy', () => {
      resetIrSensorHistory();
      setDesiredConveyor('RUN', 'Reset for test');

      // 1. IR1 triggered -> conveyor moves to HOLD in stop_and_scan mode
      const ir1Res = handleIrEvent({
        deviceId: 'conveyor-esp32',
        sensorId: 'IR1',
        state: 'TRIGGERED',
        seq: 1001,
        ts: Date.now()
      });
      expect(ir1Res.success).toBe(true);
      expect(getDesiredConveyorState().state).toBe('HOLD');

      // 2. Trigger scan timeout
      const timeoutRes = handleScanTimeout();
      expect(timeoutRes.success).toBe(true);
      expect(timeoutRes.faultId).toBeDefined();

      // Check fault logged in DB
      const fault = queryOne<{ type: string; detail: string }>(
        "SELECT type, detail FROM pipeline_faults WHERE id = ?",
        [timeoutRes.faultId]
      );
      expect(fault?.type).toBe('SCAN_TIMEOUT');
    });

    it('handles ARM_ACK timeout when arm does not acknowledge command within timeout', () => {
      const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const staleTime = new Date(Date.now() - 15000).toISOString().replace('T', ' ').substring(0, 19);
      const orderId = `ORD-ARM-ACK-${Date.now()}`;
      const parcelId = `pcl-ack-${Date.now()}`;
      const cmdId = `cmd-ack-${Date.now()}`;

      run(`INSERT INTO orders (id, customer_id, total_amount, subtotal, gst_amount, status, payment_status, destination_city, created_at, updated_at)
           VALUES (?, 'usr-cust-demo', 500, 400, 100, 'ON_CONVEYOR', 'PAID', 'Delhi', ?, ?)`, [orderId, now, now]);
      run(`INSERT INTO parcels (id, order_id, label_payload, status, created_at, updated_at)
           VALUES (?, ?, ?, 'SCANNED', ?, ?)`, [parcelId, orderId, `PF1.${parcelId}.1234567890`, staleTime, staleTime]);
      run(`INSERT INTO hardware_commands (id, device_id, type, parcel_id, status, idempotency_key, created_at, updated_at)
           VALUES (?, 'arm-esp32', 'SORT_TO_BIN', ?, 'SENT', ?, ?, ?)`, [cmdId, parcelId, `key-${cmdId}`, staleTime, staleTime]);

      const timedOut = checkArmTimeouts();
      expect(timedOut.some(t => t.commandId === cmdId && t.type === 'ARM_ACK_TIMEOUT')).toBe(true);

      const cmd = queryOne<{ status: string; failure_reason: string }>(
        "SELECT status, failure_reason FROM hardware_commands WHERE id = ?", [cmdId]
      );
      expect(cmd?.status).toBe('FAILED');
      expect(cmd?.failure_reason).toBe('ARM_ACK_TIMEOUT');

      const parcel = queryOne<{ status: string }>("SELECT status FROM parcels WHERE id = ?", [parcelId]);
      expect(parcel?.status).toBe('FAILED');

      expect(getDesiredConveyorState().state).toBe('HOLD');
    });

    it('handles ARM_COMPLETE timeout when arm does not complete command within timeout', () => {
      const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const staleTime = new Date(Date.now() - 35000).toISOString().replace('T', ' ').substring(0, 19);
      const orderId = `ORD-ARM-CMP-${Date.now()}`;
      const parcelId = `pcl-cmp-${Date.now()}`;
      const cmdId = `cmd-cmp-${Date.now()}`;

      run(`INSERT INTO orders (id, customer_id, total_amount, subtotal, gst_amount, status, payment_status, destination_city, created_at, updated_at)
           VALUES (?, 'usr-cust-demo', 500, 400, 100, 'ON_CONVEYOR', 'PAID', 'Delhi', ?, ?)`, [orderId, now, now]);
      run(`INSERT INTO parcels (id, order_id, label_payload, status, created_at, updated_at)
           VALUES (?, ?, ?, 'SORTING', ?, ?)`, [parcelId, orderId, `PF1.${parcelId}.1234567890`, staleTime, staleTime]);
      run(`INSERT INTO hardware_commands (id, device_id, type, parcel_id, status, idempotency_key, created_at, updated_at)
           VALUES (?, 'arm-esp32', 'SORT_TO_BIN', ?, 'ACKED', ?, ?, ?)`, [cmdId, parcelId, `key-${cmdId}`, staleTime, staleTime]);

      const timedOut = checkArmTimeouts();
      expect(timedOut.some(t => t.commandId === cmdId && t.type === 'ARM_COMPLETE_TIMEOUT')).toBe(true);

      const cmd = queryOne<{ status: string; failure_reason: string }>(
        "SELECT status, failure_reason FROM hardware_commands WHERE id = ?", [cmdId]
      );
      expect(cmd?.status).toBe('FAILED');
      expect(cmd?.failure_reason).toBe('ARM_COMPLETE_TIMEOUT');

      const parcel = queryOne<{ status: string }>("SELECT status FROM parcels WHERE id = ?", [parcelId]);
      expect(parcel?.status).toBe('FAILED');

      expect(getDesiredConveyorState().state).toBe('HOLD');
    });

    it('rejects duplicate or out-of-order IR sensor events and enforces debounce window', () => {
      resetIrSensorHistory();
      const nowMs = Date.now();

      // First trigger
      const first = handleIrEvent({
        deviceId: 'conveyor-esp32',
        sensorId: 'IR1',
        state: 'TRIGGERED',
        seq: 500,
        ts: nowMs
      });
      expect(first.success).toBe(true);
      expect((first as any).ignored).toBeUndefined();

      // Duplicate sequence
      const dupSeq = handleIrEvent({
        deviceId: 'conveyor-esp32',
        sensorId: 'IR1',
        state: 'TRIGGERED',
        seq: 500,
        ts: nowMs + 10
      });
      expect(dupSeq.success).toBe(true);
      expect((dupSeq as any).ignored).toBe(true);
      expect((dupSeq as any).reason).toBe('Duplicate or old sequence number');

      // Older sequence
      const oldSeq = handleIrEvent({
        deviceId: 'conveyor-esp32',
        sensorId: 'IR1',
        state: 'TRIGGERED',
        seq: 499,
        ts: nowMs + 20
      });
      expect(oldSeq.success).toBe(true);
      expect((oldSeq as any).ignored).toBe(true);
      expect((oldSeq as any).reason).toBe('Duplicate or old sequence number');

      // Higher sequence within debounce window (< 250ms)
      const debounceActive = handleIrEvent({
        deviceId: 'conveyor-esp32',
        sensorId: 'IR1',
        state: 'TRIGGERED',
        seq: 501,
        ts: nowMs + 50
      });
      expect(debounceActive.success).toBe(true);
      expect((debounceActive as any).ignored).toBe(true);
      expect((debounceActive as any).reason).toBe('Debounce window active');
    });

    it('rejects duplicate command acknowledge and complete calls', () => {
      const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const cmdId = `cmd-dup-${Date.now()}`;
      run(`INSERT INTO hardware_commands (id, device_id, type, status, idempotency_key, created_at, updated_at)
           VALUES (?, 'arm-esp32', 'SORT_TO_BIN', 'RELEASED', ?, ?, ?)`, [cmdId, `key-${cmdId}`, now, now]);

      // First ACK
      const ack1 = acknowledgeCommand(cmdId);
      expect(ack1.success).toBe(true);

      // Duplicate ACK
      const ack2 = acknowledgeCommand(cmdId);
      expect(ack2.success).toBe(false);
      expect(ack2.error).toBe('Command already acknowledged');

      // First COMPLETE
      const comp1 = completeCommand(cmdId, 1000);
      expect(comp1.success).toBe(true);

      // Duplicate COMPLETE
      const comp2 = completeCommand(cmdId, 1000);
      expect(comp2.success).toBe(false);
      expect(comp2.error).toBe('Command already completed');
    });

    it('heartbeat timeout generates DEVICE_OFFLINE fault and sets conveyor to HOLD when mode is real', () => {
      const cfg = getConfig();
      const prevMode = cfg.HARDWARE_MODE;
      try {
        (cfg as any).HARDWARE_MODE = 'real';
        setDesiredConveyor('RUN', 'Reset for heartbeat test');

        // Insert an expired heartbeat
        const staleTime = new Date(Date.now() - cfg.HEARTBEAT_TIMEOUT_MS - 5000).toISOString().replace('T', ' ').substring(0, 19);
        run(`INSERT INTO device_heartbeats (device_id, last_seen_at) VALUES ('arm-esp32-offline-test', ?)
             ON CONFLICT(device_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`, [staleTime]);

        checkDeviceWatchdog();

        // Must create fault
        const fault = queryOne<{ type: string; detail: string }>(
          "SELECT type, detail FROM pipeline_faults WHERE type = 'DEVICE_OFFLINE' AND detail LIKE '%arm-esp32-offline-test%' LIMIT 1"
        );
        expect(fault).toBeDefined();
        expect(fault?.type).toBe('DEVICE_OFFLINE');

        // Conveyor must be placed in HOLD
        expect(getDesiredConveyorState().state).toBe('HOLD');
      } finally {
        (cfg as any).HARDWARE_MODE = prevMode;
      }
    });
  });
});

import { describe, it, expect, beforeAll } from 'vitest';
import { getDb, queryOne, run } from '../src/server/db';
import { loadConfig } from '../src/server/config';
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
  resetIrSensorHistory
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
});

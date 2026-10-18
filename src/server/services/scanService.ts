import crypto from 'crypto';
import { query, queryOne, run, transaction } from '../db';
import { getConfig, isSingleParcelMode } from '../config';
import { verifyLabelPayload, resolveRoutingBin } from './labelService';
import { transitionOrderStatus } from '../orderStateMachine';
import { Server as SocketIOServer } from 'socket.io';

export type ScanResult =
  | 'ACCEPTED'
  | 'DUPLICATE'
  | 'INVALID_FORMAT'
  | 'BAD_CHECKSUM'
  | 'UNKNOWN_PARCEL'
  | 'WRONG_STATE'
  | 'BUSY'
  | 'REJECTED';

export interface ScanRequest {
  payload: string;
  source: 'browser_camera' | 'python_camera' | 'manual' | 'simulator';
  decodeMs?: number;
  deviceId?: string;
  operatorId?: string;
}

export interface ScanResponse {
  result: ScanResult;
  parcelId?: string;
  orderId?: string;
  bin?: { number: number; label: string; category: string };
  state?: string;
  message: string;
}

let recentBadScans: { ts: number }[] = [];

export function processScan(req: ScanRequest, io?: SocketIOServer | null): ScanResponse {
  const payload = (req.payload || '').substring(0, 200); // Truncate
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

  // Helper to write scan event
  function writeScanEvent(result: ScanResult, parcelId: string | null, reason?: string) {
    const id = `scan-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    run(
      `INSERT INTO scan_events (id, parcel_id, raw_payload, source, result, reason, operator_id, device_id, decode_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, parcelId, payload, req.source, result, reason || null, req.operatorId || null, req.deviceId || null, req.decodeMs || null, now]
    );
  }

  // 1. Format check
  const verification = verifyLabelPayload(payload);
  if (!verification.valid && verification.reason === 'INVALID_FORMAT') {
    writeScanEvent('INVALID_FORMAT', null, 'Payload format not PF1.parcelId.mac10');
    return { result: 'INVALID_FORMAT', message: 'Invalid label format' };
  }

  // 2. MAC check
  if (!verification.valid && verification.reason === 'BAD_CHECKSUM') {
    // Track consecutive bad scans for fault detection
    const nowMs = Date.now();
    recentBadScans = recentBadScans.filter(s => nowMs - s.ts < 30000);
    recentBadScans.push({ ts: nowMs });

    if (recentBadScans.length >= 3) {
      // Log pipeline fault
      const faultId = `fault-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      run(
        "INSERT INTO pipeline_faults (id, type, detail, created_at) VALUES (?, 'BAD_SCAN', ?, ?)",
        [faultId, `3+ consecutive bad checksums in 30s`, now]
      );
      if (io) io.emit('fault:created', { id: faultId, type: 'BAD_SCAN', detail: '3+ consecutive bad checksums', created_at: now });
      recentBadScans = [];
    }

    writeScanEvent('BAD_CHECKSUM', verification.parcelId || null, 'HMAC verification failed');
    return { result: 'BAD_CHECKSUM', parcelId: verification.parcelId, message: 'Label checksum invalid — possible forgery or damage' };
  }

  const parcelId = verification.parcelId!;

  // 3. Lookup parcel
  const parcel = queryOne<{
    id: string; order_id: string; status: string; assigned_bin_id: string | null;
  }>("SELECT id, order_id, status, assigned_bin_id FROM parcels WHERE id = ?", [parcelId]);

  if (!parcel) {
    writeScanEvent('UNKNOWN_PARCEL', parcelId, 'No parcel found with this ID');
    return { result: 'UNKNOWN_PARCEL', parcelId, message: 'Unknown parcel — not in the system' };
  }

  // 4. Duplicate check
  const prevAccepted = queryOne<{ id: string }>(
    "SELECT id FROM scan_events WHERE parcel_id = ? AND result = 'ACCEPTED'",
    [parcelId]
  );
  if (prevAccepted) {
    writeScanEvent('DUPLICATE', parcelId, 'Already scanned and accepted');
    return {
      result: 'DUPLICATE', parcelId, orderId: parcel.order_id,
      state: parcel.status, message: 'Parcel already scanned — no state change'
    };
  }

  // 5. Pipeline gate (single parcel mode)
  if (isSingleParcelMode()) {
    const inFlight = queryOne<{ id: string }>(
      "SELECT id FROM parcels WHERE status IN ('SCANNED', 'AT_PICK_POINT', 'SORTING') AND id != ? LIMIT 1",
      [parcelId]
    );
    if (inFlight) {
      writeScanEvent('BUSY', parcelId, `Pipeline busy — ${inFlight.id} in flight`);
      return { result: 'BUSY', parcelId, orderId: parcel.order_id, message: 'Pipeline busy — wait for current parcel to complete' };
    }
  }

  // 6. State check
  const order = queryOne<{ status: string }>("SELECT status FROM orders WHERE id = ?", [parcel.order_id]);
  if (!order) {
    writeScanEvent('WRONG_STATE', parcelId, 'Order not found');
    return { result: 'WRONG_STATE', parcelId, orderId: parcel.order_id, message: 'Order not found' };
  }

  const validStates = ['ON_CONVEYOR', 'PACKED'];
  if (!validStates.includes(order.status)) {
    writeScanEvent('WRONG_STATE', parcelId, `Order status ${order.status} not in [ON_CONVEYOR, PACKED]`);
    return {
      result: 'WRONG_STATE', parcelId, orderId: parcel.order_id,
      state: order.status, message: `Order is ${order.status} — expected ON_CONVEYOR or PACKED`
    };
  }

  // 7. Resolve bin
  let binInfo = parcel.assigned_bin_id
    ? queryOne<{ id: string; bin_number: number; label: string; category_name: string }>(
        `SELECT b.id, b.bin_number, b.label, COALESCE(c.name, 'Overflow') as category_name
         FROM bins b LEFT JOIN categories c ON b.category_id = c.id WHERE b.id = ?`,
        [parcel.assigned_bin_id]
      )
    : null;

  if (!binInfo) {
    const routing = resolveRoutingBin(parcel.order_id);
    if (routing) {
      binInfo = { id: routing.binId, bin_number: routing.binNumber, label: routing.binLabel, category_name: routing.categoryName };
      run("UPDATE parcels SET assigned_bin_id = ? WHERE id = ?", [routing.binId, parcelId]);
      run("UPDATE orders SET assigned_bin_id = ? WHERE id = ?", [routing.binId, parcel.order_id]);
    }
  }

  if (!binInfo) {
    // No bin available — check for overflow
    const overflowBin = queryOne<{ id: string }>(
      "SELECT id FROM bins WHERE is_overflow = 1 AND is_active = 1 LIMIT 1"
    );
    if (!overflowBin) {
      writeScanEvent('REJECTED', parcelId, 'No active bin for category and no overflow bin');
      const faultId = `fault-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      run(
        "INSERT INTO pipeline_faults (id, type, parcel_id, detail, created_at) VALUES (?, 'SCAN_TIMEOUT', ?, ?, ?)",
        [faultId, parcelId, 'No bin available — all bins inactive', now]
      );
      return { result: 'REJECTED', parcelId, orderId: parcel.order_id, message: 'No bin available for this category' };
    }
  }

  // 8. SUCCESS — all checks passed
  return transaction(() => {
    // Auto-transition through ON_CONVEYOR if still PACKED
    if (order.status === 'PACKED') {
      transitionOrderStatus(parcel.order_id, 'ON_CONVEYOR', 'Auto-transitioned from PACKED during scan', io, true);
    }

    // Update parcel
    run(
      "UPDATE parcels SET status = 'SCANNED', scanned_at = ?, updated_at = ? WHERE id = ?",
      [now, now, parcelId]
    );

    // Transition order to SCANNED
    transitionOrderStatus(parcel.order_id, 'SCANNED', `QR scanned (${req.source})`, io, true);

    // Create SORT_TO_BIN command (QUEUED — not yet released to arm)
    if (binInfo) {
      const cmdId = crypto.randomUUID();
      const binData = queryOne<{ servo_preset_json: string }>(
        "SELECT servo_preset_json FROM bins WHERE id = ?", [binInfo.id]
      );
      const payloadJson = JSON.stringify({
        parcelId, binNumber: binInfo.bin_number, binLabel: binInfo.label,
        servoPreset: binData ? JSON.parse(binData.servo_preset_json) : {}
      });
      const expiresAt = new Date(Date.now() + getConfig().ARM_COMPLETE_TIMEOUT_MS + 30000).toISOString();

      run(
        `INSERT INTO hardware_commands (id, device_id, type, parcel_id, bin_id, payload_json, status, idempotency_key, expires_at, created_at, updated_at)
         VALUES (?, 'arm-esp32', 'SORT_TO_BIN', ?, ?, ?, 'QUEUED', ?, ?, ?, ?)`,
        [cmdId, parcelId, binInfo.id, payloadJson, `sort-${parcelId}`, expiresAt, now, now]
      );
    }

    // Set conveyor desired = RUN (resume after scan)
    run("UPDATE pipeline_state SET value = 'RUN', updated_at = ? WHERE key = 'conveyor_desired'", [now]);
    run("UPDATE pipeline_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = ? WHERE key = 'conveyor_revision'", [now]);

    writeScanEvent('ACCEPTED', parcelId);
    recentBadScans = []; // Reset bad scan counter

    // Emit socket events
    if (io) {
      io.emit('scan:result', {
        result: 'ACCEPTED', parcelId, orderId: parcel.order_id,
        bin: binInfo ? { number: binInfo.bin_number, label: binInfo.label } : null,
        source: req.source, timestamp: now
      });
      io.emit('conveyor:desired', { state: 'RUN' });
    }

    return {
      result: 'ACCEPTED' as ScanResult,
      parcelId,
      orderId: parcel.order_id,
      bin: binInfo ? { number: binInfo.bin_number, label: binInfo.label, category: binInfo.category_name } : null,
      state: 'SCANNED',
      message: `Parcel accepted — route to ${binInfo?.label || 'unknown bin'}`
    };
  });
}

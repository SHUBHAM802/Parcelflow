import crypto from 'crypto';
import { query, queryOne, run, transaction } from '../db';
import { getConfig, isSingleParcelMode } from '../config';
import { verifyLabelPayload, resolveRoutingBin } from './labelService';
import { transitionOrderStatus } from '../orderStateMachine';
import { clearScanTimeoutTimer } from './hardwareService';
import { Server as SocketIOServer } from 'socket.io';

export type ScanResult =
  | 'ACCEPTED'
  | 'DUPLICATE'
  | 'INVALID_FORMAT'
  | 'BAD_CHECKSUM'
  | 'UNKNOWN_PARCEL'
  | 'WRONG_STATE'
  | 'BUSY'
  | 'DISPOSABLE_FALLBACK'
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
  bin?: { number: number; label: string; category?: string; routeCode?: string };
  state?: string;
  message: string;
}

let recentBadScans: { ts: number }[] = [];

export function processScan(req: ScanRequest, io?: SocketIOServer | null): ScanResponse {
  const payload = (req.payload || '').trim().substring(0, 200); // Truncate
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

  // 1. Verification of label or route card payload
  const verification = verifyLabelPayload(payload);

  // Disposable fallback helper
  const handleDisposableFallback = (reason: string, extraNote?: string): ScanResponse => {
    return transaction(() => {
      // Find fallback bin (Bin 7)
      const fallbackBin = queryOne<{ id: string; bin_number: number; label: string; servo_preset_json: string }>(
        "SELECT id, bin_number, label, servo_preset_json FROM bins WHERE (is_disposable_fallback = 1 OR is_overflow = 1) AND is_active = 1 ORDER BY is_disposable_fallback DESC LIMIT 1"
      );

      // Check if there is an in-flight parcel or active conveyor order
      const activeOrder = queryOne<{ id: string; status: string }>(
        "SELECT id, status FROM orders WHERE status IN ('ON_CONVEYOR', 'IR1_DETECTED', 'SCANNING', 'PACKED') ORDER BY updated_at DESC LIMIT 1"
      );

      let parcelId: string | null = null;
      let orderId: string | null = null;

      if (activeOrder) {
        orderId = activeOrder.id;
        const p = queryOne<{ id: string }>("SELECT id FROM parcels WHERE order_id = ?", [orderId]);
        if (p) {
          parcelId = p.id;
        } else {
          parcelId = `PF-FALLBACK-${Date.now().toString().slice(-6)}`;
          run(
            `INSERT INTO parcels (id, order_id, label_version, label_payload, status, assigned_bin_id, created_at, updated_at)
             VALUES (?, ?, 1, ?, 'SCANNED', ?, ?, ?)`,
            [parcelId, orderId, payload, fallbackBin?.id || null, now, now]
          );
        }

        // Transition order state to DISPOSED
        transitionOrderStatus(orderId, 'DISPOSED', `Routed to disposable fallback: ${reason}`, io, true);
        run("UPDATE parcels SET status = 'SCANNED', assigned_bin_id = ?, scanned_at = ?, updated_at = ? WHERE id = ?", [fallbackBin?.id || null, now, now, parcelId]);
      }

      // Create hardware command for arm to sort into Disposable Fallback Bin
      if (fallbackBin) {
        const cmdId = crypto.randomUUID();
        const payloadJson = JSON.stringify({
          parcelId,
          binNumber: fallbackBin.bin_number,
          binLabel: fallbackBin.label,
          isDisposable: true,
          servoPreset: JSON.parse(fallbackBin.servo_preset_json || '{}')
        });
        const expiresAt = new Date(Date.now() + getConfig().ARM_COMPLETE_TIMEOUT_MS + 30000).toISOString();

        run(
          `INSERT INTO hardware_commands (id, device_id, type, parcel_id, bin_id, payload_json, status, idempotency_key, expires_at, created_at, updated_at)
           VALUES (?, 'arm-esp32', 'SORT_TO_BIN', ?, ?, ?, 'QUEUED', ?, ?, ?, ?)`,
          [cmdId, parcelId, fallbackBin.id, payloadJson, `sort-fallback-${Date.now()}`, expiresAt, now, now]
        );
      }

      // Resume conveyor to move parcel to pick point
      run("UPDATE pipeline_state SET value = 'RUN', updated_at = ? WHERE key = 'conveyor_desired'", [now]);
      run("UPDATE pipeline_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = ? WHERE key = 'conveyor_revision'", [now]);

      writeScanEvent('DISPOSABLE_FALLBACK', parcelId, `${reason}: ${extraNote || ''}`);
      clearScanTimeoutTimer();

      if (io) {
        io.emit('scan:result', {
          result: 'DISPOSABLE_FALLBACK',
          parcelId,
          orderId,
          bin: fallbackBin ? { number: fallbackBin.bin_number, label: fallbackBin.label } : null,
          source: req.source,
          timestamp: now
        });
        io.emit('conveyor:desired', { state: 'RUN' });
      }

      return {
        result: 'DISPOSABLE_FALLBACK',
        parcelId: parcelId || undefined,
        orderId: orderId || undefined,
        bin: fallbackBin ? { number: fallbackBin.bin_number, label: fallbackBin.label, category: 'Disposable Fallback' } : undefined,
        state: 'DISPOSED',
        message: `Unrecognized or invalid QR code — safely routing to ${fallbackBin?.label || 'Disposable Bin 7'}`
      };
    });
  };

  // 2. Handle Invalid Format
  if (!verification.valid && verification.reason === 'INVALID_FORMAT') {
    writeScanEvent('INVALID_FORMAT', null, 'Payload format invalid');
    return { result: 'INVALID_FORMAT', message: 'Invalid label format' };
  }

  // 3. Handle Bad Checksum (Signature Failure)
  if (!verification.valid && verification.reason === 'BAD_CHECKSUM') {
    const nowMs = Date.now();
    recentBadScans = recentBadScans.filter(s => nowMs - s.ts < 30000);
    recentBadScans.push({ ts: nowMs });

    if (recentBadScans.length >= 3) {
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

  // 4. Case: ROUTE Profile Card Scanned (e.g. PF1.ROUTE.DEL.<mac>)
  if (verification.type === 'ROUTE') {
    const routeCode = verification.routeCode!;
    const routeProfile = queryOne<{ id: string; code: string; name: string; target_bin_id: string }>(
      "SELECT id, code, name, target_bin_id FROM qr_route_profiles WHERE UPPER(code) = ? AND is_active = 1 LIMIT 1",
      [routeCode]
    );

    if (!routeProfile) {
      return handleDisposableFallback('UNKNOWN_ROUTE', `Route profile code ${routeCode} not found`);
    }

    const targetBin = queryOne<{ id: string; bin_number: number; label: string; servo_preset_json: string }>(
      "SELECT id, bin_number, label, servo_preset_json FROM bins WHERE id = ? AND is_active = 1",
      [routeProfile.target_bin_id]
    );

    return transaction(() => {
      // Find active order on conveyor or pick the latest packed order
      const activeOrder = queryOne<{ id: string; status: string }>(
        "SELECT id, status FROM orders WHERE status IN ('ON_CONVEYOR', 'IR1_DETECTED', 'SCANNING', 'PACKED') ORDER BY updated_at DESC LIMIT 1"
      );

      let parcelId: string;
      let orderId: string | undefined;

      if (activeOrder) {
        orderId = activeOrder.id;
        const existingParcel = queryOne<{ id: string }>("SELECT id FROM parcels WHERE order_id = ?", [orderId]);
        if (existingParcel) {
          parcelId = existingParcel.id;
        } else {
          parcelId = `PF-ROUTE-${routeCode}-${Date.now().toString().slice(-6)}`;
          run(
            `INSERT INTO parcels (id, order_id, label_version, label_payload, status, assigned_bin_id, created_at, updated_at)
             VALUES (?, ?, 1, ?, 'SCANNED', ?, ?, ?)`,
            [parcelId, orderId, payload, targetBin?.id || null, now, now]
          );
        }

        run("UPDATE orders SET assigned_bin_id = ? WHERE id = ?", [targetBin?.id || null, orderId]);
        run("UPDATE parcels SET status = 'SCANNED', assigned_bin_id = ?, scanned_at = ?, updated_at = ? WHERE id = ?", [targetBin?.id || null, now, now, parcelId]);

        // Status sequence: ROUTE_IDENTIFIED -> SCANNED
        transitionOrderStatus(orderId, 'ROUTE_IDENTIFIED', `Identified Route Profile: ${routeProfile.name} (${routeCode})`, io, true);
        transitionOrderStatus(orderId, 'SCANNED', `QR scanned (${req.source})`, io, true);
      } else {
        // Physical demonstration session without prior web order
        parcelId = `PF-DEMO-${routeCode}-${Date.now().toString().slice(-6)}`;
      }

      // Create hardware command for robotic arm
      if (targetBin) {
        const cmdId = crypto.randomUUID();
        const payloadJson = JSON.stringify({
          parcelId,
          routeCode,
          binNumber: targetBin.bin_number,
          binLabel: targetBin.label,
          servoPreset: JSON.parse(targetBin.servo_preset_json || '{}')
        });
        const expiresAt = new Date(Date.now() + getConfig().ARM_COMPLETE_TIMEOUT_MS + 30000).toISOString();

        run(
          `INSERT INTO hardware_commands (id, device_id, type, parcel_id, bin_id, payload_json, status, idempotency_key, expires_at, created_at, updated_at)
           VALUES (?, 'arm-esp32', 'SORT_TO_BIN', ?, ?, ?, 'QUEUED', ?, ?, ?, ?)`,
          [cmdId, parcelId, targetBin.id, payloadJson, `sort-${parcelId}-${Date.now()}`, expiresAt, now, now]
        );
      }

      // Resume conveyor
      run("UPDATE pipeline_state SET value = 'RUN', updated_at = ? WHERE key = 'conveyor_desired'", [now]);
      run("UPDATE pipeline_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = ? WHERE key = 'conveyor_revision'", [now]);

      writeScanEvent('ACCEPTED', parcelId, `Route card: ${routeProfile.name}`);
      clearScanTimeoutTimer();
      recentBadScans = [];

      if (io) {
        io.emit('scan:result', {
          result: 'ACCEPTED',
          parcelId,
          orderId,
          bin: targetBin ? { number: targetBin.bin_number, label: targetBin.label, routeCode } : null,
          source: req.source,
          timestamp: now
        });
        io.emit('conveyor:desired', { state: 'RUN' });
      }

      return {
        result: 'ACCEPTED' as ScanResult,
        parcelId,
        orderId,
        bin: targetBin ? { number: targetBin.bin_number, label: targetBin.label, routeCode } : undefined,
        state: 'SCANNED',
        message: `Route profile ${routeCode} (${routeProfile.name}) accepted -> ${targetBin?.label || 'Assigned Bin'}`
      };
    });
  }

  // 5. Case: Standard or Route-Tagged Parcel
  const parcelId = verification.parcelId!;

  // Lookup parcel
  const parcel = queryOne<{
    id: string; order_id: string; status: string; assigned_bin_id: string | null;
  }>("SELECT id, order_id, status, assigned_bin_id FROM parcels WHERE id = ?", [parcelId]);

  if (!parcel) {
    writeScanEvent('UNKNOWN_PARCEL', parcelId, 'No parcel found with this ID');
    return { result: 'UNKNOWN_PARCEL', parcelId, message: 'Unknown parcel — not in the system' };
  }

  // Duplicate check
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

  // Pipeline gate (single parcel mode)
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

  // State check
  const order = queryOne<{ status: string; destination_city: string }>("SELECT status, destination_city FROM orders WHERE id = ?", [parcel.order_id]);
  if (!order) {
    writeScanEvent('WRONG_STATE', parcelId, 'Order not found');
    return { result: 'WRONG_STATE', parcelId, orderId: parcel.order_id, message: 'Order not found' };
  }

  const validStates = ['ON_CONVEYOR', 'IR1_DETECTED', 'SCANNING', 'PACKED'];
  if (!validStates.includes(order.status)) {
    writeScanEvent('WRONG_STATE', parcelId, `Order status ${order.status} not in valid states`);
    return {
      result: 'WRONG_STATE', parcelId, orderId: parcel.order_id,
      state: order.status, message: `Order is ${order.status} — expected ON_CONVEYOR or PACKED`
    };
  }

  // Resolve target bin
  let binInfo = parcel.assigned_bin_id
    ? queryOne<{ id: string; bin_number: number; label: string; category_name: string }>(
        `SELECT b.id, b.bin_number, b.label, COALESCE(c.name, 'Express Route') as category_name
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
    return handleDisposableFallback('NO_BIN', 'No active destination bin configured');
  }

  // SUCCESS
  return transaction(() => {
    if (order.status === 'PACKED') {
      transitionOrderStatus(parcel.order_id, 'ON_CONVEYOR', 'Auto-transitioned from PACKED during infeed', io, true);
    }

    // Status sequence: ROUTE_IDENTIFIED -> SCANNED
    transitionOrderStatus(parcel.order_id, 'ROUTE_IDENTIFIED', `Destination: ${order.destination_city || binInfo.label}`, io, true);
    transitionOrderStatus(parcel.order_id, 'SCANNED', `QR scanned (${req.source})`, io, true);

    // Update parcel
    run("UPDATE parcels SET status = 'SCANNED', scanned_at = ?, updated_at = ? WHERE id = ?", [now, now, parcelId]);

    // Create hardware command for arm
    const cmdId = crypto.randomUUID();
    const binData = queryOne<{ servo_preset_json: string }>("SELECT servo_preset_json FROM bins WHERE id = ?", [binInfo.id]);
    const payloadJson = JSON.stringify({
      parcelId,
      binNumber: binInfo.bin_number,
      binLabel: binInfo.label,
      servoPreset: binData ? JSON.parse(binData.servo_preset_json) : {}
    });
    const expiresAt = new Date(Date.now() + getConfig().ARM_COMPLETE_TIMEOUT_MS + 30000).toISOString();

    run(
      `INSERT INTO hardware_commands (id, device_id, type, parcel_id, bin_id, payload_json, status, idempotency_key, expires_at, created_at, updated_at)
       VALUES (?, 'arm-esp32', 'SORT_TO_BIN', ?, ?, ?, 'QUEUED', ?, ?, ?, ?)`,
      [cmdId, parcelId, binInfo.id, payloadJson, `sort-${parcelId}`, expiresAt, now, now]
    );

    // Set conveyor desired = RUN
    run("UPDATE pipeline_state SET value = 'RUN', updated_at = ? WHERE key = 'conveyor_desired'", [now]);
    run("UPDATE pipeline_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = ? WHERE key = 'conveyor_revision'", [now]);

    writeScanEvent('ACCEPTED', parcelId);
    clearScanTimeoutTimer();
    recentBadScans = [];

    if (io) {
      io.emit('scan:result', {
        result: 'ACCEPTED',
        parcelId,
        orderId: parcel.order_id,
        bin: { number: binInfo.bin_number, label: binInfo.label },
        source: req.source,
        timestamp: now
      });
      io.emit('conveyor:desired', { state: 'RUN' });
    }

    return {
      result: 'ACCEPTED' as ScanResult,
      parcelId,
      orderId: parcel.order_id,
      bin: { number: binInfo.bin_number, label: binInfo.label, category: binInfo.category_name },
      state: 'SCANNED',
      message: `Parcel accepted — route to ${binInfo.label}`
    };
  });
}

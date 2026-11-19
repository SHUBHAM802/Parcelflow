import crypto from 'crypto';
import { query, queryOne, run, transaction } from '../db';
import { getConfig } from '../config';

// ────────────────────────────────────────────────────────────
// Parcel ID generation: PF-YYMMDD-NNNN (NNNN resets daily)
// ────────────────────────────────────────────────────────────
function generateParcelId(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const datePrefix = `PF-${yy}${mm}${dd}`;

  // Count existing parcels with today's prefix
  const count = queryOne<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM parcels WHERE id LIKE ?",
    [`${datePrefix}-%`]
  );
  const seq = (count?.cnt || 0) + 1;
  return `${datePrefix}-${String(seq).padStart(4, '0')}`;
}

// ────────────────────────────────────────────────────────────
// Label payload: PF1.<parcelId>.<mac10> or PF1.ROUTE.<code10>
// ────────────────────────────────────────────────────────────
export function computeMac(data: string): string {
  const secret = getConfig().LABEL_SECRET;
  return crypto.createHmac('sha256', secret).update(data).digest('hex').substring(0, 10);
}

export function generateRouteQrPayload(routeCode: string): string {
  const code = routeCode.toUpperCase();
  const prefix = `PF1.ROUTE.${code}`;
  const mac = computeMac(prefix);
  return `${prefix}.${mac}`;
}

export function generateLabelPayload(parcelId: string, routeCode?: string): string {
  if (routeCode) {
    const code = routeCode.toUpperCase();
    const prefix = `PF1.${parcelId}.${code}`;
    const mac = computeMac(prefix);
    return `${prefix}.${mac}`;
  }
  const prefix = `PF1.${parcelId}`;
  const mac = computeMac(prefix);
  return `${prefix}.${mac}`;
}

export interface LabelVerificationResult {
  valid: boolean;
  type?: 'PARCEL' | 'ROUTE';
  parcelId?: string;
  routeCode?: string;
  reason?: 'INVALID_FORMAT' | 'BAD_CHECKSUM';
  isFallback?: boolean;
}

export function verifyLabelPayload(payload: string): LabelVerificationResult {
  if (!payload || typeof payload !== 'string') {
    return { valid: false, reason: 'INVALID_FORMAT', isFallback: true };
  }

  const parts = payload.trim().split('.');
  if (parts.length < 3 || parts[0] !== 'PF1') {
    return { valid: false, reason: 'INVALID_FORMAT', isFallback: true };
  }

  // Case 1: Route Profile QR Card -> PF1.ROUTE.<routeCode>.<mac10>
  if (parts.length === 4 && parts[1] === 'ROUTE') {
    const routeCode = parts[2].toUpperCase();
    const providedMac = parts[3];
    if (!routeCode || !providedMac || providedMac.length !== 10) {
      return { valid: false, reason: 'INVALID_FORMAT', isFallback: true };
    }
    const expectedMac = computeMac(`PF1.ROUTE.${routeCode}`);
    const a = Buffer.from(providedMac);
    const b = Buffer.from(expectedMac);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { valid: false, routeCode, reason: 'BAD_CHECKSUM', isFallback: true };
    }
    return { valid: true, type: 'ROUTE', routeCode };
  }

  // Case 2: Parcel with Route Code -> PF1.<parcelId>.<routeCode>.<mac10>
  if (parts.length === 4) {
    const parcelId = parts[1];
    const routeCode = parts[2].toUpperCase();
    const providedMac = parts[3];
    if (!parcelId || !routeCode || !providedMac || providedMac.length !== 10) {
      return { valid: false, reason: 'INVALID_FORMAT', isFallback: true };
    }
    const expectedMac = computeMac(`PF1.${parcelId}.${routeCode}`);
    const a = Buffer.from(providedMac);
    const b = Buffer.from(expectedMac);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { valid: false, parcelId, routeCode, reason: 'BAD_CHECKSUM', isFallback: true };
    }
    return { valid: true, type: 'PARCEL', parcelId, routeCode };
  }

  // Case 3: Standard Parcel -> PF1.<parcelId>.<mac10>
  if (parts.length === 3) {
    const parcelId = parts[1];
    const providedMac = parts[2];
    if (!parcelId || !providedMac || providedMac.length !== 10) {
      return { valid: false, reason: 'INVALID_FORMAT', isFallback: true };
    }
    const expectedMac = computeMac(`PF1.${parcelId}`);
    const a = Buffer.from(providedMac);
    const b = Buffer.from(expectedMac);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { valid: false, parcelId, reason: 'BAD_CHECKSUM', isFallback: true };
    }
    return { valid: true, type: 'PARCEL', parcelId };
  }

  return { valid: false, reason: 'INVALID_FORMAT', isFallback: true };
}

// ────────────────────────────────────────────────────────────
// Bin routing: resolve bin from destination route profile or category
// ────────────────────────────────────────────────────────────

export function resolveRoutingBin(orderId: string): {
  binId: string;
  binNumber: number;
  binLabel: string;
  categoryName: string;
  routeCode?: string;
  routeName?: string;
} | null {
  // 1. Item category-based matching (preserves catalog routing & test assertions)
  const item = queryOne<{ category_id: string; category_name: string }>(
    `SELECT p.category_id, c.name as category_name
     FROM order_items oi
     JOIN products p ON oi.product_id = p.id
     JOIN categories c ON p.category_id = c.id
     WHERE oi.order_id = ?
     ORDER BY oi.unit_price DESC
     LIMIT 1`,
    [orderId]
  );

  if (item) {
    let bin = queryOne<{ id: string; bin_number: number; label: string }>(
      "SELECT id, bin_number, label FROM bins WHERE category_id = ? AND is_active = 1",
      [item.category_id]
    );
    if (!bin) {
      bin = queryOne<{ id: string; bin_number: number; label: string }>(
        "SELECT id, bin_number, label FROM bins WHERE is_overflow = 1 AND is_active = 1 ORDER BY bin_number ASC LIMIT 1"
      );
    }
    if (bin) {
      return {
        binId: bin.id,
        binNumber: bin.bin_number,
        binLabel: bin.label,
        categoryName: item.category_name
      };
    }
  }

  // 2. Destination-based route profile matching (Delhi, Maharashtra, Pune, HUB4, HUB5, HUB6)
  const order = queryOne<{ destination_city: string }>("SELECT destination_city FROM orders WHERE id = ?", [orderId]);
  if (order?.destination_city) {
    const city = order.destination_city.trim().toLowerCase();
    const route = queryOne<{ id: string; code: string; name: string; target_bin_id: string }>(
      `SELECT id, code, name, target_bin_id FROM qr_route_profiles 
       WHERE is_active = 1 AND (LOWER(city) = ? OR LOWER(name) LIKE ? OR LOWER(code) = ?) LIMIT 1`,
      [city, `%${city}%`, city]
    );

    if (route) {
      const bin = queryOne<{ id: string; bin_number: number; label: string }>(
        "SELECT id, bin_number, label FROM bins WHERE id = ? AND is_active = 1",
        [route.target_bin_id]
      );
      if (bin) {
        return {
          binId: bin.id,
          binNumber: bin.bin_number,
          binLabel: bin.label,
          categoryName: route.name,
          routeCode: route.code,
          routeName: route.name
        };
      }
    }
  }

  // 3. Fallback to Disposable Fallback Bin (Bin 7) or Overflow Bin (Bin 4)
  const fallbackBin = queryOne<{ id: string; bin_number: number; label: string }>(
    "SELECT id, bin_number, label FROM bins WHERE (is_disposable_fallback = 1 OR is_overflow = 1) AND is_active = 1 ORDER BY is_disposable_fallback DESC LIMIT 1"
  );

  if (!fallbackBin) return null;

  return {
    binId: fallbackBin.id,
    binNumber: fallbackBin.bin_number,
    binLabel: fallbackBin.label,
    categoryName: 'Fallback Reject'
  };
}

// ────────────────────────────────────────────────────────────
// Label creation (idempotent)
// ────────────────────────────────────────────────────────────
export interface LabelResult {
  parcel: {
    id: string;
    order_id: string;
    label_payload: string;
    status: string;
    label_print_count: number;
    assigned_bin_id: string | null;
  };
  labelPayload: string;
  bin: { number: number; label: string; category: string } | null;
  isNew: boolean;
}

export function createOrGetLabel(orderId: string): LabelResult {
  // Check if parcel already exists for this order
  const existing = queryOne<{
    id: string; order_id: string; label_payload: string; status: string;
    label_print_count: number; assigned_bin_id: string | null;
  }>("SELECT * FROM parcels WHERE order_id = ?", [orderId]);

  if (existing) {
    const bin = existing.assigned_bin_id
      ? queryOne<{ bin_number: number; label: string; category_name: string }>(
          `SELECT b.bin_number, b.label, COALESCE(c.name, 'Overflow') as category_name
           FROM bins b LEFT JOIN categories c ON b.category_id = c.id
           WHERE b.id = ?`,
          [existing.assigned_bin_id]
        )
      : null;

    return {
      parcel: existing,
      labelPayload: existing.label_payload,
      bin: bin ? { number: bin.bin_number, label: bin.label, category: bin.category_name } : null,
      isNew: false
    };
  }

  // Create new parcel
  return transaction(() => {
    const parcelId = generateParcelId();
    const routing = resolveRoutingBin(orderId);
    const labelPayload = generateLabelPayload(parcelId, routing?.routeCode);
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    run(
      `INSERT INTO parcels (id, order_id, label_version, label_payload, label_print_count,
       status, assigned_bin_id, created_at, updated_at)
       VALUES (?, ?, 1, ?, 0, 'LABELED', ?, ?, ?)`,
      [parcelId, orderId, labelPayload, routing?.binId || null, now, now]
    );

    // Update order with bin assignment
    if (routing) {
      run("UPDATE orders SET assigned_bin_id = ? WHERE id = ?", [routing.binId, orderId]);
    }

    const parcel = {
      id: parcelId,
      order_id: orderId,
      label_payload: labelPayload,
      status: 'LABELED',
      label_print_count: 0,
      assigned_bin_id: routing?.binId || null
    };

    return {
      parcel,
      labelPayload,
      bin: routing ? { number: routing.binNumber, label: routing.binLabel, category: routing.categoryName } : null,
      isNew: true
    };
  });
}

export function recordLabelPrinted(parcelId: string, reason?: string): void {
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const parcel = queryOne<{ label_print_count: number; first_printed_at: string | null }>(
    "SELECT label_print_count, first_printed_at FROM parcels WHERE id = ?",
    [parcelId]
  );

  if (!parcel) throw new Error(`Parcel ${parcelId} not found`);

  const updates: string[] = [
    "label_print_count = label_print_count + 1",
    `last_printed_at = '${now}'`,
    `updated_at = '${now}'`
  ];

  if (!parcel.first_printed_at) {
    updates.push(`first_printed_at = '${now}'`);
  }

  run(`UPDATE parcels SET ${updates.join(', ')} WHERE id = ?`, [parcelId]);
}

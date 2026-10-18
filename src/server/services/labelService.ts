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
// Label payload: PF1.<parcelId>.<mac10>
// ────────────────────────────────────────────────────────────
function computeMac(parcelId: string): string {
  const secret = getConfig().LABEL_SECRET;
  const data = `PF1.${parcelId}`;
  return crypto.createHmac('sha256', secret).update(data).digest('hex').substring(0, 10);
}

export function generateLabelPayload(parcelId: string): string {
  const mac = computeMac(parcelId);
  return `PF1.${parcelId}.${mac}`;
}

export function verifyLabelPayload(payload: string): { valid: boolean; parcelId?: string; reason?: string } {
  // Format: PF1.<parcelId>.<mac10>
  if (!payload || typeof payload !== 'string') {
    return { valid: false, reason: 'INVALID_FORMAT' };
  }

  const parts = payload.split('.');
  if (parts.length !== 3 || parts[0] !== 'PF1') {
    return { valid: false, reason: 'INVALID_FORMAT' };
  }

  const parcelId = parts[1];
  const providedMac = parts[2];

  if (!parcelId || !providedMac || providedMac.length !== 10) {
    return { valid: false, reason: 'INVALID_FORMAT' };
  }

  // Constant-time MAC comparison
  const expectedMac = computeMac(parcelId);
  const a = Buffer.from(providedMac);
  const b = Buffer.from(expectedMac);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, parcelId, reason: 'BAD_CHECKSUM' };
  }

  return { valid: true, parcelId };
}

// ────────────────────────────────────────────────────────────
// Bin routing: resolve bin from product category
// ────────────────────────────────────────────────────────────

/**
 * Routing rule for mixed-category orders:
 * Use the category of the FIRST item (highest unit_price if tied).
 * This matches the single-parcel-per-order prototype constraint.
 */
export function resolveRoutingBin(orderId: string): { binId: string; binNumber: number; binLabel: string; categoryName: string } | null {
  // Get the first item's category (by highest unit_price as tiebreaker)
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

  if (!item) return null;

  // Find active bin for this category
  let bin = queryOne<{ id: string; bin_number: number; label: string }>(
    "SELECT id, bin_number, label FROM bins WHERE category_id = ? AND is_active = 1",
    [item.category_id]
  );

  // Fallback to overflow bin
  if (!bin) {
    bin = queryOne<{ id: string; bin_number: number; label: string }>(
      "SELECT id, bin_number, label FROM bins WHERE is_overflow = 1 AND is_active = 1 LIMIT 1"
    );
  }

  if (!bin) return null;

  return {
    binId: bin.id,
    binNumber: bin.bin_number,
    binLabel: bin.label,
    categoryName: item.category_name
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
    const labelPayload = generateLabelPayload(parcelId);
    const routing = resolveRoutingBin(orderId);
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

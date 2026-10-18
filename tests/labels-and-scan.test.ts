import { describe, it, expect, beforeAll } from 'vitest';
import { getDb, queryOne, run, query } from '../src/server/db';
import { loadConfig } from '../src/server/config';
import { generateLabelPayload, verifyLabelPayload, createOrGetLabel, resolveRoutingBin } from '../src/server/services/labelService';
import { processScan } from '../src/server/services/scanService';

describe('Labels, Payload Verification & Optical Scan Pipeline', () => {
  beforeAll(async () => {
    loadConfig();
    await getDb();
  });

  describe('3.1 Symbology & Payload Verification', () => {
    it('generates authoritative PF1.<parcelId>.<mac10> payload format', () => {
      const parcelId = 'PF-261019-0001';
      const payload = generateLabelPayload(parcelId);

      expect(payload).toMatch(/^PF1\.PF-261019-0001\.[a-f0-9]{10}$/);
    });

    it('verifies untampered payload as valid', () => {
      const parcelId = 'PF-261019-0002';
      const payload = generateLabelPayload(parcelId);
      const res = verifyLabelPayload(payload);

      expect(res.valid).toBe(true);
      expect(res.parcelId).toBe(parcelId);
    });

    it('rejects tampered MAC checksum with BAD_CHECKSUM', () => {
      const parcelId = 'PF-261019-0003';
      const payload = generateLabelPayload(parcelId);
      // Alter one character in the HMAC
      const tampered = payload.slice(0, -1) + (payload.slice(-1) === 'a' ? 'b' : 'a');
      const res = verifyLabelPayload(tampered);

      expect(res.valid).toBe(false);
      expect(res.reason).toBe('BAD_CHECKSUM');
    });

    it('rejects malformed string with INVALID_FORMAT', () => {
      expect(verifyLabelPayload('INVALID-BARCODE-DATA').valid).toBe(false);
      expect(verifyLabelPayload('PF2.123.456').valid).toBe(false);
      expect(verifyLabelPayload('').valid).toBe(false);
    });
  });

  describe('3.2 Label Service Idempotency & Order Generation', () => {
    it('creates or retrieves consistent label payload for packed order', () => {
      // Find or insert a test packed order
      const testOrderId = `ORD-TEST-${Date.now()}`;
      const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

      run(`
        INSERT INTO orders (id, customer_id, total_amount, subtotal, gst_amount, status, payment_status, destination_city, created_at, updated_at)
        VALUES (?, 'usr-cust-demo', 1499, 1200, 299, 'PACKED', 'PAID', 'Mumbai', ?, ?)
      `, [testOrderId, now, now]);

      // Call createOrGetLabel first time
      const res1 = createOrGetLabel(testOrderId);
      expect(res1.parcel).toBeDefined();
      expect(res1.labelPayload).toMatch(/^PF1\./);

      // Call createOrGetLabel second time — must return exact same parcel and payload
      const res2 = createOrGetLabel(testOrderId);
      expect(res2.parcel.id).toBe(res1.parcel.id);
      expect(res2.labelPayload).toBe(res1.labelPayload);
      expect(res2.isNew).toBe(false);
    });
  });

  describe('4.1 Optical Scan Service Outcomes', () => {
    it('returns INVALID_FORMAT for garbage payload', () => {
      const res = processScan({
        payload: 'GARBAGE_PAYLOAD_STRING',
        source: 'browser_camera'
      });

      expect(res.result).toBe('INVALID_FORMAT');
    });

    it('returns BAD_CHECKSUM for forged MAC payload', () => {
      const res = processScan({
        payload: 'PF1.PF-261019-9999.0123456789',
        source: 'browser_camera'
      });

      expect(res.result).toBe('BAD_CHECKSUM');
    });

    it('returns UNKNOWN_PARCEL when payload is validly signed but not in database', () => {
      const phantomPayload = generateLabelPayload('PF-999999-9999');
      const res = processScan({
        payload: phantomPayload,
        source: 'browser_camera'
      });

      expect(res.result).toBe('UNKNOWN_PARCEL');
    });

    it('accepts valid parcel and returns DUPLICATE on second scan', () => {
      run("UPDATE parcels SET status = 'DONE_TEST' WHERE status IN ('SCANNED', 'AT_PICK_POINT', 'SORTING')");
      const testOrderId = `ORD-SCAN-${Date.now()}`;
      const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

      run(`
        INSERT INTO orders (id, customer_id, total_amount, subtotal, gst_amount, status, payment_status, destination_city, created_at, updated_at)
        VALUES (?, 'usr-cust-demo', 2999, 2500, 499, 'ON_CONVEYOR', 'PAID', 'Pune', ?, ?)
      `, [testOrderId, now, now]);

      const prod = queryOne<{ id: string }>("SELECT id FROM products LIMIT 1");
      if (prod) {
        run(`INSERT INTO order_items (id, order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, 1, 2500)`,
          [`item-${testOrderId}`, testOrderId, prod.id]
        );
      }

      const label = createOrGetLabel(testOrderId);

      // First scan: should be ACCEPTED
      const scan1 = processScan({
        payload: label.labelPayload,
        source: 'browser_camera',
        decodeMs: 42
      });

      expect(scan1.result).toBe('ACCEPTED');
      expect(scan1.parcelId).toBe(label.parcel.id);
      expect(scan1.state).toBe('SCANNED');

      // Second scan of same parcel: should return DUPLICATE
      const scan2 = processScan({
        payload: label.labelPayload,
        source: 'browser_camera'
      });

      expect(scan2.result).toBe('DUPLICATE');
      expect(scan2.parcelId).toBe(label.parcel.id);
    });
  });

  describe('2.1 Category-Based Destination Bin Routing', () => {
    it('maps all 4 bins correctly: Bin1 Electronics, Bin2 Fashion, Bin3 Books, Bin4 Overflow', () => {
      const bin1 = queryOne<{ category_id: string; is_overflow: number }>("SELECT category_id, is_overflow FROM bins WHERE bin_number = 1");
      const bin2 = queryOne<{ category_id: string; is_overflow: number }>("SELECT category_id, is_overflow FROM bins WHERE bin_number = 2");
      const bin3 = queryOne<{ category_id: string; is_overflow: number }>("SELECT category_id, is_overflow FROM bins WHERE bin_number = 3");
      const bin4 = queryOne<{ category_id: string | null; is_overflow: number }>("SELECT category_id, is_overflow FROM bins WHERE bin_number = 4");

      expect(bin1?.category_id).toBe('cat-electronics');
      expect(bin2?.category_id).toBe('cat-fashion');
      expect(bin3?.category_id).toBe('cat-books');
      expect(bin4?.is_overflow).toBe(1);
    });

    it('every seeded product in the database resolves to a valid destination bin', () => {
      const products = query<{ id: string; name: string; category_id: string }>("SELECT id, name, category_id FROM products");
      expect(products.length).toBeGreaterThan(0);

      const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

      for (const product of products) {
        const testOrderId = `ORD-ROUTE-${product.id}-${Date.now()}`;
        run(`
          INSERT INTO orders (id, customer_id, total_amount, subtotal, gst_amount, status, payment_status, destination_city, created_at, updated_at)
          VALUES (?, 'usr-cust-demo', 999, 800, 199, 'PACKED', 'PAID', 'Mumbai', ?, ?)
        `, [testOrderId, now, now]);

        run(`
          INSERT INTO order_items (id, order_id, product_id, quantity, unit_price)
          VALUES (?, ?, ?, 1, 800)
        `, [`item-${testOrderId}`, testOrderId, product.id]);

        const routing = resolveRoutingBin(testOrderId);
        expect(routing, `Product ${product.id} (${product.name}) in category ${product.category_id} must resolve to a bin`).not.toBeNull();
        expect(routing?.binNumber).toBeGreaterThanOrEqual(1);
        expect(routing?.binNumber).toBeLessThanOrEqual(4);

        if (product.category_id === 'cat-electronics') {
          expect(routing?.binNumber).toBe(1);
        } else if (product.category_id === 'cat-fashion') {
          expect(routing?.binNumber).toBe(2);
        } else if (product.category_id === 'cat-books') {
          expect(routing?.binNumber).toBe(3);
        } else {
          // Home & Kitchen, Fitness, Accessories -> Overflow
          expect(routing?.binNumber).toBe(4);
        }
      }
    });
  });
});

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createApiRouter } from '../src/server/routes';
import { getDb, run, queryOne } from '../src/server/db';
import { generateToken, verifyToken } from '../src/server/auth';
import { loadConfig } from '../src/server/config';
import { Server as SocketIOServer } from 'socket.io';
import http from 'http';

describe('Phase 1 & 8 Verification — ParcelFlow Security & Architecture Tests', () => {
  let app: express.Express;
  let io: SocketIOServer;
  let customerToken: string;
  let customerId = 'usr-customer-1';
  let otherCustomerToken: string;
  let otherCustomerId = 'usr-cust-2';
  let operatorToken: string;
  let adminToken: string;

  beforeAll(async () => {
    loadConfig();
    await getDb();
    app = express();
    app.use(express.json());
    const httpServer = http.createServer(app);
    io = new SocketIOServer(httpServer);
    app.use('/api', createApiRouter(io));

    customerToken = generateToken({
      id: customerId,
      name: 'Rahul Sharma',
      email: 'rahul@parcelflow.com',
      role: 'customer'
    });

    otherCustomerToken = generateToken({
      id: otherCustomerId,
      name: 'Priya Deshmukh',
      email: 'priya.d@gmail.com',
      role: 'customer'
    });

    operatorToken = generateToken({
      id: 'usr-operator-1',
      name: 'Vikram Patel',
      email: 'operator@parcelflow.com',
      role: 'operator'
    });

    adminToken = generateToken({
      id: 'usr-admin-1',
      name: 'Ananya Iyer',
      email: 'admin@parcelflow.com',
      role: 'admin'
    });
  });

  // 1. Login & Logout
  it('1. POST /api/auth/login authenticates demo customer and returns user & token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'rahul@parcelflow.com', password: 'demo123' });

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.role).toBe('customer');
    expect(res.body.token).toBeDefined();
  });

  it('2. POST /api/auth/logout succeeds', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // 3. Customer Authentication & Isolation
  it('3. GET /api/cart rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/cart');
    expect(res.status).toBe(401);
  });

  // 4. Product Browsing
  it('4. GET /api/catalog/products returns product catalog with stock & category info', async () => {
    const res = await request(app).get('/api/catalog/products');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('price');
    expect(res.body[0]).toHaveProperty('category_name');
  });

  // 5. Add to Cart
  it('5. POST /api/cart/items adds an item to cart and recalculates subtotal and GST', async () => {
    const res = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productId: 'prod-1', quantity: 2 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const cartRes = await request(app)
      .get('/api/cart')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(cartRes.status).toBe(200);
    expect(cartRes.body.items.length).toBeGreaterThan(0);
    expect(cartRes.body.subtotal).toBeGreaterThan(0);
    expect(cartRes.body.gst).toBe(Math.round(cartRes.body.subtotal * 0.18 * 100) / 100);
  });

  // 6. Address Ownership Validation During Checkout
  it('6. POST /api/orders/checkout rejects address belonging to another customer with 403', async () => {
    // Ensure an address belongs to other customer
    const addrId = `addr-test-other-${Date.now()}`;
    run(
      `INSERT INTO addresses (id, customer_id, label, full_name, phone, line1, line2, city, state, pincode, is_default)
       VALUES (?, ?, 'Office', 'Other Person', '9999999999', 'Other Street', '', 'Mumbai', 'Maharashtra', '400001', 0)`,
      [addrId, otherCustomerId]
    );

    // Customer 1 tries to use Customer 2's address ID
    const res = await request(app)
      .post('/api/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        addressId: addrId,
        paymentMethod: 'UPI',
        directItem: { productId: 'prod-1', quantity: 1 }
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/does not belong to this account/i);
  });

  // 7. Checkout returns both `id` and `orderId`
  it('7. POST /api/orders/checkout returns both `id` and `orderId` for tracking compatibility', async () => {
    // Create customer 1 address
    const addrId = `addr-cust1-${Date.now()}`;
    run(
      `INSERT INTO addresses (id, customer_id, label, full_name, phone, line1, line2, city, state, pincode, is_default)
       VALUES (?, ?, 'Home', 'Rahul Sharma', '9876543210', 'FC Road', '', 'Pune', 'Maharashtra', '411005', 1)`,
      [addrId, customerId]
    );

    const res = await request(app)
      .post('/api/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        addressId: addrId,
        paymentMethod: 'UPI',
        directItem: { productId: 'prod-2', quantity: 1 }
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // CRITICAL: Both id and orderId exist
    expect(res.body.id).toBeDefined();
    expect(res.body.orderId).toBeDefined();
    expect(res.body.id).toBe(res.body.orderId);
    expect(res.body.payment_status).toBe('PAID');
  });

  // 8. COD payment status handling
  it('8. POST /api/orders/checkout sets payment_status to PENDING for COD orders', async () => {
    const addr = queryOne<{ id: string }>('SELECT id FROM addresses WHERE customer_id = ? LIMIT 1', [customerId]);
    const res = await request(app)
      .post('/api/orders/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        addressId: addr?.id,
        paymentMethod: 'COD',
        directItem: { productId: 'prod-4', quantity: 1 }
      });

    expect(res.status).toBe(200);
    expect(res.body.payment_status).toBe('PENDING');

    const orderRow = queryOne<{ payment_status: string }>('SELECT payment_status FROM orders WHERE id = ?', [res.body.id]);
    expect(orderRow?.payment_status).toBe('PENDING');
  });

  // 9. Order tracking
  it('9. GET /api/orders/:id returns order details, status history, and items', async () => {
    const orderRow = queryOne<{ id: string }>('SELECT id FROM orders WHERE customer_id = ? LIMIT 1', [customerId]);
    expect(orderRow).toBeDefined();

    const res = await request(app)
      .get(`/api/orders/${orderRow!.id}`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.order).toBeDefined();
    expect(res.body.order.id).toBe(orderRow!.id);
    expect(Array.isArray(res.body.history)).toBe(true);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  // 10. Invoice generation
  it('10. GET /api/invoices/:orderId returns invoice with itemized tax and placeholder GSTIN', async () => {
    const orderRow = queryOne<{ id: string }>('SELECT id FROM orders WHERE customer_id = ? LIMIT 1', [customerId]);
    expect(orderRow).toBeDefined();

    const res = await request(app)
      .get(`/api/invoices/${orderRow!.id}`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.invoice).toBeDefined();
    expect(res.body.invoice.gstin).toBe('27AABCP1234F1Z9');
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  // 11. Wishlist customer isolation
  it('11. Wishlist operations are strictly customer-specific and isolated', async () => {
    // Customer 1 adds prod-5 to wishlist
    const toggle1 = await request(app)
      .post('/api/wishlist/toggle')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productId: 'prod-5' });

    expect(toggle1.status).toBe(200);

    // Customer 1 wishlist contains prod-5
    const list1 = await request(app)
      .get('/api/wishlist')
      .set('Authorization', `Bearer ${customerToken}`);

    const hasProd5Customer1 = list1.body.some((item: any) => item.product_id === 'prod-5' || item.id === 'prod-5');
    expect(hasProd5Customer1).toBe(true);

    // Customer 2 wishlist does NOT contain Customer 1's wishlist item
    const list2 = await request(app)
      .get('/api/wishlist')
      .set('Authorization', `Bearer ${otherCustomerToken}`);

    const hasProd5Customer2 = list2.body.some((item: any) => item.product_id === 'prod-5' || item.id === 'prod-5');
    expect(hasProd5Customer2).toBe(false);
  });

  // 12. Operator queue
  it('12. GET /api/warehouse/queue returns orders grouped by 6 fulfillment stages', async () => {
    const res = await request(app)
      .get('/api/warehouse/queue')
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('newOrders');
    expect(res.body).toHaveProperty('picking');
    expect(res.body).toHaveProperty('packing');
    expect(res.body).toHaveProperty('ready');
    expect(res.body).toHaveProperty('conveyor');
    expect(res.body).toHaveProperty('dispatched');
  });

  // 13. Staff role authorization on conveyor controls
  it('13. Conveyor control endpoint requires staff role (rejects customer with 403)', async () => {
    const res = await request(app)
      .post('/api/warehouse/conveyor/control')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ action: 'stop' });

    expect(res.status).toBe(403);

    const staffRes = await request(app)
      .post('/api/warehouse/conveyor/control')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ action: 'stop' });

    expect(staffRes.status).toBe(200);
  });

  // 14. Admin inventory adjustment
  it('14. POST /api/inventory/adjust updates stock quantity atomically', async () => {
    const res = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId: 'prod-1', newStockQuantity: 42, reason: 'Physical stock verification audit' });

    expect(res.status).toBe(200);
    expect(res.body.newQuantity).toBe(42);

    const inv = queryOne<{ stock_quantity: number }>('SELECT stock_quantity FROM inventory WHERE product_id = ?', ['prod-1']);
    expect(inv?.stock_quantity).toBe(42);
  });

  // 15. Password reset endpoint only exposes token in development
  it('15. POST /api/auth/forgot-password does not leak tokens when NODE_ENV is production', async () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'rahul@parcelflow.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeUndefined(); // MUST NOT leak token in production
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  // 16. API Error Handling
  it('16. Catch-all returns JSON 404 error for non-existent API endpoints', async () => {
    const res = await request(app).get('/api/non-existent-endpoint');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

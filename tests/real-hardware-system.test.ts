import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import { getDb, queryOne, query, run, saveDb } from '../src/server/db';
import { createApiRouter } from '../src/server/routes';
import { generateToken } from '../src/server/auth';
import { generateRouteQrPayload, verifyLabelPayload, resolveRoutingBin } from '../src/server/services/labelService';
import { processScan } from '../src/server/services/scanService';
import { loadConfig, getConfig } from '../src/server/config';

describe('Real Hardware Integration — 7-Servo Arm, 6 Route Profiles & Fallback Reject', () => {
  let app: Express;
  let adminToken: string;
  let operatorToken: string;
  let deviceToken: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.HARDWARE_MODE = 'real';
    loadConfig();
    await getDb();

    deviceToken = getConfig().DEVICE_TOKEN || 'parcelflow-device-token-secret-32ch-min';

    adminToken = generateToken({
      id: 'usr-admin-test',
      email: 'admin@parcelflow.com',
      role: 'admin',
      name: 'System Admin'
    });

    operatorToken = generateToken({
      id: 'usr-operator-test',
      email: 'operator@parcelflow.com',
      role: 'operator',
      name: 'Field Operator'
    });

    app = express();
    app.use(express.json());
    app.use('/api', createApiRouter(null));
  });

  // ────────────────────────────────────────────────────────────
  // 1. Destination Route Profiles
  // ────────────────────────────────────────────────────────────
  it('should have 7 route profiles (6 standard + 1 disposable fallback)', async () => {
    const res = await request(app)
      .get('/api/admin/route-profiles')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(7);

    const codes = res.body.map((r: any) => r.code);
    expect(codes).toContain('DEL');
    expect(codes).toContain('MH');
    expect(codes).toContain('PN');
    expect(codes).toContain('HUB4');
    expect(codes).toContain('HUB5');
    expect(codes).toContain('HUB6');
    expect(codes).toContain('FALLBACK');

    const fallback = res.body.find((r: any) => r.code === 'FALLBACK');
    expect(fallback.is_disposable_fallback).toBe(1);
  });

  // ────────────────────────────────────────────────────────────
  // 2. Physical Bins & 7-Servo Presets
  // ────────────────────────────────────────────────────────────
  it('should have 7 physical bins configured with 7-joint servo presets', async () => {
    const bins = query<any>('SELECT * FROM bins ORDER BY bin_number ASC');
    expect(bins.length).toBe(7);

    const bin7 = bins.find(b => b.bin_number === 7);
    expect(bin7.is_disposable_fallback).toBe(1);
    expect(bin7.is_overflow).toBe(1);

    // Verify 7-joint JSON preset
    for (const b of bins) {
      const preset = JSON.parse(b.servo_preset_json);
      expect(preset).toHaveProperty('base');
      expect(preset).toHaveProperty('shoulder');
      expect(preset).toHaveProperty('elbow');
      expect(preset).toHaveProperty('wrist_pitch');
      expect(preset).toHaveProperty('wrist_roll');
      expect(preset).toHaveProperty('gripper');
      expect(preset).toHaveProperty('aux');
    }
  });

  // ────────────────────────────────────────────────────────────
  // 3. Servo Joint Calibration
  // ────────────────────────────────────────────────────────────
  it('should return 7 PCA9685 joint calibration channels via admin API', async () => {
    const res = await request(app)
      .get('/api/admin/servo-calibration')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(7);

    const joint0 = res.body.find((j: any) => j.joint_index === 0);
    expect(joint0.joint_name).toContain('Base');
    expect(joint0.pca_channel).toBe(0);
    expect(joint0.servo_model).toBe('MG996R');

    const gripper = res.body.find((j: any) => j.joint_index === 5);
    expect(gripper.joint_name).toContain('Gripper');
    expect(gripper.pca_channel).toBe(5);
    expect(gripper.servo_model).toBe('MG90S');
  });

  it('should update calibration angles and limits for a joint', async () => {
    const res = await request(app)
      .put('/api/admin/servo-calibration/0')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        default_angle: 92,
        trim_offset: 2
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updated = queryOne<any>('SELECT default_angle, trim_offset FROM servo_calibration WHERE joint_index = 0');
    expect(updated.default_angle).toBe(92);
    expect(updated.trim_offset).toBe(2);
  });

  // ────────────────────────────────────────────────────────────
  // 4. Cryptographic QR Route Cards
  // ────────────────────────────────────────────────────────────
  it('should generate and verify authentic signed QR route demonstration payloads', () => {
    const delPayload = generateRouteQrPayload('DEL');
    expect(delPayload).toMatch(/^PF1\.ROUTE\.DEL\.[a-f0-9]{10}$/);

    const verified = verifyLabelPayload(delPayload);
    expect(verified.valid).toBe(true);
    expect(verified.type).toBe('ROUTE');
    expect(verified.routeCode).toBe('DEL');

    // Corrupted payload verification
    const corruptedPayload = delPayload.slice(0, -2) + 'xx';
    const badVerify = verifyLabelPayload(corruptedPayload);
    expect(badVerify.valid).toBe(false);
    expect(badVerify.reason).toBe('BAD_CHECKSUM');
    expect(badVerify.isFallback).toBe(true);
  });

  // ────────────────────────────────────────────────────────────
  // 5. Hardware Endpoints with Device Token Authentication
  // ────────────────────────────────────────────────────────────
  it('should enforce X-Device-Token on /api/hardware/conveyor/state', async () => {
    // Missing token -> 401
    const noAuth = await request(app).get('/api/hardware/conveyor/state');
    expect(noAuth.status).toBe(401);

    // Valid device token -> 200
    const authed = await request(app)
      .get('/api/hardware/conveyor/state')
      .set('X-Device-Token', deviceToken);

    expect(authed.status).toBe(200);
    expect(authed.body).toHaveProperty('state');
    expect(authed.body).toHaveProperty('speedPct');
    expect(authed.body).toHaveProperty('revision');
  });

  it('should accept ESP32 heartbeat with 7-servo arm telemetry', async () => {
    const res = await request(app)
      .post('/api/hardware/heartbeat')
      .set('X-Device-Token', deviceToken)
      .send({
        deviceId: 'arm-esp32',
        firmware: 'v2.1.0-arm7-pca9685',
        rssi: -55,
        state: {
          arm: 'READY',
          action: 'IDLE',
          angles: { Base: 90, Shoulder: 85, Elbow: 105, Gripper: 50 }
        }
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // ────────────────────────────────────────────────────────────
  // 6. Disposable Fallback Routing for Fallback Route Cards
  // ────────────────────────────────────────────────────────────
  it('should route Fallback demonstration card to Disposable Fallback Bin 7', () => {
    // Setup an order placed on conveyor
    const orderId = `ORD-FALLBACK-TEST-${Date.now()}`;
    run(`
      INSERT INTO orders (id, customer_id, destination_city, status, payment_status, subtotal, gst_amount, total_amount)
      VALUES (?, 'usr-cust-1', 'Unknown City', 'ON_CONVEYOR', 'PAID', 1000, 180, 1180)
    `, [orderId]);

    // Fallback QR code card scanned
    const fallbackPayload = generateRouteQrPayload('FALLBACK');
    const scanRes = processScan({
      payload: fallbackPayload,
      source: 'browser_camera'
    });

    expect(scanRes.result).toBe('ACCEPTED');
    expect(scanRes.bin?.number).toBe(7);
    expect(scanRes.state).toBe('SCANNED');

    // Confirm hardware command was queued for arm targeting Bin 7
    const cmd = queryOne<any>(
      "SELECT * FROM hardware_commands WHERE parcel_id = ? ORDER BY rowid DESC LIMIT 1",
      [scanRes.parcelId]
    );
    expect(cmd).not.toBeNull();
    const payload = JSON.parse(cmd.payload_json);
    expect(payload.binNumber).toBe(7);
  });
});

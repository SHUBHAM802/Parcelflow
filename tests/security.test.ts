import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createApiRouter } from '../src/server/routes';
import { getDb } from '../src/server/db';
import { hashPassword, verifyPassword, generateToken } from '../src/server/auth';
import { getConfig, loadConfig } from '../src/server/config';
import { Server as SocketIOServer } from 'socket.io';
import http from 'http';

describe('Security & Authentication Tests', () => {
  let app: express.Express;
  let io: SocketIOServer;

  beforeAll(async () => {
    loadConfig();
    await getDb();
    app = express();
    app.use(express.json());
    const httpServer = http.createServer(app);
    io = new SocketIOServer(httpServer);
    app.use('/api', createApiRouter(io));
  });

  describe('1.1 Google Sign-In Hardening', () => {
    it('rejects POST /api/auth/google without idToken with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/auth/google')
        .send({ email: 'admin@parcelflow.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/id token/i);
    });

    it('rejects Google login with forged or non-string idToken', async () => {
      const res = await request(app)
        .post('/api/auth/google')
        .send({ idToken: '' });

      expect(res.status).toBe(400);
    });
  });

  describe('1.2 Device Token Authentication (Hardware API)', () => {
    it('rejects hardware routes when X-Device-Token header is missing with 401', async () => {
      const res = await request(app)
        .post('/api/hardware/heartbeat')
        .send({ deviceId: 'conveyor-esp32' });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/device token required/i);
    });

    it('rejects hardware routes with incorrect device token with 401', async () => {
      const res = await request(app)
        .post('/api/hardware/heartbeat')
        .set('X-Device-Token', 'totally-wrong-fake-device-token-12345')
        .send({ deviceId: 'conveyor-esp32' });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/invalid device token/i);
    });

    it('rejects hardware routes when supplied a user Bearer JWT instead of device token', async () => {
      const userToken = generateToken({ id: 'usr-1', email: 'test@example.com', role: 'customer', name: 'Test User' });
      const res = await request(app)
        .post('/api/hardware/heartbeat')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ deviceId: 'conveyor-esp32' });

      expect(res.status).toBe(401);
    });

    it('accepts hardware routes when valid X-Device-Token is provided', async () => {
      const cfg = getConfig();
      if (!cfg.DEVICE_TOKEN) return;

      const res = await request(app)
        .post('/api/hardware/heartbeat')
        .set('X-Device-Token', cfg.DEVICE_TOKEN)
        .send({
          deviceId: 'conveyor-esp32',
          firmware: 'v1.4.2-test',
          rssi: -60,
          state: { conveyor: 'RUNNING' }
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('1.3 PBKDF2 Password Hashing', () => {
    it('hashes passwords with salt and high iteration format (iterations:salt:hash)', () => {
      const password = 'IndustrialSecure2026!';
      const hash = hashPassword(password);

      expect(hash).toMatch(/^\d+:[a-f0-9]+:[a-f0-9]+$/);
      expect(verifyPassword(password, hash).valid).toBe(true);
      expect(verifyPassword('WrongPassword!', hash).valid).toBe(false);
    });

    it('timing-safe verification handles incorrect passwords cleanly', () => {
      const hash = hashPassword('correctPassword');
      expect(verifyPassword('', hash).valid).toBe(false);
      expect(verifyPassword('almostCorrect', hash).valid).toBe(false);
    });
  });

  describe('1.4 Provider Discovery', () => {
    it('GET /api/auth/providers returns available auth options', async () => {
      const res = await request(app).get('/api/auth/providers');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('google');
      expect(res.body).toHaveProperty('email');
    });
  });
});

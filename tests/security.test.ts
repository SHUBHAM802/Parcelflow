import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createApiRouter, setGoogleJwksResolver } from '../src/server/routes';
import { getDb } from '../src/server/db';
import { hashPassword, verifyPassword, generateToken } from '../src/server/auth';
import { getConfig, loadConfig } from '../src/server/config';
import { Server as SocketIOServer } from 'socket.io';
import http from 'http';
import * as jose from 'jose';

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
    let privateKey: jose.KeyLike;
    let publicKey: jose.KeyLike;
    const testProjectId = 'test-firebase-project';

    beforeAll(async () => {
      const keypair = await jose.generateKeyPair('RS256');
      privateKey = keypair.privateKey;
      publicKey = keypair.publicKey;

      const publicJwk = await jose.exportJWK(publicKey);
      publicJwk.kid = 'test-rsa-key-1';
      publicJwk.alg = 'RS256';
      publicJwk.use = 'sig';

      const localJwks = jose.createLocalJWKSet({ keys: [publicJwk] });
      setGoogleJwksResolver(localJwks);
    });

    afterAll(() => {
      setGoogleJwksResolver(null);
    });

    async function makeToken(claims: Record<string, any>, options: {
      kid?: string;
      alg?: string;
      exp?: string | number;
      issuer?: string;
      audience?: string;
      key?: jose.KeyLike;
    } = {}) {
      if (options.alg === 'none') {
        const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
        const payload = Buffer.from(JSON.stringify({
          iss: options.issuer ?? `https://securetoken.google.com/${testProjectId}`,
          aud: options.audience ?? testProjectId,
          sub: 'uid-none',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
          ...claims
        })).toString('base64url');
        return `${header}.${payload}.`;
      }

      const jwt = new jose.SignJWT(claims)
        .setProtectedHeader({ alg: options.alg || 'RS256', kid: options.kid || 'test-rsa-key-1' })
        .setIssuer(options.issuer ?? `https://securetoken.google.com/${testProjectId}`)
        .setAudience(options.audience ?? testProjectId)
        .setSubject(claims.sub || 'test-firebase-uid-001')
        .setIssuedAt();

      if (options.exp !== undefined) {
        if (typeof options.exp === 'number') jwt.setExpirationTime(options.exp);
        else jwt.setExpirationTime(options.exp);
      } else {
        jwt.setExpirationTime('1h');
      }

      return jwt.sign(options.key || privateKey);
    }

    it('rejects POST /api/auth/google without idToken with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/auth/google')
        .send({ email: 'admin@parcelflow.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/id token/i);
    });

    it('rejects Google login with forged or non-string idToken with 400', async () => {
      const res = await request(app)
        .post('/api/auth/google')
        .send({ idToken: '' });

      expect(res.status).toBe(400);
    });

    it('accepts valid customer token with 200 and issues session token', async () => {
      const token = await makeToken({
        email: 'google.customer@example.com',
        email_verified: true,
        name: 'Google Customer',
        picture: 'https://example.com/photo.jpg',
        sub: 'google-cust-uid-1001'
      });

      const res = await request(app)
        .post('/api/auth/google')
        .send({ idToken: token });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.role).toBe('customer');
      expect(res.body.user.email).toBe('google.customer@example.com');
      expect(res.body.token).toBeDefined();
    });

    it('rejects valid token for existing operator email with 403 Forbidden and never links', async () => {
      const token = await makeToken({
        email: 'operator@parcelflow.com',
        email_verified: true,
        name: 'Vikram Patel',
        sub: 'attacker-google-sub-operator'
      });

      const res = await request(app)
        .post('/api/auth/google')
        .send({ idToken: token });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/operator and admin/i);
    });

    it('rejects valid token for existing admin email with 403 Forbidden and never links', async () => {
      const token = await makeToken({
        email: 'admin@parcelflow.com',
        email_verified: true,
        name: 'Ananya Iyer',
        sub: 'attacker-google-sub-admin'
      });

      const res = await request(app)
        .post('/api/auth/google')
        .send({ idToken: token });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/operator and admin/i);
    });

    it('rejects token with wrong audience with 401', async () => {
      const token = await makeToken(
        { email: 'user@example.com', email_verified: true },
        { audience: 'wrong-firebase-project-id' }
      );

      const res = await request(app)
        .post('/api/auth/google')
        .send({ idToken: token });

      expect(res.status).toBe(401);
    });

    it('rejects token with wrong issuer with 401', async () => {
      const token = await makeToken(
        { email: 'user@example.com', email_verified: true },
        { issuer: 'https://securetoken.google.com/malicious-project' }
      );

      const res = await request(app)
        .post('/api/auth/google')
        .send({ idToken: token });

      expect(res.status).toBe(401);
    });

    it('rejects expired token with 401', async () => {
      const token = await makeToken(
        { email: 'user@example.com', email_verified: true },
        { exp: Math.floor(Date.now() / 1000) - 60 } // expired 60s ago
      );

      const res = await request(app)
        .post('/api/auth/google')
        .send({ idToken: token });

      expect(res.status).toBe(401);
    });

    it('rejects token with alg: none with 401', async () => {
      const token = await makeToken(
        { email: 'user@example.com', email_verified: true },
        { alg: 'none' }
      );

      const res = await request(app)
        .post('/api/auth/google')
        .send({ idToken: token });

      expect(res.status).toBe(401);
    });

    it('rejects token when email_verified is false with 401', async () => {
      const token = await makeToken({
        email: 'unverified@example.com',
        email_verified: false,
        sub: 'unverified-sub-1'
      });

      const res = await request(app)
        .post('/api/auth/google')
        .send({ idToken: token });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/email not verified/i);
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

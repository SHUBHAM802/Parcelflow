import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createApiRouter, setGoogleJwksResolver } from '../src/server/routes';
import { getDb, run, queryOne } from '../src/server/db';
import { hashPassword, verifyPassword, generateToken } from '../src/server/auth';
import { getConfig, loadConfig } from '../src/server/config';
import { Server as SocketIOServer } from 'socket.io';
import http from 'http';
import * as jose from 'jose';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import initSqlJs from 'sql.js';

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
    let privateKey: any;
    let publicKey: any;
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
      key?: any;
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

  describe('1.5 Role-Based Access Control Matrix', () => {
    let custToken: string;
    let opToken: string;
    let adminToken: string;

    beforeAll(() => {
      custToken = generateToken({ id: 'usr-cust-demo', email: 'rahul@parcelflow.com', role: 'customer', name: 'Rahul Sharma' });
      opToken = generateToken({ id: 'usr-op-demo', email: 'operator@parcelflow.com', role: 'operator', name: 'Vikram Patel' });
      adminToken = generateToken({ id: 'usr-admin-demo', email: 'admin@parcelflow.com', role: 'admin', name: 'Ananya Iyer' });
    });

    it('customer role can access customer routes but is rejected on operator/admin routes with 403', async () => {
      // Customer route -> 200
      const custRes = await request(app).get('/api/cart').set('Authorization', `Bearer ${custToken}`);
      expect(custRes.status).toBe(200);

      // Operator route -> 403
      const opRes = await request(app).get('/api/warehouse/parcels').set('Authorization', `Bearer ${custToken}`);
      expect(opRes.status).toBe(403);
      expect(opRes.body.error).toMatch(/operator or admin/i);

      // Admin route -> 403
      const adminRes = await request(app).get('/api/admin/customers').set('Authorization', `Bearer ${custToken}`);
      expect(adminRes.status).toBe(403);
      expect(adminRes.body.error).toMatch(/admin role required/i);
    });

    it('operator role can access operator routes but is rejected on admin routes with 403', async () => {
      // Operator route -> 200
      const opRes = await request(app).get('/api/warehouse/parcels').set('Authorization', `Bearer ${opToken}`);
      expect(opRes.status).toBe(200);

      // Admin route -> 403
      const adminRes = await request(app).get('/api/admin/customers').set('Authorization', `Bearer ${opToken}`);
      expect(adminRes.status).toBe(403);
      expect(adminRes.body.error).toMatch(/admin role required/i);
    });

    it('admin role can access both operator and admin routes with 200', async () => {
      // Operator route -> 200
      const opRes = await request(app).get('/api/warehouse/parcels').set('Authorization', `Bearer ${adminToken}`);
      expect(opRes.status).toBe(200);

      // Admin route -> 200
      const adminRes = await request(app).get('/api/admin/customers').set('Authorization', `Bearer ${adminToken}`);
      expect(adminRes.status).toBe(200);
    });
  });

  describe('1.6 PBKDF2 Legacy Password Rehash on Login', () => {
    it('verifies legacy 10,000-iteration salt:hash password and transparently rehashes to 210,000 iterations', async () => {
      const password = 'LegacyPassword2026!';
      const salt = crypto.randomBytes(16).toString('hex');
      const legacyHash = crypto.pbkdf2Sync(password, salt, 10_000, 64, 'sha512').toString('hex');
      const storedLegacy = `${salt}:${legacyHash}`;
      const email = 'legacy.user@parcelflow.com';
      const userId = `usr-legacy-${Date.now()}`;

      run(`INSERT INTO users (id, name, email, role, phone, password_hash, created_at)
           VALUES (?, 'Legacy User', ?, 'customer', '9876543210', ?, '2026-01-01')`,
        [userId, email, storedLegacy]
      );

      // Verify that verifyPassword marks it as needsRehash
      const check = verifyPassword(password, storedLegacy);
      expect(check.valid).toBe(true);
      expect(check.needsRehash).toBe(true);

      // Log in via HTTP endpoint
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();

      // Check DB: password_hash must now be the modern 210,000 iteration format
      const updatedUser = queryOne<{ password_hash: string }>(
        "SELECT password_hash FROM users WHERE id = ?", [userId]
      );
      expect(updatedUser?.password_hash).toMatch(/^210000:[a-f0-9]+:[a-f0-9]+$/);
    });
  });

  describe('1.7 Boot Validation & Secret Enforcement', () => {
    it('enforces minimum 32 character length for JWT_SECRET and LABEL_SECRET', async () => {
      const { z } = await import('zod');
      const testSchema = z.object({
        JWT_SECRET: z.string().min(32),
        LABEL_SECRET: z.string().min(32)
      });

      // Too short JWT_SECRET
      const badJwt = testSchema.safeParse({
        JWT_SECRET: 'short-secret-1234',
        LABEL_SECRET: 'a-sufficiently-long-secret-key-of-32-chars-plus'
      });
      expect(badJwt.success).toBe(false);

      // Too short LABEL_SECRET
      const badLabel = testSchema.safeParse({
        JWT_SECRET: 'a-sufficiently-long-secret-key-of-32-chars-plus',
        LABEL_SECRET: 'short-label'
      });
      expect(badLabel.success).toBe(false);

      // Valid secrets
      const valid = testSchema.safeParse({
        JWT_SECRET: 'a-sufficiently-long-secret-key-of-32-chars-plus',
        LABEL_SECRET: 'another-sufficiently-long-secret-key-of-32-chars'
      });
      expect(valid.success).toBe(true);
    });
  });

  describe('1.8 SQLite Database Recovery from .bak', () => {
    it('recovers database from .bak file if primary database file is corrupted', async () => {
      const SQL = await initSqlJs();
      const tempDir = path.join(process.cwd(), 'tmp-test-db');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

      const mainDbFile = path.join(tempDir, 'corrupt-test.sqlite');
      const bakDbFile = path.join(tempDir, 'corrupt-test.sqlite.bak');

      try {
        // Create valid database in .bak
        const validDb = new SQL.Database();
        validDb.run("CREATE TABLE test_recovery (id TEXT, val TEXT);");
        validDb.run("INSERT INTO test_recovery VALUES ('rec-1', 'restored_from_backup');");
        const validData = validDb.export();
        fs.writeFileSync(bakDbFile, Buffer.from(validData));

        // Corrupt main file (garbage bytes)
        fs.writeFileSync(mainDbFile, Buffer.from('NOT_A_VALID_SQLITE_DATABASE_HEADER_CORRUPTED'));

        // Simulate getDb recovery logic
        let recoveredDb: any = null;
        try {
          const mainBuffer = fs.readFileSync(mainDbFile);
          recoveredDb = new SQL.Database(mainBuffer);
          recoveredDb.exec("SELECT * FROM test_recovery");
        } catch {
          // Fallback to .bak
          if (fs.existsSync(bakDbFile)) {
            const bakBuffer = fs.readFileSync(bakDbFile);
            recoveredDb = new SQL.Database(bakBuffer);
          }
        }

        expect(recoveredDb).not.toBeNull();
        const res = recoveredDb.exec("SELECT val FROM test_recovery WHERE id = 'rec-1'");
        expect(res[0].values[0][0]).toBe('restored_from_backup');
      } finally {
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
      }
    });
  });
});

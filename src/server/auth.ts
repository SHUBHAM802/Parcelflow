import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { queryOne, run } from './db';
import { getConfig } from './config';

// ────────────────────────────────────────────────────────────
// Password Hashing — PBKDF2-SHA512
// ────────────────────────────────────────────────────────────
const CURRENT_ITERATIONS = 210_000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';

/**
 * Hash a password. Format: `iterations:salt:hash` (all hex).
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, CURRENT_ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
  return `${CURRENT_ITERATIONS}:${salt}:${hash}`;
}

/**
 * Verify a password against a stored hash.
 * Returns `{ valid, needsRehash }`.
 * Supports legacy `salt:hash` format (10,000 iterations) for migration.
 */
export function verifyPassword(password: string, storedHash: string): { valid: boolean; needsRehash: boolean } {
  if (!storedHash || !password) return { valid: false, needsRehash: false };

  const parts = storedHash.split(':');

  let iterations: number;
  let salt: string;
  let originalHash: string;

  if (parts.length === 3) {
    // New format: iterations:salt:hash
    iterations = parseInt(parts[0], 10);
    salt = parts[1];
    originalHash = parts[2];
  } else if (parts.length === 2) {
    // Legacy format: salt:hash (10,000 iterations)
    iterations = 10_000;
    salt = parts[0];
    originalHash = parts[1];
  } else {
    // Unknown format — reject
    return { valid: false, needsRehash: false };
  }

  if (isNaN(iterations) || iterations < 1) return { valid: false, needsRehash: false };

  const computedHash = crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST).toString('hex');

  // Constant-time comparison
  const a = Buffer.from(computedHash, 'hex');
  const b = Buffer.from(originalHash, 'hex');
  if (a.length !== b.length) return { valid: false, needsRehash: false };

  const valid = crypto.timingSafeEqual(a, b);
  const needsRehash = valid && iterations < CURRENT_ITERATIONS;

  return { valid, needsRehash };
}

// ────────────────────────────────────────────────────────────
// JWT Token Signing & Verification (HMAC-SHA256)
// ────────────────────────────────────────────────────────────
export interface TokenPayload {
  sub: string;   // user id
  id: string;    // alias for sub (backwards compat)
  email: string;
  role: 'customer' | 'operator' | 'admin';
  name: string;
  iat: number;
  exp: number;
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

export function generateToken(user: { id: string; email: string; role: 'customer' | 'operator' | 'admin'; name: string }): string {
  const secret = getConfig().JWT_SECRET;
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    sub: user.id,
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    iat: now,
    exp: now + 7 * 24 * 60 * 60 // 7 days
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${headerB64}.${payloadB64}.${signature}`;
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    if (!token) return null;

    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signature] = parts;

    // Verify header algorithm
    try {
      const header = JSON.parse(base64UrlDecode(headerB64));
      if (header.alg !== 'HS256') return null;
    } catch {
      return null;
    }

    const secret = getConfig().JWT_SECRET;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    // Constant-time signature comparison
    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const payload: TokenPayload = JSON.parse(base64UrlDecode(payloadB64));
    const now = Math.floor(Date.now() / 1000);

    // Validate required claims
    if (!payload.sub && !payload.id) return null;
    if (!payload.exp || payload.exp < now) return null;
    if (!payload.iat) return null;
    if (!payload.role) return null;

    // Normalize: ensure both sub and id are set
    if (!payload.sub) payload.sub = payload.id;
    if (!payload.id) payload.id = payload.sub;

    return payload;
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────
// Authentication & Role Middlewares
// ────────────────────────────────────────────────────────────
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: 'customer' | 'operator' | 'admin';
    name: string;
  };
}

export function extractUserFromRequest(req: Request): { id: string; email: string; role: 'customer' | 'operator' | 'admin'; name: string } | null {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    const verified = verifyToken(token);
    if (verified) {
      return { id: verified.id, email: verified.email, role: verified.role, name: verified.name };
    }
  }

  return null;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const user = extractUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  req.user = user;
  next();
}

export function requireRole(allowedRoles: ('customer' | 'operator' | 'admin') | ('customer' | 'operator' | 'admin')[]) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = extractUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    req.user = user;
    if (!roles.includes(user.role)) {
      return res.status(403).json({ error: `Access denied. Requires one of roles: ${roles.join(', ')}` });
    }
    next();
  };
}

// ────────────────────────────────────────────────────────────
// Device Token Middleware (for ESP32 hardware routes)
// ────────────────────────────────────────────────────────────
export function requireDeviceToken(req: Request, res: Response, next: NextFunction) {
  const cfg = getConfig();
  if (!cfg.DEVICE_TOKEN) {
    return res.status(503).json({ error: 'Hardware API not configured' });
  }

  const token = req.headers['x-device-token'];
  if (!token || typeof token !== 'string') {
    return res.status(401).json({ error: 'Device token required' });
  }

  const tokenBuf = Buffer.from(token);
  const primaryBuf = Buffer.from(cfg.DEVICE_TOKEN);

  let match = false;
  if (tokenBuf.length === primaryBuf.length) {
    match = crypto.timingSafeEqual(tokenBuf, primaryBuf);
  }

  // Check rotation slot
  if (!match && cfg.DEVICE_TOKEN_NEXT) {
    const nextBuf = Buffer.from(cfg.DEVICE_TOKEN_NEXT);
    if (tokenBuf.length === nextBuf.length) {
      match = crypto.timingSafeEqual(tokenBuf, nextBuf);
    }
  }

  if (!match) {
    return res.status(401).json({ error: 'Invalid device token' });
  }

  next();
}

// ────────────────────────────────────────────────────────────
// Login Rate Limiter (Sliding Window in-memory)
// ────────────────────────────────────────────────────────────
interface RateLimitRecord {
  timestamps: number[];
}
const loginAttempts = new Map<string, RateLimitRecord>();

export function loginRateLimiter(maxAttempts = 10, windowMs = 60 * 1000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown-client';
    const now = Date.now();
    const record = loginAttempts.get(ip) || { timestamps: [] };

    // Filter out timestamps outside window
    record.timestamps = record.timestamps.filter(t => now - t < windowMs);

    if (record.timestamps.length >= maxAttempts) {
      const oldest = record.timestamps[0];
      const waitTimeSec = Math.ceil((windowMs - (now - oldest)) / 1000);
      res.setHeader('Retry-After', waitTimeSec);
      return res.status(429).json({
        error: `Too many login attempts. Please try again in ${waitTimeSec} seconds.`
      });
    }

    record.timestamps.push(now);
    loginAttempts.set(ip, record);
    next();
  };
}

// ────────────────────────────────────────────────────────────
// Scan Rate Limiter (per-user, for /api/operator/scan)
// ────────────────────────────────────────────────────────────
const scanAttempts = new Map<string, RateLimitRecord>();

export function scanRateLimiter(maxAttempts = 30, windowMs = 10_000) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.user?.id || req.ip || 'unknown';
    const now = Date.now();
    const record = scanAttempts.get(userId) || { timestamps: [] };
    record.timestamps = record.timestamps.filter(t => now - t < windowMs);

    if (record.timestamps.length >= maxAttempts) {
      return res.status(429).json({ error: 'Scan rate limit exceeded. Slow down.' });
    }

    record.timestamps.push(now);
    scanAttempts.set(userId, record);
    next();
  };
}

// ────────────────────────────────────────────────────────────
// Hardware Rate Limiter (per-device)
// ────────────────────────────────────────────────────────────
const hardwareAttempts = new Map<string, RateLimitRecord>();

export function hardwareRateLimiter(maxAttempts = 120, windowMs = 10_000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const deviceId = (req.body?.deviceId as string) || req.query.deviceId as string || 'unknown';
    const now = Date.now();
    const record = hardwareAttempts.get(deviceId) || { timestamps: [] };
    record.timestamps = record.timestamps.filter(t => now - t < windowMs);

    if (record.timestamps.length >= maxAttempts) {
      return res.status(429).json({ error: 'Hardware rate limit exceeded' });
    }

    record.timestamps.push(now);
    hardwareAttempts.set(deviceId, record);
    next();
  };
}

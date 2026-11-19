import { z } from 'zod';
import crypto from 'crypto';
import dotenv from 'dotenv';

// Load .env before anything else
dotenv.config();

// ────────────────────────────────────────────────────────────
// Schema: validated once at boot, cached for the process lifetime
// ────────────────────────────────────────────────────────────
const envSchema = z.object({
  // Server
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Auth – hard requirements
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'),
  LABEL_SECRET: z.string().min(32, 'LABEL_SECRET must be at least 32 characters. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'),

  // Device auth
  DEVICE_TOKEN: z.string().min(32, 'DEVICE_TOKEN must be at least 32 characters').optional(),
  DEVICE_TOKEN_NEXT: z.string().min(32).optional(),

  // Database
  DATABASE_PATH: z.string().default('parcelflow.sqlite'),

  // Hardware
  HARDWARE_MODE: z.enum(['simulator', 'real']).default('simulator'),
  SCAN_MODE: z.enum(['stop_and_scan', 'on_the_fly']).default('stop_and_scan'),
  SCAN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(6000),
  SCAN_REJECT_POLICY: z.enum(['stop', 'continue']).default('stop'),
  SINGLE_PARCEL_MODE: z.enum(['true', 'false']).default('true'),
  ARM_ACK_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(5000),
  ARM_COMPLETE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(20000),
  HEARTBEAT_TIMEOUT_MS: z.coerce.number().int().min(2000).max(30000).default(6000),
  IR_DEBOUNCE_MS: z.coerce.number().int().min(50).max(2000).default(250),
  IR2_MATCH_WINDOW_MS: z.coerce.number().int().min(5000).max(120000).default(30000),

  // Firebase (optional – Google login unavailable if missing)
  FIREBASE_PROJECT_ID: z.string().optional(),

  // CORS
  ALLOWED_ORIGIN: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

let _config: EnvConfig | null = null;

/**
 * Parse and validate environment variables. Exits the process on failure.
 * Idempotent: returns the cached result on subsequent calls.
 */
export function loadConfig(): EnvConfig {
  if (_config) return _config;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues.map(
      (i) => `  ✗ ${i.path.join('.')}: ${i.message}`
    );
    console.error(
      '\n╔══════════════════════════════════════════════════════════╗\n' +
      '║  PARCELFLOW — CONFIGURATION ERROR                      ║\n' +
      '╚══════════════════════════════════════════════════════════╝\n' +
      '\nThe following environment variables are missing or invalid:\n\n' +
      errors.join('\n') +
      '\n\nCopy .env.example to .env and fill in the required values.\n'
    );
    process.exit(1);
  }

  _config = result.data;

  // Warn if DEVICE_TOKEN is absent (hardware routes will be unavailable)
  if (!_config.DEVICE_TOKEN) {
    console.warn('[ParcelFlow] ⚠  DEVICE_TOKEN not set — hardware API routes are disabled.');
  }

  return _config;
}

/**
 * Get the already-loaded config. Throws if called before loadConfig().
 */
export function getConfig(): EnvConfig {
  if (!_config) throw new Error('Config not loaded. Call loadConfig() at boot.');
  return _config;
}

/**
 * Check if Google Sign-In is available (Firebase project ID configured).
 */
export function isGoogleLoginAvailable(): boolean {
  const cfg = getConfig();
  return Boolean(cfg.FIREBASE_PROJECT_ID && cfg.FIREBASE_PROJECT_ID.trim().length > 0);
}

/**
 * Check if the hardware API routes should be enabled.
 */
export function isHardwareApiEnabled(): boolean {
  const cfg = getConfig();
  return Boolean(cfg.DEVICE_TOKEN && cfg.DEVICE_TOKEN.trim().length >= 32);
}

/**
 * Is the single-parcel-mode pipeline gate enabled?
 */
export function isSingleParcelMode(): boolean {
  return getConfig().SINGLE_PARCEL_MODE === 'true';
}

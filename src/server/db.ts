import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';

import { seedDatabase } from './seed';
import { hashPassword } from './auth';

let dbInstance: Database | null = null;
let DB_FILE = path.join(process.cwd(), process.env.DATABASE_PATH || 'parcelflow.sqlite');

// ────────────────────────────────────────────────────────────
// Atomic persistence
// ────────────────────────────────────────────────────────────
let inTransaction = false;
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE_MS = 200;

/**
 * Persist the in-memory database to disk atomically.
 * Writes to a .tmp file first, then renames (which is atomic on most OS).
 * Keeps one rolling .bak copy.
 */
export function saveDb(immediate = false) {
  if (!dbInstance || inTransaction) return;

  // Debounce unless immediate flush requested
  if (!immediate && saveDebounceTimer) return;
  if (!immediate) {
    saveDebounceTimer = setTimeout(() => {
      saveDebounceTimer = null;
      doSave();
    }, SAVE_DEBOUNCE_MS);
    return;
  }

  doSave();
}

function doSave() {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const tmpFile = DB_FILE + '.tmp';
    const bakFile = DB_FILE + '.bak';

    // Write to temp file first
    fs.writeFileSync(tmpFile, Buffer.from(data));

    // Rotate: current -> .bak
    if (fs.existsSync(DB_FILE)) {
      try {
        fs.copyFileSync(DB_FILE, bakFile);
      } catch (bakErr) {
        console.warn('[ParcelFlow] Warning: could not create .bak:', bakErr);
      }
    }

    // Atomic rename: .tmp -> main with Windows EPERM fallback
    try {
      fs.renameSync(tmpFile, DB_FILE);
    } catch (renameErr: any) {
      if ((process.platform === 'win32' || renameErr.code === 'EPERM') && fs.existsSync(tmpFile)) {
        fs.copyFileSync(tmpFile, DB_FILE);
        try { fs.unlinkSync(tmpFile); } catch {}
      } else if (!fs.existsSync(DB_FILE)) {
        throw renameErr;
      }
    }
  } catch (e) {
    console.error('[ParcelFlow] Failed to persist database to disk:', e);
  }
}

function flushSave() {
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
  }
  doSave();
}

// ────────────────────────────────────────────────────────────
// Pragmas and indexes
// ────────────────────────────────────────────────────────────
function applyPragmasAndIndexes(db: Database) {
  db.run("PRAGMA foreign_keys = ON;");
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
    CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON order_status_history(order_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON inventory(product_id);
    CREATE INDEX IF NOT EXISTS idx_picking_tasks_order_id ON picking_tasks(order_id);
    CREATE INDEX IF NOT EXISTS idx_packing_tasks_order_id ON packing_tasks(order_id);
    CREATE INDEX IF NOT EXISTS idx_sorting_logs_order_id ON sorting_logs(order_id);
    CREATE INDEX IF NOT EXISTS idx_cart_items_customer_id ON cart_items(customer_id);
    CREATE INDEX IF NOT EXISTS idx_addresses_customer_id ON addresses(customer_id);
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);
  `);
}

// ────────────────────────────────────────────────────────────
// Schema migrations (recorded in schema_migrations table)
// ────────────────────────────────────────────────────────────
function ensureMigrationsTable(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

function hasMigration(db: Database, id: string): boolean {
  const stmt = db.prepare("SELECT 1 FROM schema_migrations WHERE id = ?");
  stmt.bind([id]);
  const has = stmt.step();
  stmt.free();
  return !!has;
}

function recordMigration(db: Database, id: string) {
  db.run("INSERT OR IGNORE INTO schema_migrations (id) VALUES (?)", [id]);
}

function runMigrations(db: Database) {
  ensureMigrationsTable(db);

  // Migration 001: password_reset_tokens
  if (!hasMigration(db, '001_password_reset_tokens')) {
    db.run(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id),
        token TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
    recordMigration(db, '001_password_reset_tokens');
  }

  // Migration 002: add avatar_url and firebase_uid to users
  if (!hasMigration(db, '002_user_firebase_columns')) {
    try { db.run("ALTER TABLE users ADD COLUMN avatar_url TEXT;"); } catch {}
    try { db.run("ALTER TABLE users ADD COLUMN firebase_uid TEXT;"); } catch {}
    recordMigration(db, '002_user_firebase_columns');
  }

  // Migration 003: bins table (category-based routing)
  if (!hasMigration(db, '003_bins_table')) {
    db.run(`
      CREATE TABLE IF NOT EXISTS bins (
        id               TEXT PRIMARY KEY,
        bin_number       INTEGER NOT NULL UNIQUE,
        label            TEXT NOT NULL,
        category_id      TEXT REFERENCES categories(id),
        is_overflow      INTEGER NOT NULL DEFAULT 0,
        servo_preset_json TEXT NOT NULL DEFAULT '{"base":90,"shoulder":90,"elbow":90,"wrist":90}',
        is_active        INTEGER NOT NULL DEFAULT 1,
        parcel_count     INTEGER NOT NULL DEFAULT 0,
        updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    recordMigration(db, '003_bins_table');
  }

  // Migration 004: parcels table
  if (!hasMigration(db, '004_parcels_table')) {
    db.run(`
      CREATE TABLE IF NOT EXISTS parcels (
        id                TEXT PRIMARY KEY,
        order_id          TEXT NOT NULL REFERENCES orders(id),
        label_version     INTEGER NOT NULL DEFAULT 1,
        label_payload     TEXT NOT NULL UNIQUE,
        label_print_count INTEGER NOT NULL DEFAULT 0,
        first_printed_at  TEXT,
        last_printed_at   TEXT,
        status            TEXT NOT NULL DEFAULT 'LABELED',
        assigned_bin_id   TEXT REFERENCES bins(id),
        scanned_at        TEXT,
        at_pick_point_at  TEXT,
        sorted_at         TEXT,
        created_at        TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_parcels_order ON parcels(order_id);
      CREATE INDEX IF NOT EXISTS idx_parcels_status ON parcels(status);
    `);
    recordMigration(db, '004_parcels_table');
  }

  // Migration 005: scan_events
  if (!hasMigration(db, '005_scan_events')) {
    db.run(`
      CREATE TABLE IF NOT EXISTS scan_events (
        id            TEXT PRIMARY KEY,
        parcel_id     TEXT REFERENCES parcels(id),
        raw_payload   TEXT NOT NULL,
        source        TEXT NOT NULL,
        result        TEXT NOT NULL,
        reason        TEXT,
        operator_id   TEXT REFERENCES users(id),
        device_id     TEXT,
        decode_ms     INTEGER,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_scan_created ON scan_events(created_at);
    `);
    recordMigration(db, '005_scan_events');
  }

  // Migration 006: hardware_commands, device_heartbeats, pipeline_faults
  if (!hasMigration(db, '006_hardware_commands')) {
    db.run(`
      CREATE TABLE IF NOT EXISTS hardware_commands (
        id              TEXT PRIMARY KEY,
        device_id       TEXT NOT NULL,
        type            TEXT NOT NULL,
        parcel_id       TEXT REFERENCES parcels(id),
        bin_id          TEXT REFERENCES bins(id),
        payload_json    TEXT NOT NULL DEFAULT '{}',
        status          TEXT NOT NULL DEFAULT 'QUEUED',
        attempts        INTEGER NOT NULL DEFAULT 0,
        idempotency_key TEXT NOT NULL UNIQUE,
        expires_at      TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at    TEXT,
        failure_reason  TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_cmd_device_status ON hardware_commands(device_id, status);

      CREATE TABLE IF NOT EXISTS device_heartbeats (
        device_id    TEXT PRIMARY KEY,
        last_seen_at TEXT NOT NULL,
        firmware     TEXT,
        rssi         INTEGER,
        state_json   TEXT
      );

      CREATE TABLE IF NOT EXISTS pipeline_faults (
        id           TEXT PRIMARY KEY,
        type         TEXT NOT NULL,
        parcel_id    TEXT,
        detail       TEXT,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        acked_at     TEXT,
        acked_by     TEXT
      );
    `);
    recordMigration(db, '006_hardware_commands');
  }

  // Migration 007: add assigned_bin_id and is_demo to orders
  if (!hasMigration(db, '007_order_bin_id')) {
    try { db.run("ALTER TABLE orders ADD COLUMN assigned_bin_id TEXT REFERENCES bins(id);"); } catch {}
    try { db.run("ALTER TABLE orders ADD COLUMN is_demo INTEGER DEFAULT 0;"); } catch {}
    recordMigration(db, '007_order_bin_id');
  }

  // Migration 008: pipeline_state for conveyor desired state
  if (!hasMigration(db, '008_pipeline_state')) {
    db.run(`
      CREATE TABLE IF NOT EXISTS pipeline_state (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    // Initialize default values
    const now = new Date().toISOString();
    db.run("INSERT OR IGNORE INTO pipeline_state (key, value, updated_at) VALUES ('conveyor_desired', 'STOP', ?)", [now]);
    db.run("INSERT OR IGNORE INTO pipeline_state (key, value, updated_at) VALUES ('conveyor_revision', '1', ?)", [now]);
    db.run("INSERT OR IGNORE INTO pipeline_state (key, value, updated_at) VALUES ('conveyor_speed_pct', '100', ?)", [now]);
    db.run("INSERT OR IGNORE INTO pipeline_state (key, value, updated_at) VALUES ('estop_active', 'false', ?)", [now]);
    recordMigration(db, '008_pipeline_state');
  }
}

function migrateUserPasswords(db: Database) {
  try {
    const res = db.exec("SELECT id, password_hash FROM users");
    if (res.length > 0 && res[0].values) {
      for (const row of res[0].values) {
        const uId = row[0] as string;
        const uPass = row[1] as string;
        if (uPass && !uPass.includes(':')) {
          // Plain text password — hash it
          const hashed = hashPassword(uPass);
          db.run("UPDATE users SET password_hash = ? WHERE id = ?", [hashed, uId]);
        } else if (uPass) {
          const parts = uPass.split(':');
          if (parts.length === 2) {
            // Legacy format (salt:hash with 10k iterations) — re-hash not possible without plaintext
            // These will be re-hashed on next successful login
          }
        }
      }
    }
  } catch (err) {
    console.error('[ParcelFlow] Password migration error:', err);
  }
}

// ────────────────────────────────────────────────────────────
// Database initialization
// ────────────────────────────────────────────────────────────
export async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance;

  const SQL = await initSqlJs();
  const dbPath = process.env.DATABASE_PATH
    ? path.join(process.cwd(), process.env.DATABASE_PATH)
    : DB_FILE;
  DB_FILE = dbPath;

  if (fs.existsSync(dbPath)) {
    try {
      const buffer = fs.readFileSync(dbPath);
      dbInstance = new SQL.Database(buffer);

      // Migrate seed emails to @parcelflow.com if needed
      dbInstance.run("UPDATE users SET email = 'rahul@parcelflow.com' WHERE email = 'rahul@parcelflow.demo'");
      dbInstance.run("UPDATE users SET email = 'operator@parcelflow.com' WHERE email = 'operator@parcelflow.demo'");
      dbInstance.run("UPDATE users SET email = 'admin@parcelflow.com' WHERE email = 'admin@parcelflow.demo'");

      runMigrations(dbInstance);
      applyPragmasAndIndexes(dbInstance);
      migrateUserPasswords(dbInstance);
      flushSave();
      return dbInstance;
    } catch (e) {
      console.error('[ParcelFlow] Failed to load database, trying .bak', e);

      // Try the backup
      const bakPath = dbPath + '.bak';
      if (fs.existsSync(bakPath)) {
        try {
          console.warn('[ParcelFlow] Loading database from .bak file');
          const buffer = fs.readFileSync(bakPath);
          dbInstance = new SQL.Database(buffer);
          runMigrations(dbInstance);
          applyPragmasAndIndexes(dbInstance);
          migrateUserPasswords(dbInstance);
          flushSave();
          return dbInstance;
        } catch (bakErr) {
          console.error('[ParcelFlow] .bak also failed, creating fresh DB', bakErr);
        }
      }
    }
  }

  // Fresh database
  dbInstance = new SQL.Database();
  await initSchemaAndSeed(dbInstance);
  runMigrations(dbInstance);
  applyPragmasAndIndexes(dbInstance);
  migrateUserPasswords(dbInstance);
  flushSave();
  return dbInstance;
}

// ────────────────────────────────────────────────────────────
// Query helpers
// ────────────────────────────────────────────────────────────
export function transaction<T>(fn: () => T): T {
  if (!dbInstance) throw new Error('Database not initialized');
  inTransaction = true;
  dbInstance.run("BEGIN TRANSACTION");
  try {
    const result = fn();
    dbInstance.run("COMMIT");
    inTransaction = false;
    flushSave(); // Immediate flush after transaction
    return result;
  } catch (err) {
    try {
      dbInstance.run("ROLLBACK");
    } catch {}
    inTransaction = false;
    throw err;
  }
}

export function query<T = any>(sql: string, params: any[] = []): T[] {
  if (!dbInstance) throw new Error('Database not initialized');
  const stmt = dbInstance.prepare(sql);
  if (params && params.length > 0) {
    stmt.bind(params);
  }
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

export function queryOne<T = any>(sql: string, params: any[] = []): T | null {
  const rows = query<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export function run(sql: string, params: any[] = []): void {
  if (!dbInstance) throw new Error('Database not initialized');
  if (!params || params.length === 0) {
    dbInstance.run(sql);
  } else {
    const stmt = dbInstance.prepare(sql);
    stmt.run(params);
    stmt.free();
  }
  saveDb();
}

// ────────────────────────────────────────────────────────────
// Schema creation (fresh database)
// ────────────────────────────────────────────────────────────
async function initSchemaAndSeed(db: Database) {
  // Schema creation
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT CHECK(role IN ('customer','operator','admin')) NOT NULL,
      phone TEXT,
      avatar_url TEXT,
      firebase_uid TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category_id TEXT REFERENCES categories(id),
      description TEXT,
      price REAL NOT NULL,
      discount_percent REAL DEFAULT 0,
      rating REAL DEFAULT 0,
      rating_count INTEGER DEFAULT 0,
      image_url TEXT,
      warehouse_rack_location TEXT,
      weight_grams INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      product_id TEXT REFERENCES products(id),
      customer_id TEXT REFERENCES users(id),
      customer_name TEXT,
      rating INTEGER NOT NULL,
      comment TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS wishlist_items (
      id TEXT PRIMARY KEY,
      customer_id TEXT REFERENCES users(id),
      product_id TEXT REFERENCES products(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cart_items (
      id TEXT PRIMARY KEY,
      customer_id TEXT REFERENCES users(id),
      product_id TEXT REFERENCES products(id),
      quantity INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS addresses (
      id TEXT PRIMARY KEY,
      customer_id TEXT REFERENCES users(id),
      label TEXT,
      full_name TEXT,
      phone TEXT,
      line1 TEXT,
      line2 TEXT,
      city TEXT,
      state TEXT,
      pincode TEXT,
      is_default INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      customer_id TEXT REFERENCES users(id),
      address_id TEXT REFERENCES addresses(id),
      destination_city TEXT NOT NULL,
      status TEXT NOT NULL,
      payment_status TEXT CHECK(payment_status IN ('PENDING','PAID','FAILED','REFUNDED')) NOT NULL,
      payment_method TEXT,
      subtotal REAL NOT NULL,
      gst_amount REAL NOT NULL,
      total_amount REAL NOT NULL,
      assigned_bin TEXT,
      assigned_bin_id TEXT REFERENCES bins(id),
      is_demo INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT REFERENCES orders(id),
      product_id TEXT REFERENCES products(id),
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_status_history (
      id TEXT PRIMARY KEY,
      order_id TEXT REFERENCES orders(id),
      status TEXT NOT NULL,
      note TEXT,
      changed_by TEXT,
      changed_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      order_id TEXT REFERENCES orders(id),
      gstin TEXT DEFAULT '27AABCP1234F1Z9',
      issued_at TEXT DEFAULT (datetime('now')),
      pdf_snapshot_json TEXT
    );

    CREATE TABLE IF NOT EXISTS inventory (
      product_id TEXT PRIMARY KEY REFERENCES products(id),
      stock_quantity INTEGER NOT NULL DEFAULT 0,
      low_stock_threshold INTEGER NOT NULL DEFAULT 10
    );

    CREATE TABLE IF NOT EXISTS picking_tasks (
      id TEXT PRIMARY KEY,
      order_id TEXT REFERENCES orders(id),
      status TEXT CHECK(status IN ('PENDING','PICKING','PICKED')) NOT NULL,
      assigned_operator_id TEXT REFERENCES users(id),
      picked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS packing_tasks (
      id TEXT PRIMARY KEY,
      order_id TEXT REFERENCES orders(id),
      status TEXT CHECK(status IN ('PENDING','PACKING','PACKED')) NOT NULL,
      weight_grams INTEGER,
      dimensions TEXT,
      packed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS destinations (
      id TEXT PRIMARY KEY,
      city TEXT UNIQUE NOT NULL,
      bin_label TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sorting_logs (
      id TEXT PRIMARY KEY,
      order_id TEXT REFERENCES orders(id),
      parcel_id TEXT REFERENCES parcels(id),
      detected_at TEXT,
      destination_city TEXT,
      assigned_bin TEXT,
      assigned_bin_id TEXT REFERENCES bins(id),
      sort_result TEXT CHECK(sort_result IN ('SUCCESS','FAILED','MANUAL_OVERRIDE')),
      duration_ms INTEGER
    );

    CREATE TABLE IF NOT EXISTS machine_status_log (
      id TEXT PRIMARY KEY,
      esp32_status TEXT,
      wifi_status TEXT,
      sensor_status TEXT,
      conveyor_status TEXT,
      robot_status TEXT,
      logged_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      type TEXT,
      severity TEXT CHECK(severity IN ('info','warning','critical')),
      message TEXT,
      resolved INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      token TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bins (
      id               TEXT PRIMARY KEY,
      bin_number       INTEGER NOT NULL UNIQUE,
      label            TEXT NOT NULL,
      category_id      TEXT REFERENCES categories(id),
      is_overflow      INTEGER NOT NULL DEFAULT 0,
      servo_preset_json TEXT NOT NULL DEFAULT '{"base":90,"shoulder":90,"elbow":90,"wrist":90}',
      is_active        INTEGER NOT NULL DEFAULT 1,
      parcel_count     INTEGER NOT NULL DEFAULT 0,
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS parcels (
      id                TEXT PRIMARY KEY,
      order_id          TEXT NOT NULL REFERENCES orders(id),
      label_version     INTEGER NOT NULL DEFAULT 1,
      label_payload     TEXT NOT NULL UNIQUE,
      label_print_count INTEGER NOT NULL DEFAULT 0,
      first_printed_at  TEXT,
      last_printed_at   TEXT,
      status            TEXT NOT NULL DEFAULT 'LABELED',
      assigned_bin_id   TEXT REFERENCES bins(id),
      scanned_at        TEXT,
      at_pick_point_at  TEXT,
      sorted_at         TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scan_events (
      id            TEXT PRIMARY KEY,
      parcel_id     TEXT REFERENCES parcels(id),
      raw_payload   TEXT NOT NULL,
      source        TEXT NOT NULL,
      result        TEXT NOT NULL,
      reason        TEXT,
      operator_id   TEXT REFERENCES users(id),
      device_id     TEXT,
      decode_ms     INTEGER,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS hardware_commands (
      id              TEXT PRIMARY KEY,
      device_id       TEXT NOT NULL,
      type            TEXT NOT NULL,
      parcel_id       TEXT REFERENCES parcels(id),
      bin_id          TEXT REFERENCES bins(id),
      payload_json    TEXT NOT NULL DEFAULT '{}',
      status          TEXT NOT NULL DEFAULT 'QUEUED',
      attempts        INTEGER NOT NULL DEFAULT 0,
      idempotency_key TEXT NOT NULL UNIQUE,
      expires_at      TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at    TEXT,
      failure_reason  TEXT
    );

    CREATE TABLE IF NOT EXISTS device_heartbeats (
      device_id    TEXT PRIMARY KEY,
      last_seen_at TEXT NOT NULL,
      firmware     TEXT,
      rssi         INTEGER,
      state_json   TEXT
    );

    CREATE TABLE IF NOT EXISTS pipeline_faults (
      id           TEXT PRIMARY KEY,
      type         TEXT NOT NULL,
      parcel_id    TEXT,
      detail       TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      acked_at     TEXT,
      acked_by     TEXT
    );

    CREATE TABLE IF NOT EXISTS pipeline_state (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    );
  `);

  await seedDatabase(db);
}

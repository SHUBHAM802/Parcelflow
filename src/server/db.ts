import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';

import { seedDatabase } from './seed';
import { hashPassword } from './auth';

let dbInstance: Database | null = null;
const DB_FILE = path.join(process.cwd(), 'parcelflow.sqlite');

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

function migrateUserPasswords(db: Database) {
  try {
    const res = db.exec("SELECT id, password_hash FROM users");
    if (res.length > 0 && res[0].values) {
      for (const row of res[0].values) {
        const uId = row[0] as string;
        const uPass = row[1] as string;
        if (uPass && !uPass.includes(':')) {
          const hashed = hashPassword(uPass);
          db.run("UPDATE users SET password_hash = ? WHERE id = ?", [hashed, uId]);
        }
      }
    }
  } catch (err) {
    console.error('Password migration error:', err);
  }
}

export async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance;

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE)) {
    try {
      const buffer = fs.readFileSync(DB_FILE);
      dbInstance = new SQL.Database(buffer);
      // Migrate seed emails to @parcelflow.com if needed
      dbInstance.run("UPDATE users SET email = 'rahul@parcelflow.com' WHERE email = 'rahul@parcelflow.demo'");
      dbInstance.run("UPDATE users SET email = 'operator@parcelflow.com' WHERE email = 'operator@parcelflow.demo'");
      dbInstance.run("UPDATE users SET email = 'admin@parcelflow.com' WHERE email = 'admin@parcelflow.demo'");
      // Migration: create password_reset_tokens table if missing (for existing databases)
      dbInstance.run(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT REFERENCES users(id),
          token TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          used INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now'))
        );
      `);
      // Migration: add avatar_url and firebase_uid columns to users table if missing
      try {
        dbInstance.run("ALTER TABLE users ADD COLUMN avatar_url TEXT;");
      } catch {}
      try {
        dbInstance.run("ALTER TABLE users ADD COLUMN firebase_uid TEXT;");
      } catch {}
      applyPragmasAndIndexes(dbInstance);
      migrateUserPasswords(dbInstance);
      saveDb();
      return dbInstance;
    } catch (e) {
      console.error('Failed to load existing database file, creating fresh one', e);
    }
  }

  dbInstance = new SQL.Database();
  await initSchemaAndSeed(dbInstance);
  applyPragmasAndIndexes(dbInstance);
  migrateUserPasswords(dbInstance);
  saveDb();
  return dbInstance;
}

let inTransaction = false;

export function saveDb() {
  if (!dbInstance || inTransaction) return;
  try {
    const data = dbInstance.export();
    fs.writeFileSync(DB_FILE, Buffer.from(data));
  } catch (e) {
    console.error('Failed to persist database to disk', e);
  }
}

export function transaction<T>(fn: () => T): T {
  if (!dbInstance) throw new Error('Database not initialized');
  inTransaction = true;
  dbInstance.run("BEGIN TRANSACTION");
  try {
    const result = fn();
    dbInstance.run("COMMIT");
    inTransaction = false;
    saveDb();
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
      detected_at TEXT,
      destination_city TEXT,
      assigned_bin TEXT,
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
  `);

  await seedDatabase(db);
}

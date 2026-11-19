import { getDb, queryOne, run, saveDb } from '../src/server/db';
import { hashPassword } from '../src/server/auth';
import crypto from 'crypto';

async function main() {
  const args = process.argv.slice(2);
  let email = '';
  let password = '';
  let name = 'ParcelFlow Admin';
  let phone = '+91 99999 88888';

  for (const arg of args) {
    if (arg.startsWith('--email=')) email = arg.split('=')[1].trim();
    else if (arg.startsWith('--password=')) password = arg.split('=')[1].trim();
    else if (arg.startsWith('--name=')) name = arg.split('=')[1].trim();
    else if (arg.startsWith('--phone=')) phone = arg.split('=')[1].trim();
  }

  // Fallbacks if not provided via flags
  if (!email) email = process.env.ADMIN_BOOTSTRAP_EMAIL || 'admin@parcelflow.com';
  if (!password) password = process.env.ADMIN_BOOTSTRAP_PASSWORD || 'Admin@PF2026!';

  if (!email || !email.includes('@')) {
    console.error('Error: A valid email address is required. Use --email=your@email.com');
    process.exit(1);
  }

  if (!password || password.length < 8) {
    console.error('Error: Password must be at least 8 characters long. Use --password=yourpassword');
    process.exit(1);
  }

  console.log('[ParcelFlow Admin Bootstrap] Connecting to database...');
  await getDb();

  const existing = queryOne<{ id: string; role: string; name: string }>(
    'SELECT id, role, name FROM users WHERE LOWER(email) = LOWER(?)',
    [email]
  );

  const hashedPassword = hashPassword(password);
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

  if (existing) {
    console.log(`[ParcelFlow Admin Bootstrap] User ${email} already exists (id: ${existing.id}). Elevating to admin and updating credentials.`);
    run(
      'UPDATE users SET password_hash = ?, role = "admin", name = ?, phone = ? WHERE id = ?',
      [hashedPassword, name || existing.name, phone, existing.id]
    );
  } else {
    const id = `usr-admin-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    console.log(`[ParcelFlow Admin Bootstrap] Creating new administrator account for ${email}...`);
    run(
      'INSERT INTO users (id, name, email, password_hash, role, phone, created_at) VALUES (?, ?, ?, ?, "admin", ?, ?)',
      [id, name, email.toLowerCase(), hashedPassword, phone, now]
    );
  }

  saveDb(true);
  console.log('\n======================================================');
  console.log('✓ Administrator account bootstrapped successfully!');
  console.log(`  Email : ${email}`);
  console.log(`  Role  : admin`);
  console.log(`  Name  : ${name}`);
  console.log('======================================================\n');
}

main().catch((err) => {
  console.error('[ParcelFlow Admin Bootstrap] Fatal error:', err);
  process.exit(1);
});

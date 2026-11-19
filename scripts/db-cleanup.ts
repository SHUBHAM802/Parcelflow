import { getDb, queryOne, query, run, transaction, saveDb } from '../src/server/db';

async function main() {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  const isDryRun = args.includes('--dry-run') || !isApply;

  console.log('======================================================');
  console.log(`[ParcelFlow DB Cleanup] Mode: ${isDryRun ? 'DRY-RUN (Simulated)' : 'APPLY (Executing deletions)'}`);
  console.log('======================================================\n');

  await getDb();

  const counts = {
    orders: queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM orders')?.cnt || 0,
    orderItems: queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM order_items')?.cnt || 0,
    history: queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM order_status_history')?.cnt || 0,
    pickingTasks: queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM picking_tasks')?.cnt || 0,
    packingTasks: queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM packing_tasks')?.cnt || 0,
    parcels: queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM parcels')?.cnt || 0,
    scanEvents: queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM scan_events')?.cnt || 0,
    sortingLogs: queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM sorting_logs')?.cnt || 0,
    hardwareCommands: queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM hardware_commands')?.cnt || 0,
    pipelineFaults: queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM pipeline_faults')?.cnt || 0,
    cartItems: queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM cart_items')?.cnt || 0,
    wishlistItems: queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM wishlist_items')?.cnt || 0,
    invoices: queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM invoices')?.cnt || 0,
    alerts: queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM alerts')?.cnt || 0,
    demoCustomers: queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM users WHERE role = "customer" AND email LIKE "%demo%"')?.cnt || 0,
    demoStaff: queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM users WHERE role IN ("operator", "admin") AND email LIKE "%demo%"')?.cnt || 0,
    adminCount: queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM users WHERE role = "admin"')?.cnt || 0,
    products: queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM products')?.cnt || 0,
    bins: queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM bins')?.cnt || 0,
    routeProfiles: queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM qr_route_profiles')?.cnt || 0,
    servoCalibrations: queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM servo_calibration')?.cnt || 0
  };

  console.log('Current Database Inventory:');
  console.log(`- Orders & Order Items       : ${counts.orders} orders (${counts.orderItems} line items)`);
  console.log(`- Order Status History Logs  : ${counts.history}`);
  console.log(`- Picking & Packing Tasks    : ${counts.pickingTasks} pick / ${counts.packingTasks} pack`);
  console.log(`- Parcels & Scan Events      : ${counts.parcels} parcels, ${counts.scanEvents} scan events`);
  console.log(`- Sorting Logs               : ${counts.sortingLogs}`);
  console.log(`- Hardware Commands & Faults : ${counts.hardwareCommands} commands, ${counts.pipelineFaults} faults`);
  console.log(`- Invoices                   : ${counts.invoices}`);
  console.log(`- Cart & Wishlist Items      : ${counts.cartItems} cart, ${counts.wishlistItems} wishlist`);
  console.log(`- Alerts                     : ${counts.alerts}`);
  console.log(`- Total Admin Accounts       : ${counts.adminCount}`);
  console.log(`- Products & Inventory Units : ${counts.products} product SKUs (will be PRESERVED)`);
  console.log(`- Hardware Destination Bins  : ${counts.bins} bins (will be PRESERVED, counts reset)`);
  console.log(`- QR Route Profiles          : ${counts.routeProfiles} profiles (will be PRESERVED)`);
  console.log(`- Servo Joint Calibrations   : ${counts.servoCalibrations} calibrations (will be PRESERVED)`);

  if (isDryRun) {
    console.log('\n[Dry-Run Summary]');
    console.log('The following operations WOULD be executed in --apply mode:');
    console.log('1. TRUNCATE: orders, order_items, order_status_history, picking_tasks, packing_tasks');
    console.log('2. TRUNCATE: parcels, scan_events, sorting_logs, hardware_commands, pipeline_faults, invoices');
    console.log('3. TRUNCATE: cart_items, wishlist_items, alerts');
    console.log('4. RESET   : All destination bins parcel_count set to 0');
    console.log('5. RESET   : Pipeline state conveyor_desired set to STOP');
    console.log('6. PRESERVE: Products, Categories, Users, Bins, Route Profiles, Servo Calibrations');
    console.log('\nTo execute these changes, run:');
    console.log('  npm run db:cleanup:apply');
    process.exit(0);
  }

  // Apply mode
  console.log('\n[Applying Cleanup]');
  transaction(() => {
    run('DELETE FROM order_items');
    run('DELETE FROM order_status_history');
    run('DELETE FROM picking_tasks');
    run('DELETE FROM packing_tasks');
    run('DELETE FROM sorting_logs');
    run('DELETE FROM scan_events');
    run('DELETE FROM hardware_commands');
    run('DELETE FROM pipeline_faults');
    run('DELETE FROM invoices');
    run('DELETE FROM parcels');
    run('DELETE FROM orders');
    run('DELETE FROM cart_items');
    run('DELETE FROM wishlist_items');
    run('DELETE FROM alerts');
    run('UPDATE bins SET parcel_count = 0');
    run("UPDATE pipeline_state SET value = 'STOP' WHERE key = 'conveyor_desired'");
    run("UPDATE pipeline_state SET value = '1' WHERE key = 'conveyor_revision'");
  });

  saveDb(true);
  console.log('✓ Cleanup successfully applied!');
  console.log('Database is now in pristine empty-state for live physical conveyor demonstration.');
}

main().catch((err) => {
  console.error('[ParcelFlow DB Cleanup] Fatal error:', err);
  process.exit(1);
});

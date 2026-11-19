import { Database } from 'sql.js';
import { hashPassword } from './auth';

export async function seedDatabase(db: Database) {
  // Check if already seeded
  const check = db.exec("SELECT COUNT(*) as cnt FROM users");
  if (check.length > 0 && check[0].values.length > 0 && (check[0].values[0][0] as number) > 0) {
    return;
  }

  // 1. Users
  const users = [
    { id: 'usr-customer-1', name: 'Rahul Sharma', email: 'rahul@parcelflow.com', password_hash: hashPassword('demo123'), role: 'customer', phone: '+91 98765 43210' },
    { id: 'usr-operator-1', name: 'Vikram Patel', email: 'operator@parcelflow.com', password_hash: hashPassword('demo123'), role: 'operator', phone: '+91 98231 11223' },
    { id: 'usr-admin-1', name: 'Ananya Iyer', email: 'admin@parcelflow.com', password_hash: hashPassword('demo123'), role: 'admin', phone: '+91 99100 88776' },
    // Additional customers
    { id: 'usr-cust-2', name: 'Priya Deshmukh', email: 'priya.d@gmail.com', password_hash: hashPassword('pass123'), role: 'customer', phone: '+91 98220 12345' },
    { id: 'usr-cust-3', name: 'Rohan Mehta', email: 'rohan.mehta@yahoo.in', password_hash: hashPassword('pass123'), role: 'customer', phone: '+91 98330 23456' },
    { id: 'usr-cust-4', name: 'Sneha Reddy', email: 'sneha.reddy@outlook.com', password_hash: hashPassword('pass123'), role: 'customer', phone: '+91 98440 34567' },
    { id: 'usr-cust-5', name: 'Amit Verma', email: 'amit.verma@gmail.com', password_hash: hashPassword('pass123'), role: 'customer', phone: '+91 98550 45678' },
    { id: 'usr-cust-6', name: 'Pooja Gupta', email: 'pooja.gupta@rediffmail.com', password_hash: hashPassword('pass123'), role: 'customer', phone: '+91 98660 56789' },
    { id: 'usr-cust-7', name: 'Arjun Nair', email: 'arjun.nair@live.com', password_hash: hashPassword('pass123'), role: 'customer', phone: '+91 98770 67890' },
    { id: 'usr-cust-8', name: 'Deepa Joshi', email: 'deepa.j@gmail.com', password_hash: hashPassword('pass123'), role: 'customer', phone: '+91 98880 78901' },
    { id: 'usr-cust-9', name: 'Rajesh Pillai', email: 'rajesh.pillai@gmail.com', password_hash: hashPassword('pass123'), role: 'customer', phone: '+91 98990 89012' },
    { id: 'usr-cust-10', name: 'Kavita Rao', email: 'kavita.rao@gmail.com', password_hash: hashPassword('pass123'), role: 'customer', phone: '+91 98110 90123' },
    { id: 'usr-cust-11', name: 'Suresh Kumar', email: 'suresh.k@gmail.com', password_hash: hashPassword('pass123'), role: 'customer', phone: '+91 98221 01234' },
    { id: 'usr-cust-12', name: 'Meera Nair', email: 'meera.nair@gmail.com', password_hash: hashPassword('pass123'), role: 'customer', phone: '+91 98331 12345' },
    { id: 'usr-cust-13', name: 'Vikram Malhotra', email: 'v.malhotra@gmail.com', password_hash: hashPassword('pass123'), role: 'customer', phone: '+91 98441 23456' },
    { id: 'usr-cust-14', name: 'Neha Jain', email: 'neha.jain@gmail.com', password_hash: hashPassword('pass123'), role: 'customer', phone: '+91 98551 34567' },
    { id: 'usr-cust-15', name: 'Karan Kapoor', email: 'karan.k@gmail.com', password_hash: hashPassword('pass123'), role: 'customer', phone: '+91 98661 45678' }
  ];

  for (const u of users) {
    db.run("INSERT INTO users (id, name, email, password_hash, role, phone) VALUES (?, ?, ?, ?, ?, ?)",
      [u.id, u.name, u.email, u.password_hash, u.role, u.phone]);
  }

  // 2. Categories
  const categories = [
    { id: 'cat-electronics', name: 'Electronics', slug: 'electronics' },
    { id: 'cat-home', name: 'Home & Kitchen', slug: 'home-kitchen' },
    { id: 'cat-fashion', name: 'Fashion', slug: 'fashion' },
    { id: 'cat-books', name: 'Books', slug: 'books' },
    { id: 'cat-fitness', name: 'Fitness', slug: 'fitness' },
    { id: 'cat-accessories', name: 'Accessories', slug: 'accessories' }
  ];

  for (const c of categories) {
    db.run("INSERT INTO categories (id, name, slug) VALUES (?, ?, ?)", [c.id, c.name, c.slug]);
  }

  // 3. Destinations
  const destinations = [
    { id: 'dest-1', city: 'Pune', bin_label: 'BOX A' },
    { id: 'dest-2', city: 'Delhi', bin_label: 'BOX B' },
    { id: 'dest-3', city: 'Mumbai', bin_label: 'BOX C' },
    { id: 'dest-4', city: 'Bengaluru', bin_label: 'BOX D' },
    { id: 'dest-5', city: 'Other', bin_label: 'BOX E' }
  ];

  for (const d of destinations) {
    db.run("INSERT INTO destinations (id, city, bin_label) VALUES (?, ?, ?)", [d.id, d.city, d.bin_label]);
  }

  // 3b. Bins (physical prototype - 7 bins with 7-servo kinematic presets)
  const bins = [
    { id: 'bin-1', bin_number: 1, label: 'DELHI HUB (BIN 1)', category_id: 'cat-electronics', is_overflow: 0, is_disposable_fallback: 0, servo_preset_json: '{"base":35,"shoulder":80,"elbow":110,"wrist_pitch":85,"wrist_roll":90,"gripper":110,"aux":90}' },
    { id: 'bin-2', bin_number: 2, label: 'MAHARASHTRA HUB (BIN 2)', category_id: 'cat-fashion', is_overflow: 0, is_disposable_fallback: 0, servo_preset_json: '{"base":65,"shoulder":85,"elbow":110,"wrist_pitch":85,"wrist_roll":90,"gripper":110,"aux":90}' },
    { id: 'bin-3', bin_number: 3, label: 'PUNE METRO (BIN 3)', category_id: 'cat-books', is_overflow: 0, is_disposable_fallback: 0, servo_preset_json: '{"base":90,"shoulder":85,"elbow":115,"wrist_pitch":85,"wrist_roll":90,"gripper":110,"aux":90}' },
    { id: 'bin-4', bin_number: 4, label: 'NORTH EXPRESS (BIN 4)', category_id: null, is_overflow: 1, is_disposable_fallback: 0, servo_preset_json: '{"base":115,"shoulder":80,"elbow":110,"wrist_pitch":85,"wrist_roll":90,"gripper":110,"aux":90}' },
    { id: 'bin-5', bin_number: 5, label: 'SOUTH EXPRESS (BIN 5)', category_id: null, is_overflow: 0, is_disposable_fallback: 0, servo_preset_json: '{"base":140,"shoulder":75,"elbow":105,"wrist_pitch":85,"wrist_roll":90,"gripper":110,"aux":90}' },
    { id: 'bin-6', bin_number: 6, label: 'EAST EXPRESS (BIN 6)', category_id: null, is_overflow: 0, is_disposable_fallback: 0, servo_preset_json: '{"base":160,"shoulder":75,"elbow":100,"wrist_pitch":85,"wrist_roll":90,"gripper":110,"aux":90}' },
    { id: 'bin-7', bin_number: 7, label: 'DISPOSABLE / REJECT (BIN 7)', category_id: null, is_overflow: 1, is_disposable_fallback: 1, servo_preset_json: '{"base":180,"shoulder":70,"elbow":95,"wrist_pitch":80,"wrist_roll":90,"gripper":110,"aux":90}' },
  ];

  const binSeedTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
  for (const b of bins) {
    db.run(
      "INSERT INTO bins (id, bin_number, label, category_id, is_overflow, is_disposable_fallback, servo_preset_json, is_active, parcel_count, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?)",
      [b.id, b.bin_number, b.label, b.category_id, b.is_overflow, b.is_disposable_fallback, b.servo_preset_json, binSeedTime]
    );
  }

  // 3b-2. Predefined QR Destination Route Profiles (6 standard + 1 disposable fallback)
  const routeProfiles = [
    { id: 'prof-delhi', code: 'DEL', name: 'Delhi Capital Hub', city: 'Delhi', target_bin_id: 'bin-1', is_disposable: 0, payload: 'PF1.ROUTE.DEL.d3l9a8b7c6', notes: 'Priority sorting for Northern NCR hub' },
    { id: 'prof-maharashtra', code: 'MH', name: 'Maharashtra Regional Gateway', city: 'Mumbai', target_bin_id: 'bin-2', is_disposable: 0, payload: 'PF1.ROUTE.MH.m4h5b6c7d8', notes: 'State distribution for West zone & Mumbai' },
    { id: 'prof-pune', code: 'PN', name: 'Pune Metro Express', city: 'Pune', target_bin_id: 'bin-3', is_disposable: 0, payload: 'PF1.ROUTE.PN.p9n8e7d6c5', notes: 'Local automated fulfillment for Pune & PCMC' },
    { id: 'prof-hub4', code: 'HUB4', name: 'Bengaluru Tech Corridor', city: 'Bengaluru', target_bin_id: 'bin-4', is_disposable: 0, payload: 'PF1.ROUTE.HUB4.b4e5n6g7h8', notes: 'South-Central express destination (configurable)' },
    { id: 'prof-hub5', code: 'HUB5', name: 'Hyderabad Deccan Gateway', city: 'Hyderabad', target_bin_id: 'bin-5', is_disposable: 0, payload: 'PF1.ROUTE.HUB5.h5y6d7e8r9', notes: 'South regional gateway hub (configurable)' },
    { id: 'prof-hub6', code: 'HUB6', name: 'Kolkata East Terminal', city: 'Kolkata', target_bin_id: 'bin-6', is_disposable: 0, payload: 'PF1.ROUTE.HUB6.k6o7l8k9a0', notes: 'Eastern logistics arterial link (configurable)' },
    { id: 'prof-fallback', code: 'FALLBACK', name: 'Disposable / Unreadable Reject', city: 'Unknown', target_bin_id: 'bin-7', is_disposable: 1, payload: 'PF1.ROUTE.FALLBACK.f0a1l2l3b4', notes: 'Safety catch-all for damaged/unregistered/foreign barcodes' }
  ];

  for (const rp of routeProfiles) {
    db.run(
      "INSERT OR REPLACE INTO qr_route_profiles (id, code, name, city, target_bin_id, is_disposable_fallback, is_active, qr_code_payload, notes, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)",
      [rp.id, rp.code, rp.name, rp.city, rp.target_bin_id, rp.is_disposable, rp.payload, rp.notes, binSeedTime]
    );
  }

  // 3b-3. Servo Calibration records (PCA9685 CH0-CH6)
  const servoCalibrations = [
    { id: 'calib-0', joint_index: 0, joint_name: 'Base (Waist Rotation)', servo_model: 'MG996R', pca_channel: 0, min_angle: 0, max_angle: 180, min_pulse_us: 500, max_pulse_us: 2500, default_angle: 90 },
    { id: 'calib-1', joint_index: 1, joint_name: 'Shoulder (Arm Pitch)', servo_model: 'MG996R', pca_channel: 1, min_angle: 15, max_angle: 165, min_pulse_us: 500, max_pulse_us: 2500, default_angle: 85 },
    { id: 'calib-2', joint_index: 2, joint_name: 'Elbow (Forearm Lift)', servo_model: 'MG996R', pca_channel: 2, min_angle: 15, max_angle: 165, min_pulse_us: 500, max_pulse_us: 2500, default_angle: 105 },
    { id: 'calib-3', joint_index: 3, joint_name: 'Wrist Pitch (End Effector Tilt)', servo_model: 'MG996R', pca_channel: 3, min_angle: 0, max_angle: 180, min_pulse_us: 500, max_pulse_us: 2500, default_angle: 85 },
    { id: 'calib-4', joint_index: 4, joint_name: 'Wrist Roll (End Effector Swivel)', servo_model: 'MG90S', pca_channel: 4, min_angle: 0, max_angle: 180, min_pulse_us: 500, max_pulse_us: 2500, default_angle: 90 },
    { id: 'calib-5', joint_index: 5, joint_name: 'Gripper (Claw Clamp)', servo_model: 'MG90S', pca_channel: 5, min_angle: 30, max_angle: 125, min_pulse_us: 600, max_pulse_us: 2400, default_angle: 50 },
    { id: 'calib-6', joint_index: 6, joint_name: 'Auxiliary (Stabilizer / Cam)', servo_model: 'MG90S', pca_channel: 6, min_angle: 0, max_angle: 180, min_pulse_us: 500, max_pulse_us: 2500, default_angle: 90 },
  ];

  for (const sc of servoCalibrations) {
    db.run(
      "INSERT OR REPLACE INTO servo_calibration (id, joint_index, joint_name, servo_model, pca_channel, min_angle, max_angle, min_pulse_us, max_pulse_us, default_angle, trim_offset, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)",
      [sc.id, sc.joint_index, sc.joint_name, sc.servo_model, sc.pca_channel, sc.min_angle, sc.max_angle, sc.min_pulse_us, sc.max_pulse_us, sc.default_angle, binSeedTime]
    );
  }

  // 3c. Pipeline initial state
  db.run("INSERT OR IGNORE INTO pipeline_state (key, value, updated_at) VALUES ('conveyor_desired', 'STOP', ?)", [binSeedTime]);
  db.run("INSERT OR IGNORE INTO pipeline_state (key, value, updated_at) VALUES ('conveyor_revision', '1', ?)", [binSeedTime]);
  db.run("INSERT OR IGNORE INTO pipeline_state (key, value, updated_at) VALUES ('conveyor_speed_pct', '100', ?)", [binSeedTime]);
  db.run("INSERT OR IGNORE INTO pipeline_state (key, value, updated_at) VALUES ('estop_active', 'false', ?)", [binSeedTime]);

  // 4. Products (~40 realistic Indian-market items)
  const products = [
    // Electronics
    { id: 'prod-1', name: 'AeroSound Pro ANC Wireless Headphones', category_id: 'cat-electronics', price: 2999, discount_percent: 15, rating: 4.6, rating_count: 128, rack: 'Rack A-01', weight: 320, stock: 45, lowStock: 10, image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&q=80', desc: 'Hybrid active noise cancellation with 40-hour battery life and fast Type-C charging.' },
    { id: 'prod-2', name: 'VoltCharge 20000mAh Power Bank 65W', category_id: 'cat-electronics', price: 1899, discount_percent: 10, rating: 4.4, rating_count: 94, rack: 'Rack A-02', weight: 410, stock: 38, lowStock: 10, image: 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=500&q=80', desc: 'Triple port fast charging power bank with digital power display and PD 3.0.' },
    { id: 'prod-3', name: 'NovaSync Smart Fitness Watch with SpO2', category_id: 'cat-electronics', price: 2499, discount_percent: 20, rating: 4.5, rating_count: 210, rack: 'Rack A-03', weight: 110, stock: 4, lowStock: 10, image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&q=80', desc: '1.78 inch AMOLED always-on display with heart-rate, sleep tracking, and IP68 water resistance.' },
    { id: 'prod-4', name: 'SonicBlast Portable Bluetooth 5.3 Speaker', category_id: 'cat-electronics', price: 1299, discount_percent: 0, rating: 4.2, rating_count: 82, rack: 'Rack A-04', weight: 480, stock: 25, lowStock: 10, image: 'https://images.unsplash.com/photo-1545454675-3531b543be5d?w=500&q=80', desc: '16W punchy stereo sound with passive bass radiators and rugged fabric exterior.' },
    { id: 'prod-5', name: 'Precision Optical Ergonomic Mouse', category_id: 'cat-electronics', price: 699, discount_percent: 5, rating: 4.3, rating_count: 65, rack: 'Rack A-05', weight: 140, stock: 60, lowStock: 12, image: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=500&q=80', desc: 'Dual mode 2.4G and Bluetooth ergonomic vertical wireless mouse.' },
    { id: 'prod-6', name: 'UltraStream 4K HDMI Capture Card', category_id: 'cat-electronics', price: 1499, discount_percent: 12, rating: 4.1, rating_count: 38, rack: 'Rack A-06', weight: 90, stock: 18, lowStock: 8, image: 'https://images.unsplash.com/photo-1544652478-6653e09f18a2?w=500&q=80', desc: 'Plug and play video recording card for streaming, gaming, and conferencing.' },
    { id: 'prod-7', name: 'TrueBass True Wireless Earbuds with ENC', category_id: 'cat-electronics', price: 1199, discount_percent: 25, rating: 4.5, rating_count: 310, rack: 'Rack A-07', weight: 85, stock: 52, lowStock: 15, image: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=500&q=80', desc: '13mm deep bass titanium drivers with quad mic environmental noise cancellation.' },

    // Home & Kitchen
    { id: 'prod-8', name: 'ThermaSteel Insulated Water Bottle 1000ml', category_id: 'cat-home', price: 649, discount_percent: 10, rating: 4.7, rating_count: 420, rack: 'Rack B-01', weight: 450, stock: 75, lowStock: 15, image: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=500&q=80', desc: 'Double walled vacuum insulation keeps water cold 24 hrs or piping hot 18 hrs.' },
    { id: 'prod-9', name: 'BaristaTouch French Press Coffee Maker', category_id: 'cat-home', price: 899, discount_percent: 15, rating: 4.6, rating_count: 140, rack: 'Rack B-02', weight: 650, stock: 3, lowStock: 8, image: 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=500&q=80', desc: 'Heat-resistant borosilicate glass with 4-level stainless steel filtration.' },
    { id: 'prod-10', name: 'ChefCraft 3-Piece Non-Stick Frying Pan Set', category_id: 'cat-home', price: 1799, discount_percent: 20, rating: 4.3, rating_count: 88, rack: 'Rack B-03', weight: 1800, stock: 22, lowStock: 6, image: 'https://images.unsplash.com/photo-1584990347449-3e3e29f37c3a?w=500&q=80', desc: 'Granite coated induction-compatible frying pans with stay-cool handles.' },
    { id: 'prod-11', name: 'PureMist Ultrasonic Aroma Diffuser & Humidifier', category_id: 'cat-home', price: 1149, discount_percent: 5, rating: 4.4, rating_count: 73, rack: 'Rack B-04', weight: 390, stock: 28, lowStock: 10, image: 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=500&q=80', desc: '500ml capacity with 7-color soothing LED mood light and auto shut-off.' },
    { id: 'prod-12', name: 'AromaSpices 12-Jar Revolving Spice Rack', category_id: 'cat-home', price: 799, discount_percent: 0, rating: 4.1, rating_count: 52, rack: 'Rack B-05', weight: 1100, stock: 35, lowStock: 10, image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=500&q=80', desc: '360-degree rotating spice organizer with food-grade airtight containers.' },
    { id: 'prod-13', name: 'BambooComfort Memory Foam Orthopedic Pillow', category_id: 'cat-home', price: 1299, discount_percent: 18, rating: 4.6, rating_count: 165, rack: 'Rack B-06', weight: 950, stock: 40, lowStock: 12, image: 'https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?w=500&q=80', desc: 'Contoured neck support pillow with breathable washable bamboo fiber cover.' },

    // Fashion
    { id: 'prod-14', name: 'Classic Pure Cotton Oxford Slim Shirt', category_id: 'cat-fashion', price: 1199, discount_percent: 25, rating: 4.4, rating_count: 98, rack: 'Rack C-01', weight: 280, stock: 50, lowStock: 15, image: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=500&q=80', desc: 'Breathable 100% combed cotton formal and semi-formal button down shirt.' },
    { id: 'prod-15', name: 'Everyday Stretch Chinos Trouser', category_id: 'cat-fashion', price: 1499, discount_percent: 20, rating: 4.2, rating_count: 76, rack: 'Rack C-02', weight: 420, stock: 32, lowStock: 10, image: 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=500&q=80', desc: 'Four-way flex fabric with stain repellent finish in versatile khaki tone.' },
    { id: 'prod-16', name: 'AirStride Ultra Lightweight Running Shoes', category_id: 'cat-fashion', price: 2299, discount_percent: 15, rating: 4.5, rating_count: 230, rack: 'Rack C-03', weight: 680, stock: 19, lowStock: 8, image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&q=80', desc: 'High rebound EVA cushioning sole with breathable mesh engineered upper.' },
    { id: 'prod-17', name: 'Vintage Genuine Leather Bifold Wallet', category_id: 'cat-fashion', price: 749, discount_percent: 0, rating: 4.7, rating_count: 180, rack: 'Rack C-04', weight: 110, stock: 2, lowStock: 10, image: 'https://images.unsplash.com/photo-1627123424574-724758594e93?w=500&q=80', desc: 'Full grain handcrafted leather wallet with RFID blocking protection.' },
    { id: 'prod-18', name: 'Polarized Aviator Sunglasses UV400', category_id: 'cat-fashion', price: 899, discount_percent: 30, rating: 4.3, rating_count: 64, rack: 'Rack C-05', weight: 80, stock: 45, lowStock: 10, image: 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=500&q=80', desc: 'Metal frame lightweight sunglasses with anti-glare scratch resistant lenses.' },
    { id: 'prod-19', name: 'All-Weather Waterproof Commuter Backpack 25L', category_id: 'cat-fashion', price: 1699, discount_percent: 10, rating: 4.6, rating_count: 142, rack: 'Rack C-06', weight: 820, stock: 30, lowStock: 10, image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=500&q=80', desc: 'Dedicated 15.6 inch padded laptop compartment with anti-theft hidden pocket.' },

    // Books
    { id: 'prod-20', name: 'System Design Interview – An Insider\'s Guide', category_id: 'cat-books', price: 999, discount_percent: 10, rating: 4.9, rating_count: 540, rack: 'Rack D-01', weight: 620, stock: 48, lowStock: 12, image: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500&q=80', desc: 'Comprehensive guide to scaling distributed systems, caching, and storage architecture.' },
    { id: 'prod-21', name: 'Atomic Habits by James Clear', category_id: 'cat-books', price: 499, discount_percent: 20, rating: 4.8, rating_count: 890, rack: 'Rack D-02', weight: 350, stock: 65, lowStock: 15, image: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=500&q=80', desc: 'Proven framework for improving every day through compounding micro-behaviors.' },
    { id: 'prod-22', name: 'The Psychology of Money by Morgan Housel', category_id: 'cat-books', price: 399, discount_percent: 15, rating: 4.7, rating_count: 620, rack: 'Rack D-03', weight: 290, stock: 55, lowStock: 15, image: 'https://images.unsplash.com/photo-1589829085413-56de8ae18c73?w=500&q=80', desc: 'Timeless lessons on wealth, greed, and happiness in 19 engaging short stories.' },
    { id: 'prod-23', name: 'Designing Data-Intensive Applications', category_id: 'cat-books', price: 1499, discount_percent: 5, rating: 4.9, rating_count: 310, rack: 'Rack D-04', weight: 890, stock: 20, lowStock: 8, image: 'https://images.unsplash.com/photo-1532012164546-f432f2e3777a?w=500&q=80', desc: 'The definitive big ideas behind reliable, scalable, and maintainable systems.' },
    { id: 'prod-24', name: 'Deep Work: Rules for Focused Success', category_id: 'cat-books', price: 449, discount_percent: 10, rating: 4.6, rating_count: 240, rack: 'Rack D-05', weight: 310, stock: 35, lowStock: 10, image: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=500&q=80', desc: 'Transformative philosophy to achieve peak cognitive productivity without distraction.' },

    // Fitness
    { id: 'prod-25', name: 'ProGrip High Density Yoga Mat with Strap (6mm)', category_id: 'cat-fitness', price: 849, discount_percent: 15, rating: 4.5, rating_count: 175, rack: 'Rack E-01', weight: 1200, stock: 42, lowStock: 12, image: 'https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=500&q=80', desc: 'Eco-friendly non-slip TPE material with laser alignment guide lines.' },
    { id: 'prod-26', name: 'PowerFlex Resistance Bands Set (5 Levels)', category_id: 'cat-fitness', price: 599, discount_percent: 25, rating: 4.3, rating_count: 110, rack: 'Rack E-02', weight: 450, stock: 58, lowStock: 15, image: 'https://images.unsplash.com/photo-1598289431512-b97b0917affc?w=500&q=80', desc: 'Natural latex loop bands with door anchor, handles, and waterproof travel pouch.' },
    { id: 'prod-27', name: 'IronCore Hexagonal Rubber Dumbbells (Set of 2x5kg)', category_id: 'cat-fitness', price: 1899, discount_percent: 10, rating: 4.6, rating_count: 95, rack: 'Rack E-03', weight: 10000, stock: 15, lowStock: 5, image: 'https://images.unsplash.com/photo-1586401100295-7a8096fd231a?w=500&q=80', desc: 'Solid cast iron with anti-roll hexagonal rubber coated heads and knurled grip.' },
    { id: 'prod-28', name: 'OptiShake Leakproof Protein Shaker 700ml', category_id: 'cat-fitness', price: 349, discount_percent: 0, rating: 4.4, rating_count: 220, rack: 'Rack E-04', weight: 190, stock: 80, lowStock: 20, image: 'https://images.unsplash.com/photo-1594882645126-14020914d58d?w=500&q=80', desc: 'BPA-free with stainless steel wire whisk ball and dual storage compartments.' },
    { id: 'prod-29', name: 'SpeedRope Ball Bearing Skipping Rope', category_id: 'cat-fitness', price: 299, discount_percent: 10, rating: 4.2, rating_count: 85, rack: 'Rack E-05', weight: 160, stock: 65, lowStock: 15, image: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=500&q=80', desc: 'Tangle-free steel wire with 360-degree high speed swivel bearings.' },

    // Accessories
    { id: 'prod-30', name: 'Multi-Device Aluminum Laptop Stand Adjustable', category_id: 'cat-accessories', price: 1199, discount_percent: 20, rating: 4.7, rating_count: 280, rack: 'Rack F-01', weight: 750, stock: 38, lowStock: 10, image: 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=500&q=80', desc: 'Ergonomic 7-angle height adjustment with silicone non-scratch pads.' },
    { id: 'prod-31', name: 'MagSafe Compatible Wireless Charging Stand 3-in-1', category_id: 'cat-accessories', price: 2199, discount_percent: 15, rating: 4.5, rating_count: 130, rack: 'Rack F-02', weight: 340, stock: 26, lowStock: 8, image: 'https://images.unsplash.com/photo-1586816879360-004f5b0c51e3?w=500&q=80', desc: 'Fast charge phone, smartwatch, and earbuds simultaneously with LED indicator.' },
    { id: 'prod-32', name: 'Braided 100W USB-C to USB-C Cable (2m)', category_id: 'cat-accessories', price: 399, discount_percent: 0, rating: 4.6, rating_count: 310, rack: 'Rack F-03', weight: 60, stock: 90, lowStock: 25, image: 'https://images.unsplash.com/photo-1585338107529-13afc5f02586?w=500&q=80', desc: 'E-marker chip supported fast power delivery with military grade nylon jacket.' },
    { id: 'prod-33', name: 'DeskMat XL Waterproof Felt & Leather Desk Pad', category_id: 'cat-accessories', price: 699, discount_percent: 10, rating: 4.4, rating_count: 92, rack: 'Rack F-04', weight: 450, stock: 50, lowStock: 12, image: 'https://images.unsplash.com/photo-1616628188859-7a11abb6fcc9?w=500&q=80', desc: '900x400mm dual sided non-slip desk protector with smooth mouse glide.' },
    { id: 'prod-34', name: 'ScreenBright USB Monitor Light Bar with Auto Dim', category_id: 'cat-accessories', price: 1799, discount_percent: 12, rating: 4.8, rating_count: 145, rack: 'Rack F-05', weight: 520, stock: 20, lowStock: 6, image: 'https://images.unsplash.com/photo-1507499739999-097706ad8914?w=500&q=80', desc: 'Zero screen glare asymmetrical optical design with touch stepless dimming.' },
    { id: 'prod-35', name: 'Acoustic Soundproofing Desk Privacy Shield', category_id: 'cat-accessories', price: 1249, discount_percent: 5, rating: 4.1, rating_count: 32, rack: 'Rack F-06', weight: 890, stock: 15, lowStock: 5, image: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=500&q=80', desc: 'Eco-felt foldable sound absorbing panel for distraction-free workspace.' },
    { id: 'prod-36', name: 'Smart Key Organizer with Multi-Tool Clip', category_id: 'cat-accessories', price: 499, discount_percent: 15, rating: 4.3, rating_count: 88, rack: 'Rack F-07', weight: 75, stock: 45, lowStock: 10, image: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=500&q=80', desc: 'Aerospace aluminum compact key holder holds up to 10 keys silently.' }
  ];

  for (const p of products) {
    db.run(`INSERT INTO products (id, name, category_id, description, price, discount_percent, rating, rating_count, image_url, warehouse_rack_location, weight_grams)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [p.id, p.name, p.category_id, p.desc, p.price, p.discount_percent, p.rating, p.rating_count, p.image, p.rack, p.weight]);

    db.run(`INSERT INTO inventory (product_id, stock_quantity, low_stock_threshold) VALUES (?, ?, ?)`,
      [p.id, p.stock, p.lowStock]);
  }

  // 5. Seed Reviews
  const reviews = [
    { id: 'rev-1', product_id: 'prod-1', customer_id: 'usr-cust-2', customer_name: 'Priya Deshmukh', rating: 5, comment: 'Exceptional sound quality and ANC blocks out all Pune traffic noise!' },
    { id: 'rev-2', product_id: 'prod-1', customer_id: 'usr-cust-3', customer_name: 'Rohan Mehta', rating: 4, comment: 'Very comfortable cushions for long 6-hour work shifts. Fast delivery.' },
    { id: 'rev-3', product_id: 'prod-8', customer_id: 'usr-customer-1', customer_name: 'Rahul Sharma', rating: 5, comment: 'Truly keeps water chilled even in 40 degree heat. Solid build.' },
    { id: 'rev-4', product_id: 'prod-20', customer_id: 'usr-cust-5', customer_name: 'Amit Verma', rating: 5, comment: 'Must-read for every backend engineer preparing for tech interviews.' },
    { id: 'rev-5', product_id: 'prod-30', customer_id: 'usr-cust-7', customer_name: 'Arjun Nair', rating: 5, comment: 'Heavy duty metal construction, my 16 inch MacBook Pro fits stably.' }
  ];

  for (const r of reviews) {
    db.run(`INSERT INTO reviews (id, product_id, customer_id, customer_name, rating, comment) VALUES (?, ?, ?, ?, ?, ?)`,
      [r.id, r.product_id, r.customer_id, r.customer_name, r.rating, r.comment]);
  }

  // 6. Addresses
  const addresses = [
    { id: 'addr-1', customer_id: 'usr-customer-1', label: 'Home', full_name: 'Rahul Sharma', phone: '+91 98765 43210', line1: 'Flat 402, Rohan Viti', line2: 'Aundh Ravet Road', city: 'Pune', state: 'Maharashtra', pincode: '411007', is_default: 1 },
    { id: 'addr-2', customer_id: 'usr-customer-1', label: 'Work', full_name: 'Rahul Sharma', phone: '+91 98765 43210', line1: 'Tower 3, Hinjawadi Phase 2', line2: 'Tech Park', city: 'Pune', state: 'Maharashtra', pincode: '411057', is_default: 0 },
    { id: 'addr-3', customer_id: 'usr-cust-2', label: 'Home', full_name: 'Priya Deshmukh', phone: '+91 98220 12345', line1: '12-B, Prabhat Road', line2: 'Near Deccan Gymkhana', city: 'Pune', state: 'Maharashtra', pincode: '411004', is_default: 1 },
    { id: 'addr-4', customer_id: 'usr-cust-3', label: 'Home', full_name: 'Rohan Mehta', phone: '+91 98330 23456', line1: '404, Sea Breeze Apts', line2: 'Bandra West', city: 'Mumbai', state: 'Maharashtra', pincode: '400050', is_default: 1 },
    { id: 'addr-5', customer_id: 'usr-cust-4', label: 'Home', full_name: 'Sneha Reddy', phone: '+91 98440 34567', line1: 'Plot 78, Indiranagar 100ft Rd', line2: 'Near Metro', city: 'Bengaluru', state: 'Karnataka', pincode: '560038', is_default: 1 },
    { id: 'addr-6', customer_id: 'usr-cust-5', label: 'Home', full_name: 'Amit Verma', phone: '+91 98550 45678', line1: 'C-24, Greater Kailash 1', line2: 'M-Block Market', city: 'Delhi', state: 'Delhi', pincode: '110048', is_default: 1 },
    { id: 'addr-7', customer_id: 'usr-cust-6', label: 'Home', full_name: 'Pooja Gupta', phone: '+91 98660 56789', line1: '501, Golf Links Residency', line2: 'Cyber Hub', city: 'Delhi', state: 'Delhi', pincode: '122002', is_default: 1 },
    { id: 'addr-8', customer_id: 'usr-cust-7', label: 'Home', full_name: 'Arjun Nair', phone: '+91 98770 67890', line1: '23, Jubilee Hills Road 36', line2: 'Near Metro', city: 'Other', state: 'Telangana', pincode: '500033', is_default: 1 }
  ];

  for (const a of addresses) {
    db.run(`INSERT INTO addresses (id, customer_id, label, full_name, phone, line1, line2, city, state, pincode, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [a.id, a.customer_id, a.label, a.full_name, a.phone, a.line1, a.line2, a.city, a.state, a.pincode, a.is_default]);
  }

  // 7. Seed ~70 Historical Orders across past 30 days
  const cities = ['Pune', 'Delhi', 'Mumbai', 'Bengaluru', 'Other'];
  const binMap: Record<string, string> = { 'Pune': 'BOX A', 'Delhi': 'BOX B', 'Mumbai': 'BOX C', 'Bengaluru': 'BOX D', 'Other': 'BOX E' };
  const statuses = [
    'DELIVERED', 'DELIVERED', 'DELIVERED', 'DELIVERED', 'DELIVERED',
    'DISPATCHED', 'SORTED', 'ON_CONVEYOR', 'PACKED', 'PICKED', 'PICKING', 'CONFIRMED'
  ];

  // Specific active orders for demo clarity
  const predefinedOrders = [
    { id: 'ORD-10241', cust: 'usr-customer-1', city: 'Pune', status: 'ON_CONVEYOR', pay: 'PAID', method: 'UPI', prodId: 'prod-1', qty: 1, daysAgo: 0, bin: 'BOX A' },
    { id: 'ORD-10242', cust: 'usr-customer-1', city: 'Mumbai', status: 'PACKED', pay: 'PAID', method: 'CARD', prodId: 'prod-8', qty: 2, daysAgo: 0, bin: null },
    { id: 'ORD-10243', cust: 'usr-cust-2', city: 'Delhi', status: 'PICKING', pay: 'PAID', method: 'UPI', prodId: 'prod-20', qty: 1, daysAgo: 0, bin: null },
    { id: 'ORD-10244', cust: 'usr-cust-3', city: 'Bengaluru', status: 'CONFIRMED', pay: 'PAID', method: 'COD', prodId: 'prod-30', qty: 1, daysAgo: 0, bin: null },
    { id: 'ORD-10245', cust: 'usr-customer-1', city: 'Pune', status: 'DELIVERED', pay: 'PAID', method: 'UPI', prodId: 'prod-21', qty: 1, daysAgo: 4, bin: 'BOX A' },
    { id: 'ORD-10246', cust: 'usr-customer-1', city: 'Pune', status: 'DELIVERED', pay: 'PAID', method: 'CARD', prodId: 'prod-32', qty: 2, daysAgo: 12, bin: 'BOX A' }
  ];

  let orderCount = 10100;
  const now = new Date();

  // Insert predefined orders first
  for (const o of predefinedOrders) {
    const prod = products.find(p => p.id === o.prodId)!;
    const subtotal = prod.price * o.qty;
    const gst = Math.round(subtotal * 0.18 * 100) / 100;
    const total = subtotal + gst;
    const d = new Date(now.getTime() - o.daysAgo * 86400000);
    const dateStr = d.toISOString().replace('T', ' ').substring(0, 19);

    db.run(`INSERT INTO orders (id, customer_id, address_id, destination_city, status, payment_status, payment_method, subtotal, gst_amount, total_amount, assigned_bin, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [o.id, o.cust, 'addr-1', o.city, o.status, o.pay, o.method, subtotal, gst, total, o.bin, dateStr, dateStr]);

    db.run(`INSERT INTO order_items (id, order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?, ?)`,
      [`item-${o.id}-1`, o.id, prod.id, o.qty, prod.price]);

    db.run(`INSERT INTO order_status_history (id, order_id, status, note, changed_at) VALUES (?, ?, ?, ?, ?)`,
      [`hist-${o.id}-1`, o.id, 'PLACED', 'Order placed via Customer Portal', dateStr]);

    db.run(`INSERT INTO order_status_history (id, order_id, status, note, changed_at) VALUES (?, ?, ?, ?, ?)`,
      [`hist-${o.id}-2`, o.id, 'CONFIRMED', 'Payment verified successfully', dateStr]);

    if (['PICKED', 'PACKING', 'PACKED', 'ON_CONVEYOR', 'SORTED', 'DISPATCHED', 'DELIVERED'].includes(o.status)) {
      db.run(`INSERT INTO picking_tasks (id, order_id, status, assigned_operator_id, picked_at) VALUES (?, ?, ?, ?, ?)`,
        [`pick-${o.id}`, o.id, 'PICKED', 'usr-operator-1', dateStr]);
    } else if (o.status === 'PICKING') {
      db.run(`INSERT INTO picking_tasks (id, order_id, status, assigned_operator_id, picked_at) VALUES (?, ?, ?, ?, ?)`,
        [`pick-${o.id}`, o.id, 'PICKING', 'usr-operator-1', null]);
    }

    if (['PACKED', 'ON_CONVEYOR', 'SORTED', 'DISPATCHED', 'DELIVERED'].includes(o.status)) {
      db.run(`INSERT INTO packing_tasks (id, order_id, status, weight_grams, dimensions, packed_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [`pack-${o.id}`, o.id, 'PACKED', prod.weight * o.qty + 50, '22x16x8 cm', dateStr]);
    }

    // Invoice
    db.run(`INSERT INTO invoices (id, order_id, gstin, issued_at) VALUES (?, ?, ?, ?)`,
      [`INV-2026-${o.id.replace('ORD-', '')}`, o.id, '27AABCP1234F1Z9', dateStr]);

    // Sorting log if sorted or beyond
    if (['SORTED', 'DISPATCHED', 'DELIVERED'].includes(o.status)) {
      db.run(`INSERT INTO sorting_logs (id, order_id, detected_at, destination_city, assigned_bin, sort_result, duration_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [`sort-${o.id}`, o.id, dateStr, o.city, binMap[o.city] || 'BOX E', 'SUCCESS', 1420]);
    }
  }

  // Generate 65 historical orders spread across past 28 days for analytics charts
  for (let i = 0; i < 65; i++) {
    orderCount++;
    const orderId = `ORD-${orderCount}`;
    const cust = users[Math.floor(Math.random() * (users.length - 3)) + 3]; // pick from non-operator/admin
    const city = cities[Math.floor(Math.random() * cities.length)];
    const bin = binMap[city];
    const daysAgo = Math.floor(Math.random() * 28) + 1;
    const status = daysAgo > 3 ? 'DELIVERED' : statuses[Math.floor(Math.random() * statuses.length)];
    const pay = 'PAID';
    const method = Math.random() > 0.4 ? 'UPI' : (Math.random() > 0.5 ? 'CARD' : 'COD');
    const prod = products[Math.floor(Math.random() * products.length)];
    const qty = Math.floor(Math.random() * 2) + 1;
    const subtotal = prod.price * qty;
    const gst = Math.round(subtotal * 0.18 * 100) / 100;
    const total = subtotal + gst;

    const d = new Date(now.getTime() - daysAgo * 86400000 - Math.random() * 3600000 * 12);
    const dateStr = d.toISOString().replace('T', ' ').substring(0, 19);

    db.run(`INSERT INTO orders (id, customer_id, address_id, destination_city, status, payment_status, payment_method, subtotal, gst_amount, total_amount, assigned_bin, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderId, cust.id, 'addr-1', city, status, pay, method, subtotal, gst, total, bin, dateStr, dateStr]);

    db.run(`INSERT INTO order_items (id, order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?, ?)`,
      [`item-${orderId}-1`, orderId, prod.id, qty, prod.price]);

    db.run(`INSERT INTO order_status_history (id, order_id, status, note, changed_at) VALUES (?, ?, ?, ?, ?)`,
      [`hist-${orderId}-1`, orderId, 'PLACED', 'Order placed', dateStr]);
    db.run(`INSERT INTO order_status_history (id, order_id, status, note, changed_at) VALUES (?, ?, ?, ?, ?)`,
      [`hist-${orderId}-2`, orderId, 'CONFIRMED', 'Payment verified', dateStr]);

    if (status === 'DELIVERED' || status === 'DISPATCHED' || status === 'SORTED') {
      db.run(`INSERT INTO sorting_logs (id, order_id, detected_at, destination_city, assigned_bin, sort_result, duration_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [`sort-${orderId}`, orderId, dateStr, city, bin, 'SUCCESS', Math.floor(Math.random() * 800) + 1100]);
    }

    db.run(`INSERT INTO invoices (id, order_id, gstin, issued_at) VALUES (?, ?, ?, ?)`,
      [`INV-2026-${orderCount}`, orderId, '27AABCP1234F1Z9', dateStr]);
  }

  // 8. Alerts
  const alerts = [
    { id: 'alt-1', type: 'LOW_STOCK', severity: 'warning', message: 'NovaSync Smart Watch stock reached critical threshold (4 units remaining).', resolved: 0, created_at: new Date(now.getTime() - 3600000 * 2).toISOString().replace('T', ' ').substring(0, 19) },
    { id: 'alt-2', type: 'LOW_STOCK', severity: 'warning', message: 'BaristaTouch French Press stock reached critical threshold (3 units remaining).', resolved: 0, created_at: new Date(now.getTime() - 3600000 * 5).toISOString().replace('T', ' ').substring(0, 19) },
    { id: 'alt-3', type: 'SORT_FAILED', severity: 'critical', message: 'Optical IR barcode reflection missed on Conveyor Line 1. Manual check required.', resolved: 1, created_at: new Date(now.getTime() - 3600000 * 24).toISOString().replace('T', ' ').substring(0, 19) },
    { id: 'alt-4', type: 'MACHINE_OFFLINE', severity: 'info', message: 'Conveyor motor routine 15-minute diagnostic self-test passed.', resolved: 1, created_at: new Date(now.getTime() - 3600000 * 48).toISOString().replace('T', ' ').substring(0, 19) }
  ];

  for (const a of alerts) {
    db.run(`INSERT INTO alerts (id, type, severity, message, resolved, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [a.id, a.type, a.severity, a.message, a.resolved, a.created_at]);
  }

  // 9. Machine status logs
  db.run(`INSERT INTO machine_status_log (id, esp32_status, wifi_status, sensor_status, conveyor_status, robot_status)
    VALUES ('msl-1', 'ONLINE', 'CONNECTED', 'ACTIVE', 'RUNNING', 'READY')`);

  // 10. Seed Expenses (for Admin Billing / P&L)
  const expenses = [
    { id: 'exp-1', category: 'Logistics', description: 'BlueDart & Delhivery Last-Mile Delivery Carrier Invoices', amount: 38400, date: '2026-09-01 10:00:00' },
    { id: 'exp-2', category: 'Warehouse Rent', description: 'Chakan Industrial Zone Fulfillment Hub Facility Lease', amount: 45000, date: '2026-09-01 09:00:00' },
    { id: 'exp-3', category: 'Salaries', description: 'Warehouse Floor Staff & Technician Payroll (Aug)', amount: 62000, date: '2026-08-31 18:00:00' },
    { id: 'exp-4', category: 'Hardware & Maintenance', description: 'Conveyor belt tensioner & ESP32 motor driver replacement parts', amount: 8500, date: '2026-08-25 14:30:00' },
    { id: 'exp-5', category: 'Packaging Supplies', description: 'Corrugated cartons (Grade A), bubble rolls & thermal shipping labels', amount: 14200, date: '2026-08-20 11:00:00' }
  ];

  for (const e of expenses) {
    db.run(`INSERT INTO expenses (id, category, description, amount, date) VALUES (?, ?, ?, ?, ?)`,
      [e.id, e.category, e.description, e.amount, e.date]);
  }
}

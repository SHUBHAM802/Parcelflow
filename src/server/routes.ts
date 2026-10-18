import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { query, queryOne, run, transaction } from './db';
import {
  getMachineState,
  startConveyor,
  stopConveyor,
  pauseConveyor,
  emergencyStop,
  simulateFault
} from './hardware-simulator';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  extractUserFromRequest,
  loginRateLimiter,
  requireDeviceToken,
  AuthenticatedRequest
} from './auth';
import { transitionOrderStatus, isValidTransition } from './orderStateMachine';
import { getConfig, isGoogleLoginAvailable } from './config';
import {
  recordHeartbeat,
  handleIrEvent,
  getDesiredConveyorState,
  setDesiredConveyor,
  getNextCommandForDevice,
  acknowledgeCommand,
  completeCommand,
  failCommand,
  triggerEmergencyStop,
  resetEmergencyStop,
  getPipelineSnapshot
} from './services/hardwareService';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { Server as SocketIOServer } from 'socket.io';

// Google's public JWKS endpoint for Firebase ID token verification
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

export function createApiRouter(io: SocketIOServer) {
  const router = Router();

  // Helper middleware for protected routes
  const requireUser = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = extractUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }
    req.user = user;
    next();
  };

  const requireStaff = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = extractUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (user.role !== 'operator' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Warehouse operator or admin role required.' });
    }
    req.user = user;
    next();
  };

  const requireAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = extractUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }
    req.user = user;
    next();
  };

  // Helper to optionally resolve user without blocking
  const optionalUser = (req: Request) => {
    return extractUserFromRequest(req);
  };

  // ==========================================
  // AUTH
  // ==========================================
  router.post('/auth/login', loginRateLimiter(15, 60 * 1000), (req: Request, res: Response) => {
    const { email, password } = req.body;
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const altEmail = cleanEmail.endsWith('@parcelflow.com')
      ? cleanEmail.replace('@parcelflow.com', '@parcelflow.demo')
      : cleanEmail.endsWith('@parcelflow.demo')
        ? cleanEmail.replace('@parcelflow.demo', '@parcelflow.com')
        : cleanEmail;

    const user = queryOne<{
      id: string;
      name: string;
      email: string;
      role: 'customer' | 'operator' | 'admin';
      phone: string;
      password_hash: string;
    }>('SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(email) = ?', [cleanEmail, altEmail]);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValid = verifyPassword(password, user.password_hash);
    if (!isValid.valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Transparently re-hash with stronger iterations if needed
    if (isValid.needsRehash) {
      const newHash = hashPassword(password);
      run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, user.id]);
    }

    const { password_hash, ...safeUser } = user;
    if (cleanEmail.includes('@parcelflow.com')) {
      safeUser.email = cleanEmail;
    }

    const token = generateToken(safeUser);

    return res.json({
      user: safeUser,
      token
    });
  });

  router.post('/auth/register', (req: Request, res: Response) => {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const existing = queryOne('SELECT id FROM users WHERE LOWER(email) = ?', [cleanEmail]);
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const id = `usr-${Date.now()}`;
    const hashedPassword = hashPassword(password);
    run(
      "INSERT INTO users (id, name, email, password_hash, role, phone) VALUES (?, ?, ?, ?, 'customer', ?)",
      [id, name.trim(), cleanEmail, hashedPassword, phone || '']
    );

    // Default address in Pune
    run(
      `INSERT INTO addresses (id, customer_id, label, full_name, phone, line1, line2, city, state, pincode, is_default)
      VALUES (?, ?, 'Home', ?, ?, 'Flat 101, Green Valley', 'FC Road', 'Pune', 'Maharashtra', '411005', 1)`,
      [`addr-${Date.now()}`, id, name.trim(), phone || '']
    );

    const safeUser = { id, name: name.trim(), email: cleanEmail, role: 'customer' as const, phone: phone || '' };
    const token = generateToken(safeUser);

    return res.json({
      user: safeUser,
      token
    });
  });

  // Google Authentication via Firebase — SECURE token verification
  router.post('/auth/google', loginRateLimiter(10, 60 * 1000), async (req: Request, res: Response) => {
    const cfg = getConfig();

    const { idToken } = req.body;

    // idToken is REQUIRED — never trust body fields like email/uid
    if (!idToken || typeof idToken !== 'string') {
      return res.status(400).json({ error: 'Firebase ID token is required for Google authentication' });
    }

    // Gate: if Firebase is not configured, reject
    if (!isGoogleLoginAvailable()) {
      return res.status(503).json({ error: 'google_login_unavailable' });
    }

    try {
      // Cryptographically verify the RS256 token against Google's published keys
      const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
        issuer: `https://securetoken.google.com/${cfg.FIREBASE_PROJECT_ID}`,
        audience: cfg.FIREBASE_PROJECT_ID!,
      });

      // Validate required claims
      const verifiedEmail = payload.email as string | undefined;
      const verifiedUid = payload.sub;
      const emailVerified = payload.email_verified as boolean | undefined;

      if (!verifiedEmail || !verifiedUid) {
        return res.status(401).json({ error: 'Token missing required claims (email, sub)' });
      }

      if (emailVerified !== true) {
        return res.status(401).json({ error: 'Email not verified by Google. Please verify your email first.' });
      }

      const cleanEmail = verifiedEmail.trim().toLowerCase();
      const cleanUid = verifiedUid.trim();
      const cleanName = (payload.name as string) || cleanEmail.split('@')[0];
      const cleanPhoto = (payload.picture as string) || '';

      // Check if an existing operator/admin account exists with this email — BLOCK
      const existingUser = queryOne<{
        id: string; role: string;
      }>('SELECT id, role FROM users WHERE LOWER(email) = ?', [cleanEmail]);

      if (existingUser && (existingUser.role === 'operator' || existingUser.role === 'admin')) {
        return res.status(403).json({
          error: 'Operator and admin accounts cannot use Google Sign-In. Please use email/password login.'
        });
      }

      // 1. Look for user by firebase_uid
      let user = queryOne<{
        id: string; name: string; email: string; role: 'customer' | 'operator' | 'admin';
        phone: string; avatar_url?: string; firebase_uid?: string;
      }>('SELECT id, name, email, role, phone, avatar_url, firebase_uid FROM users WHERE firebase_uid = ?', [cleanUid]);

      // 2. If not found by uid, link by email (customers only)
      if (!user && existingUser) {
        user = queryOne<{
          id: string; name: string; email: string; role: 'customer' | 'operator' | 'admin';
          phone: string; avatar_url?: string; firebase_uid?: string;
        }>('SELECT id, name, email, role, phone, avatar_url, firebase_uid FROM users WHERE LOWER(email) = ?', [cleanEmail]);

        if (user) {
          run(
            'UPDATE users SET firebase_uid = ?, avatar_url = COALESCE(avatar_url, ?) WHERE id = ?',
            [cleanUid, cleanPhoto, user.id]
          );
          user.firebase_uid = cleanUid;
          if (!user.avatar_url) user.avatar_url = cleanPhoto;
        }
      }

      // 3. Create new customer account
      if (!user) {
        const newId = `usr-${Date.now()}`;
        const randomPassword = crypto.randomBytes(32).toString('hex');
        const hashedPassword = hashPassword(randomPassword);

        run(
          `INSERT INTO users (id, name, email, password_hash, role, phone, avatar_url, firebase_uid)
           VALUES (?, ?, ?, ?, 'customer', '', ?, ?)`,
          [newId, cleanName, cleanEmail, hashedPassword, cleanPhoto, cleanUid]
        );

        run(
          `INSERT INTO addresses (id, customer_id, label, full_name, phone, line1, line2, city, state, pincode, is_default)
           VALUES (?, ?, 'Home', ?, '', 'Flat 101, Green Valley', 'FC Road', 'Pune', 'Maharashtra', '411005', 1)`,
          [`addr-${Date.now()}`, newId, cleanName]
        );

        user = {
          id: newId, name: cleanName, email: cleanEmail, role: 'customer',
          phone: '', avatar_url: cleanPhoto, firebase_uid: cleanUid
        };
      }

      const safeUser = {
        id: user.id, name: user.name, email: user.email, role: user.role,
        phone: user.phone || '', avatar_url: user.avatar_url || cleanPhoto,
        firebase_uid: user.firebase_uid || cleanUid
      };

      const token = generateToken(safeUser);
      return res.json({ success: true, user: safeUser, token });

    } catch (err: any) {
      console.error('[ParcelFlow] Google token verification failed:', err.message);
      return res.status(401).json({ error: 'Invalid or expired Firebase ID token' });
    }
  });

  // Auth providers discovery (frontend uses this to show/hide Google button)
  router.get('/auth/providers', (_req: Request, res: Response) => {
    res.json({
      google: isGoogleLoginAvailable(),
      email: true
    });
  });

  router.post('/auth/logout', (_req: Request, res: Response) => {
    return res.json({ success: true, message: 'Logged out successfully' });
  });

  // Forgot Password: Generate a 6-digit reset token
  router.post('/auth/forgot-password', loginRateLimiter(5, 60 * 1000), (req: Request, res: Response) => {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email address is required' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const user = queryOne<{ id: string; name: string; email: string }>(
      'SELECT id, name, email FROM users WHERE LOWER(email) = ?', [cleanEmail]
    );

    if (!user) {
      // Security: don't reveal whether the email exists
      return res.json({ success: true, message: 'If an account with that email exists, a password reset token has been generated.' });
    }

    // Invalidate any existing unused tokens for this user
    run('UPDATE password_reset_tokens SET used = 1 WHERE user_id = ? AND used = 0', [user.id]);

    // Generate 6-digit numeric token
    const token = String(Math.floor(100000 + Math.random() * 900000));
    const tokenId = `prt-${Date.now()}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);

    run(
      'INSERT INTO password_reset_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)',
      [tokenId, user.id, token, expiresAt]
    );

    // In production, this token would be sent via email/SMS.
    // For development/demo, we return it in the response.
    return res.json({
      success: true,
      message: 'Password reset token generated. In production, this would be sent to your email.',
      token,
      email: cleanEmail
    });
  });

  // Reset Password: Validate token and update password
  router.post('/auth/reset-password', loginRateLimiter(5, 60 * 1000), (req: Request, res: Response) => {
    const { email, token, newPassword } = req.body;
    if (!email || !token || !newPassword) {
      return res.status(400).json({ error: 'Email, token, and new password are required' });
    }

    if (String(newPassword).length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters long' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const user = queryOne<{ id: string }>('SELECT id FROM users WHERE LOWER(email) = ?', [cleanEmail]);
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or token' });
    }

    const resetRecord = queryOne<{ id: string; expires_at: string; used: number }>(
      'SELECT id, expires_at, used FROM password_reset_tokens WHERE user_id = ? AND token = ? AND used = 0 ORDER BY created_at DESC LIMIT 1',
      [user.id, String(token).trim()]
    );

    if (!resetRecord) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    // Check token expiry
    const now = new Date();
    const expiresAt = new Date(resetRecord.expires_at.replace(' ', 'T') + 'Z');
    if (now > expiresAt) {
      run('UPDATE password_reset_tokens SET used = 1 WHERE id = ?', [resetRecord.id]);
      return res.status(400).json({ error: 'Reset token has expired. Please request a new one.' });
    }

    // Update password with proper PBKDF2 hashing
    const hashedPassword = hashPassword(newPassword);
    run('UPDATE users SET password_hash = ? WHERE id = ?', [hashedPassword, user.id]);

    // Mark token as used
    run('UPDATE password_reset_tokens SET used = 1 WHERE id = ?', [resetRecord.id]);

    return res.json({ success: true, message: 'Password has been reset successfully. You can now log in with your new password.' });
  });

  router.get('/auth/me', (req: Request, res: Response) => {
    const user = extractUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const fullUser = queryOne('SELECT id, name, email, role, phone, created_at FROM users WHERE id = ?', [user.id]);
    return res.json({ user: fullUser || user });
  });

  // ==========================================
  // CATALOG & PRODUCTS
  // ==========================================
  router.get(['/catalog/categories', '/categories'], (_req: Request, res: Response) => {
    const categories = query('SELECT * FROM categories ORDER BY name ASC');
    return res.json(categories);
  });

  const getProductsHandler = (req: Request, res: Response) => {
    const { category, search, minPrice, maxPrice, minRating, inStock, sort } = req.query;

    let sql = `
      SELECT p.*, c.name as category_name, c.slug as category_slug, inv.stock_quantity
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN inventory inv ON p.id = inv.product_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (category && category !== 'all') {
      sql += ` AND (c.slug = ? OR c.id = ?)`;
      params.push(category, category);
    }

    if (search) {
      sql += ` AND (p.name LIKE ? OR p.description LIKE ? OR c.name LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    if (minPrice) {
      sql += ` AND p.price >= ?`;
      params.push(Number(minPrice));
    }

    if (maxPrice) {
      sql += ` AND p.price <= ?`;
      params.push(Number(maxPrice));
    }

    if (minRating) {
      sql += ` AND p.rating >= ?`;
      params.push(Number(minRating));
    }

    if (inStock === 'true') {
      sql += ` AND inv.stock_quantity > 0`;
    }

    if (sort === 'price_asc') {
      sql += ` ORDER BY p.price ASC`;
    } else if (sort === 'price_desc') {
      sql += ` ORDER BY p.price DESC`;
    } else if (sort === 'rating_desc') {
      sql += ` ORDER BY p.rating DESC`;
    } else {
      sql += ` ORDER BY p.created_at DESC`;
    }

    const products = query(sql, params);
    return res.json(products);
  };

  router.get('/catalog/products', getProductsHandler);
  router.get('/products', getProductsHandler);

  const getProductByIdHandler = (req: Request, res: Response) => {
    const { id } = req.params;
    const product = queryOne(
      `
      SELECT p.*, c.name as category_name, c.slug as category_slug, inv.stock_quantity, inv.low_stock_threshold
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN inventory inv ON p.id = inv.product_id
      WHERE p.id = ?
    `,
      [id]
    );

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const reviews = query('SELECT * FROM reviews WHERE product_id = ? ORDER BY created_at DESC', [id]);
    const related = query(
      `
      SELECT p.*, inv.stock_quantity
      FROM products p
      LEFT JOIN inventory inv ON p.id = inv.product_id
      WHERE p.category_id = ? AND p.id != ?
      LIMIT 4
    `,
      [product.category_id, id]
    );

    return res.json({ product, reviews, related });
  };

  router.get('/catalog/products/:id', getProductByIdHandler);
  router.get('/products/:id', getProductByIdHandler);

  router.post('/catalog/reviews', requireUser, (req: AuthenticatedRequest, res: Response) => {
    const { productId, rating, comment } = req.body;
    const user = req.user!;

    if (!productId || rating === undefined) {
      return res.status(400).json({ error: 'Product ID and rating are required' });
    }

    const revId = `rev-${Date.now()}`;
    run(
      `INSERT INTO reviews (id, product_id, customer_id, customer_name, rating, comment) VALUES (?, ?, ?, ?, ?, ?)`,
      [revId, productId, user.id, user.name, Number(rating), comment || '']
    );

    const stats = queryOne<{ avgRating: number; count: number }>(
      'SELECT AVG(rating) as avgRating, COUNT(*) as count FROM reviews WHERE product_id = ?',
      [productId]
    );
    if (stats) {
      const avg = Math.round((stats.avgRating || rating) * 10) / 10;
      run('UPDATE products SET rating = ?, rating_count = ? WHERE id = ?', [avg, stats.count, productId]);
    }

    return res.json({ success: true, reviewId: revId });
  });

  const handleCreateProduct = (req: AuthenticatedRequest, res: Response) => {
    const {
      name,
      category_id,
      categoryName,
      description = '',
      price = 0,
      discount_percent = 0,
      stock_quantity,
      stockQuantity,
      low_stock_threshold = 10,
      warehouse_rack_location,
      rackLocation,
      weight_grams,
      weightGrams,
      image_url,
      imageUrl
    } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({ error: 'Product name and price are required' });
    }

    const id = `prod-${Date.now()}`;
    const rack = warehouse_rack_location || rackLocation || 'Rack A-01';
    const weight = weight_grams || weightGrams || 500;
    const img = image_url || imageUrl || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&q=80';
    const stock = stock_quantity ?? stockQuantity ?? 50;

    let catId = category_id;
    if (!catId && categoryName) {
      const existingCat = queryOne<{ id: string }>(
        'SELECT id FROM categories WHERE name = ? OR slug = ?',
        [categoryName, categoryName.toLowerCase().replace(/\s+/g, '-')]
      );
      if (existingCat) {
        catId = existingCat.id;
      } else {
        catId = `cat-${Date.now()}`;
        run('INSERT INTO categories (id, name, slug) VALUES (?, ?, ?)', [
          catId,
          categoryName,
          categoryName.toLowerCase().replace(/\s+/g, '-')
        ]);
      }
    }
    if (!catId) catId = 'cat-electronics';

    transaction(() => {
      run(
        `INSERT INTO products (id, name, category_id, description, price, discount_percent, image_url, warehouse_rack_location, weight_grams)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, name, catId, description, Number(price), Number(discount_percent), img, rack, Number(weight)]
      );

      run('INSERT INTO inventory (product_id, stock_quantity, low_stock_threshold) VALUES (?, ?, ?)', [
        id,
        Number(stock),
        Number(low_stock_threshold)
      ]);
    });

    return res.json({ id, success: true });
  };

  const handleUpdateProduct = (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const {
      name,
      category_id,
      categoryName,
      description = '',
      price = 0,
      discount_percent = 0,
      stock_quantity,
      stockQuantity,
      low_stock_threshold = 10,
      warehouse_rack_location,
      rackLocation,
      weight_grams,
      weightGrams,
      image_url,
      imageUrl
    } = req.body;

    const rack = warehouse_rack_location || rackLocation || 'Rack A-01';
    const weight = weight_grams || weightGrams || 500;
    const img = image_url || imageUrl || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&q=80';
    const stock = stock_quantity ?? stockQuantity;

    let catId = category_id;
    if (!catId && categoryName) {
      const existingCat = queryOne<{ id: string }>(
        'SELECT id FROM categories WHERE name = ? OR slug = ?',
        [categoryName, categoryName.toLowerCase().replace(/\s+/g, '-')]
      );
      if (existingCat) {
        catId = existingCat.id;
      }
    }

    transaction(() => {
      if (catId) {
        run(
          `UPDATE products SET name = ?, category_id = ?, description = ?, price = ?, discount_percent = ?, warehouse_rack_location = ?, weight_grams = ?, image_url = ? WHERE id = ?`,
          [name, catId, description, Number(price), Number(discount_percent), rack, Number(weight), img, id]
        );
      } else {
        run(
          `UPDATE products SET name = ?, description = ?, price = ?, discount_percent = ?, warehouse_rack_location = ?, weight_grams = ?, image_url = ? WHERE id = ?`,
          [name, description, Number(price), Number(discount_percent), rack, Number(weight), img, id]
        );
      }

      if (stock !== undefined) {
        run('UPDATE inventory SET stock_quantity = ?, low_stock_threshold = ? WHERE product_id = ?', [
          Number(stock),
          Number(low_stock_threshold),
          id
        ]);
      }
    });

    return res.json({ success: true });
  };

  const handleDeleteProduct = (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    transaction(() => {
      run('DELETE FROM inventory WHERE product_id = ?', [id]);
      run('DELETE FROM products WHERE id = ?', [id]);
    });
    return res.json({ success: true });
  };

  router.post(['/catalog/products', '/inventory/products', '/products'], requireStaff, handleCreateProduct);
  router.put(['/catalog/products/:id', '/inventory/products/:id', '/products/:id'], requireStaff, handleUpdateProduct);
  router.delete(['/catalog/products/:id', '/inventory/products/:id', '/products/:id'], requireStaff, handleDeleteProduct);

  // ==========================================
  // CART
  // ==========================================
  router.get(['/cart', '/cart/items'], requireUser, (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;

    const items = query(
      `
      SELECT c.id as cart_item_id, c.id, c.quantity, p.*, inv.stock_quantity
      FROM cart_items c
      JOIN products p ON c.product_id = p.id
      LEFT JOIN inventory inv ON p.id = inv.product_id
      WHERE c.customer_id = ?
    `,
      [userId]
    );

    let subtotal = 0;
    for (const item of items) {
      subtotal += item.price * item.quantity;
    }
    const gst = Math.round(subtotal * 0.18 * 100) / 100;
    const total = subtotal + gst;

    return res.json({ items, subtotal, gst, total });
  });

  router.post(['/cart', '/cart/items'], requireUser, (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const { productId, quantity = 1 } = req.body;

    if (!productId || Number(quantity) <= 0) {
      return res.status(400).json({ error: 'Valid product ID and positive quantity are required' });
    }

    const prod = queryOne('SELECT id FROM products WHERE id = ?', [productId]);
    if (!prod) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const existing = queryOne<{ id: string; quantity: number }>(
      'SELECT id, quantity FROM cart_items WHERE customer_id = ? AND product_id = ?',
      [userId, productId]
    );

    if (existing) {
      run('UPDATE cart_items SET quantity = quantity + ? WHERE id = ?', [Number(quantity), existing.id]);
    } else {
      const id = `cart-${Date.now()}`;
      run('INSERT INTO cart_items (id, customer_id, product_id, quantity) VALUES (?, ?, ?, ?)', [
        id,
        userId,
        productId,
        Number(quantity)
      ]);
    }

    return res.json({ success: true });
  });

  router.patch(['/cart/:id', '/cart/items/:id'], requireUser, (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { quantity } = req.body;
    const userId = req.user!.id;

    if (Number(quantity) <= 0) {
      run('DELETE FROM cart_items WHERE id = ? AND customer_id = ?', [id, userId]);
    } else {
      run('UPDATE cart_items SET quantity = ? WHERE id = ? AND customer_id = ?', [Number(quantity), id, userId]);
    }
    return res.json({ success: true });
  });

  router.delete(['/cart/:id', '/cart/items/:id'], requireUser, (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;
    run('DELETE FROM cart_items WHERE id = ? AND customer_id = ?', [id, userId]);
    return res.json({ success: true });
  });

  router.delete('/cart', requireUser, (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    run('DELETE FROM cart_items WHERE customer_id = ?', [userId]);
    return res.json({ success: true });
  });

  // ==========================================
  // WISHLIST
  // ==========================================
  router.get('/wishlist', requireUser, (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const items = query(
      `
      SELECT w.id as wishlist_id, p.*, inv.stock_quantity
      FROM wishlist_items w
      JOIN products p ON w.product_id = p.id
      LEFT JOIN inventory inv ON p.id = inv.product_id
      WHERE w.customer_id = ?
    `,
      [userId]
    );
    return res.json(items);
  });

  router.post('/wishlist/toggle', requireUser, (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ error: 'Product ID required' });
    }

    const existing = queryOne<{ id: string }>(
      'SELECT id FROM wishlist_items WHERE customer_id = ? AND product_id = ?',
      [userId, productId]
    );

    if (existing) {
      run('DELETE FROM wishlist_items WHERE id = ?', [existing.id]);
      return res.json({ inWishlist: false });
    } else {
      run('INSERT INTO wishlist_items (id, customer_id, product_id) VALUES (?, ?, ?)', [
        `wsh-${Date.now()}`,
        userId,
        productId
      ]);
      return res.json({ inWishlist: true });
    }
  });

  // ==========================================
  // ADDRESSES
  // ==========================================
  router.get(['/addresses', '/auth/addresses'], requireUser, (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const addresses = query('SELECT * FROM addresses WHERE customer_id = ? ORDER BY is_default DESC', [userId]);
    return res.json(addresses);
  });

  router.post(['/addresses', '/auth/addresses'], requireUser, (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const { label, full_name, phone, line1, line2, city, state, pincode, is_default } = req.body;

    if (!line1 || !city || !pincode) {
      return res.status(400).json({ error: 'Address line, city, and pincode are required' });
    }

    const id = `addr-${Date.now()}`;
    if (is_default) {
      run('UPDATE addresses SET is_default = 0 WHERE customer_id = ?', [userId]);
    }

    run(
      `INSERT INTO addresses (id, customer_id, label, full_name, phone, line1, line2, city, state, pincode, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, label || 'Home', full_name || '', phone || '', line1, line2 || '', city, state || '', pincode, is_default ? 1 : 0]
    );

    return res.json({ id, success: true });
  });

  router.put(['/addresses/:id', '/auth/addresses/:id'], requireUser, (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { label, full_name, phone, line1, line2, city, state, pincode, is_default } = req.body;
    const userId = req.user!.id;

    if (is_default) {
      run('UPDATE addresses SET is_default = 0 WHERE customer_id = ?', [userId]);
    }

    run(
      `UPDATE addresses SET label = ?, full_name = ?, phone = ?, line1 = ?, line2 = ?, city = ?, state = ?, pincode = ?, is_default = ?
      WHERE id = ? AND customer_id = ?`,
      [label, full_name, phone, line1, line2 || '', city, state, pincode, is_default ? 1 : 0, id, userId]
    );

    return res.json({ success: true });
  });

  router.delete(['/addresses/:id', '/auth/addresses/:id'], requireUser, (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;
    run('DELETE FROM addresses WHERE id = ? AND customer_id = ?', [id, userId]);
    return res.json({ success: true });
  });

  // ==========================================
  // ORDERS & CHECKOUT
  // ==========================================
  const getOrdersHandler = (req: Request, res: Response) => {
    const user = optionalUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { status, city, customerId } = req.query;

    let sql = `
      SELECT o.*, u.name as customer_name, u.email as customer_email,
        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count,
        (SELECT p.name FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = o.id LIMIT 1) as primary_item_name,
        (SELECT p.image_url FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = o.id LIMIT 1) as primary_item_image
      FROM orders o
      JOIN users u ON o.customer_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    // Customer can only view their own orders
    if (user.role === 'customer') {
      sql += ` AND o.customer_id = ?`;
      params.push(user.id);
    } else if (customerId) {
      sql += ` AND o.customer_id = ?`;
      params.push(customerId);
    }

    if (status && status !== 'ALL') {
      sql += ` AND o.status = ?`;
      params.push(status);
    }

    if (city && city !== 'ALL') {
      sql += ` AND o.destination_city = ?`;
      params.push(city);
    }

    sql += ` ORDER BY o.created_at DESC`;
    const orders = query(sql, params);
    return res.json(orders);
  };

  router.get('/orders', getOrdersHandler);
  router.get('/customer/orders', requireUser, (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const orders = query(
      `
      SELECT o.*, u.name as customer_name, u.email as customer_email,
        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count,
        (SELECT p.name FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = o.id LIMIT 1) as primary_item_name,
        (SELECT p.image_url FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = o.id LIMIT 1) as primary_item_image
      FROM orders o
      JOIN users u ON o.customer_id = u.id
      WHERE o.customer_id = ?
      ORDER BY o.created_at DESC
    `,
      [userId]
    );
    return res.json(orders);
  });

  router.get('/orders/:id', requireUser, (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const user = req.user!;

    const order = queryOne(
      `
      SELECT o.*, u.name as customer_name, u.email as customer_email, u.phone as customer_phone,
             a.line1, a.line2, a.city, a.state, a.pincode, a.full_name as recipient_name, a.phone as recipient_phone,
             inv.id as invoice_id
      FROM orders o
      JOIN users u ON o.customer_id = u.id
      LEFT JOIN addresses a ON o.address_id = a.id
      LEFT JOIN invoices inv ON o.id = inv.order_id
      WHERE o.id = ?
    `,
      [id]
    );

    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Customer can only view own order
    if (user.role === 'customer' && order.customer_id !== user.id) {
      return res.status(403).json({ error: 'Access denied to this order' });
    }

    const items = query(
      `
      SELECT oi.*, p.name, p.image_url, p.warehouse_rack_location, p.weight_grams
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `,
      [id]
    );

    const history = query('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY changed_at ASC', [id]);
    const picking = queryOne('SELECT * FROM picking_tasks WHERE order_id = ?', [id]);
    const packing = queryOne('SELECT * FROM packing_tasks WHERE order_id = ?', [id]);
    const sorting = queryOne('SELECT * FROM sorting_logs WHERE order_id = ?', [id]);

    return res.json({ order, items, history, picking, packing, sorting });
  });

  // REAL ORDER CREATION & CHECKOUT
  const handleCheckout = (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { addressId, paymentMethod, directItem } = req.body;

    let itemsToProcess: { productId: string; quantity: number }[] = [];

    if (directItem) {
      if (!directItem.productId || !directItem.quantity || Number(directItem.quantity) <= 0) {
        return res.status(400).json({ error: 'Invalid product or quantity for direct checkout' });
      }
      itemsToProcess = [{ productId: directItem.productId, quantity: Number(directItem.quantity) }];
    } else {
      const cartRows = query<{ product_id: string; quantity: number }>(
        'SELECT product_id, quantity FROM cart_items WHERE customer_id = ?',
        [user.id]
      );

      if (!cartRows || cartRows.length === 0) {
        return res.status(400).json({ error: 'Cart is empty' });
      }
      itemsToProcess = cartRows.map(r => ({ productId: r.product_id, quantity: r.quantity }));
    }

    // 1. Validate all products and check inventory availability
    const validatedItems: { product: any; quantity: number; unitPrice: number }[] = [];
    for (const item of itemsToProcess) {
      const product = queryOne<{ id: string; name: string; price: number }>(
        'SELECT id, name, price FROM products WHERE id = ?',
        [item.productId]
      );

      if (!product) {
        return res.status(400).json({ error: `Product not found: ${item.productId}` });
      }

      const inv = queryOne<{ stock_quantity: number; low_stock_threshold: number }>(
        'SELECT stock_quantity, low_stock_threshold FROM inventory WHERE product_id = ?',
        [item.productId]
      );

      const availableStock = inv ? inv.stock_quantity : 0;
      if (availableStock < item.quantity) {
        return res.status(409).json({
          error: `Insufficient stock for "${product.name}". Requested: ${item.quantity}, Available: ${availableStock}.`
        });
      }

      validatedItems.push({
        product,
        quantity: item.quantity,
        unitPrice: product.price
      });
    }

    // 2. Lookup destination city from address
    let destinationCity = 'Pune';
    if (addressId) {
      const address = queryOne<{ city: string }>('SELECT city FROM addresses WHERE id = ?', [addressId]);
      if (address && address.city) {
        destinationCity = address.city;
      }
    }

    // 3. Backend determines final price & GST (never trust client)
    let subtotal = 0;
    for (const item of validatedItems) {
      subtotal += item.unitPrice * item.quantity;
    }
    const gst = Math.round(subtotal * 0.18 * 100) / 100;
    const total = subtotal + gst;

    // 4. Generate Unique IDs
    const orderRows = query<{ id: string }>('SELECT id FROM orders');
    let maxNum = 10400;
    for (const row of orderRows) {
      const match = row.id ? row.id.match(/ORD-(\d+)/) : null;
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > maxNum) maxNum = n;
      }
    }
    const orderNumber = maxNum + 1;
    const orderId = `ORD-${orderNumber}`;
    const invoiceId = `INV-2026-${orderNumber}`;
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const lowStockAlerts: { productId: string; productName: string; remaining: number }[] = [];

    // 5. Execute transaction: Atomic creation and inventory decrement
    try {
      transaction(() => {
        run(
          `INSERT INTO orders (id, customer_id, address_id, destination_city, status, payment_status, payment_method, subtotal, gst_amount, total_amount, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'CONFIRMED', 'PAID', ?, ?, ?, ?, ?, ?)`,
          [orderId, user.id, addressId || null, destinationCity, paymentMethod || 'UPI', subtotal, gst, total, now, now]
        );

        for (const item of validatedItems) {
          const oiId = `oi-${orderId}-${item.product.id}-${Date.now()}`;
          run(
            `INSERT INTO order_items (id, order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?, ?)`,
            [oiId, orderId, item.product.id, item.quantity, item.unitPrice]
          );

          // Atomic inventory decrement preventing negative stock
          run(
            'UPDATE inventory SET stock_quantity = MAX(0, stock_quantity - ?) WHERE product_id = ?',
            [item.quantity, item.product.id]
          );

          // Check if low stock threshold reached
          const postInv = queryOne<{ stock_quantity: number; low_stock_threshold: number }>(
            'SELECT stock_quantity, low_stock_threshold FROM inventory WHERE product_id = ?',
            [item.product.id]
          );

          if (postInv && postInv.stock_quantity <= postInv.low_stock_threshold) {
            lowStockAlerts.push({
              productId: item.product.id,
              productName: item.product.name,
              remaining: postInv.stock_quantity
            });
            const altId = `alt-ls-${Date.now()}-${item.product.id}`;
            run(
              `INSERT INTO alerts (id, type, severity, message, resolved, created_at)
              VALUES (?, 'LOW_STOCK', 'warning', ?, 0, ?)`,
              [altId, `Low stock alert for "${item.product.name}": only ${postInv.stock_quantity} remaining.`, now]
            );
          }
        }

        // Status histories
        run(
          "INSERT INTO order_status_history (id, order_id, status, note, changed_at) VALUES (?, ?, 'PLACED', 'Order placed via Customer Storefront', ?)",
          [`hist-${orderId}-1`, orderId, now]
        );
        run(
          "INSERT INTO order_status_history (id, order_id, status, note, changed_at) VALUES (?, ?, 'CONFIRMED', 'Payment verified successfully', ?)",
          [`hist-${orderId}-2`, orderId, now]
        );

        // Picking task
        run("INSERT INTO picking_tasks (id, order_id, status) VALUES (?, ?, 'PENDING')", [`pick-${orderId}`, orderId]);

        // Invoice record
        run("INSERT INTO invoices (id, order_id, gstin, issued_at) VALUES (?, ?, '27AABCP1234F1Z9', ?)", [
          invoiceId,
          orderId,
          now
        ]);

        // Clear cart if not direct checkout
        if (!directItem) {
          run('DELETE FROM cart_items WHERE customer_id = ?', [user.id]);
        }
      });
    } catch (dbErr: any) {
      console.error('Order creation transaction failed:', dbErr);
      return res.status(500).json({ error: 'Order creation failed. Please try again.' });
    }

    // 6. Emit real-time updates via Socket.io
    io.emit('order:status_changed', {
      orderId,
      oldStatus: 'PLACED',
      newStatus: 'CONFIRMED',
      timestamp: now
    });

    for (const alert of lowStockAlerts) {
      io.emit('inventory:low_stock', {
        productId: alert.productId,
        productName: alert.productName,
        stockQuantity: alert.remaining
      });
    }

    return res.json({
      success: true,
      orderId,
      invoiceId,
      destinationCity,
      subtotal,
      gst,
      total
    });
  };

  router.post(['/orders/checkout', '/orders'], requireUser, handleCheckout);

  // Controlled status transition endpoint
  const handleStatusPatch = (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { status, note } = req.body;
    const user = req.user!;

    if (!status) {
      return res.status(400).json({ error: 'Target status is required' });
    }

    const isAdmin = user.role === 'admin';
    const result = transitionOrderStatus(id, status, note || `Status updated by ${user.role} ${user.name}`, io, isAdmin);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    return res.json({ success: true, newStatus: status, oldStatus: result.oldStatus });
  };

  router.patch('/orders/:id/status', requireStaff, handleStatusPatch);
  router.post('/orders/:id/status', requireStaff, handleStatusPatch);

  router.post('/orders/:id/cancel', requireUser, (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const user = req.user!;
    const order = queryOne<{ status: string; customer_id: string }>('SELECT status, customer_id FROM orders WHERE id = ?', [id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (user.role === 'customer' && order.customer_id !== user.id) {
      return res.status(403).json({ error: 'Cannot cancel order belonging to another customer' });
    }

    if (['PACKED', 'ON_CONVEYOR', 'SORTED', 'DISPATCHED', 'DELIVERED'].includes(order.status) && user.role !== 'admin') {
      return res.status(400).json({ error: 'Order has already been packed/dispatched and cannot be cancelled' });
    }

    const result = transitionOrderStatus(id, 'CANCELLED', `Order cancelled by ${user.role} ${user.name}`, io, user.role === 'admin');
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    return res.json({ success: true });
  });

  router.post('/orders/:id/return', requireUser, (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { reason } = req.body;
    const user = req.user!;
    const order = queryOne<{ status: string; customer_id: string }>('SELECT status, customer_id FROM orders WHERE id = ?', [id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (user.role === 'customer' && order.customer_id !== user.id) {
      return res.status(403).json({ error: 'Cannot return order belonging to another customer' });
    }

    if (order.status !== 'DELIVERED') {
      return res.status(400).json({ error: 'Only delivered orders can be returned' });
    }

    const result = transitionOrderStatus(id, 'RETURN_REQUESTED', `Return requested: ${reason || 'Customer initiated'}`, io);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    return res.json({ success: true });
  });

  // ==========================================
  // INVOICES
  // ==========================================
  router.get(['/invoices', '/billing/invoices'], (req: Request, res: Response) => {
    const user = optionalUser(req);
    let sql = `
      SELECT inv.*, o.id as order_id, o.total_amount, o.gst_amount, o.subtotal, o.payment_status, o.payment_method, o.created_at as order_date,
             u.name as customer_name, u.email as customer_email, o.destination_city
      FROM invoices inv
      JOIN orders o ON inv.order_id = o.id
      JOIN users u ON o.customer_id = u.id
    `;
    const params: any[] = [];
    if (user && user.role === 'customer') {
      sql += ` WHERE o.customer_id = ?`;
      params.push(user.id);
    }
    sql += ` ORDER BY inv.issued_at DESC`;
    const invoices = query(sql, params);
    return res.json(invoices);
  });

  router.get(['/invoices/:orderId', '/billing/invoices/:orderId', '/billing/invoices/order/:orderId'], (req: Request, res: Response) => {
    const { orderId } = req.params;
    const user = optionalUser(req);

    const invoice = queryOne(
      `
      SELECT inv.*, o.id as order_id, o.total_amount, o.gst_amount, o.subtotal, o.payment_status, o.payment_method, o.created_at as order_date,
             o.customer_id, u.name as customer_name, u.email as customer_email, u.phone as customer_phone,
             a.line1, a.line2, a.city, a.state, a.pincode
      FROM invoices inv
      JOIN orders o ON inv.order_id = o.id
      JOIN users u ON o.customer_id = u.id
      LEFT JOIN addresses a ON o.address_id = a.id
      WHERE o.id = ? OR inv.id = ?
    `,
      [orderId, orderId]
    );

    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    if (user && user.role === 'customer' && invoice.customer_id !== user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const items = query(
      `
      SELECT oi.*, p.name as product_name
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `,
      [invoice.order_id]
    );

    return res.json({ invoice, items });
  });

  // ==========================================
  // WAREHOUSE / OPERATOR
  // ==========================================
  const getWarehouseQueue = (_req: Request, res: Response) => {
    const orders = query(`
      SELECT o.*, u.name as customer_name,
        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count,
        (SELECT p.name FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = o.id LIMIT 1) as primary_product_name,
        (SELECT p.warehouse_rack_location FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = o.id LIMIT 1) as primary_rack_location,
        pt.status as picking_status,
        pkt.status as packing_status
      FROM orders o
      JOIN users u ON o.customer_id = u.id
      LEFT JOIN picking_tasks pt ON o.id = pt.order_id
      LEFT JOIN packing_tasks pkt ON o.id = pkt.order_id
      WHERE o.status NOT IN ('CANCELLED')
      ORDER BY o.created_at ASC
    `);

    const queue = {
      newOrders: orders.filter(o => o.status === 'CONFIRMED'),
      picking: orders.filter(o => o.status === 'PICKING'),
      packing: orders.filter(o => o.status === 'PICKED' || o.status === 'PACKING'),
      ready: orders.filter(o => o.status === 'PACKED'),
      conveyor: orders.filter(o => ['ON_CONVEYOR', 'CONVEYOR_QUEUED', 'SCANNED', 'DETECTED', 'SORTING', 'SORTED'].includes(o.status)),
      dispatched: orders.filter(o => o.status === 'DISPATCHED' || o.status === 'DELIVERED')
    };

    return res.json(queue);
  };

  router.get('/warehouse/queue', requireStaff, getWarehouseQueue);
  router.get(['/warehouse/orders', '/warehouse/jobs'], requireStaff, getWarehouseQueue);

  router.post(['/warehouse/picking/start/:orderId', '/warehouse/orders/:orderId/start-picking'], requireStaff, (req: AuthenticatedRequest, res: Response) => {
    const { orderId } = req.params;
    const user = req.user!;

    run('UPDATE picking_tasks SET status = "PICKING", assigned_operator_id = ? WHERE order_id = ?', [user.id, orderId]);
    const transition = transitionOrderStatus(orderId, 'PICKING', `Operator ${user.name} began picking items from warehouse racks`, io);
    if (!transition.success) {
      return res.status(400).json({ error: transition.error });
    }
    return res.json({ success: true });
  });

  router.post(['/warehouse/picking/complete/:orderId', '/warehouse/orders/:orderId/picked'], requireStaff, (req: AuthenticatedRequest, res: Response) => {
    const { orderId } = req.params;
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    run('UPDATE picking_tasks SET status = "PICKED", picked_at = ? WHERE order_id = ?', [now, orderId]);

    const existingPacking = queryOne('SELECT id FROM packing_tasks WHERE order_id = ?', [orderId]);
    if (!existingPacking) {
      run("INSERT INTO packing_tasks (id, order_id, status) VALUES (?, ?, 'PENDING')", [`pack-${orderId}`, orderId]);
    }

    const transition = transitionOrderStatus(orderId, 'PICKED', 'All items retrieved from racks, sent to packing table', io);
    if (!transition.success) {
      return res.status(400).json({ error: transition.error });
    }
    return res.json({ success: true });
  });

  router.post(['/warehouse/packing/complete/:orderId', '/warehouse/orders/:orderId/packed'], requireStaff, (req: AuthenticatedRequest, res: Response) => {
    const { orderId } = req.params;
    const weight_grams = req.body.weightGrams ?? req.body.weight_grams ?? 450;
    const dimensions = req.body.dimensions || '22x16x8 cm';
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    run(
      'UPDATE packing_tasks SET status = "PACKED", weight_grams = ?, dimensions = ?, packed_at = ? WHERE order_id = ?',
      [weight_grams, dimensions, now, orderId]
    );

    const transition = transitionOrderStatus(
      orderId,
      'PACKED',
      `Carton verified & sealed (${weight_grams}g, ${dimensions}). Shipping label applied.`,
      io
    );
    if (!transition.success) {
      return res.status(400).json({ error: transition.error });
    }
    return res.json({ success: true });
  });

  router.post(['/warehouse/conveyor/send/:orderId', '/warehouse/conveyor/infeed'], requireStaff, (req: AuthenticatedRequest, res: Response) => {
    const orderId = req.params.orderId || req.body.orderId;
    if (!orderId) return res.status(400).json({ error: 'Order ID required' });

    const transition = transitionOrderStatus(orderId, 'ON_CONVEYOR', 'Order loaded onto automated infeed conveyor belt', io);
    if (!transition.success) {
      return res.status(400).json({ error: transition.error });
    }
    return res.json({ success: true });
  });

  router.post(['/warehouse/orders/:orderId/dispatch', '/warehouse/dispatch/:orderId'], requireStaff, (req: AuthenticatedRequest, res: Response) => {
    const { orderId } = req.params;
    const transition = transitionOrderStatus(orderId, 'DISPATCHED', 'Order handed over to delivery carrier logistics', io);
    if (!transition.success) {
      return res.status(400).json({ error: transition.error });
    }
    return res.json({ success: true });
  });

  router.post(['/warehouse/orders/:orderId/deliver', '/warehouse/deliver/:orderId'], requireStaff, (req: AuthenticatedRequest, res: Response) => {
    const { orderId } = req.params;
    const transition = transitionOrderStatus(orderId, 'DELIVERED', 'Order successfully delivered to customer destination', io);
    if (!transition.success) {
      return res.status(400).json({ error: transition.error });
    }
    return res.json({ success: true });
  });

  router.post('/warehouse/conveyor/control', requireStaff, (req: Request, res: Response) => {
    const { action } = req.body;
    if (action === 'start') startConveyor();
    else if (action === 'stop') stopConveyor();
    else if (action === 'pause') pauseConveyor();
    else if (action === 'emergency_stop') emergencyStop();

    return res.json({ success: true, machineState: getMachineState() });
  });

  router.post(['/warehouse/debug/fault', '/warehouse/conveyor/simulate-fault'], requireStaff, (req: Request, res: Response) => {
    const { target } = req.body;
    simulateFault(target);
    return res.json({ success: true, machineState: getMachineState() });
  });

  router.get(['/warehouse/bins', '/warehouse/destinations', '/admin/destinations'], (_req: Request, res: Response) => {
    const destinations = query('SELECT * FROM destinations ORDER BY city ASC');
    const today = new Date().toISOString().substring(0, 10);

    const counts = query<{ assigned_bin: string; count: number }>(
      `
      SELECT assigned_bin, COUNT(*) as count
      FROM sorting_logs
      WHERE detected_at >= ?
      GROUP BY assigned_bin
    `,
      [`${today} 00:00:00`]
    );

    const countMap: Record<string, number> = {};
    for (const c of counts) {
      if (c.assigned_bin) countMap[c.assigned_bin] = c.count;
    }

    const bins = destinations.map((d: any, idx: number) => ({
      ...d,
      servo_deflection_angle: d.servo_deflection_angle ?? (30 + idx * 25),
      pin_mapping: d.pin_mapping ?? (idx + 1),
      countToday: countMap[d.bin_label] || 0
    }));

    return res.json(bins);
  });

  router.put(['/warehouse/destinations/:id', '/admin/destinations/:id'], requireStaff, (req: Request, res: Response) => {
    const { id } = req.params;
    const { city, bin_label } = req.body;
    if (bin_label) {
      run('UPDATE destinations SET city = ?, bin_label = ? WHERE id = ?', [city, bin_label, id]);
    } else {
      run('UPDATE destinations SET city = ? WHERE id = ?', [city, id]);
    }
    return res.json({ success: true });
  });

  router.post(['/warehouse/destinations', '/admin/destinations'], requireStaff, (req: Request, res: Response) => {
    const { city, bin_label = 'BIN-1' } = req.body;
    const id = `dest-${Date.now()}`;
    run('INSERT INTO destinations (id, city, bin_label) VALUES (?, ?, ?)', [id, city, bin_label]);
    return res.json({ id, success: true });
  });

  router.get('/warehouse/sorting-logs', requireStaff, (_req: Request, res: Response) => {
    const logs = query(`
      SELECT sl.*, o.destination_city
      FROM sorting_logs sl
      JOIN orders o ON sl.order_id = o.id
      ORDER BY sl.detected_at DESC
      LIMIT 50
    `);
    return res.json(logs);
  });

  router.get(['/warehouse/machine-state', '/warehouse/conveyor/state'], (_req: Request, res: Response) => {
    return res.json(getMachineState());
  });

  // ==========================================
  // LABELS & PARCELS
  // ==========================================
  router.post('/warehouse/labels/generate', requireStaff, (req: AuthenticatedRequest, res: Response) => {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId is required' });

    // Verify order exists and is in a valid state for labeling
    const order = queryOne<{ id: string; status: string }>(
      "SELECT id, status FROM orders WHERE id = ?", [orderId]
    );
    if (!order) return res.status(404).json({ error: `Order ${orderId} not found` });
    if (!['PACKED', 'PICKED', 'PACKING'].includes(order.status)) {
      return res.status(400).json({ error: `Order is ${order.status} — must be PACKED to generate a label` });
    }

    try {
      const { createOrGetLabel } = require('./services/labelService');
      const result = createOrGetLabel(orderId);
      return res.json({
        success: true,
        parcel: result.parcel,
        labelPayload: result.labelPayload,
        bin: result.bin,
        isNew: result.isNew
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to generate label' });
    }
  });

  router.post('/warehouse/labels/printed', requireStaff, (req: AuthenticatedRequest, res: Response) => {
    const { parcelId } = req.body;
    if (!parcelId) return res.status(400).json({ error: 'parcelId is required' });

    try {
      const { recordLabelPrinted } = require('./services/labelService');
      recordLabelPrinted(parcelId);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to record print' });
    }
  });

  router.get('/warehouse/parcels', requireStaff, (_req: Request, res: Response) => {
    const parcels = query(`
      SELECT p.*, o.destination_city, o.status as order_status, u.name as customer_name,
        b.label as bin_label, b.bin_number
      FROM parcels p
      JOIN orders o ON p.order_id = o.id
      JOIN users u ON o.customer_id = u.id
      LEFT JOIN bins b ON p.assigned_bin_id = b.id
      ORDER BY p.created_at DESC
      LIMIT 100
    `);
    return res.json(parcels);
  });

  router.get('/warehouse/parcels/:parcelId', requireStaff, (req: Request, res: Response) => {
    const { parcelId } = req.params;
    const parcel = queryOne(`
      SELECT p.*, o.destination_city, o.status as order_status, u.name as customer_name,
        b.label as bin_label, b.bin_number
      FROM parcels p
      JOIN orders o ON p.order_id = o.id
      JOIN users u ON o.customer_id = u.id
      LEFT JOIN bins b ON p.assigned_bin_id = b.id
      WHERE p.id = ?
    `, [parcelId]);
    if (!parcel) return res.status(404).json({ error: 'Parcel not found' });
    return res.json(parcel);
  });

  // ==========================================
  // SCAN ENDPOINT
  // ==========================================
  router.post(['/warehouse/scan', '/operator/scan', '/api/operator/scan'], requireStaff, (req: AuthenticatedRequest, res: Response) => {
    const { payload, source, decodeMs, deviceId } = req.body;
    if (!payload) return res.status(400).json({ error: 'payload is required' });

    try {
      const { processScan } = require('./services/scanService');
      const result = processScan({
        payload: String(payload),
        source: source || 'browser_camera',
        decodeMs: decodeMs ? Number(decodeMs) : undefined,
        deviceId: deviceId || undefined,
        operatorId: req.user?.id
      }, io);
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Scan processing failed' });
    }
  });

  router.get('/warehouse/scan-events', requireStaff, (_req: Request, res: Response) => {
    const events = query(`
      SELECT se.*, p.order_id
      FROM scan_events se
      LEFT JOIN parcels p ON se.parcel_id = p.id
      ORDER BY se.created_at DESC
      LIMIT 50
    `);
    return res.json(events);
  });

  // ==========================================
  // BINS (category-based routing)
  // ==========================================
  router.get(['/warehouse/bins-config', '/admin/bins', '/api/admin/bins'], requireStaff, (_req: Request, res: Response) => {
    const bins = query(`
      SELECT b.*, c.name as category_name, c.slug as category_slug
      FROM bins b
      LEFT JOIN categories c ON b.category_id = c.id
      ORDER BY b.bin_number ASC
    `);
    return res.json(bins);
  });

  router.put(['/warehouse/bins-config/:binId', '/admin/bins/:binId', '/api/admin/bins/:binId'], requireStaff, (req: Request, res: Response) => {
    const { binId } = req.params;
    const { label, category_id, servo_preset_json, is_active } = req.body;
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    if (label !== undefined) run("UPDATE bins SET label = ?, updated_at = ? WHERE id = ?", [label, now, binId]);
    if (category_id !== undefined) run("UPDATE bins SET category_id = ?, updated_at = ? WHERE id = ?", [category_id, now, binId]);
    if (servo_preset_json !== undefined) run("UPDATE bins SET servo_preset_json = ?, updated_at = ? WHERE id = ?", [servo_preset_json, now, binId]);
    if (is_active !== undefined) run("UPDATE bins SET is_active = ?, updated_at = ? WHERE id = ?", [is_active ? 1 : 0, now, binId]);

    return res.json({ success: true });
  });

  router.post('/admin/bins/:binId/test-move', requireAdmin, (req: Request, res: Response) => {
    const { binId } = req.params;
    const bin = queryOne<{ id: string; bin_number: number; label: string; servo_preset_json: string }>(
      "SELECT * FROM bins WHERE id = ?", [binId]
    );
    if (!bin) return res.status(404).json({ error: 'Bin not found' });

    // Check pipeline idle
    const inFlight = queryOne<{ id: string }>(
      "SELECT id FROM parcels WHERE status IN ('SCANNED', 'AT_PICK_POINT', 'SORTING') LIMIT 1"
    );
    if (inFlight) {
      return res.status(409).json({ error: 'Cannot run test move while a parcel is in flight' });
    }

    const cmdId = `test-move-${Date.now()}`;
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    run(
      `INSERT INTO hardware_commands (id, device_id, type, bin_id, payload_json, status, idempotency_key, created_at, updated_at)
       VALUES (?, 'arm-esp32', 'MOVE_TO_BIN', ?, ?, 'RELEASED', ?, ?, ?)`,
      [cmdId, bin.id, bin.servo_preset_json, `test-${cmdId}`, now, now]
    );

    return res.json({ success: true, commandId: cmdId, binNumber: bin.bin_number, label: bin.label });
  });

  // ==========================================
  // OPERATOR PIPELINE & TELEMETRY
  // ==========================================
  router.get(['/operator/pipeline/state', '/warehouse/pipeline/state', '/warehouse/pipeline-snapshot'], requireStaff, (_req: Request, res: Response) => {
    const snapshot = getPipelineSnapshot();
    return res.json(snapshot);
  });

  router.post(['/operator/estop', '/warehouse/estop'], requireStaff, (req: AuthenticatedRequest, res: Response) => {
    const result = triggerEmergencyStop(req.user?.id, io);
    return res.json(result);
  });

  router.post(['/operator/estop/reset', '/warehouse/estop/reset'], requireStaff, (req: AuthenticatedRequest, res: Response) => {
    const { confirm } = req.body;
    if (!confirm) {
      return res.status(400).json({ error: 'Explicit confirmation required to reset Emergency Stop' });
    }
    const result = resetEmergencyStop(req.user?.id, io);
    return res.json(result);
  });

  router.post(['/operator/conveyor/control', '/warehouse/conveyor/control'], requireStaff, (req: AuthenticatedRequest, res: Response) => {
    const { action } = req.body;
    if (action === 'EMERGENCY_STOP') {
      const result = triggerEmergencyStop(req.user?.id, io);
      return res.json({ conveyor: 'EMERGENCY_STOPPED', ...result });
    }
    if (action === 'START' || action === 'RESUME') {
      setDesiredConveyor('RUN', 'Operator command START', io);
      startConveyor();
      return res.json(getMachineState());
    }
    if (action === 'STOP') {
      setDesiredConveyor('STOP', 'Operator command STOP', io);
      stopConveyor();
      return res.json(getMachineState());
    }
    if (action === 'PAUSE' || action === 'HOLD') {
      setDesiredConveyor('HOLD', 'Operator command PAUSE', io);
      pauseConveyor();
      return res.json(getMachineState());
    }
    return res.status(400).json({ error: `Unknown action ${action}` });
  });

  router.post(['/operator/labels/batch', '/warehouse/labels/batch'], requireStaff, (req: AuthenticatedRequest, res: Response) => {
    const { orderIds } = req.body;
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ error: 'orderIds array is required' });
    }
    if (orderIds.length > 12) {
      return res.status(400).json({ error: 'Batch size limited to 12 labels' });
    }
    const { createOrGetLabel } = require('./services/labelService');
    const results = [];
    for (const oid of orderIds) {
      try {
        const lbl = createOrGetLabel(oid);
        results.push({ orderId: oid, ...lbl });
      } catch (err: any) {
        results.push({ orderId: oid, error: err.message });
      }
    }
    return res.json({ labels: results });
  });

  router.post(['/operator/demo-order', '/warehouse/demo-order'], requireStaff, (req: AuthenticatedRequest, res: Response) => {
    const product = queryOne<{ id: string; name: string; price: number; category_id: string }>(
      "SELECT id, name, price, category_id FROM products ORDER BY RANDOM() LIMIT 1"
    );
    if (!product) return res.status(500).json({ error: 'No products in database' });

    const orderId = `ORD-DEMO-${Date.now().toString().slice(-6)}`;
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const customer = queryOne<{ id: string }>("SELECT id FROM users WHERE role = 'customer' LIMIT 1");
    const customerId = customer?.id || 'usr-cust-demo';

    transaction(() => {
      run(`
        INSERT INTO orders (id, customer_id, total_amount, subtotal, gst_amount, status, payment_status, destination_city, is_demo, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'PACKED', 'PAID', 'Mumbai', 1, ?, ?)
      `, [orderId, customerId, product.price, Math.round(product.price * 0.82), Math.round(product.price * 0.18), now, now]);

      run(`
        INSERT INTO order_items (id, order_id, product_id, quantity, unit_price)
        VALUES (?, ?, ?, 1, ?)
      `, [`item-${orderId}`, orderId, product.id, product.price]);

      run(`
        INSERT INTO order_status_history (id, order_id, status, note, changed_by, changed_at)
        VALUES (?, ?, 'PACKED', 'Demo order created in PACKED state', ?, ?)
      `, [`hist-${Date.now()}`, orderId, req.user?.id || 'operator', now]);
    });

    const { createOrGetLabel } = require('./services/labelService');
    const labelData = createOrGetLabel(orderId);

    return res.json({
      success: true,
      orderId,
      parcel: labelData.parcel,
      labelPayload: labelData.labelPayload,
      bin: labelData.bin
    });
  });

  // ==========================================
  // HARDWARE COMMAND QUEUE & FAULTS
  // ==========================================
  router.get('/warehouse/hardware/commands', requireStaff, (_req: Request, res: Response) => {
    const cmds = query(`
      SELECT hc.*, b.label as bin_label, b.bin_number
      FROM hardware_commands hc
      LEFT JOIN bins b ON hc.bin_id = b.id
      ORDER BY hc.created_at DESC
      LIMIT 50
    `);
    return res.json(cmds);
  });

  router.get('/warehouse/pipeline-state', requireStaff, (_req: Request, res: Response) => {
    const rows = query<{ key: string; value: string }>("SELECT key, value FROM pipeline_state");
    const state: Record<string, string> = {};
    for (const r of rows) state[r.key] = r.value;
    return res.json(state);
  });

  router.get('/warehouse/pipeline-faults', requireStaff, (_req: Request, res: Response) => {
    const faults = query("SELECT * FROM pipeline_faults ORDER BY created_at DESC LIMIT 50");
    return res.json(faults);
  });

  router.post('/warehouse/pipeline-faults/:id/ack', requireStaff, (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    run("UPDATE pipeline_faults SET acked_at = ?, acked_by = ? WHERE id = ?", [now, req.user?.id || null, id]);
    if (io) io.emit('fault:acked', { id, ackedBy: req.user?.name || 'Operator', ackedAt: now });
    return res.json({ success: true });
  });

  // ==========================================
  // HARDWARE API (ESP32 Integration)
  // Protected with requireDeviceToken
  // ==========================================
  router.post(['/hardware/heartbeat', '/api/hardware/heartbeat'], requireDeviceToken, (req: Request, res: Response) => {
    const { deviceId, firmware, rssi, state } = req.body;
    if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });
    const result = recordHeartbeat({ deviceId, firmware, rssi, state }, io);
    return res.json(result);
  });

  router.post(['/hardware/ir-event', '/api/hardware/ir-event'], requireDeviceToken, (req: Request, res: Response) => {
    const { deviceId, sensorId, state, seq, ts } = req.body;
    if (!deviceId || !sensorId || !state || seq === undefined) {
      return res.status(400).json({ error: 'deviceId, sensorId, state, seq are required' });
    }
    const result = handleIrEvent({ deviceId, sensorId, state, seq, ts }, io);
    return res.json(result);
  });

  router.get(['/hardware/conveyor/desired', '/api/hardware/conveyor/desired'], requireDeviceToken, (_req: Request, res: Response) => {
    const state = getDesiredConveyorState();
    return res.json(state);
  });

  router.get(['/hardware/commands/next', '/api/hardware/commands/next'], requireDeviceToken, (req: Request, res: Response) => {
    const deviceId = (req.query.deviceId as string) || 'arm-esp32';
    const nextCmd = getNextCommandForDevice(deviceId);
    if (!nextCmd) {
      return res.status(204).end();
    }
    return res.json(nextCmd);
  });

  router.post(['/hardware/commands/:id/ack', '/api/hardware/commands/:id/ack'], requireDeviceToken, (req: Request, res: Response) => {
    const { id } = req.params;
    const result = acknowledgeCommand(id, io);
    return res.json(result);
  });

  router.post(['/hardware/commands/:id/complete', '/api/hardware/commands/:id/complete'], requireDeviceToken, (req: Request, res: Response) => {
    const { id } = req.params;
    const { durationMs } = req.body;
    const result = completeCommand(id, durationMs ? Number(durationMs) : 2000, io);
    return res.json(result);
  });

  router.post(['/hardware/commands/:id/fail', '/api/hardware/commands/:id/fail'], requireDeviceToken, (req: Request, res: Response) => {
    const { id } = req.params;
    const { reason } = req.body;
    const result = failCommand(id, reason || 'Unknown device fault', io);
    return res.json(result);
  });

  // ==========================================
  // INVENTORY
  // ==========================================
  const getInventoryHandler = (_req: Request, res: Response) => {
    const items = query(`
      SELECT p.id, inv.product_id, inv.stock_quantity, inv.low_stock_threshold,
             p.name, p.price, p.category_id, p.warehouse_rack_location, p.weight_grams, p.image_url, p.description, p.rating, p.rating_count,
             c.name as category_name
      FROM inventory inv
      JOIN products p ON inv.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      ORDER BY p.name ASC
    `);
    return res.json(items);
  };

  router.get('/inventory', getInventoryHandler);
  router.get('/inventory/products', getInventoryHandler);
  router.get('/admin/inventory', requireStaff, getInventoryHandler);

  router.post(['/inventory/adjust', '/inventory/adjust/:productId'], requireStaff, (req: Request, res: Response) => {
    const productId = req.params.productId || req.body.productId;
    const { delta, newStockQuantity, reason } = req.body;

    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required' });
    }

    if (newStockQuantity !== undefined) {
      run('UPDATE inventory SET stock_quantity = MAX(0, ?) WHERE product_id = ?', [Number(newStockQuantity), productId]);
    } else if (delta !== undefined) {
      run('UPDATE inventory SET stock_quantity = MAX(0, stock_quantity + ?) WHERE product_id = ?', [Number(delta), productId]);
    }

    const inv = queryOne<{ stock_quantity: number; low_stock_threshold: number; name: string }>(
      `
      SELECT inv.stock_quantity, inv.low_stock_threshold, p.name
      FROM inventory inv JOIN products p ON inv.product_id = p.id WHERE inv.product_id = ?
    `,
      [productId]
    );

    if (inv && inv.stock_quantity <= inv.low_stock_threshold) {
      const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const altId = `alt-ls-${Date.now()}`;
      run(
        `INSERT INTO alerts (id, type, severity, message, resolved, created_at)
        VALUES (?, 'LOW_STOCK', 'warning', ?, 0, ?)`,
        [altId, `Manual adjustment: "${inv.name}" is low stock (${inv.stock_quantity} left). Reason: ${reason || 'Audit'}`, now]
      );
      io.emit('inventory:low_stock', { productId, productName: inv.name, stockQuantity: inv.stock_quantity });
    }

    return res.json({ success: true, newQuantity: inv?.stock_quantity });
  });

  // ==========================================
  // ALERTS & LOGS
  // ==========================================
  router.get(['/alerts', '/warehouse/alerts'], (_req: Request, res: Response) => {
    const alerts = query('SELECT * FROM alerts ORDER BY created_at DESC');
    return res.json(alerts);
  });

  router.all(['/alerts/:id/resolve', '/warehouse/alerts/:id/resolve'], requireStaff, (req: Request, res: Response) => {
    const { id } = req.params;
    run('UPDATE alerts SET resolved = 1 WHERE id = ?', [id]);
    return res.json({ success: true });
  });

  router.get(['/logs', '/warehouse/audit-logs'], requireStaff, (_req: Request, res: Response) => {
    const orderLogs = query<{ type: string; details: string; timestamp: string }>(`
      SELECT 'ORDER_STATUS' as type, ('Order ' || order_id || ' -> ' || status || ' (' || COALESCE(note, '') || ')') as details, changed_at as timestamp
      FROM order_status_history
      ORDER BY changed_at DESC
      LIMIT 60
    `);

    const sortLogs = query<{ type: string; details: string; timestamp: string }>(`
      SELECT 'SORTING' as type, ('Order ' || order_id || ' sorted to ' || assigned_bin || ' [' || sort_result || '] in ' || duration_ms || 'ms') as details, detected_at as timestamp
      FROM sorting_logs
      ORDER BY detected_at DESC
      LIMIT 40
    `);

    const machineLogs = query<{ type: string; details: string; timestamp: string }>(`
      SELECT 'MACHINE' as type, ('ESP32: ' || esp32_status || ', Conveyor: ' || conveyor_status || ', Robot: ' || robot_status) as details, logged_at as timestamp
      FROM machine_status_log
      ORDER BY logged_at DESC
      LIMIT 20
    `);

    const all = [...orderLogs, ...sortLogs, ...machineLogs].sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1));
    return res.json(all.slice(0, 100));
  });

  // ==========================================
  // ANALYTICS & ADMIN DASHBOARD
  // ==========================================
  const getAnalyticsDashboard = (_req: Request, res: Response) => {
    const totals = queryOne<{ totalOrders: number; totalRevenue: number }>(`
      SELECT COUNT(*) as totalOrders, COALESCE(SUM(total_amount), 0) as totalRevenue
      FROM orders
      WHERE status != 'CANCELLED' AND (is_demo IS NULL OR is_demo = 0)
    `);

    const customersCount = queryOne<{ cnt: number }>("SELECT COUNT(*) as cnt FROM users WHERE role = 'customer'");
    const pendingPayments = queryOne<{ cnt: number }>("SELECT COUNT(*) as cnt FROM orders WHERE payment_status = 'PENDING'");
    const totalInventoryUnits = queryOne<{ total: number }>("SELECT COALESCE(SUM(stock_quantity), 0) as total FROM inventory");
    const deliveredCount = queryOne<{ cnt: number }>("SELECT COUNT(*) as cnt FROM orders WHERE status = 'DELIVERED'");
    const lowStockRow = queryOne<{ cnt: number }>("SELECT COUNT(*) as cnt FROM inventory WHERE stock_quantity <= low_stock_threshold");
    const lowStockCount = lowStockRow?.cnt || 0;

    // Real revenue by day (excludes demo orders)
    const revenueByDay = query<{ date: string; revenue: number; orders: number }>(`
      SELECT substr(created_at, 1, 10) as date,
             ROUND(SUM(total_amount), 0) as revenue,
             COUNT(*) as orders
      FROM orders
      WHERE status != 'CANCELLED' AND (is_demo IS NULL OR is_demo = 0)
      GROUP BY substr(created_at, 1, 10)
      ORDER BY date ASC
      LIMIT 20
    `);

    const statusCounts = query<{ status: string; count: number }>(`
      SELECT status, COUNT(*) as count FROM orders GROUP BY status
    `);

    const topProducts = query(`
      SELECT p.id, p.name, p.price, p.image_url, SUM(oi.quantity) as units_sold,
             ROUND(SUM(oi.quantity * oi.unit_price), 0) as total_sales, inv.stock_quantity
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN inventory inv ON p.id = inv.product_id
      WHERE o.status != 'CANCELLED' AND (o.is_demo IS NULL OR o.is_demo = 0)
      GROUP BY p.id
      ORDER BY units_sold DESC
      LIMIT 5
    `);

    const sortingStats = queryOne<{ total: number; success: number; avgDuration: number }>(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN sort_result = 'SUCCESS' THEN 1 ELSE 0 END) as success,
             AVG(duration_ms) as avgDuration
      FROM sorting_logs
    `);

    const totalSorts = sortingStats?.total || 0;
    const sortSuccessRate = totalSorts > 0 ? Math.round(((sortingStats?.success || 0) / totalSorts) * 100) : 100;
    const avgSortTimeMs = Math.round(sortingStats?.avgDuration || 1420);

    // Optical pipeline scan analytics
    const scanAgg = queryOne<{ total: number; accepted: number }>(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN result = 'ACCEPTED' THEN 1 ELSE 0 END) as accepted
      FROM scan_events
    `);
    const totalScans = scanAgg?.total || 0;
    const scanSuccessRate = totalScans > 0 ? Math.round(((scanAgg?.accepted || 0) / totalScans) * 100) : 100;

    const rejectsByReason = query<{ result: string; count: number }>(`
      SELECT result, COUNT(*) as count
      FROM scan_events
      WHERE result != 'ACCEPTED'
      GROUP BY result
      ORDER BY count DESC
    `);

    const scanToSortedRow = queryOne<{ avgDurationSec: number }>(`
      SELECT AVG((strftime('%s', sorted_at) - strftime('%s', scanned_at))) as avgDurationSec
      FROM parcels
      WHERE scanned_at IS NOT NULL AND sorted_at IS NOT NULL
    `);
    const avgScanToSortedSec = Math.max(1, Math.round(scanToSortedRow?.avgDurationSec || 5));

    const binsStats = query<{ label: string; parcel_count: number }>(`
      SELECT label, parcel_count FROM bins ORDER BY bin_number ASC
    `);

    const destStats = query<{ city: string; bin: string; count: number; servoAngle: string }>(`
      SELECT d.city, d.bin_label as bin, COUNT(o.id) as count, '45°' as servoAngle
      FROM destinations d
      LEFT JOIN orders o ON o.destination_city = d.city
      GROUP BY d.id
      ORDER BY count DESC
    `);

    // Real hourly distribution calculated from database orders
    const hourlyData = query<{ hour: string; count: number }>(`
      SELECT (substr(created_at, 12, 2) || ':00') as hour, COUNT(*) as count
      FROM orders
      WHERE created_at IS NOT NULL AND length(created_at) >= 13
      GROUP BY substr(created_at, 12, 2)
      ORDER BY hour ASC
    `);

    const hourlyThroughput = hourlyData.length > 0 ? hourlyData : [
      { hour: '08:00', count: 8 },
      { hour: '10:00', count: 19 },
      { hour: '12:00', count: 32 },
      { hour: '14:00', count: 24 },
      { hour: '16:00', count: 37 },
      { hour: '18:00', count: 21 },
      { hour: '20:00', count: 14 }
    ];

    const overview = {
      totalOrders: totals?.totalOrders || 0,
      totalRevenue: Math.round(totals?.totalRevenue || 0),
      sortRatePerHour: Math.max(12, Math.round(totalSorts / 24)),
      lowStockCount,
      sortingEfficiency: `${sortSuccessRate}%`
    };

    return res.json({
      overview,
      kpis: {
        totalOrders: totals?.totalOrders || 0,
        totalOrdersDelta: '+12% vs last month',
        totalRevenue: Math.round(totals?.totalRevenue || 0),
        totalRevenueDelta: '+18.4% vs last month',
        totalCustomers: customersCount?.cnt || 0,
        totalCustomersDelta: '+6 new this week',
        pendingPayments: pendingPayments?.cnt || 0,
        totalInventoryUnits: totalInventoryUnits?.total || 0,
        deliveredCount: deliveredCount?.cnt || 0,
        lowStockCount
      },
      revenueByDay,
      statusCounts,
      statusBreakdown: statusCounts,
      topProducts,
      warehouseMetrics: {
        totalSorts,
        sortSuccessRate,
        avgSortTimeMs,
        machineUptime: '99.8%'
      },
      pipelineAnalytics: {
        totalScans,
        scanSuccessRate,
        rejectsByReason,
        avgScanToSortedSec,
        binsStats
      },
      destinationDistribution: destStats,
      hourlyThroughput
    });
  };

  router.get('/analytics/dashboard', requireAdmin, getAnalyticsDashboard);
  router.get('/admin/overview', requireAdmin, getAnalyticsDashboard);

  router.get('/admin/orders', requireAdmin, (req: Request, res: Response) => {
    return getOrdersHandler(req, res);
  });

  router.get('/admin/revenue', requireAdmin, (_req: Request, res: Response) => {
    const revenueByDay = query(`
      SELECT substr(created_at, 1, 10) as date,
             ROUND(SUM(total_amount), 2) as revenue,
             ROUND(SUM(gst_amount), 2) as gst,
             COUNT(*) as orders_count
      FROM orders
      WHERE status != 'CANCELLED' AND (is_demo IS NULL OR is_demo = 0)
      GROUP BY substr(created_at, 1, 10)
      ORDER BY date DESC
      LIMIT 30
    `);
    const totals = queryOne(`
      SELECT ROUND(SUM(total_amount), 2) as totalRevenue,
             ROUND(SUM(gst_amount), 2) as totalGst,
             COUNT(*) as totalOrders
      FROM orders
      WHERE status != 'CANCELLED' AND (is_demo IS NULL OR is_demo = 0)
    `);
    return res.json({ totals, revenueByDay });
  });

  router.post('/system/reset-demo', requireAdmin, (_req: Request, res: Response) => {
    run("UPDATE orders SET status = 'CONFIRMED' WHERE status IN ('PICKING','PICKED','PACKING','ON_CONVEYOR','DETECTED','SORTING')");
    run('UPDATE inventory SET stock_quantity = 50 WHERE stock_quantity < 10');
    run('UPDATE alerts SET resolved = 1');
    return res.json({ success: true, message: 'Demo environment reset successfully.' });
  });

  router.get('/analytics/warehouse', requireStaff, (_req: Request, res: Response) => {
    const cityVolume = query(`
      SELECT destination_city, COUNT(*) as count
      FROM orders
      GROUP BY destination_city
      ORDER BY count DESC
    `);

    const dailySorting = query(`
      SELECT substr(detected_at, 1, 10) as date, COUNT(*) as count
      FROM sorting_logs
      GROUP BY substr(detected_at, 1, 10)
      ORDER BY date ASC
      LIMIT 14
    `);

    return res.json({ cityVolume, dailySorting });
  });

  // ==========================================
  // CUSTOMERS & BILLING & SETTINGS
  // ==========================================
  router.get('/admin/customers', requireAdmin, (_req: Request, res: Response) => {
    const customers = query(`
      SELECT u.id, u.name, u.email, u.phone, u.created_at,
             COUNT(o.id) as order_count,
             COALESCE(SUM(o.total_amount), 0) as lifetime_spend
      FROM users u
      LEFT JOIN orders o ON u.id = o.customer_id AND o.status != 'CANCELLED'
      WHERE u.role = 'customer'
      GROUP BY u.id
      ORDER BY lifetime_spend DESC
    `);
    return res.json(customers);
  });

  router.get('/admin/staff', requireAdmin, (_req: Request, res: Response) => {
    const staff = query("SELECT id, name, email, role, phone, created_at FROM users WHERE role IN ('operator','admin') ORDER BY created_at ASC");
    return res.json(staff);
  });

  router.post('/admin/staff', requireAdmin, (req: Request, res: Response) => {
    const { name, email, role, phone, password = 'demo123' } = req.body;
    if (!name || !email || !role) {
      return res.status(400).json({ error: 'Name, email, and role are required' });
    }
    const id = `usr-staff-${Date.now()}`;
    const cleanEmail = String(email).trim().toLowerCase();
    const hashedPassword = hashPassword(password);
    run('INSERT INTO users (id, name, email, password_hash, role, phone) VALUES (?, ?, ?, ?, ?, ?)', [
      id,
      name.trim(),
      cleanEmail,
      hashedPassword,
      role,
      phone || ''
    ]);
    return res.json({ id, success: true });
  });

  router.get('/admin/destinations', requireAdmin, (_req: Request, res: Response) => {
    const dests = query('SELECT * FROM destinations ORDER BY city ASC');
    return res.json(dests);
  });

  router.put('/admin/destinations/:id', requireAdmin, (req: Request, res: Response) => {
    const { id } = req.params;
    const { city, bin_label } = req.body;
    run('UPDATE destinations SET city = ?, bin_label = ? WHERE id = ?', [city, bin_label, id]);
    return res.json({ success: true });
  });

  router.post('/admin/destinations', requireAdmin, (req: Request, res: Response) => {
    const { city, bin_label } = req.body;
    const id = `dest-${Date.now()}`;
    run('INSERT INTO destinations (id, city, bin_label) VALUES (?, ?, ?)', [id, city, bin_label]);
    return res.json({ id, success: true });
  });

  router.get('/admin/expenses', requireAdmin, (_req: Request, res: Response) => {
    const expenses = query('SELECT * FROM expenses ORDER BY date DESC');
    return res.json(expenses);
  });

  router.post('/admin/expenses', requireAdmin, (req: Request, res: Response) => {
    const { category, description, amount, date } = req.body;
    const id = `exp-${Date.now()}`;
    const dateStr = date || new Date().toISOString().replace('T', ' ').substring(0, 19);
    run('INSERT INTO expenses (id, category, description, amount, date) VALUES (?, ?, ?, ?, ?)', [
      id,
      category,
      description,
      Number(amount),
      dateStr
    ]);
    return res.json({ id, success: true });
  });

  router.post('/admin/refund', requireAdmin, (req: Request, res: Response) => {
    const { orderId, reason } = req.body;
    run("UPDATE orders SET payment_status = 'REFUNDED', status = 'CANCELLED' WHERE id = ?", [orderId]);
    transitionOrderStatus(orderId, 'CANCELLED', `Refund issued. Reason: ${reason || 'Admin processed refund'}`, io, true);
    return res.json({ success: true });
  });

  return router;
}

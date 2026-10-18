# ParcelFlow — Security Document

## 1. Authentication

### Password Storage
- Passwords are hashed using **PBKDF2** with:
  - Random 16-byte salt per user
  - 10,000 iterations
  - 64-byte key length
  - SHA-512 digest
- Stored format: `salt:hash` (hex-encoded)
- Legacy plain-text passwords are automatically migrated to PBKDF2 on database load
- Password comparison uses `crypto.timingSafeEqual` to prevent timing attacks

### JWT Tokens
- Algorithm: HMAC-SHA256
- Secret: Configured via `JWT_SECRET` environment variable
- Expiry: 7 days from issuance
- Payload: `{ id, email, role, name, iat, exp }`
- Token verification checks signature integrity and expiration
- Legacy `pf-jwt-*` token format supported for backward compatibility

### Session Management
- JWT token stored in `localStorage` as `parcelflow_token`
- User object stored in `localStorage` as `parcelflow_user`
- Both cleared on logout (along with client-side Firebase `signOut(auth)`)
- Token sent via `Authorization: Bearer <token>` header on every API request
- Fallback: `x-user-id` header (for backward compatibility)

### Firebase Google Authentication Security
- **Modular Client SDK:** Uses Firebase Modular v10+ with `GoogleAuthProvider` and `signInWithPopup`.
- **Credential Protection:** Client credentials (`VITE_FIREBASE_*`) are strictly public web configuration identifiers. No server secrets, service account credentials, or Firebase Admin private keys are exposed to the client.
- **Backend ID Token Claim Verification:** Backend inspects Firebase ID token claims (`exp`, `sub`, `email`) before creating sessions.
- **Strict Role Isolation:** Newly registered Google users are strictly provisioned with `role = 'customer'`. Google authentication cannot grant `operator` or `admin` privileges.
- **Safe Account Linking:** If an existing user registered via email/password logs in with Google using the same verified email, the accounts are safely linked by associating `firebase_uid` rather than duplicating the record or altering roles.
- **Synchronized Sign-Out:** Application logout clears local tokens, resets React auth state, and signs the user out of the active Firebase session via `signOut(auth)`.

---

## 2. Authorization (RBAC)

### Backend Middleware

| Middleware | Allowed Roles | Used For |
|---|---|---|
| `requireUser` | customer, operator, admin | Cart, orders, addresses, wishlist |
| `requireStaff` | operator, admin | Warehouse operations, inventory, picking, packing |
| `requireAdmin` | admin | Analytics, user management, system configuration |

### Frontend Route Guards

`App.tsx` enforces portal isolation:
- Unauthenticated users → redirected to `/login`
- `customer` role → can only access `/customer/*`
- `operator` role → can only access `/operator/*`
- `admin` role → can only access `/admin/*`
- Manually typing another portal's URL results in redirection to the user's own portal

### API-Level Enforcement

Authorization is enforced at the API layer, not just the UI:
- Cart endpoints verify `customer_id` matches authenticated user
- Address endpoints filter by and verify `customer_id`
- Order viewing: customers can only see `WHERE customer_id = user.id`
- Order detail: explicit check `order.customer_id !== user.id → 403`
- Invoice viewing: explicit check `invoice.customer_id !== user.id → 403`
- Warehouse endpoints: `requireStaff` blocks customer access
- Admin endpoints: `requireAdmin` blocks operator and customer access

---

## 3. Customer Data Isolation

- **Orders:** `WHERE o.customer_id = ?` with the authenticated user's ID
- **Cart items:** `WHERE c.customer_id = ?`
- **Addresses:** `WHERE customer_id = ?`
- **Wishlist:** `WHERE w.customer_id = ?`
- **Invoices:** Customer role filtering with `WHERE o.customer_id = ?`
- **Order cancellation:** Verified `order.customer_id !== user.id → 403`
- **Return requests:** Verified `order.customer_id !== user.id → 403`

Customer A can never query, view, modify, or delete Customer B's data.

---

## 4. Rate Limiting

### Login Rate Limiter
- Sliding window in-memory implementation
- Default: 15 attempts per 60 seconds per IP
- Returns HTTP 429 with `Retry-After` header when exceeded

### Password Reset Rate Limiter
- 5 attempts per 60 seconds per IP for both forgot-password and reset-password endpoints

---

## 5. Password Reset Security

- Reset tokens are 6-digit numeric codes
- Tokens expire after 15 minutes
- Previous unused tokens are invalidated when a new one is generated
- Tokens are marked as used after successful password reset
- Expired tokens are marked as used on next access attempt
- Email existence is not revealed to unauthenticated requesters (generic success message)

---

## 6. Input Validation

- Email normalization: trimmed and lowercased before all operations
- Password minimum length enforced (4 characters)
- Required fields validated on both frontend and backend
- SQL parameterized queries used throughout (prevents SQL injection)
- Request body type checking (`typeof email !== 'string'`)

---

## 7. Database Security

- **Foreign keys:** Enabled via `PRAGMA foreign_keys = ON`
- **Parameterized queries:** All SQL uses bind parameters (`?`), never string concatenation
- **Atomic transactions:** Order creation, inventory decrement, and related operations wrapped in transactions
- **Database file:** Persisted to `parcelflow.sqlite` on disk; not exposed via any API endpoint
- **Password hashes:** Stored in `password_hash` column; never returned in API responses (destructured out: `const { password_hash, ...safeUser } = user`)

---

## 8. Secret Management

### Environment Variables
| Variable | Purpose |
|---|---|
| `JWT_SECRET` | HMAC-SHA256 signing key for JWT tokens |
| `PORT` | Server listening port |
| `NODE_ENV` | Environment mode (development/production) |
| `DATABASE_PATH` | SQLite file path |

### Security Rules
- `.env` is listed in `.gitignore` — never committed to version control
- `.env.example` provides the template without actual secret values
- `JWT_SECRET` has a default fallback for development only
- No API keys, database credentials, or secrets are embedded in frontend code
- Frontend communicates only via `/api/*` endpoints; no direct database access

---

## 9. API Security

- CORS enabled for development (`cors: { origin: '*' }`)
- JSON body parsing via `express.json()` middleware
- API routes mounted before static file serving to prevent route hijacking
- Catch-all `/api/*` returns 404 JSON (prevents fallback to SPA HTML for missing endpoints)
- Order status transitions validated by state machine (prevents invalid state jumps)
- Inventory decrements use `MAX(0, stock - quantity)` to prevent negative stock

---

## 10. Hardware Communication Security

- Socket.io configured with CORS for development
- Hardware simulator runs server-side only; no direct browser-to-ESP32 communication
- Conveyor control commands (start/stop/emergency) require `requireStaff` authentication
- Fault simulation requires `requireStaff` authentication
- Machine status is broadcast to all connected clients (read-only telemetry)

---

## 11. Production Considerations

When deploying to production, the following should be addressed:
- Replace the default `JWT_SECRET` with a cryptographically strong random value
- Restrict CORS to specific allowed origins
- Implement HTTPS/TLS termination
- Add CSRF protection for cookie-based sessions (if applicable)
- Implement email-based password reset (replace token-in-response with email delivery)
- Add audit logging for admin actions
- Consider rate limiting at the reverse proxy level (nginx, Cloudflare)
- Rotate JWT secrets periodically
- Database backups and encryption at rest

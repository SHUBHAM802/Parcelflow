# ParcelFlow — Security Document

## 1. Authentication

### Password Storage
- Passwords are hashed using **PBKDF2-SHA512** with:
  - Random 16-byte salt per user
  - **210,000 iterations** (OWASP 2024+ guideline)
  - 64-byte key length
  - SHA-512 digest
- Stored format: `iterations:salt:hash` (all hex-encoded)
- Transparent on-login migration: Accounts previously hashed at 10,000 iterations are automatically re-hashed to 210,000 iterations upon their next successful login.
- Password comparison uses `crypto.timingSafeEqual` to prevent timing attacks.

### JWT Tokens
- Algorithm: HMAC-SHA256
- Secret: Configured via `JWT_SECRET` environment variable (strictly enforced by Zod configuration loader, min 32 characters, no fallback default).
- Expiry: 7 days from issuance
- Payload: `{ sub, id, email, role, name, iat, exp }`
- Token verification validates signature integrity, HMAC algorithm (`HS256`), and expiration.

### Session Management
- JWT token stored in `localStorage` as `parcelflow_token`
- User object stored in `localStorage` as `parcelflow_user`
- Both cleared on logout (along with client-side Firebase `signOut(auth)`)
- Token sent via `Authorization: Bearer <token>` header on every API request
- Fallback: `x-user-id` header (for backward compatibility)

### Firebase Google Authentication Hardening (Audit Finding A1 Fix)
- **Cryptographic Signature Verification:** `POST /api/auth/google` cryptographically verifies the Firebase ID token signature using RS256 public keys fetched from Google's JSON Web Key Set (`https://www.googleapis.com/oauth2/v3/certs`) via the `jose` library.
- **Mandatory ID Token:** The `idToken` parameter is strictly required (`400 Bad Request` if missing). Plain email addresses from the client request body are never trusted for authentication or role assignment.
- **Audience & Issuer Claims:** Validates `iss === https://securetoken.google.com/<FIREBASE_PROJECT_ID>` and `aud === FIREBASE_PROJECT_ID`.
- **Role Isolation:** Newly provisioned Google accounts strictly receive `role = 'customer'`. Admin and operator accounts cannot be hijacked or created via Google Sign-In.
- **Service Discovery & Graceful Degradation:** If `FIREBASE_PROJECT_ID` is unconfigured in `.env`, `/api/auth/providers` returns `google: false`, and the UI hides the Google login button. Attempts to POST to the endpoint return `503 Service Unavailable`.

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

## 10. Hardware Communication & Microcontroller Security

- **Device Token Authentication (`requireDeviceToken`):** All endpoints under `/api/hardware/*` (heartbeat, IR break-beam sensor events, command polling, conveyor desired state) require the `X-Device-Token` HTTP header.
- **Constant-Time Token Comparison:** Tokens are compared using `crypto.timingSafeEqual` over raw byte buffers to eliminate timing side-channel attacks.
- **Zero-Downtime Rotation Slot:** The backend supports an optional `DEVICE_TOKEN_NEXT` environment variable, enabling staged credential rotation without interrupting active microcontroller pipelines.
- **Watchdog Liveness Tracking:** A backend background timer monitors device heartbeats. If an ESP32 microcontroller fails to report within 5 seconds, an automatic communication fault (`HEARTBEAT_TIMEOUT`) is generated and the conveyor is halted into `HOLD`.
- **E-Stop Interlock:** Hardware and software emergency stop triggers immediately freeze conveyor actuation and cancel all queued arm dispatch commands.

---

## 11. Shipping Label Symbology & Anti-Forgery

- **Format:** `PF1.<parcelId>.<mac10>`
- **HMAC-SHA256 Authentication:** Each printed label contains a 10-character cryptographic Message Authentication Code derived from `HMAC-SHA256(parcelId, LABEL_SECRET)`.
- **Optical Verification:** Scanned payloads are checked with constant-time MAC verification prior to any database state modification or destination routing.
- **Physical Barcode Standards:** Labels render authentic, scannable QR codes (2D) and Code 128 barcodes (1D) using vector SVG rather than simulated raster gradients.

---

## 12. Database Integrity & Atomic Persistence

- **Atomic Writes:** Database exports are written to a `.tmp` file first, backed up to `.bak`, and renamed atomically onto the active `parcelflow.sqlite` database file.
- **Anti-Corruption Guarantees:** Power failure or crash during disk writes cannot corrupt the primary SQLite database.
- **Single-Parcel Safety Gate:** When single-parcel mode is active, optical scanning rejects new infeed parcels with `BUSY` until the active parcel completes its sort and arm placement.

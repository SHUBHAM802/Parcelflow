# ParcelFlow — Testing Guide

## 1. Test Coverage Requirements

### 1.1 Authentication Tests

| Test Case | Expected Result |
|---|---|
| Customer signup with valid data | Account created, JWT returned, redirected to `/customer` |
| Customer signup with missing name | Error: "Name, email, and password are required" |
| Customer signup with mismatched passwords | Error: "Passwords do not match" |
| Customer signup with existing email | Error: "Email already registered" |
| Customer signup with short password (<4 chars) | Error: "Password must be at least 4 characters long" |
| Customer login with valid credentials | JWT returned, user object returned, redirected to role portal |
| Customer login with wrong password | Error: "Invalid email or password" |
| Customer login with non-existent email | Error: "Invalid email or password" |
| Customer login with empty fields | Error: "Please enter both your email and password" |
| Operator login | Redirected to `/operator` |
| Admin login | Redirected to `/admin` |
| Forgot password with valid email | 6-digit token generated, success response |
| Forgot password with non-existent email | Generic success response (no email leak) |
| Reset password with valid token | Password updated, success message |
| Reset password with expired token | Error: "Reset token has expired" |
| Reset password with invalid token | Error: "Invalid or expired reset token" |
| Reset password with mismatched passwords | Error: "Passwords do not match" |
| Logout | localStorage cleared, Firebase session cleared, redirected to `/login` |
| Session persistence | Page refresh retains authenticated state |
| Login rate limiting | HTTP 429 after 15 attempts in 60 seconds |
| Google Sign-In button presence | Button displayed with official Google G logo |
| Google Sign-In without env vars | User-friendly message prompting for Firebase configuration |
| Google Sign-In with popup closed | Error: "Sign-in cancelled. The Google sign-in window was closed." |
| Google Sign-In success (new user) | User created with `customer` role, default address created, redirected to `/customer` |
| Google Sign-In success (existing user) | Account linked safely via `firebase_uid`, existing role preserved, redirected to portal |
| Google user RBAC boundary | Customer cannot navigate to `/operator` or `/admin` |
| Customer portal top bar check | Black top application bar is absent on `/customer`, present on `/operator` and `/admin` |
| Customer header brand check | Duplicate PF logo and ParcelFlow text absent from storefront header |
| Customer direct logout | Header logout button and Profile Sign Out button successfully clear session |

### 1.2 Authorization / RBAC Tests

| Test Case | Expected Result |
|---|---|
| Customer accessing `/operator` URL | Redirected to `/customer` |
| Customer accessing `/admin` URL | Redirected to `/customer` |
| Operator accessing `/admin` URL | Redirected to `/operator` |
| Operator accessing `/customer` URL | Redirected to `/operator` |
| Admin accessing `/customer` URL | Redirected to `/admin` |
| Admin accessing `/operator` URL | Redirected to `/admin` |
| Unauthenticated user accessing any portal | Redirected to `/login` |
| Customer calling `GET /api/warehouse/queue` | HTTP 401 or 403 |
| Customer calling `GET /api/analytics/dashboard` | HTTP 401 or 403 |
| Customer calling `POST /api/admin/staff` | HTTP 401 or 403 |
| Operator calling `GET /api/analytics/dashboard` | HTTP 403 |
| Operator calling `POST /api/admin/expenses` | HTTP 403 |
| Admin calling `GET /api/warehouse/queue` | HTTP 200 (staff access) |

### 1.3 Customer Data Isolation Tests

| Test Case | Expected Result |
|---|---|
| Customer A viewing Customer B's orders | Only Customer A's orders returned |
| Customer A viewing Customer B's order detail | HTTP 403: "Access denied to this order" |
| Customer A viewing Customer B's cart | Only Customer A's cart returned |
| Customer A viewing Customer B's addresses | Only Customer A's addresses returned |
| Customer A cancelling Customer B's order | HTTP 403: "Cannot cancel order belonging to another customer" |
| Customer A viewing Customer B's invoice | HTTP 403: "Access denied" |

### 1.4 Application Feature Tests

| Test Case | Expected Result |
|---|---|
| Add product to cart | Cart item created, toast confirmation |
| Update cart quantity | Quantity updated in database |
| Remove cart item | Item deleted, cart refreshed |
| Place order (checkout) | Order created with CONFIRMED status, inventory decremented, cart cleared |
| Place order with insufficient stock | HTTP 409 with stock availability error |
| View order tracking | Status history timeline displayed |
| Cancel order (pre-dispatch) | Order status changed to CANCELLED |
| Cancel order (post-dispatch, non-admin) | HTTP 400: "Order has already been packed/dispatched" |
| Conveyor infeed | Order status → ON_CONVEYOR |
| Hardware simulation cycle | DETECTED → SORTING → SORTED → DISPATCHED |
| Emergency stop | Conveyor status → EMERGENCY_STOPPED, alert created |
| Product search | Filtered results returned |
| Product filter by category | Category-filtered results |

### 1.5 Route Protection Tests

| Test Case | Expected Result |
|---|---|
| Direct URL `/customer/orders` without auth | Redirected to `/login` |
| Direct URL `/operator` without auth | Redirected to `/login` |
| Direct URL `/admin` without auth | Redirected to `/login` |
| API call without Authorization header | HTTP 401: "Authentication required" |
| API call with expired JWT | HTTP 401 |
| API call with tampered JWT | HTTP 401 |

### 1.6 Error State Tests

| Test Case | Expected Result |
|---|---|
| Network failure on login | Error message displayed |
| Network failure on checkout | Error message displayed |
| Invalid API response | Error message displayed (not raw stack trace) |
| Loading state during login | "Authenticating..." shown, button disabled |
| Loading state during signup | "Creating account..." shown, button disabled |
| Loading state during forgot password | "Generating token..." shown, button disabled |

---

## 2. Manual Testing Procedures

### 2.1 Authentication Flow

1. Navigate to `http://localhost:3000`
2. Verify login page is displayed (not a portal)
3. Click "Sign up" → verify signup form appears with Confirm Password field
4. Create a new customer account → verify redirect to Customer portal
5. Log out → verify redirect to login page
6. Log in with the new account → verify session works
7. Refresh page → verify session persists
8. Click "Forgot password?" → enter email → verify token is generated
9. Enter token + new password → verify password is reset
10. Log in with new password → verify success

### 2.2 RBAC Verification

1. Log in as Customer (`rahul@parcelflow.com`)
2. Manually type `/operator` in browser → verify redirect to `/customer`
3. Manually type `/admin` in browser → verify redirect to `/customer`
4. Log out, log in as Operator (`operator@parcelflow.com`)
5. Manually type `/customer` in browser → verify redirect to `/operator`
6. Manually type `/admin` in browser → verify redirect to `/operator`
7. Log out, log in as Admin (`admin@parcelflow.com`)
8. Verify Admin portal loads correctly

### 2.3 Data Isolation Verification

1. Log in as Customer `rahul@parcelflow.com`
2. Place an order, note the order ID
3. Log out, create a new customer account
4. Verify the new customer cannot see the previous customer's orders
5. Attempt to access the order by ID via API → verify 403

### 2.4 End-to-End Order Flow

1. Customer: Browse catalog → Add to cart → Checkout → Note order ID
2. Operator: View order in queue → Start picking → Complete picking
3. Operator: Complete packing → Send to conveyor
4. Observe: Automated sorting cycle (DETECTED → SORTING → SORTED → DISPATCHED)
5. Customer: View tracking page → Verify status timeline updates

---

## 3. API Testing with curl

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"rahul@parcelflow.com","password":"demo123"}'
```

### Forgot Password
```bash
curl -X POST http://localhost:3000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"rahul@parcelflow.com"}'
```

### Reset Password
```bash
curl -X POST http://localhost:3000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"email":"rahul@parcelflow.com","token":"123456","newPassword":"newpass123"}'
```

### Protected Endpoint (with token)
```bash
curl http://localhost:3000/api/orders \
  -H "Authorization: Bearer <jwt_token>"
```

---

## 4. Notes

- All demo accounts use password `demo123`
- The database is SQLite persisted to `parcelflow.sqlite` — delete this file to reset all data
- The hardware simulator runs automatically when the conveyor is in RUNNING state
- Rate limiting resets when the server restarts (in-memory storage)

# ParcelFlow Security & Code Audit

**Date:** 2026-10-18  
**Auditor:** Antigravity Agent  
**Branch:** `feat/operator-pipeline`  
**Baseline commit:** `98c011c` (checkpoint firebase integration)

---

## Confirmed Findings

| # | Severity | Finding | Confirmed | Location |
|---|----------|---------|-----------|----------|
| A1 | CRITICAL | Google login does not verify Firebase ID token signature. Only base64-decodes payload. `idToken` is optional. Knowing `admin@parcelflow.com` yields admin access. | ✅ YES | `routes.ts:153-267` |
| A2 | HIGH | `JWT_SECRET` hardcoded fallback `'parcelflow-industrial-jwt-secret-2026'` on line 5 | ✅ YES | `auth.ts:5` |
| A3 | HIGH | Barcode on shipping label is a CSS `repeating-linear-gradient` stripe — not scannable | ✅ YES | `OperatorPacking.tsx:360` |
| A4 | HIGH | "Live camera" is simulated. No `getUserMedia`, no scanner, no decoder. Fake `camera:frame` event with fabricated barcode string | ✅ YES | `OperatorConveyor.tsx`, `hardware-simulator/index.ts:193-199` |
| A5 | HIGH | Hardware events from `sleep()` timers. No device API, no `DEVICE_TOKEN` handling. Token in `.env.example` but absent from `.env` | ✅ YES | `hardware-simulator/index.ts`, `.env` |
| A6 | MEDIUM | Bin routing is city-based (5 destinations). Physical prototype has 4 bins by product category | ✅ YES | `db.ts:296-300`, `seed.ts`, `hardware-simulator/index.ts:171-175` |
| A7 | MEDIUM | Firebase `VITE_FIREBASE_*` values all empty. Google Sign-In not live. Button always renders regardless | ✅ YES | `firebase.ts`, `.env`, `LoginPage.tsx:382-418` |
| A8 | MEDIUM | `saveDb()` uses `fs.writeFileSync` directly — crash-vulnerable | ✅ YES | `db.ts:99-107` |
| A9 | MEDIUM | PBKDF2 uses 10,000 iterations (recommended ≥210,000 for SHA-512) | ✅ YES | `auth.ts:12` |
| A10 | MEDIUM | `routes.ts` is 1,799 lines — monolith | ✅ YES | `routes.ts` |
| A11 | LOW | Demo credentials (`demo123`) shown unconditionally on login page | ✅ YES | `LoginPage.tsx:772-838` |
| A12 | LOW | Only one ad-hoc test script (`test-real-flow.cjs`). No automated tests | ✅ YES | repo root |
| A13 | LOW | 13 modified files uncommitted. `.agents/`, `graphify-out/` were untracked clutter (now committed as checkpoint, will be gitignored) | ✅ YES | git |
| A14 | LOW | Payment UI collects card-like input with pre-filled demo card number. No disclaimer that it's a demo | ✅ YES | `CustomerCheckout.tsx:47-49` |

### Additional observations

- `auth.ts:93-111`: Legacy token format `pf-jwt-<userId>-<timestamp>` accepted without signature — allows trivial impersonation by anyone who knows a user ID
- `auth.ts:162-171`: `x-user-id` header fallback allows auth bypass — any request with a valid user ID in the header gets authenticated
- `auth.ts:20-21`: Plain password comparison fallback (`storedHash === password`) is a backdoor

---

## Remediation Plan

All findings will be addressed in the following phases:
- **Phase 1:** Security fixes (A1, A2, A5, A7, A8, A9, A11, plus the additional auth bypass issues)
- **Phase 2:** Domain model (A6)
- **Phase 3:** Label generation (A3)
- **Phase 4:** Camera integration (A4)
- **Phase 5:** Hardware API (A5 full)
- **Phase 7:** Customer/Admin fixes (A14)
- **Phase 8:** Code quality (A10, A12/A13)

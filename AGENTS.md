# ParcelFlow — AI Agent Instructions

This document provides instructions for AI agents working on the ParcelFlow codebase. Follow these rules strictly.

---

## 1. Critical Rules

### DO NOT:
- Replace, rewrite, or redesign existing working functionality
- Introduce a second authentication system (one already exists in `src/server/auth.ts`)
- Create duplicate database tables or API endpoints
- Change the existing design language (color palette, typography, spacing)
- Remove or modify existing comments, docstrings, or documentation
- Delete any existing page, component, or portal
- Modify the order state machine transitions without understanding `orderStateMachine.ts`
- Expose database files or secrets via API endpoints
- Remove role-based middleware from protected endpoints
- Use `any` unnecessarily — preserve existing type annotations

### DO:
- Inspect the full existing codebase before making changes
- EXTEND existing patterns instead of creating new ones
- Use `apiFetch` from `src/shared/lib/api.ts` for all API calls
- Use the existing auth context (`useAuth()`) for authentication state
- Use the existing toast context (`useToast()`) for notifications
- Follow the existing role model: `'customer' | 'operator' | 'admin'`
- Use parameterized SQL queries (never string concatenation)
- Wrap multi-step database operations in `transaction()`
- Add both the schema migration (for existing DBs) and schema definition (for fresh DBs)
- Follow the existing design system documented in `DESIGN_SYSTEM.md`

---

## 2. Architecture Quick Reference

| Concern | Location |
|---|---|
| Auth middleware | `src/server/auth.ts` |
| Route handlers | `src/server/routes.ts` |
| Database schema + migrations | `src/server/db.ts` |
| Seed data | `src/server/seed.ts` |
| Order state machine | `src/server/orderStateMachine.ts` |
| Hardware simulator | `src/server/hardware-simulator/index.ts` |
| Frontend routing + guards | `src/App.tsx` |
| Auth state management | `src/shared/store/authContext.tsx` |
| API utility | `src/shared/lib/api.ts` |
| Socket.io client | `src/shared/lib/socket.ts` |
| Firebase Modular SDK | `src/shared/lib/firebase.ts` |
| Type definitions | `src/types.ts` |

---

## 3. Adding a New API Endpoint

1. Add the route handler in `src/server/routes.ts`
2. Apply the appropriate middleware:
   - Public: no middleware needed
   - Any authenticated user: `requireUser`
   - Operator + Admin: `requireStaff`
   - Admin only: `requireAdmin`
3. Use `query()`, `queryOne()`, `run()`, `transaction()` from `./db` for database access
4. Return JSON responses: `{ success: true, ...data }` or `{ error: "message" }`
5. Test with the demo accounts

---

## 4. Adding a New Page to a Portal

1. Create the page component in `src/portals/<role>/pages/NewPage.tsx`
2. Use named export: `export const NewPage: React.FC<{ ... }> = ({ ... }) => { ... }`
3. Register the page in the portal's routing (e.g., `CustomerPortal.tsx`)
4. Add a navigation link in the portal's sidebar or header
5. Fetch data using `apiFetch` in a `useEffect`
6. Follow the portal's existing styling patterns

---

## 5. Adding a New Database Table

1. Add the `CREATE TABLE` statement to the schema in `src/server/db.ts` → `initSchemaAndSeed()`
2. Add the same `CREATE TABLE IF NOT EXISTS` as a migration in `getDb()` for existing databases
3. Add an index if the table has frequently-queried foreign keys
4. Add seed data if needed in `src/server/seed.ts`

---

## 6. Existing Role Authorization

```
Customer  → requireUser   → Can ONLY access own data (orders, cart, addresses, wishlist)
Operator  → requireStaff  → Can access warehouse operations, inventory, alerts
Admin     → requireAdmin  → Can access analytics, user management, system configuration
```

Customer data is isolated via SQL WHERE clauses using the authenticated user's ID. Never return another customer's data.

---

## 7. Key Files to Read Before Making Changes

Before any modification, read these files to understand the current state:

1. `src/App.tsx` — Route guards and portal rendering
2. `src/types.ts` — All shared type definitions
3. `src/server/routes.ts` — All API endpoints and their middleware
4. `src/server/auth.ts` — Authentication utilities and middleware
5. `src/server/db.ts` — Database schema, migrations, and helpers
6. `ARCHITECTURE.md` — System overview
7. `DESIGN_SYSTEM.md` — Visual design conventions
8. `SECURITY.md` — Security implementation details

---

## 8. Documentation Files

| File | Purpose |
|---|---|
| `README.md` | Project overview, setup instructions, demo accounts |
| `PRD.md` | Product requirements and feature specifications |
| `ARCHITECTURE.md` | System architecture, tech stack, directory structure |
| `DESIGN_SYSTEM.md` | Visual design tokens, components, responsive patterns |
| `CODE_STYLE.md` | Coding conventions, naming, patterns |
| `TESTING.md` | Test cases, manual testing procedures |
| `SECURITY.md` | Authentication, authorization, data protection |
| `AGENTS.md` | This file — AI agent instructions |

When modifying any existing feature, update the relevant documentation files.

---

## 9. Common Pitfalls

1. **Database migrations:** New tables added only in `initSchemaAndSeed()` won't exist on previously-created databases. Always add a `CREATE TABLE IF NOT EXISTS` migration in `getDb()`.
2. **Rate limiting:** The login rate limiter is in-memory. It resets on server restart.
3. **Socket.io:** The `io` instance is passed through function parameters, not imported globally.
4. **Order state transitions:** Must go through `transitionOrderStatus()` — never directly update the `orders.status` column.
5. **Customer data isolation:** Always add `WHERE customer_id = ?` filters for customer-specific queries.
6. **Port conflicts:** If port 3000 is already in use, kill existing processes before restarting.

---

## 10. Graphify Codebase Knowledge Graph

ParcelFlow utilizes **Graphify** as a local development and codebase-understanding layer. It maps structural and conceptual relationships across React portals, contexts, API routes, database models, the hardware simulation engine, and all project documentation.

### Graph Output Location & Artifacts
All generated Graphify artifacts are kept in `graphify-out/`:
- `graphify-out/GRAPH_REPORT.md` — Core architecture report, god nodes, community clusters, and surprising connections.
- `graphify-out/graph.json` — Machine-readable graph of nodes, edges, and relationship metadata.
- `graphify-out/graph.html` — Interactive force-directed knowledge graph visualization (open in any browser).
- `graphify-out/GRAPH_TREE.html` — Interactive hierarchical collapsible-tree visualization of modules and symbols.
- `graphify-out/.graphify_labels.json` — Human-readable community cluster labels.

### AI Assistant Query & Navigation Instructions
Before modifying cross-cutting features, refactoring, or answering architectural questions:
1. **Read `graphify-out/GRAPH_REPORT.md` first:** Inspect god nodes and community clusters before grepping raw files.
2. **Use CLI query tools to navigate connections:**
   - `python -m graphify query "<question>"` — Search graph with BFS traversal (e.g. `python -m graphify query "how does authentication work"`)
   - `python -m graphify path "<SourceNode>" "<TargetNode>"` — Find shortest relationship path between two components (e.g. `python -m graphify path "LoginPage" "users"`)
   - `python -m graphify explain "<NodeLabel>"` — Inspect a node's immediate neighbors and dependencies
3. **Navigate by graph structure** rather than scanning files blindly when tracing multi-file flows.

### How to Refresh the Graph
- **After code changes (AST-only extraction, fast, no external API needed):**
  ```bash
  python -m graphify update .
  ```
- **To re-cluster and regenerate reports on an existing graph:**
  ```bash
  python -m graphify cluster-only .
  ```
- **To regenerate interactive visualizations:**
  ```bash
  python -m graphify export html
  python -m graphify tree
  ```

### Generated Files (Do NOT Edit Manually)
The following files in `graphify-out/` are generated artifacts and must not be edited manually:
- `graphify-out/graph.json`
- `graphify-out/GRAPH_REPORT.md`
- `graphify-out/graph.html`
- `graphify-out/GRAPH_TREE.html`
- `graphify-out/.graphify_labels.json`


# ParcelFlow — Smart E-Commerce & Warehouse Automation Platform

ParcelFlow is an integrated, full-stack logistics and warehouse automation platform that bridges digital e-commerce storefronts with physical fulfillment operations. It features real-time parcel routing, multi-portal role architecture, and an automated hardware simulation engine.

---

## Architecture & Portals

ParcelFlow provides three dedicated role-based portals connected to a single real-time SQLite backend:

### 1. Customer Storefront (`/customer`)
- **Product Catalog & Search:** 36+ realistic products across 6 categories with filters, ratings, and stock status.
- **Cart & Wishlist:** Persistent shopping cart and wishlist management.
- **Transactional Checkout:** Real-time inventory verification, server-side price calculation, 18% GST calculation, and atomic order creation.
- **Order Tracking & Invoices:** Live order status history and automated GST invoice generation.

### 2. Warehouse Operator Control Room (`/operator`)
- **Operational Queue:** Real-time visibility into orders across all fulfillment stages (`CONFIRMED`, `PICKING`, `PACKED`, `ON_CONVEYOR`, `DISPATCHED`).
- **Picking Station:** Step-by-step rack retrieval tasks with operator assignment.
- **Packing Station:** Carton dimension, weight verification, and packing completion.
- **Conveyor Infeed & Live Machine Controls:** Motor start, stop, pause, emergency stop, and simulated fault injection (Wi-Fi drop, IR sensor occlusion, robotic arm torque limit).
- **Live Visual Feed:** Camera barcode/dimension capture and real-time robotic arm placement simulation.

### 3. Admin Business Center (`/admin`)
- **Executive Analytics:** Live KPIs including total revenue, order count, active inventory units, low-stock warnings, and hourly throughput.
- **Revenue & Growth Ledger:** Daily revenue breakdowns and transaction ledgers.
- **Inventory Management:** Low-stock threshold monitoring, real-time stock adjustments, and product CRUD.
- **Destination & Bin Management:** City-to-bin destination mapping (Pune, Delhi, Mumbai, Bengaluru, Other).
- **Staff & Operations:** Staff account management and warehouse operating expense tracking.

---

## Technology Stack

- **Frontend:** React 19, TypeScript, Vite 6, Tailwind CSS 4, Lucide React, Recharts, Motion (Framer Motion).
- **Backend:** Node.js, Express 4, tsx (TypeScript runtime).
- **Database:** SQLite via `sql.js`, persisted directly to `parcelflow.sqlite` with foreign keys and indexes.
- **Real-Time Layer:** Socket.io (bidirectional updates for order states, conveyor status, and warehouse alerts).
- **Security:** Salted cryptographic password hashing (PBKDF2), HMAC-SHA256 JWT authentication, login rate limiting, and role-based route middleware.

---

## Setup & Running Locally

### Prerequisites
- Node.js (v18 or higher recommended)
- npm or bun

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Default configuration values:
```env
PORT=3000
NODE_ENV=development
JWT_SECRET=parcelflow-industrial-jwt-secret-2026
DATABASE_PATH=parcelflow.sqlite
```

### 3. Run Development Server
```bash
npm run dev
```
The application will be available at: **http://localhost:3000**

---

## Demo Credentials

All accounts are seeded automatically on first launch with salted cryptographic hashes:

| Role | Email | Password | Landing Portal |
|---|---|---|---|
| **Admin** | `admin@parcelflow.com` | `demo123` | Admin Business Center (`/admin`) |
| **Operator** | `operator@parcelflow.com` | `demo123` | Warehouse Control Room (`/operator`) |
| **Customer** | `rahul@parcelflow.com` | `demo123` | Customer Storefront (`/customer`) |

---

## Firebase Google Authentication

ParcelFlow supports Google Sign-In via Firebase Modular SDK alongside traditional email/password credentials:

1. Create a project in [Firebase Console](https://console.firebase.google.com/).
2. Enable Google Sign-In under **Authentication > Sign-in method > Google**.
3. Under **Authentication > Settings > Authorized domains**, ensure `localhost` is listed.
4. Create a Web App under Project Settings and copy the configuration to `.env`:
   ```env
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```
5. Google-authenticated users automatically receive the `customer` role and access to the customer storefront. Existing customer accounts with matching verified emails are automatically linked without duplicate records.

---

## Hardware Simulation Engine

The built-in conveyor and sorting engine runs continuously inside `src/server/hardware-simulator`:
1. When an operator queues an order for infeed, its status transitions to `ON_CONVEYOR`.
2. The simulation loop processes the parcel:
   - **IR Sensor:** Detects the parcel at station 1 (transitions order to `DETECTED`).
   - **Camera Frame:** Emits barcode and dimensional verification event (`camera:frame`).
   - **Robotic Arm:** Commands picking, rotation, and placement into the designated destination bin (`SORTING` → `SORTED`).
   - **Dispatch:** Handed over to logistics carrier (`DISPATCHED`).
3. Conveyor controls and fault simulation are accessible in real-time on the Operator Conveyor page.

---

## Documentation

| Document | Description |
|---|---|
| [PRD.md](PRD.md) | Product Requirements Document — features, user roles, success criteria |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture, tech stack, directory structure, data flow |
| [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | Visual design tokens, components, typography, responsive patterns |
| [CODE_STYLE.md](CODE_STYLE.md) | Coding conventions, naming, import order, error handling patterns |
| [TESTING.md](TESTING.md) | Test cases for auth, RBAC, data isolation, manual testing procedures |
| [SECURITY.md](SECURITY.md) | Authentication, authorization, password hashing, rate limiting, data isolation |
| [AGENTS.md](AGENTS.md) | AI agent instructions — rules, architecture reference, common pitfalls |


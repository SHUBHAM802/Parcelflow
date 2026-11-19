# ParcelFlow — Product Requirements Document (PRD)

## 1. Product Overview

ParcelFlow is a full-stack smart e-commerce and warehouse automation platform that bridges digital storefronts with physical fulfillment operations. It integrates an automated parcel sorting system powered by ESP32 microcontrollers, conveyor belts, IR sensors, camera-based detection (OpenCV), and a robotic sorting arm — all controlled and monitored through a unified web application.

The platform serves three distinct user roles (Customer, Warehouse Operator, Administrator) through dedicated portals, connected to a single shared backend and SQLite database.

---

## 2. Problem Statement

Modern logistics and e-commerce warehouses face critical challenges:

- **Manual sorting is slow and error-prone:** Human operators manually routing parcels to destination bins leads to misroutes and bottlenecks.
- **Lack of real-time visibility:** Customers, operators, and administrators have no unified view of order status from placement through fulfillment to delivery.
- **Disconnected systems:** E-commerce frontends, warehouse operations, and hardware control are typically managed through separate, incompatible tools.
- **No automation feedback loop:** Physical machinery status (conveyor, sensors, robotic arms) is not integrated with the software order pipeline.

---

## 3. Goal

Build an integrated platform that:

1. Provides customers with a complete e-commerce experience (catalog, cart, checkout, tracking).
2. Gives warehouse operators real-time control and visibility over physical sorting machinery.
3. Offers administrators business analytics, user management, and system-wide oversight.
4. Automates the parcel sorting pipeline from order placement to dispatch using ESP32-driven hardware.
5. Uses role-based access control to enforce secure, isolated access per user type.

---

## 4. Target Users

### Customer
- End users who browse products, place orders, track shipments, and manage their profile.
- Can only access the Customer portal and their own data.

### Warehouse / Operator
- Warehouse floor personnel who manage the physical fulfillment pipeline.
- Operate picking, packing, conveyor infeed, and monitor sorting machinery.
- Can only access the Operator portal.

### Administrator
- Business owners / system managers with full oversight.
- Access analytics, user management, inventory, billing, destinations, and system configuration.
- Can only access the Administrator portal.

---

## 5. Core Features

### 5.1 Authentication & Authorization
- Customer sign-up, sign-in, forgot password, password reset
- Firebase Google Authentication (Continue with Google) with safe account linking
- JWT-based session management with PBKDF2 password hashing
- Role-based access control (Customer / Operator / Admin)
- Backend middleware enforcing role restrictions on all API endpoints
- Frontend route guards preventing unauthorized portal access
- Login rate limiting

### 5.2 Customer Portal
- Clean, focused e-commerce storefront layout with zero internal dashboard clutter
- Sticky storefront navigation with instant search, category strip, and quick access
- Product catalog with categories, search, filters, ratings
- Product detail pages with reviews
- Shopping cart with quantity management
- Wishlist
- Multi-address management
- Checkout with server-side price calculation and 18% GST
- Order history with status tracking
- Live order tracking with status timeline
- GST invoice generation and viewing
- Customer profile management
- Direct header and profile logout

### 5.3 Warehouse / Operator Portal
- Real-time operational dashboard with queue counts and machine status
- Order queue management (Confirmed → Picking → Packed → Conveyor → Dispatched)
- Picking station with rack location guidance
- Packing station with weight/dimension verification
- Conveyor control panel (start, stop, pause, emergency stop)
- Live machine status (ESP32, Wi-Fi, IR sensor, conveyor motor, robotic arm)
- Fault simulation (Wi-Fi drop, sensor occlusion, robotic arm torque fault)
- Sorting logs
- Inventory management
- Alert monitoring and resolution
- Audit log viewer

### 5.4 Administrator Portal
- Executive analytics dashboard (revenue, orders, customers, inventory KPIs)
- Revenue and growth ledger
- Product catalog management (CRUD)
- Inventory management with low-stock threshold alerts
- Order management (all customers)
- Billing and invoice management
- Machine analytics (sort success rate, throughput, uptime)
- Destination/bin mapping management
- Staff account provisioning
- Expense tracking
- System reset controls

### 5.5 Hardware / IoT Layer
- ESP32 microcontroller integration
- Conveyor belt motor control
- IR sensor parcel detection
- Camera/OpenCV-based barcode and dimensional capture
- Robotic arm sorting with servo-controlled bin placement
- Real-time telemetry via Socket.io
- Machine status logging to database
- Alert generation on hardware faults

### 5.6 Real-Time Communication
- Socket.io bidirectional updates for:
  - Machine status broadcasts (every 2 seconds)
  - Order status transitions
  - Sensor trigger events
  - Camera frame events
  - Robot action events
  - Sorting completion events
  - Alert creation events
  - Inventory low-stock events

---

## 6. Success Criteria

- All three portals are functional and role-protected.
- Customer can complete full purchase flow: browse → cart → checkout → track → invoice.
- Operator can process orders through the full warehouse pipeline: confirm → pick → pack → conveyor → sort → dispatch.
- Hardware simulation accurately models the physical sorting pipeline.
- Administrator has full visibility into business metrics and system health.
- No customer can access another customer's data.
- No user can access a portal outside their assigned role.
- Backend API endpoints enforce role-based authorization independently of frontend.

---

## 7. Non-Functional Requirements

- **Performance:** Sub-second API response times for all CRUD operations.
- **Security:** No secrets or database credentials exposed in frontend code.
- **Responsiveness:** All portals work on desktop, laptop, tablet, and mobile screens.
- **Reliability:** Atomic database transactions for order creation and inventory decrements.
- **Real-time:** Machine status and order updates delivered within 2-3 seconds via WebSocket.

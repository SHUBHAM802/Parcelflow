# Graph Report - parcelflow  (2026-11-20)

## Corpus Check
- 98 files · ~91,195 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 754 nodes · 1607 edges · 47 communities (30 shown, 17 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.95)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `dcaab1d3`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Authentication & RBAC Security|Authentication & RBAC Security]]
- [[_COMMUNITY_Fulfillment Operations & Hardware Simulation|Fulfillment Operations & Hardware Simulation]]
- [[_COMMUNITY_Fulfillment Operations & Hardware Simulation|Fulfillment Operations & Hardware Simulation]]
- [[_COMMUNITY_Customer E-Commerce Experience|Customer E-Commerce Experience]]
- [[_COMMUNITY_Authentication & RBAC Security|Authentication & RBAC Security]]
- [[_COMMUNITY_Fulfillment Operations & Hardware Simulation|Fulfillment Operations & Hardware Simulation]]
- [[_COMMUNITY_Authentication & RBAC Security|Authentication & RBAC Security]]
- [[_COMMUNITY_Shared Design System Components|Shared Design System Components]]
- [[_COMMUNITY_Module Group 8|Module Group 8]]
- [[_COMMUNITY_System Architecture & Documentation|System Architecture & Documentation]]
- [[_COMMUNITY_System Architecture & Documentation|System Architecture & Documentation]]
- [[_COMMUNITY_Authentication & RBAC Security|Authentication & RBAC Security]]
- [[_COMMUNITY_Module Group 12|Module Group 12]]
- [[_COMMUNITY_Module Group 13|Module Group 13]]
- [[_COMMUNITY_Executive Business Administration & Analytics|Executive Business Administration & Analytics]]
- [[_COMMUNITY_Customer E-Commerce Experience|Customer E-Commerce Experience]]
- [[_COMMUNITY_Customer E-Commerce Experience|Customer E-Commerce Experience]]
- [[_COMMUNITY_Customer E-Commerce Experience|Customer E-Commerce Experience]]
- [[_COMMUNITY_Fulfillment Operations & Hardware Simulation|Fulfillment Operations & Hardware Simulation]]
- [[_COMMUNITY_Fulfillment Operations & Hardware Simulation|Fulfillment Operations & Hardware Simulation]]
- [[_COMMUNITY_Fulfillment Operations & Hardware Simulation|Fulfillment Operations & Hardware Simulation]]
- [[_COMMUNITY_Authentication & RBAC Security|Authentication & RBAC Security]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]

## God Nodes (most connected - your core abstractions)
1. `useToast()` - 37 edges
2. `run()` - 36 edges
3. `apiFetch()` - 34 edges
4. `queryOne()` - 30 edges
5. `Button()` - 30 edges
6. `formatINR()` - 27 edges
7. `getConfig()` - 24 edges
8. `getDb()` - 21 edges
9. `transaction()` - 20 edges
10. `useAuth()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `ARCHITECTURE.md (System Architecture)` --documents--> `App()`  [EXTRACTED]
  ARCHITECTURE.md → src/App.tsx
- `AGENTS.md (AI Agent & Architecture Instructions)` --governs--> `getDb()`  [EXTRACTED]
  AGENTS.md → src/server/db.ts
- `DESIGN_SYSTEM.md (Visual Design System)` --styles--> `LoginPage()`  [EXTRACTED]
  DESIGN_SYSTEM.md → src/portals/auth/LoginPage.tsx
- `TESTING.md (Testing Guide & Test Cases)` --tests--> `LoginPage()`  [EXTRACTED]
  TESTING.md → src/portals/auth/LoginPage.tsx
- `SECURITY.md (Security & RBAC Specification)` --specifies--> `hashPassword()`  [EXTRACTED]
  SECURITY.md → src/server/auth.ts

## Hyperedges (group relationships)
- **Firebase Google Authentication Pipeline** — auth_loginpage_loginpage, lib_firebase_googleprovider, flow_google_auth_firebase, server_routes_createapirouter, schema_users [EXTRACTED 1.00]
- **Hardware Conveyor & Robotic Sorting Loop** — hardware_simulator_index_inithardwaresimulator, flow_hardware_automation, schema_destinations, schema_sorting_logs, server_orderstatemachine_transitionorderstatus [EXTRACTED 1.00]
- **Customer E-Commerce Order Lifecycle** — customer_pages_customercatalog_customercatalog, customer_components_cartdrawer_cartdrawer, customer_pages_customercheckout_customercheckout, schema_orders, schema_invoices [EXTRACTED 1.00]

## Communities (47 total, 17 thin omitted)

### Community 0 - "Authentication & RBAC Security"
Cohesion: 0.06
Nodes (84): AdminPortal(), BarcodeCannerProps, BarcodeScanner(), ScanResult, Button(), ButtonProps, CartDrawer(), CartDrawerProps (+76 more)

### Community 1 - "Fulfillment Operations & Hardware Simulation"
Cohesion: 0.07
Nodes (39): LoginPage(), AdminHeader(), AdminHeaderProps, CustomerHeader(), CustomerHeaderProps, OperatorHeader(), OperatorHeaderProps, ParcelFlowLogo() (+31 more)

### Community 2 - "Fulfillment Operations & Hardware Simulation"
Cohesion: 0.05
Nodes (42): ack1, ack2, ackRes, cfg, cmd, comp1, comp2, completeRes (+34 more)

### Community 3 - "Customer E-Commerce Experience"
Cohesion: 0.08
Nodes (33): simulateScan(), isSingleParcelMode(), computeMac(), generateLabelPayload(), generateRouteQrPayload(), LabelResult, LabelVerificationResult, recordLabelPrinted() (+25 more)

### Community 4 - "Authentication & RBAC Security"
Cohesion: 0.15
Nodes (32): emergencyStop(), getMachineState(), logMachineStatus(), MachineState, pauseConveyor(), processNextOrder(), resetEmergencyStopUi(), simulateFault() (+24 more)

### Community 5 - "Fulfillment Operations & Hardware Simulation"
Cohesion: 0.06
Nodes (33): 10. Error Handling Patterns, 11. Formatting, 1. Language & Runtime, 2. File Naming, 3. Directory Structure, 4. Component Conventions, 5. TypeScript Conventions, 6. API Conventions (+25 more)

### Community 6 - "Authentication & RBAC Security"
Cohesion: 0.09
Nodes (29): OrderTimeline(), OrderTimelineProps, StepItem, Stepper(), StepperProps, OperatorConveyorProps, ClientToServerEvents, DeviceHeartbeatRecord (+21 more)

### Community 7 - "Shared Design System Components"
Cohesion: 0.07
Nodes (29): 1. Color Palette, 2. Typography, 3. Spacing & Layout, 4. Border Radius, 5. Shadows, 6. Components, 7. Icons, 8. Animations & Transitions (+21 more)

### Community 8 - "Module Group 8"
Cohesion: 0.1
Nodes (23): addresses (Database Table), users (Database Table), AuthenticatedRequest, base64UrlDecode(), base64UrlEncode(), extractUserFromRequest(), generateToken(), hardwareAttempts (+15 more)

### Community 9 - "System Architecture & Documentation"
Cohesion: 0.07
Nodes (27): 1. Physical Architecture & Rig Topology, 2. Device Authentication, 3.1 Device Heartbeat, 3.2 Infrared Sensor Events, 3.3 Conveyor Desired State Polling, 3.4 Hardware Command Queue (Robotic Arm), 3.5 Command Acknowledge (ACK), 3.6 Command Complete (DONE) (+19 more)

### Community 10 - "System Architecture & Documentation"
Cohesion: 0.08
Nodes (25): 1. System Overview, 2. Technology Stack, 3. Directory Structure, 4. Authentication Architecture, 5. Role-Based Access Control, 6. Database Schema, 7. Real-Time Communication (Socket.io), 8. Hardware Simulation Engine (+17 more)

### Community 11 - "Authentication & RBAC Security"
Cohesion: 0.08
Nodes (24): 1. Customer Storefront (`/customer`), 1. Install Dependencies, 2. Environment Configuration, 2. Warehouse Operator Control Room (`/operator`), 3. Admin Business Center (`/admin`), 3. Run Development Server, Architecture & Portals, code:bash (npm install) (+16 more)

### Community 12 - "Module Group 12"
Cohesion: 0.08
Nodes (24): 10. Hardware Communication & Microcontroller Security, 11. Shipping Label Symbology & Anti-Forgery, 12. Database Integrity & Atomic Persistence, 1. Authentication, 2. Authorization (RBAC), 3. Customer Data Isolation, 4. Rate Limiting, 5. Password Reset Security (+16 more)

### Community 13 - "Module Group 13"
Cohesion: 0.1
Nodes (22): requireDeviceToken(), EnvConfig, envSchema, getConfig(), isGoogleLoginAvailable(), isHardwareApiEnabled(), loadConfig(), badVerify (+14 more)

### Community 14 - "Executive Business Administration & Analytics"
Cohesion: 0.08
Nodes (22): setGoogleJwksResolver(), badJwt, badLabel, bakBuffer, bakDbFile, cfg, check, hash (+14 more)

### Community 15 - "Customer E-Commerce Experience"
Cohesion: 0.08
Nodes (23): 10. Graphify Codebase Knowledge Graph, 11. Ponytail — Senior Developer Philosophy & Lean Execution, 1. Critical Rules, 2. Architecture Quick Reference, 3. Adding a New API Endpoint, 4. Adding a New Page to a Portal, 5. Adding a New Database Table, 6. Existing Role Authorization (+15 more)

### Community 16 - "Customer E-Commerce Experience"
Cohesion: 0.08
Nodes (23): 1.1 Authentication Tests, 1.2 Authorization / RBAC Tests, 1.3 Customer Data Isolation Tests, 1.4 Application Feature Tests, 1.5 Route Protection Tests, 1.6 Error State Tests, 1. Test Coverage Requirements, 2.1 Authentication Flow (+15 more)

### Community 17 - "Customer E-Commerce Experience"
Cohesion: 0.27
Nodes (17): main(), main(), hashPassword(), applyPragmasAndIndexes(), DB_FILE, doSave(), ensureMigrationsTable(), flushSave() (+9 more)

### Community 18 - "Fulfillment Operations & Hardware Simulation"
Cohesion: 0.11
Nodes (17): 1. Product Overview, 2. Problem Statement, 3. Goal, 4. Target Users, 5.1 Authentication & Authorization, 5.2 Customer Portal, 5.3 Warehouse / Operator Portal, 5.4 Administrator Portal (+9 more)

### Community 19 - "Fulfillment Operations & Hardware Simulation"
Cohesion: 0.14
Nodes (13): 1. System Bill of Materials (BOM), 2. Power Supply Architecture & Cautionary Rules, 3. Microcontroller Pinout Tables, 4. Predefined Destination Route Profiles & Fallback Reject, 5. Local Safety Interlock Architecture, 6. Software & Firmware Verification Commands, code:block1 ([ 12V SMPS ] ─────────────────────────> L298N 12V Pin (Conve), code:bash (# 1. Run database cleanup in dry-run mode) (+5 more)

### Community 20 - "Fulfillment Operations & Hardware Simulation"
Cohesion: 0.17
Nodes (11): 1. Electrical & Power Topology, 2. ESP32 #1 — Conveyor Controller (`firmware/ConveyorESP32`), 3. ESP32 #2 — 7-Servo Robotic Arm (`firmware/RoboticArmESP32`), 4. Arduino IDE Flashing Instructions, Architecture Overview, code:block1 (+-----------------------------------------------------------), Key Firmware Capabilities:, Key Firmware Capabilities: (+3 more)

### Community 21 - "Authentication & RBAC Security"
Cohesion: 0.2
Nodes (10): AGENTS.md (AI Agent & Architecture Instructions), ARCHITECTURE.md (System Architecture), initHardwareSimulator(), stopSimulatorIntervals(), startServer(), order_status_history (Database Table), isValidTransition(), OrderStatus (+2 more)

### Community 22 - "Community 22"
Cohesion: 0.25
Nodes (7): 1. Firebase Console Setup, 2. Obtain Client & Server Config, 3. Verify Server Startup, code:env (# Server token verification (RS256 verified against Google's), code:bash (npm run dev), code:block3 ([ParcelFlow] Google login: enabled (project: your-firebase-p), Enabling Google Sign-In with Firebase Authentication

### Community 23 - "Community 23"
Cohesion: 0.48
Nodes (7): query(), queryOne(), checkArmTimeouts(), checkDeviceWatchdog(), getDesiredConveyorState(), getPipelineSnapshot(), generateParcelId()

### Community 24 - "Community 24"
Cohesion: 0.29
Nodes (6): 1. Routing Model Overview, 2. Default Bin Allocation Table, 3. Mixed-Category Order Resolution Rule, 4. Administrative Dynamic Reconfiguration, Authoritative Resolution Hierarchy:, ParcelFlow Bin Routing Architecture & Category Rules

### Community 25 - "Community 25"
Cohesion: 0.4
Nodes (3): Skeleton(), Column, TableProps

### Community 26 - "Community 26"
Cohesion: 0.4
Nodes (4): Additional observations, Confirmed Findings, ParcelFlow Security & Code Audit, Remediation Plan

## Knowledge Gaps
- **380 isolated node(s):** `config`, `OrderStatus`, `PaymentStatus`, `PickingTask`, `PackingTask` (+375 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createApiRouter()` connect `Module Group 8` to `Authentication & RBAC Security`, `Fulfillment Operations & Hardware Simulation`, `Authentication & RBAC Security`, `Module Group 13`, `Executive Business Administration & Analytics`, `Authentication & RBAC Security`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Why does `apiFetch()` connect `Authentication & RBAC Security` to `Module Group 8`, `Fulfillment Operations & Hardware Simulation`, `Authentication & RBAC Security`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Why does `run()` connect `Customer E-Commerce Experience` to `Fulfillment Operations & Hardware Simulation`, `Customer E-Commerce Experience`, `Authentication & RBAC Security`, `Module Group 8`, `Module Group 13`, `Executive Business Administration & Analytics`, `Authentication & RBAC Security`, `Community 23`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **What connects `config`, `OrderStatus`, `PaymentStatus` to the rest of the system?**
  _380 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Authentication & RBAC Security` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Fulfillment Operations & Hardware Simulation` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Fulfillment Operations & Hardware Simulation` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
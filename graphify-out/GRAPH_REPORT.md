# Graph Report - D:\3rd year\major project\parcelflow  (2026-10-01)

## Corpus Check
- 74 files · ~54,688 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 265 nodes · 769 edges · 22 communities (8 shown, 14 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.95)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Authentication & RBAC Security|Authentication & RBAC Security]]
- [[_COMMUNITY_Fulfillment Operations & Hardware Simulation|Fulfillment Operations & Hardware Simulation]]
- [[_COMMUNITY_Fulfillment Operations & Hardware Simulation|Fulfillment Operations & Hardware Simulation]]
- [[_COMMUNITY_Customer E-Commerce Experience|Customer E-Commerce Experience]]
- [[_COMMUNITY_Authentication & RBAC Security|Authentication & RBAC Security]]
- [[_COMMUNITY_Fulfillment Operations & Hardware Simulation|Fulfillment Operations & Hardware Simulation]]
- [[_COMMUNITY_Authentication & RBAC Security|Authentication & RBAC Security]]
- [[_COMMUNITY_Shared Design System Components|Shared Design System Components]]
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

## God Nodes (most connected - your core abstractions)
1. `useToast()` - 33 edges
2. `apiFetch()` - 32 edges
3. `Button()` - 27 edges
4. `formatINR()` - 27 edges
5. `useAuth()` - 18 edges
6. `run()` - 16 edges
7. `transitionOrderStatus()` - 12 edges
8. `Order` - 11 edges
9. `createApiRouter()` - 11 edges
10. `getDb()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `TESTING.md (Testing Guide & Test Cases)` --tests--> `LoginPage()`  [EXTRACTED]
  TESTING.md → src/portals/auth/LoginPage.tsx
- `PRD.md (Product Requirements Document)` --defines--> `Customer Storefront Flow (Catalog->Cart->Checkout->Orders)`  [EXTRACTED]
  PRD.md → src/portals/customer/CustomerPortal.tsx
- `PRD.md (Product Requirements Document)` --defines--> `Operator Warehouse Flow (Queue->Pick->Pack->Infeed)`  [EXTRACTED]
  PRD.md → src/portals/operator/OperatorPortal.tsx
- `PRD.md (Product Requirements Document)` --defines--> `Admin Business Center (Analytics->Inventory->Ledger->Destinations)`  [EXTRACTED]
  PRD.md → src/portals/admin/AdminPortal.tsx
- `ARCHITECTURE.md (System Architecture)` --documents--> `App()`  [EXTRACTED]
  ARCHITECTURE.md → src/App.tsx

## Hyperedges (group relationships)
- **Firebase Google Authentication Pipeline** — auth_loginpage_loginpage, lib_firebase_googleprovider, flow_google_auth_firebase, server_routes_createapirouter, schema_users [EXTRACTED 1.00]
- **Hardware Conveyor & Robotic Sorting Loop** — hardware_simulator_index_inithardwaresimulator, flow_hardware_automation, schema_destinations, schema_sorting_logs, server_orderstatemachine_transitionorderstatus [EXTRACTED 1.00]
- **Customer E-Commerce Order Lifecycle** — customer_pages_customercatalog_customercatalog, customer_components_cartdrawer_cartdrawer, customer_pages_customercheckout_customercheckout, schema_orders, schema_invoices [EXTRACTED 1.00]

## Communities (22 total, 14 thin omitted)

### Community 0 - "Authentication & RBAC Security"
Cohesion: 0.09
Nodes (48): AGENTS.md (AI Agent & Architecture Instructions), ARCHITECTURE.md (System Architecture), emergencyStop(), getMachineState(), initHardwareSimulator(), logMachineStatus(), MachineState, pauseConveyor() (+40 more)

### Community 1 - "Fulfillment Operations & Hardware Simulation"
Cohesion: 0.07
Nodes (39): OperatorHeader(), OperatorHeaderProps, OperatorSidebar(), OperatorSidebarProps, StatusDotPill(), StatusDotPillProps, StatusPill(), StatusPillProps (+31 more)

### Community 2 - "Fulfillment Operations & Hardware Simulation"
Cohesion: 0.13
Nodes (28): AdminSidebar(), AdminSidebarProps, Button(), ButtonProps, KPICard(), KPICardProps, Modal(), ModalProps (+20 more)

### Community 3 - "Customer E-Commerce Experience"
Cohesion: 0.14
Nodes (21): CartDrawer(), CartDrawerProps, Drawer(), DrawerProps, formatDate(), formatINR(), AdminBilling(), CustomerCatalog() (+13 more)

### Community 4 - "Authentication & RBAC Security"
Cohesion: 0.11
Nodes (22): AdminPortal(), LoginPage(), AdminHeader(), AdminHeaderProps, CustomerHeader(), CustomerHeaderProps, CustomerPortal(), DESIGN_SYSTEM.md (Visual Design System) (+14 more)

### Community 5 - "Fulfillment Operations & Hardware Simulation"
Cohesion: 0.13
Nodes (13): EmptyState(), EmptyStateProps, Skeleton(), Column, TableProps, TabItem, Tabs(), TabsProps (+5 more)

### Community 6 - "Authentication & RBAC Security"
Cohesion: 0.17
Nodes (12): PRD.md (Product Requirements Document), SECURITY.md (Security & RBAC Specification), TESTING.md (Testing Guide & Test Cases), Admin Business Center (Analytics->Inventory->Ledger->Destinations), Customer Storefront Flow (Catalog->Cart->Checkout->Orders), Firebase Google OAuth Flow (/auth/google), Automated Hardware Simulation (IR->Camera->RoboticArm->Sort), Operator Warehouse Flow (Queue->Pick->Pack->Infeed) (+4 more)

## Knowledge Gaps
- **76 isolated node(s):** `OrderStatus`, `PaymentStatus`, `PickingTask`, `PackingTask`, `ExpenseItem` (+71 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `apiFetch()` connect `Fulfillment Operations & Hardware Simulation` to `Authentication & RBAC Security`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Why does `AuthProvider()` connect `Authentication & RBAC Security` to `Fulfillment Operations & Hardware Simulation`, `Authentication & RBAC Security`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **What connects `OrderStatus`, `PaymentStatus`, `PickingTask` to the rest of the system?**
  _76 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Authentication & RBAC Security` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `Fulfillment Operations & Hardware Simulation` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Fulfillment Operations & Hardware Simulation` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._
- **Should `Customer E-Commerce Experience` be split into smaller, more focused modules?**
  _Cohesion score 0.14 - nodes in this community are weakly interconnected._
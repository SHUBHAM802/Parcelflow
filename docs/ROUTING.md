# ParcelFlow Bin Routing Architecture & Category Rules

**Author:** ParcelFlow Core Logistics Engine  
**Version:** 2.0  
**Scope:** Automated destination allocation for physical robotic sorting.

---

## 1. Routing Model Overview

In the physical ParcelFlow prototype, parcels are mechanically sorted into **4 physical destination bins** by a 4-DOF servo-actuated robotic arm.

> **Key Architectural Change (Audit Finding A6 Remediation):**  
> Legacy versions resolved bin allocation using customer destination cities (`destinations` table). In Version 2.0, routing is **data-driven by product category** via the `bins` table. The customer's city and address remain strictly shipping label fields and do not dictate actuator kinematics.

---

## 2. Default Bin Allocation Table

| Bin Number | Label | Primary Category ID | Category Name | Role | Servo Angles (Base/Shoulder/Elbow/Wrist) |
|---|---|---|---|---|---|
| **Bin 1** | `BIN 1` | `cat-elec` | Electronics | Sensitive / High Value | `{ "base": 60, "shoulder": 75, "elbow": 90, "wrist": 90 }` |
| **Bin 2** | `BIN 2` | `cat-fash` | Fashion & Apparel | Soft goods / Garments | `{ "base": 90, "shoulder": 80, "elbow": 95, "wrist": 85 }` |
| **Bin 3** | `BIN 3` | `cat-books` | Books & Media | Standard media & print | `{ "base": 120, "shoulder": 70, "elbow": 90, "wrist": 95 }` |
| **Bin 4** | `BIN 4` | *(null)* | All other categories | **Overflow / Reject / Catch-all** (`is_overflow = 1`) | `{ "base": 150, "shoulder": 85, "elbow": 100, "wrist": 90 }` |

---

## 3. Mixed-Category Order Resolution Rule

An order placed on the customer storefront can contain multiple line items belonging to different product categories (e.g., 1 smartphone from Electronics + 1 t-shirt from Fashion).

### Authoritative Resolution Hierarchy:
When resolving the destination bin for a mixed-category order at label creation or scan time, the backend applies the following strict priority order:

1. **Electronics (`cat-elec`):** Highest priority — requires placement in padded Bin 1 to minimize drop impact.
2. **Fashion & Apparel (`cat-fash`):** Second priority -> Bin 2.
3. **Books & Media (`cat-books`):** Third priority -> Bin 3.
4. **Any other category (Accessories, Fitness, Home):** Routed to Bin 4 (`is_overflow = 1`).

If an order cannot be resolved to any active bin (e.g., all bins disabled or misconfigured), it falls back to the bin marked with `is_overflow = 1`. If no overflow bin is active, the scan endpoint rejects the parcel with `REJECTED` and halts the conveyor.

---

## 4. Administrative Dynamic Reconfiguration

All bin properties are dynamic and persisted in SQLite:
- Administrators can reassign category-to-bin mappings live via the **Admin Portal > Destination Bins** screen (`PUT /api/admin/bins/:binId`).
- Administrators can test robotic arm angles using the **Test Move** button (`POST /api/admin/bins/:binId/test-move`), which validates that no parcel is in flight before releasing actuation commands.
- Servo angles (`servo_preset_json`) are transmitted directly in hardware command payloads, meaning the ESP32 firmware never needs hardcoded degrees or flash reprogramming.

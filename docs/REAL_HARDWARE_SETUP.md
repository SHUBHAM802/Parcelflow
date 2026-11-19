# ParcelFlow — Real Hardware Integration & Physical Automation Guide

This document describes the complete physical, electrical, kinematic, and firmware architecture for demonstrating the **ParcelFlow Smart Parcel Sorting and Warehouse Management System**.

---

## 1. System Bill of Materials (BOM)

| Component | Quantity | Purpose | Wiring / Interface |
|---|---|---|---|
| **ESP32 DevKit V1 (30/36-pin)** | 2 | Conveyor Controller (ESP32 #1) & 7-Servo Arm Controller (ESP32 #2) | Micro-USB / 5V Vin |
| **L298N Dual H-Bridge Motor Driver** | 1 | Controls 12V DC conveyor motor direction & PWM speed | ENA: GPIO 25, IN1: GPIO 32, IN2: GPIO 33 |
| **LM2596 DC-DC Buck Converter** | 1 | Steps down 12V SMPS to clean 5.0V for ESP32 #1 & L298N logic | Input: 12V SMPS, Output: 5.0V |
| **12V DC Geared Motor** | 1 | Drives conveyor belt roller | Connected to L298N OUT1/OUT2 |
| **Optical IR Break-Beam Sensors** | 2 | IR1: Inspection Zone, IR2: Pick Point with Local Motor Halt | IR1: GPIO 27, IR2: GPIO 26 (Active LOW) |
| **PCA9685 16-Channel 12-bit PWM Driver** | 1 | Generates 50Hz PWM pulses for 7 servos via I2C | I2C: SDA (GPIO 21), SCL (GPIO 22) |
| **MG996R High-Torque Metal Gear Servos**| 4 | Base, Shoulder, Elbow, Wrist Pitch | PCA9685 Channels 0, 1, 2, 3 |
| **MG90S Micro Metal Gear Servos** | 3 | Wrist Roll, Gripper Clamp, Auxiliary | PCA9685 Channels 4, 5, 6 |
| **12V SMPS Power Supply** | 1 | Powers conveyor motor & LM2596 converter | 12V DC Mains Adapter (≥3A) |
| **Regulated High-Current Servo PSU** | 1 | Dedicated power for 7 servos (5V–6V, ≥5A–10A peak) | Connected directly to PCA9685 V+ |
| **USB Webcam** | 1 | Decodes QR codes via laptop browser (@zxing/browser) | USB port on laptop |

---

## 2. Power Supply Architecture & Cautionary Rules

```
[ 12V SMPS ] ─────────────────────────> L298N 12V Pin (Conveyor Motor Power)
     │
     └──> [ LM2596 Buck (5.0V) ] ─────> ESP32 #1 Vin & L298N 5V Logic
     │
[ Dedicated Servo PSU (5V-6V 8A) ] ───> PCA9685 V+ (Screw Terminal)
     │
     └─── COMMON GROUND (GND) ────────> Shared between SMPS, Servo PSU, Both ESP32s, L298N, PCA9685
```

> [!CAUTION]
> **CRITICAL ELECTRICAL ISOLATION RULES**
> 1. **NEVER power the 7 servos from the ESP32 3.3V or 5V pins:** 7 servos operating simultaneously draw 4A–8A peak. Attempting to power them from the ESP32 will immediately reset the MCU or destroy its onboard voltage regulator.
> 2. **NEVER power the 7 servos from the Conveyor's LM2596 converter:** Conveyor motor startup produces high inductive back-EMF spikes that disrupt servo PWM timing.
> 3. **PCA9685 VCC vs V+ separation:**
>    - `VCC` powers the PCA9685 I2C chip (connect to ESP32 3.3V or 5V).
>    - `V+` powers the servos (connect exclusively to the dedicated 5V–6V high-current PSU).
> 4. **Connect ALL GNDs together:** Common ground between SMPS, Servo PSU, LM2596, and both ESP32 boards is mandatory for I2C and logic level reference.

---

## 3. Microcontroller Pinout Tables

### ESP32 #1 — Conveyor Controller
| Pin | Direction | Function | Connected To |
|---|---|---|---|
| GPIO 25 | Output | PWM Motor Speed (0–255) | L298N `ENA` |
| GPIO 32 | Output | Motor Forward Direction | L298N `IN1` |
| GPIO 33 | Output | Motor Reverse Direction | L298N `IN2` |
| GPIO 27 | Input (Pullup) | Camera Inspection Zone Break-Beam | Sensor `IR1` Out |
| GPIO 26 | Input (Pullup/ISR)| Robotic Pick Point Break-Beam | Sensor `IR2` Out (Local Halt) |
| GND | — | Common Ground | Power Common Ground |

### ESP32 #2 — 7-Servo Robotic Arm Controller
| Pin | Direction | Function | Connected To |
|---|---|---|---|
| GPIO 21 | Bidirectional | I2C Data (SDA) | PCA9685 `SDA` |
| GPIO 22 | Output | I2C Clock (SCL) | PCA9685 `SCL` |
| 3.3V / 5V | Power | Logic Power | PCA9685 `VCC` |
| GND | — | Common Ground | PCA9685 `GND` |

### PCA9685 16-Channel Servo Mapping
| Channel | Joint Name | Servo Model | Min Angle | Max Angle | Default |
|---|---|---|---|---|---|
| CH 0 | Joint 0: Base Waist Pan | MG996R | 0° | 180° | 90° |
| CH 1 | Joint 1: Shoulder Pitch | MG996R | 15° | 165° | 85° |
| CH 2 | Joint 2: Elbow Pitch | MG996R | 15° | 165° | 105° |
| CH 3 | Joint 3: Wrist Pitch | MG996R | 0° | 180° | 85° |
| CH 4 | Joint 4: Wrist Roll | MG90S | 0° | 180° | 90° |
| CH 5 | Joint 5: Gripper Clamp | MG90S | 30° (Open) | 120° (Clamped) | 50° |
| CH 6 | Joint 6: Auxiliary Joint | MG90S | 0° | 180° | 90° |

---

## 4. Predefined Destination Route Profiles & Fallback Reject

The system features 6 predefined destination profiles + 1 disposable fallback reject bin:

| Route Code | Destination Profile | City | Target Bin | Signed QR Payload Sample |
|---|---|---|---|---|
| **DEL** | Delhi Capital Hub | Delhi | Bin 1 (`bin-1`) | `PF1.ROUTE.DEL.d3l9a8b7c6` |
| **MH** | Maharashtra Regional Gateway | Mumbai | Bin 2 (`bin-2`) | `PF1.ROUTE.MH.m4h5b6c7d8` |
| **PN** | Pune Metro Express | Pune | Bin 3 (`bin-3`) | `PF1.ROUTE.PN.p9n8e7d6c5` |
| **HUB4** | North / Central Express | Bengaluru | Bin 4 (`bin-4`) | `PF1.ROUTE.HUB4.b4e5n6g7h8` |
| **HUB5** | South Express Gateway | Hyderabad | Bin 5 (`bin-5`) | `PF1.ROUTE.HUB5.h5y6d7e8r9` |
| **HUB6** | East Coast Terminal | Kolkata | Bin 6 (`bin-6`) | `PF1.ROUTE.HUB6.k6o7l8k9a0` |
| **FALLBACK**| Disposable Fallback Reject | Unknown | Bin 7 (`bin-7`) | `PF1.ROUTE.FALLBACK.f0a1l2l3b4` |

---

## 5. Local Safety Interlock Architecture

### Local Motor Arrest Guarantee
When a parcel travels down the conveyor and trips `IR2` (located directly below the robotic arm gripper):
1. The ESP32's hardware interrupt `isrIr2Triggered()` executes immediately.
2. It sets `IN1=LOW, IN2=LOW, ENA=0`, arresting motor motion within **< 1 millisecond**.
3. It does **not** wait for an HTTP request or network round-trip.
4. It transmits the `IR2 TRIGGERED` event to `POST /api/hardware/ir-event`.
5. The server releases the sort command to the arm.
6. The arm performs the pick-and-place sequence and reports completion.
7. The server updates conveyor desired state to `RUN`, resuming the belt for the next parcel.

---

## 6. Software & Firmware Verification Commands

```bash
# 1. Run database cleanup in dry-run mode
npm run db:cleanup:dry-run

# 2. Apply database cleanup to establish empty state
npm run db:cleanup:apply

# 3. Create or bootstrap the system administrator
npm run admin:create -- --email=admin@parcelflow.com --password=YourAdminPassword

# 4. Run automated test suite
npm test

# 5. Typecheck entire TypeScript codebase
npm run typecheck

# 6. Build production bundles
npm run build
```

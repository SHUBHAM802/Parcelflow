# ParcelFlow ESP32 Firmware & Hardware Integration Guide

This directory contains the production-ready C++ firmware sketches for both ESP32 DevKit microcontrollers operating the physical ParcelFlow automated warehouse sorting cell.

---

## Architecture Overview

```
+---------------------------------------------------------------------------------+
|                       LAPTOP WORKSTATION / FULFILLMENT SERVER                   |
|  - ParcelFlow Web Server (Port 3000)                                            |
|  - USB Webcam connected directly to laptop (Browser / ZXing QR Scanner)        |
|  - Authoritative Pipeline State Machine & Socket.IO telemetry broadcast         |
+------------------------+------------------------------------+-------------------+
                         |                                    |
          Wi-Fi REST     |                     Wi-Fi REST     |
          X-Device-Token |                     X-Device-Token |
                         v                                    v
       +-------------------------------+    +----------------------------------+
       |     ESP32 #1: Conveyor Belt   |    |    ESP32 #2: 7-Servo Robotic Arm |
       |     (firmware/ConveyorESP32)  |    |    (firmware/RoboticArmESP32)    |
       +---------------+---------------+    +----------------+-----------------+
                       |                                     | I2C (SDA=21, SCL=22)
          +------------+------------+                        v
          |                         |            +-------------------------+
          v                         v            | PCA9685 16-Ch PWM Driver|
   +--------------+         +--------------+     +------------+------------+
   | L298N Driver |         | 2x IR Sensors|                  |
   | - ENA: 25    |         | - IR1: 27    |         +--------+--------+
   | - IN1: 32    |         | - IR2: 26    |         |                 |
   | - IN2: 33    |         | (Local Halt) |         v                 v
   +--------------+         +--------------+     4x MG996R Servos   3x MG90S Servos
          |                                      - CH0: Base        - CH4: Wrist Roll
          v                                      - CH1: Shoulder    - CH5: Gripper
    12V DC Motor                                 - CH2: Elbow       - CH6: Aux / Cam
                                                 - CH3: Wrist Pitch
```

---

## 1. Electrical & Power Topology

> [!CAUTION]
> **CRITICAL POWER WARNING: SERVO POWER SEPARATION**
> 1. **DO NOT** attempt to power the 7 servos from the ESP32's 3.3V or 5V (Vin) pins. Servos will draw up to 5A-10A peak under load, immediately triggering ESP32 brownout reset or burning the on-board linear regulator.
> 2. **DO NOT** power the 7 servos from the conveyor motor's LM2596 buck converter. Motor inductive spikes and back-EMF will destabilize servo PWM timing.
> 3. Connect a **dedicated regulated 5V-6V high-current power supply** (rated for at least 5A-8A continuous) directly to the **V+ screw terminals** on the PCA9685 board.
> 4. Ensure **COMMON GROUND (GND)** is connected between:
>    - The 12V SMPS GND
>    - The LM2596 Buck Converter GND
>    - The Dedicated Servo Power Supply GND
>    - Both ESP32 GND pins
>    - The PCA9685 GND pin

---

## 2. ESP32 #1 — Conveyor Controller (`firmware/ConveyorESP32`)

### Pin Assignments
| Function | ESP32 GPIO | Connected Component | Logic Level |
|---|---|---|---|
| ENA (Motor Speed PWM) | GPIO 25 | L298N ENA Pin | 3.3V PWM (5kHz) |
| IN1 (Direction Forward) | GPIO 32 | L298N IN1 Pin | 3.3V Digital Output |
| IN2 (Direction Reverse) | GPIO 33 | L298N IN2 Pin | 3.3V Digital Output |
| IR Sensor 1 (Inspection Zone) | GPIO 27 | Optical Break-Beam Sensor 1 | Active LOW (INPUT_PULLUP) |
| IR Sensor 2 (Robotic Pick Point)| GPIO 26 | Optical Break-Beam Sensor 2 | Active LOW (Hardware Interrupt) |

### Key Firmware Capabilities:
- **Local Motor Arrest Interlock:** When IR2 is occluded (parcel arrives at pick point), a hardware interrupt (`isrIr2Triggered`) arrests the L298N motor immediately without awaiting HTTP round-trip latency.
- **Debounced IR Event Emission:** Reports `TRIGGERED` and `CLEAR` transitions to `POST /api/hardware/ir-event` with monotonic sequence tracking.
- **Heartbeat & Watchdog:** Broadcasts online telemetry every 2000 ms to `POST /api/hardware/heartbeat`. Halts motor if server communication is lost for > 8000 ms.
- **State Polling:** Synchronizes desired conveyor state (`RUN`, `HOLD`, `STOP`) via `GET /api/hardware/conveyor/state`.

---

## 3. ESP32 #2 — 7-Servo Robotic Arm (`firmware/RoboticArmESP32`)

### Pin Assignments & PCA9685 Channels
| Function | ESP32 GPIO / Channel | Actuator Model | Description |
|---|---|---|---|
| I2C SDA | GPIO 21 | PCA9685 SDA | 400kHz Fast I2C Bus |
| I2C SCL | GPIO 22 | PCA9685 SCL | 400kHz Fast I2C Bus |
| Joint 0 | PCA9685 Channel 0 | MG996R Metal Gear | Base Waist Pan Rotation (0-180°) |
| Joint 1 | PCA9685 Channel 1 | MG996R Metal Gear | Shoulder Arm Pitch (15-165°) |
| Joint 2 | PCA9685 Channel 2 | MG996R Metal Gear | Elbow Forearm Pitch (15-165°) |
| Joint 3 | PCA9685 Channel 3 | MG996R Metal Gear | Wrist Pitch Tilt (0-180°) |
| Joint 4 | PCA9685 Channel 4 | MG90S Micro Metal Gear | Wrist Roll Swivel (0-180°) |
| Joint 5 | PCA9685 Channel 5 | MG90S Micro Metal Gear | Gripper Claw Clamp (30° Open - 120° Clamped) |
| Joint 6 | PCA9685 Channel 6 | MG90S Micro Metal Gear | Auxiliary Joint / Camera Pitch (0-180°) |

### Key Firmware Capabilities:
- **Smooth Trajectory Generation:** Employs cosine-eased multi-joint interpolation over 25-35 steps per motion segment, preventing gear backlash, current spikes, and dropped parcels.
- **Autonomous Pick-and-Place Cycle:**
  1. Standby at `HOME_POSE`
  2. Descend to `POSE_APPROACH` above IR2
  3. Close gripper at `POSE_PICK`
  4. Elevate parcel at `POSE_LIFT`
  5. Rotate and align over target destination bin (using dynamic angles in command payload)
  6. Open gripper to drop parcel into destination bin (Delhi, Maharashtra, Pune, Express Hub, or Disposable Reject Bin)
  7. Return smoothly to `HOME_POSE`
- **Command Acknowledgment & Lifecycle:**
  - Polls `GET /api/hardware/commands/next?deviceId=arm-esp32`
  - Acknowledges with `POST /api/hardware/commands/:id/ack`
  - Reports success with `POST /api/hardware/commands/:id/complete`
  - Reports mechanical faults with `POST /api/hardware/commands/:id/fail`

---

## 4. Arduino IDE Flashing Instructions

1. Install **Arduino IDE** (v2.0 or newer).
2. Add ESP32 Board Support:
   - Go to **File > Preferences**.
   - In "Additional Boards Manager URLs", add:
     `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
   - Open **Tools > Board > Boards Manager**, search for `esp32` by Espressif Systems, and click **Install**.
3. Install Required Libraries via **Tools > Manage Libraries**:
   - `ArduinoJson` (v6.21.0 or newer by Benoit Blanchon)
4. Configure Wi-Fi & Server IP:
   - In `firmware/config.example.h`, update your Wi-Fi credentials (`WIFI_SSID`, `WIFI_PASSWORD`).
   - Set `SERVER_HOST` to your laptop's **local IPv4 address** on your Wi-Fi network (e.g., `192.168.1.100`), **NOT** `localhost`.
   - Ensure `DEVICE_TOKEN` matches the `DEVICE_TOKEN` in your ParcelFlow `.env`.
   - Copy `config.example.h` to `config.h` inside each firmware directory.
5. Upload Firmware:
   - Select Board: `DOIT ESP32 DEVKIT V1` (or generic `ESP32 Dev Module`).
   - Select the COM port corresponding to your connected ESP32 board.
   - Click **Upload**.

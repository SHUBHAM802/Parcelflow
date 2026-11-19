# ParcelFlow Hardware Integration API Specification

**Revision:** 2.0  
**Target Hardware:** ESP32-WROOM-32 (Conveyor Controller & 4-DOF Robotic Arm)  
**Host Controller:** Local Fulfillment Server (Node.js / Express / Socket.io)  
**Authentication Header:** `X-Device-Token`

---

## 1. Physical Architecture & Rig Topology

```
                  +----------------------------------------------+
                  |         LAPTOP OPERATOR WORKSTATION          |
                  |  - Browser Webcam (ZXing QR Decoder)         |
                  |  - ParcelFlow Local Server (Port 3000)       |
                  |  - Authoritative Pipeline State Machine      |
                  +----------------------+-----------------------+
                                         | Wi-Fi (HTTP REST + Sockets)
                  +----------------------+-----------------------+
                  |            ESP32 MICROCONTROLLER             |
                  +-----------+--------------+-------------------+
                              |              |
                +-------------+--+        +--+----------------+
                | Conveyor Belt  |        | 4-DOF Robotic Arm |
                | - Motor L298N  |        | - Base Servo      |
                | - Sensor IR1   |        | - Shoulder Servo  |
                | - Sensor IR2   |        | - Elbow Servo     |
                |                |        | - Wrist Gripper   |
                +----------------+        +-------------------+
```

### Sensor & Actuator Placement
1. **Infeed Zone:** Cartons placed onto running conveyor.
2. **Sensor IR1 (Camera Inspection Zone):** Optical break-beam sensor. In `stop_and_scan` mode, triggers conveyor `HOLD` while the laptop webcam decodes the label.
3. **Sensor IR2 (Robotic Pick Point):** Optical break-beam sensor located directly under the robotic arm gripper. **Firmware Requirement:** ESP32 MUST halt conveyor motor locally upon IR2 TRIGGERED without waiting for network round-trip.
4. **4-DOF Robotic Arm:** 4 MG90S metal-gear servos actuated to destination bin angles.

---

## 2. Device Authentication

All hardware endpoints require authentication via HTTP header:

```http
X-Device-Token: <DEVICE_TOKEN>
```

- The server uses `crypto.timingSafeEqual` to prevent side-channel timing attacks.
- Supports dual-slot token rotation via `DEVICE_TOKEN_NEXT`.
- Device routes reject browser user JWTs with `401 Unauthorized`.
- User routes reject device tokens with `401 Unauthorized`.

---

## 3. Hardware API Endpoints

### 3.1 Device Heartbeat
Devices send a heartbeat every 2000 ms to confirm online telemetry. If no heartbeat is received within `HEARTBEAT_TIMEOUT_MS` (default: 6000 ms), the server flags the device `OFFLINE`, engages conveyor `HOLD`, and raises a `DEVICE_OFFLINE` fault.

```http
POST /api/hardware/heartbeat
Content-Type: application/json
X-Device-Token: your-device-token-here

{
  "deviceId": "conveyor-esp32",
  "firmware": "v1.4.2-esp32",
  "rssi": -58,
  "state": {
    "conveyor": "RUNNING",
    "ir1": "CLEAR",
    "ir2": "CLEAR",
    "arm": "READY"
  }
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "timestamp": "2026-10-19 00:54:12"
}
```

---

### 3.2 Infrared Sensor Events
Emitted whenever an optical beam sensor state transitions between `TRIGGERED` and `CLEAR`.

```http
POST /api/hardware/ir-event
Content-Type: application/json
X-Device-Token: your-device-token-here

{
  "deviceId": "conveyor-esp32",
  "sensorId": "IR2",
  "state": "TRIGGERED",
  "seq": 142,
  "ts": 1790760000123
}
```

**Rules:**
- **Debounce:** Trigger pulses within `IR_DEBOUNCE_MS` (default: 250 ms) are ignored.
- **Sequence Tracking:** Stale sequence numbers (`seq <= last_seq`) are discarded to prevent out-of-order execution over unstable Wi-Fi.
- **IR2 FIFO Match:** The server matches IR2 to the oldest parcel in `SCANNED` status. If no matching parcel exists, the server raises `UNEXPECTED_OBJECT` and arrests conveyor motion.

**Response (200 OK):**
```json
{
  "success": true,
  "parcelId": "PF-261019-0001",
  "orderId": "ORD-179001"
}
```

---

### 3.3 Conveyor Desired State Polling
ESP32 conveyor motor controller polls this endpoint (or listens over Socket.io) to synchronize motor state:

```http
GET /api/hardware/conveyor/desired?deviceId=conveyor-esp32
X-Device-Token: your-device-token-here
```

**Response (200 OK):**
```json
{
  "state": "RUN",
  "speedPct": 100,
  "revision": 14
}
```

Possible `state` values:
- `RUN`: Belt runs at configured motor RPM.
- `HOLD`: Temporary stop for optical scanning or pick-point robotic action.
- `STOP`: Conveyor arrested by Emergency Stop or critical fault.

---

### 3.4 Hardware Command Queue (Robotic Arm)
The robotic arm controller polls for released sort commands:

```http
GET /api/hardware/commands/next?deviceId=arm-esp32
X-Device-Token: your-device-token-here
```

**Response when idle:** `204 No Content`

**Response when command available (200 OK):**
```json
{
  "commandId": "c7d0e1f2-3a4b-5c6d-7e8f-9a0b1c2d3e4f",
  "type": "SORT_TO_BIN",
  "parcelId": "PF-261019-0001",
  "bin": {
    "number": 1,
    "label": "BIN 1"
  },
  "servoPreset": {
    "base": 120,
    "shoulder": 70,
    "elbow": 95,
    "wrist": 90
  },
  "expiresAt": "2026-10-19T01:15:30.000Z"
}
```

---

### 3.5 Command Acknowledge (ACK)
Device confirms receipt of command before actuation:

```http
POST /api/hardware/commands/c7d0e1f2-3a4b-5c6d-7e8f-9a0b1c2d3e4f/ack
X-Device-Token: your-device-token-here
```

**Response (200 OK):**
```json
{ "success": true }
```

---

### 3.6 Command Complete (DONE)
Robotic arm reports physical placement complete:

```http
POST /api/hardware/commands/c7d0e1f2-3a4b-5c6d-7e8f-9a0b1c2d3e4f/complete
Content-Type: application/json
X-Device-Token: your-device-token-here

{
  "result": "OK",
  "durationMs": 2150
}
```

**Server Actions upon Complete:**
1. Command marked `DONE`.
2. Parcel status transitioned to `SORTED`.
3. Order status transitioned to `SORTED`.
4. Target bin `parcel_count` incremented.
5. Entry appended to `sorting_logs`.
6. Conveyor desired state restored to `RUN`.

---

### 3.7 Command Failure / Stall
If the robotic arm encounters a servo stall or timeout:

```http
POST /api/hardware/commands/c7d0e1f2-3a4b-5c6d-7e8f-9a0b1c2d3e4f/fail
Content-Type: application/json
X-Device-Token: your-device-token-here

{
  "reason": "Servo torque limit exceeded on Axis 2"
}
```

---

## 4. Safety Architecture & Emergency Stop

1. **Physical E-Stop vs Software E-Stop:** Physical mushroom button on mains power is primary safety. Software E-Stop (`POST /api/operator/estop`) cancels active commands and commands conveyor `STOP`.
2. **Reset Protocol:** E-Stop can ONLY be cleared with explicit operator confirmation (`POST /api/operator/estop/reset`). Clearing puts conveyor into `HOLD` status; operator must deliberately press **Start** to resume movement.
3. **Local Halt Guarantee:** Firmware MUST bind IR2 interrupt directly to L298N motor enable pin LOW to avoid latency-induced overrun.

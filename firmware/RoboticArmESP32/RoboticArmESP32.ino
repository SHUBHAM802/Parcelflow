/**
 * ==============================================================================
 * ParcelFlow — ESP32 #2 7-Servo Robotic Arm Controller Firmware
 * ==============================================================================
 * Hardware Components:
 * - ESP32 DevKit V1
 * - PCA9685 16-Channel 12-Bit PWM I2C Servo Driver (Address 0x40)
 * - 4x MG996R High-Torque Metal Gear Servos (Base, Shoulder, Elbow, Wrist Pitch)
 * - 3x MG90S Micro Metal Gear Servos (Wrist Roll, Gripper, Aux / Camera)
 * - SEPARATE Regulated 5V-6V High-Current Servo Power Supply (Connected to PCA9685 V+)
 *
 * Pin Assignment:
 * - I2C SDA: GPIO 21
 * - I2C SCL: GPIO 22
 *
 * PCA9685 Channels:
 * - CH0: Joint 0 - Base Waist Pan (MG996R)
 * - CH1: Joint 1 - Shoulder Arm Pitch (MG996R)
 * - CH2: Joint 2 - Elbow Forearm Pitch (MG996R)
 * - CH3: Joint 3 - Wrist Pitch (MG996R)
 * - CH4: Joint 4 - Wrist Roll Swivel (MG90S)
 * - CH5: Joint 5 - Gripper Clamp (MG90S)
 * - CH6: Joint 6 - Auxiliary / Stabilizer (MG90S)
 * ==============================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>

// If config.h exists locally, use it; otherwise fallback to sane defaults
#if __has_include("config.h")
  #include "config.h"
#elif __has_include("../config.h")
  #include "../config.h"
#else
  #define WIFI_SSID           "ParcelFlow_Industrial"
  #define WIFI_PASSWORD       "Warehouse@2026"
  #define SERVER_HOST         "192.168.1.50"
  #define SERVER_PORT         3000
  #define DEVICE_TOKEN        "parcelflow-device-token-secret-32ch-min"
  #define HEARTBEAT_INTERVAL_MS 2000
  #define POLL_INTERVAL_MS      500
#endif

// PCA9685 I2C Address & Registers
#define PCA9685_ADDR       0x40
#define PCA9685_MODE1      0x00
#define PCA9685_PRESCALE   0xFE
#define LED0_ON_L          0x06

// Joint Count
#define NUM_JOINTS         7

// Device Identity
const char* DEVICE_ID = "arm-esp32";
const char* FIRMWARE_VERSION = "v2.1.0-arm7-pca9685";

// Joint Configuration Structure
struct JointConfig {
  const char* name;
  uint8_t channel;
  int minAngle;
  int maxAngle;
  int minPulseUs;
  int maxPulseUs;
  int currentAngle;
  int defaultAngle;
};

// 7 Servo Joint Specifications
JointConfig joints[NUM_JOINTS] = {
  {"Base",        0,   0, 180, 500, 2500,  90,  90}, // CH0 - MG996R
  {"Shoulder",    1,  15, 165, 500, 2500,  85,  85}, // CH1 - MG996R
  {"Elbow",       2,  15, 165, 500, 2500, 105, 105}, // CH2 - MG996R
  {"Wrist Pitch", 3,   0, 180, 500, 2500,  85,  85}, // CH3 - MG996R
  {"Wrist Roll",  4,   0, 180, 500, 2500,  90,  90}, // CH4 - MG90S
  {"Gripper",     5,  30, 125, 600, 2400,  50,  50}, // CH5 - MG90S (30=Open, 120=Clamped)
  {"Aux",         6,   0, 180, 500, 2500,  90,  90}  // CH6 - MG90S
};

// Predefined Poses (Angles: Base, Shoulder, Elbow, WristPitch, WristRoll, Gripper, Aux)
const int POSE_HOME[NUM_JOINTS]     = {90,  85, 105,  85, 90,  45, 90}; // Gripper open
const int POSE_APPROACH[NUM_JOINTS] = {90,  60, 125,  80, 90,  45, 90}; // Hovering over IR2
const int POSE_PICK[NUM_JOINTS]     = {90,  45, 138,  75, 90, 115, 90}; // Gripper clamped on parcel
const int POSE_LIFT[NUM_JOINTS]     = {90,  75, 110,  85, 90, 115, 90}; // Lifted above conveyor

// Runtime State
enum ArmState { ARM_READY, ARM_BUSY, ARM_FAULT };
ArmState currentArmState = ARM_READY;
String currentAction = "IDLE";
String activeCommandId = "";

// Loop Timers
unsigned long lastHeartbeatTime = 0;
unsigned long lastPollTime = 0;

// ------------------------------------------------------------------------------
// Low-Level PCA9685 I2C Hardware Driver Functions
// ------------------------------------------------------------------------------
void pcaWrite8(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(PCA9685_ADDR);
  Wire.write(reg);
  Wire.write(val);
  Wire.endTransmission();
}

uint8_t pcaRead8(uint8_t reg) {
  Wire.beginTransmission(PCA9685_ADDR);
  Wire.write(reg);
  Wire.endTransmission();
  Wire.requestFrom(PCA9685_ADDR, 1);
  return Wire.read();
}

void setPwmFrequency(float freqHz) {
  float prescaleval = 25000000.0f; // 25MHz internal oscillator
  prescaleval /= 4096.0f;
  prescaleval /= freqHz;
  prescaleval -= 1.0f;
  uint8_t prescale = (uint8_t)(prescaleval + 0.5f);

  uint8_t oldmode = pcaRead8(PCA9685_MODE1);
  uint8_t newmode = (oldmode & 0x7F) | 0x10; // Sleep mode
  pcaWrite8(PCA9685_MODE1, newmode);
  pcaWrite8(PCA9685_PRESCALE, prescale);
  pcaWrite8(PCA9685_MODE1, oldmode);
  delay(5);
  pcaWrite8(PCA9685_MODE1, oldmode | 0xa1); // Auto-increment, restart
}

void setPwmRaw(uint8_t channel, uint16_t onTick, uint16_t offTick) {
  Wire.beginTransmission(PCA9685_ADDR);
  Wire.write(LED0_ON_L + 4 * channel);
  Wire.write(onTick & 0xFF);
  Wire.write(onTick >> 8);
  Wire.write(offTick & 0xFF);
  Wire.write(offTick >> 8);
  Wire.endTransmission();
}

void writeJointAngle(uint8_t jointIndex, int angle) {
  if (jointIndex >= NUM_JOINTS) return;
  JointConfig &j = joints[jointIndex];
  int safeAngle = constrain(angle, j.minAngle, j.maxAngle);
  j.currentAngle = safeAngle;

  // Map angle to pulse duration (microseconds)
  int pulseUs = map(safeAngle, j.minAngle, j.maxAngle, j.minPulseUs, j.maxPulseUs);

  // Convert pulse microseconds to 12-bit PCA9685 ticks (50 Hz = 20,000 us per cycle)
  uint16_t offTick = (uint16_t)(((uint32_t)pulseUs * 4096UL) / 20000UL);
  setPwmRaw(j.channel, 0, offTick);
}

// ------------------------------------------------------------------------------
// Smooth Multi-Joint Trajectory Interpolation
// Moves all 7 joints synchronously in small steps to prevent current surges.
// ------------------------------------------------------------------------------
void moveArmToPose(const int targetAngles[NUM_JOINTS], int totalSteps = 30, int stepDelayMs = 15) {
  int startAngles[NUM_JOINTS];
  for (int i = 0; i < NUM_JOINTS; i++) {
    startAngles[i] = joints[i].currentAngle;
  }

  for (int step = 1; step <= totalSteps; step++) {
    float progress = (float)step / (float)totalSteps;
    // Cosine smoothing (ease-in-out)
    float ease = (1.0f - cos(progress * 3.14159265f)) * 0.5f;

    for (int i = 0; i < NUM_JOINTS; i++) {
      int interpolated = startAngles[i] + (int)((targetAngles[i] - startAngles[i]) * ease);
      writeJointAngle(i, interpolated);
    }
    delay(stepDelayMs);
  }
}

// ------------------------------------------------------------------------------
// HTTP Communication Helpers
// ------------------------------------------------------------------------------
String getApiBaseUrl() {
  return String("http://") + SERVER_HOST + ":" + SERVER_PORT;
}

void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = getApiBaseUrl() + "/api/hardware/heartbeat";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.setTimeout(1500);

  StaticJsonDocument<384> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["firmware"] = FIRMWARE_VERSION;
  doc["rssi"] = WiFi.RSSI();

  JsonObject stateObj = doc.createNestedObject("state");
  stateObj["arm"] = (currentArmState == ARM_READY) ? "READY" : ((currentArmState == ARM_BUSY) ? "BUSY" : "FAULT");
  stateObj["action"] = currentAction;
  stateObj["activeCommandId"] = activeCommandId;

  JsonObject anglesObj = stateObj.createNestedObject("angles");
  for (int i = 0; i < NUM_JOINTS; i++) {
    anglesObj[joints[i].name] = joints[i].currentAngle;
  }

  String jsonBody;
  serializeJson(doc, jsonBody);
  http.POST(jsonBody);
  http.end();
}

void reportCommandAck(const String& cmdId) {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  String url = getApiBaseUrl() + "/api/hardware/commands/" + cmdId + "/ack";
  http.begin(url);
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.setTimeout(1500);
  http.POST("{}");
  http.end();
}

void reportCommandComplete(const String& cmdId, unsigned long durationMs) {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  String url = getApiBaseUrl() + "/api/hardware/commands/" + cmdId + "/complete";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.setTimeout(2000);

  StaticJsonDocument<128> doc;
  doc["result"] = "OK";
  doc["durationMs"] = durationMs;
  String body;
  serializeJson(doc, body);

  http.POST(body);
  http.end();
}

void reportCommandFail(const String& cmdId, const String& reason) {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  String url = getApiBaseUrl() + "/api/hardware/commands/" + cmdId + "/fail";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.setTimeout(2000);

  StaticJsonDocument<128> doc;
  doc["reason"] = reason;
  String body;
  serializeJson(doc, body);

  http.POST(body);
  http.end();
}

// ------------------------------------------------------------------------------
// Execute Pick & Place Sequence to Destination Bin
// ------------------------------------------------------------------------------
bool executeSortSequence(JsonObject servoPreset, String binLabel) {
  unsigned long startTime = millis();
  currentArmState = ARM_BUSY;

  // Extract Destination Bin Angles (defaulting to safe intermediate angles)
  int targetPose[NUM_JOINTS];
  targetPose[0] = servoPreset["base"]        | 90;
  targetPose[1] = servoPreset["shoulder"]    | 80;
  targetPose[2] = servoPreset["elbow"]       | 110;
  targetPose[3] = servoPreset["wrist_pitch"] | 85;
  targetPose[4] = servoPreset["wrist_roll"]  | 90;
  targetPose[5] = servoPreset["gripper"]     | 115; // Clamped while moving
  targetPose[6] = servoPreset["aux"]         | 90;

  int targetReleasePose[NUM_JOINTS];
  for (int i = 0; i < NUM_JOINTS; i++) targetReleasePose[i] = targetPose[i];
  targetReleasePose[5] = 40; // Open gripper to drop parcel into bin

  Serial.printf("[ParcelFlow Arm] Beginning Pick & Sort to %s (Base Angle: %d deg)\n",
                binLabel.c_str(), targetPose[0]);

  // Step 1: Move from HOME to APPROACH (hover above IR2 pick point)
  currentAction = "APPROACH_PICK_POINT";
  moveArmToPose(POSE_APPROACH, 25, 12);
  delay(100);

  // Step 2: Descend onto parcel at IR2 pick point & grasp
  currentAction = "GRASPING";
  moveArmToPose(POSE_PICK, 20, 15);
  delay(250); // Allow physical claw jaws to grip carton securely

  // Step 3: Lift parcel vertically to clear conveyor rails
  currentAction = "LIFTING";
  moveArmToPose(POSE_LIFT, 25, 15);
  delay(100);

  // Step 4: Rotate base and position arm over destination bin
  currentAction = "TRAVERSING_TO_BIN";
  moveArmToPose(targetPose, 35, 15);
  delay(150);

  // Step 5: Open gripper to release parcel into target destination bin
  currentAction = "RELEASING_PARCEL";
  moveArmToPose(targetReleasePose, 15, 10);
  delay(300); // Allow parcel gravity drop into bin

  // Step 6: Smoothly return arm back to HOME pose
  currentAction = "RETURNING_HOME";
  moveArmToPose(POSE_HOME, 30, 12);
  delay(100);

  currentAction = "IDLE";
  currentArmState = ARM_READY;
  Serial.printf("[ParcelFlow Arm] Sort complete in %lu ms\n", millis() - startTime);
  return true;
}

// ------------------------------------------------------------------------------
// Poll Next Command for Robotic Arm
// ------------------------------------------------------------------------------
void pollNextArmCommand() {
  if (currentArmState == ARM_BUSY || WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = getApiBaseUrl() + "/api/hardware/commands/next?deviceId=" + DEVICE_ID;
  http.begin(url);
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.setTimeout(1500);

  int httpCode = http.GET();
  if (httpCode == 200) {
    String response = http.getString();
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, response);

    if (!error) {
      String cmdId = doc["commandId"].as<String>();
      String cmdType = doc["type"].as<String>();
      activeCommandId = cmdId;

      Serial.printf("[ParcelFlow Arm] New Command: %s (ID: %s)\n", cmdType.c_str(), cmdId.c_str());

      // Acknowledge command immediately
      reportCommandAck(cmdId);

      if (cmdType == "SORT_TO_BIN") {
        JsonObject preset = doc["servoPreset"];
        String binLabel = doc["bin"]["label"] | "Bin";

        unsigned long sortStart = millis();
        bool ok = executeSortSequence(preset, binLabel);

        if (ok) {
          reportCommandComplete(cmdId, millis() - sortStart);
        } else {
          reportCommandFail(cmdId, "Physical servo trajectory stall");
        }
      } else if (cmdType == "TEST_JOINT") {
        // Direct single-joint test command from Admin UI
        int jIdx = doc["jointIndex"] | 0;
        int tAngle = doc["targetAngle"] | 90;
        Serial.printf("[ParcelFlow Arm] Testing Joint %d at %d deg\n", jIdx, tAngle);
        writeJointAngle(jIdx, tAngle);
        delay(400);
        reportCommandComplete(cmdId, 400);
      }
      activeCommandId = "";
    }
  }
  http.end();
}

// ------------------------------------------------------------------------------
// Setup & Main Loop
// ------------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n[ParcelFlow Arm] Initializing ESP32 7-Servo Controller...");

  // Initialize I2C Bus for PCA9685
  Wire.begin(21, 22); // SDA=21, SCL=22
  Wire.setClock(400000); // 400kHz Fast Mode

  // Initialize PCA9685 PWM Controller
  pcaWrite8(PCA9685_MODE1, 0x01); // Reset
  delay(10);
  setPwmFrequency(50.0f); // 50Hz standard for RC servos

  // Move arm into HOME pose on boot
  Serial.println("[ParcelFlow Arm] Positioning 7 joints to HOME stance...");
  for (int i = 0; i < NUM_JOINTS; i++) {
    writeJointAngle(i, POSE_HOME[i]);
  }

  // Connect to Wi-Fi
  Serial.printf("[ParcelFlow Arm] Connecting to Wi-Fi SSID: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[ParcelFlow Arm] Wi-Fi Connected! IP: %s | RSSI: %d dBm\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
  } else {
    Serial.println("\n[ParcelFlow Arm] Wi-Fi connection timed out. Standing by.");
  }
}

void loop() {
  unsigned long now = millis();

  // 1. Maintain Wi-Fi Connection
  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long lastReconnect = 0;
    if (now - lastReconnect > 5000) {
      lastReconnect = now;
      WiFi.reconnect();
    }
  }

  // 2. Periodic Telemetry Heartbeat
  if (now - lastHeartbeatTime >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatTime = now;
    sendHeartbeat();
  }

  // 3. Command Polling
  if (currentArmState == ARM_READY && (now - lastPollTime >= POLL_INTERVAL_MS)) {
    lastPollTime = now;
    pollNextArmCommand();
  }

  delay(10);
}

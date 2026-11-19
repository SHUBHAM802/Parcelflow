/**
 * ==============================================================================
 * ParcelFlow — ESP32 #1 Conveyor Controller Firmware
 * ==============================================================================
 * Hardware Components:
 * - ESP32 DevKit V1
 * - L298N Dual H-Bridge Motor Driver
 * - 12V DC Geared Conveyor Motor
 * - LM2596 Step-Down Buck Converter (12V -> 5.0V regulated logic supply)
 * - IR Sensor 1 (Inspection / Camera Zone Break-Beam)
 * - IR Sensor 2 (Pick Point Break-Beam with LOCAL HARDWARE HALT INTERLOCK)
 *
 * Pin Assignment:
 * - ENA (PWM Speed):   GPIO 25
 * - IN1 (Direction 1): GPIO 32
 * - IN2 (Direction 2): GPIO 33
 * - IR1 (Camera Zone): GPIO 27 (Active LOW, INPUT_PULLUP)
 * - IR2 (Pick Point):  GPIO 26 (Active LOW, INPUT_PULLUP with LOCAL HALT)
 * ==============================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

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
  #define POLL_INTERVAL_MS      400
  #define WATCHDOG_TIMEOUT_MS   8000
#endif

// Pin Definitions
#define PIN_ENA 25
#define PIN_IN1 32
#define PIN_IN2 33
#define PIN_IR1 27
#define PIN_IR2 26

// PWM Configuration for ENA
#define PWM_CHANNEL    0
#define PWM_FREQ       5000
#define PWM_RESOLUTION 8 // 0-255

// Device Identity
const char* DEVICE_ID = "conveyor-esp32";
const char* FIRMWARE_VERSION = "v2.1.0-conveyor-7bin";

// Runtime States
enum MotorState { MOTOR_STOPPED, MOTOR_HOLD, MOTOR_RUNNING };
volatile MotorState currentMotorState = MOTOR_STOPPED;
volatile bool localIr2HaltActive = false;
int currentSpeedPct = 100;
uint32_t irSequenceCounter = 100;

// Sensor debounce & state cache
bool lastIr1State = false;
bool lastIr2State = false;
unsigned long lastIr1DebounceTime = 0;
unsigned long lastIr2DebounceTime = 0;
const unsigned long DEBOUNCE_DELAY_MS = 200;

// Loop Timers
unsigned long lastHeartbeatTime = 0;
unsigned long lastPollTime = 0;
unsigned long lastSuccessfulServerContact = 0;

// ------------------------------------------------------------------------------
// Interrupt Service Routine: IR2 Triggered (LOCAL SAFETY INTERLOCK)
// Halts conveyor motor IMMEDIATELY on beam occlusion without network latency.
// ------------------------------------------------------------------------------
void IRAM_ATTR isrIr2Triggered() {
  if (digitalRead(PIN_IR2) == LOW) { // Beam occluded / parcel present
    // Immediate physical motor arrest
    digitalWrite(PIN_IN1, LOW);
    digitalWrite(PIN_IN2, LOW);
    ledcWrite(PWM_CHANNEL, 0);
    currentMotorState = MOTOR_HOLD;
    localIr2HaltActive = true;
  }
}

// ------------------------------------------------------------------------------
// Motor Control Functions
// ------------------------------------------------------------------------------
void applyMotorOutput(MotorState state, int speedPct) {
  if (localIr2HaltActive && state == MOTOR_RUNNING) {
    // If IR2 is still actively detecting an unpicked parcel, do not restart
    if (digitalRead(PIN_IR2) == LOW) {
      return;
    } else {
      localIr2HaltActive = false; // Beam cleared, safe to resume
    }
  }

  currentSpeedPct = constrain(speedPct, 0, 100);
  int pwmValue = map(currentSpeedPct, 0, 100, 0, 255);

  switch (state) {
    case MOTOR_RUNNING:
      digitalWrite(PIN_IN1, HIGH);
      digitalWrite(PIN_IN2, LOW);
      ledcWrite(PWM_CHANNEL, pwmValue);
      currentMotorState = MOTOR_RUNNING;
      break;

    case MOTOR_HOLD:
      // Active braking / hold
      digitalWrite(PIN_IN1, HIGH);
      digitalWrite(PIN_IN2, HIGH);
      ledcWrite(PWM_CHANNEL, 0);
      currentMotorState = MOTOR_HOLD;
      break;

    case MOTOR_STOPPED:
    default:
      // Coast to stop
      digitalWrite(PIN_IN1, LOW);
      digitalWrite(PIN_IN2, LOW);
      ledcWrite(PWM_CHANNEL, 0);
      currentMotorState = MOTOR_STOPPED;
      break;
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

  StaticJsonDocument<256> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["firmware"] = FIRMWARE_VERSION;
  doc["rssi"] = WiFi.RSSI();

  JsonObject stateObj = doc.createNestedObject("state");
  stateObj["conveyor"] = (currentMotorState == MOTOR_RUNNING) ? "RUNNING" : ((currentMotorState == MOTOR_HOLD) ? "HOLD" : "STOP");
  stateObj["ir1"] = (digitalRead(PIN_IR1) == LOW) ? "TRIGGERED" : "CLEAR";
  stateObj["ir2"] = (digitalRead(PIN_IR2) == LOW) ? "TRIGGERED" : "CLEAR";
  stateObj["speedPct"] = currentSpeedPct;

  String jsonBody;
  serializeJson(doc, jsonBody);

  int httpCode = http.POST(jsonBody);
  if (httpCode == 200) {
    lastSuccessfulServerContact = millis();
  }
  http.end();
}

void sendIrEvent(const char* sensorId, bool isTriggered) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = getApiBaseUrl() + "/api/hardware/ir-event";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.setTimeout(1500);

  StaticJsonDocument<192> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["sensorId"] = sensorId;
  doc["state"] = isTriggered ? "TRIGGERED" : "CLEAR";
  doc["seq"] = ++irSequenceCounter;
  doc["ts"] = millis();

  String jsonBody;
  serializeJson(doc, jsonBody);

  int httpCode = http.POST(jsonBody);
  if (httpCode == 200) {
    lastSuccessfulServerContact = millis();
  }
  http.end();
}

void pollDesiredConveyorState() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = getApiBaseUrl() + "/api/hardware/conveyor/state?deviceId=" + DEVICE_ID;
  http.begin(url);
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.setTimeout(1000);

  int httpCode = http.GET();
  if (httpCode == 200) {
    lastSuccessfulServerContact = millis();
    String response = http.getString();
    StaticJsonDocument<192> doc;
    DeserializationError error = deserializeJson(doc, response);

    if (!error) {
      const char* desiredStateStr = doc["state"] | "HOLD";
      int speedPct = doc["speedPct"] | 100;

      if (strcmp(desiredStateStr, "RUN") == 0) {
        applyMotorOutput(MOTOR_RUNNING, speedPct);
      } else if (strcmp(desiredStateStr, "HOLD") == 0) {
        applyMotorOutput(MOTOR_HOLD, 0);
      } else {
        applyMotorOutput(MOTOR_STOPPED, 0);
      }
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
  Serial.println("\n[ParcelFlow Conveyor] Initializing ESP32 Controller...");

  // Pin Modes
  pinMode(PIN_IN1, OUTPUT);
  pinMode(PIN_IN2, OUTPUT);
  pinMode(PIN_IR1, INPUT_PULLUP);
  pinMode(PIN_IR2, INPUT_PULLUP);

  // Initial Safe State
  digitalWrite(PIN_IN1, LOW);
  digitalWrite(PIN_IN2, LOW);

  // Configure PWM for motor speed control
  ledcSetup(PWM_CHANNEL, PWM_FREQ, PWM_RESOLUTION);
  ledcAttachPin(PIN_ENA, PWM_CHANNEL);
  ledcWrite(PWM_CHANNEL, 0);

  // Attach Hardware Interrupt to IR2 for instant motor stop
  attachInterrupt(digitalPinToInterrupt(PIN_IR2), isrIr2Triggered, FALLING);

  // Connect to Wi-Fi
  Serial.printf("[ParcelFlow Conveyor] Connecting to Wi-Fi SSID: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[ParcelFlow Conveyor] Wi-Fi Connected! IP: %s | RSSI: %d dBm\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
  } else {
    Serial.println("\n[ParcelFlow Conveyor] Wi-Fi connection timed out. Running in fail-safe offline mode.");
  }

  lastSuccessfulServerContact = millis();
}

void loop() {
  unsigned long now = millis();

  // 1. Reconnect Wi-Fi if dropped
  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long lastReconnectAttempt = 0;
    if (now - lastReconnectAttempt > 5000) {
      lastReconnectAttempt = now;
      WiFi.reconnect();
    }
  }

  // 2. Safety Watchdog: If no contact with server for > WATCHDOG_TIMEOUT_MS, arrest motor
  if (now - lastSuccessfulServerContact > WATCHDOG_TIMEOUT_MS && currentMotorState == MOTOR_RUNNING) {
    Serial.println("[ParcelFlow Conveyor] Watchdog timeout: Server unreachable. Halting motor for safety.");
    applyMotorOutput(MOTOR_HOLD, 0);
  }

  // 3. Scan & Process IR1 Sensor Transitions (Camera Inspection Zone)
  bool currentIr1Raw = (digitalRead(PIN_IR1) == LOW); // Active LOW
  if (currentIr1Raw != lastIr1State) {
    if (now - lastIr1DebounceTime > DEBOUNCE_DELAY_MS) {
      lastIr1DebounceTime = now;
      lastIr1State = currentIr1Raw;
      Serial.printf("[ParcelFlow Conveyor] IR1 Beam %s\n", currentIr1Raw ? "TRIGGERED (Object at Camera)" : "CLEARED");
      sendIrEvent("IR1", currentIr1Raw);
    }
  }

  // 4. Scan & Process IR2 Sensor Transitions (Robotic Pick Point)
  bool currentIr2Raw = (digitalRead(PIN_IR2) == LOW); // Active LOW
  if (currentIr2Raw != lastIr2State) {
    if (now - lastIr2DebounceTime > DEBOUNCE_DELAY_MS) {
      lastIr2DebounceTime = now;
      lastIr2State = currentIr2Raw;
      Serial.printf("[ParcelFlow Conveyor] IR2 Beam %s\n", currentIr2Raw ? "TRIGGERED (Object at Pick Point)" : "CLEARED");
      sendIrEvent("IR2", currentIr2Raw);

      if (!currentIr2Raw) {
        // Parcel has been picked and removed from beam
        localIr2HaltActive = false;
      }
    }
  }

  // 5. Periodic Heartbeat Broadcast
  if (now - lastHeartbeatTime >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatTime = now;
    sendHeartbeat();
  }

  // 6. Periodic Desired Conveyor State Polling
  if (now - lastPollTime >= POLL_INTERVAL_MS) {
    lastPollTime = now;
    pollDesiredConveyorState();
  }

  delay(10);
}

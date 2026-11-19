#ifndef PARCELFLOW_CONFIG_H
#define PARCELFLOW_CONFIG_H

// ==============================================================================
// ParcelFlow ESP32 Hardware Configuration
// Copy this file to "config.h" in each firmware folder and configure your setup.
// Do NOT commit config.h containing real Wi-Fi credentials or production secrets.
// ==============================================================================

// 1. Wi-Fi Settings
#define WIFI_SSID           "Your_WiFi_SSID"
#define WIFI_PASSWORD       "Your_WiFi_Password"

// 2. Server Configuration
// NOTE: Use your laptop's actual local IPv4 address (e.g. 192.168.1.100), NEVER "localhost" or "127.0.0.1".
#define SERVER_HOST         "192.168.1.100"
#define SERVER_PORT         3000

// 3. Security & Device Authentication
// Must match DEVICE_TOKEN in ParcelFlow server .env
#define DEVICE_TOKEN        "parcelflow-device-token-secret-32ch-min"

// 4. Timing & Polling Intervals
#define HEARTBEAT_INTERVAL_MS 2000
#define POLL_INTERVAL_MS      400
#define WATCHDOG_TIMEOUT_MS   8000

#endif // PARCELFLOW_CONFIG_H

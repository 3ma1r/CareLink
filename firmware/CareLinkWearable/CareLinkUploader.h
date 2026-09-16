#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <LittleFS.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <time.h>
#include <algorithm>
#include <vector>
#include "carelink_root_ca.h"
#include "secrets.h"

class CareLinkUploader {
 public:
  static constexpr const char* FIRMWARE_VERSION = "carelink-stage4-1.0.0";

  void begin() {
    if (!LittleFS.begin(true)) {
      Serial.println("[CareLink] LittleFS unavailable; uploads disabled.");
      return;
    }
    if (!LittleFS.exists(QUEUE_PATH) && LittleFS.exists(BACKUP_PATH))
      LittleFS.rename(BACKUP_PATH, QUEUE_PATH);
    mutex_ = xSemaphoreCreateMutex();
    ready_ = mutex_ != nullptr;
    if (!ready_) {
      Serial.println("[CareLink] Queue mutex unavailable; uploads disabled.");
      return;
    }
    Serial.printf("[CareLink] Durable queue ready: %u pending, %lu overflow drops.\n",
                  queueSize(), overflowDrops());
    xTaskCreatePinnedToCore(taskEntry, "carelink-upload", 12288, this, 1, nullptr, 0);
  }

  void enqueue(float heartRate, bool heartRateValid, float spo2, bool spo2Valid,
               float temperature, bool temperatureValid, float movement, bool movementValid,
               bool gpsValid, double latitude, double longitude) {
    if (!ready_) return;
    time_t captured = time(nullptr);
    if (captured < 1700000000) {
      Serial.println("[CareLink] Measurement not queued: clock is not synchronized.");
      return;
    }
    char timestamp[25];
    formatTime(captured, timestamp, sizeof(timestamp));
    char messageId[37];
    makeUuid(messageId);
    const bool heartRateObserved = isfinite(heartRate) && heartRate >= 20 && heartRate <= 250;
    const bool spo2Observed = isfinite(spo2) && spo2 >= 50 && spo2 <= 100;
    const bool temperatureObserved = isfinite(temperature) && temperature >= -20 && temperature <= 85;
    heartRateValid = heartRateValid && heartRateObserved;
    spo2Valid = spo2Valid && spo2Observed;
    temperatureValid = temperatureValid && temperatureObserved;
    movementValid = movementValid && isfinite(movement) && movement >= 0 && movement <= 1000000;
    JsonDocument measurement;
    measurement["message_id"] = messageId;
    measurement["measured_at"] = timestamp;
    if (heartRateValid) measurement["heart_rate"] = heartRate;
    else measurement["heart_rate"] = nullptr;
    if (spo2Valid) measurement["spo2"] = spo2;
    else measurement["spo2"] = nullptr;
    if (temperatureValid) measurement["sensor_temperature"] = temperature;
    else measurement["sensor_temperature"] = nullptr;
    if (movementValid) measurement["movement"] = max(0.0f, movement);
    else measurement["movement"] = nullptr;
    const bool anyObserved = heartRateObserved || spo2Observed || temperatureObserved;
    measurement["quality"] = heartRateValid && spo2Valid && temperatureValid
      ? "good" : anyObserved ? "unstable" : "missing";
    if (gpsValid && isfinite(latitude) && isfinite(longitude) &&
        fabs(latitude) <= 90.0 && fabs(longitude) <= 180.0 &&
        !(latitude == 0.0 && longitude == 0.0)) {
      measurement["latitude"] = latitude;
      measurement["longitude"] = longitude;
      measurement["gps_fix_at"] = timestamp;
    }
    String line;
    serializeJson(measurement, line);
    appendBounded(line);
  }

 private:
  static constexpr const char* QUEUE_PATH = "/carelink-queue.ndjson";
  static constexpr const char* BACKUP_PATH = "/carelink-queue.bak";
  static constexpr const char* DROP_PATH = "/carelink-drops.txt";
  static constexpr size_t MAX_QUEUE = 64;
  static constexpr size_t BATCH_SIZE = 5;
  static constexpr uint32_t INITIAL_RETRY_MS = 5000;
  static constexpr uint32_t MAX_RETRY_MS = 300000;
  static constexpr uint32_t AUTH_RETRY_MS = 900000;
  SemaphoreHandle_t mutex_ = nullptr;
  bool ready_ = false;

  static void taskEntry(void* argument) {
    static_cast<CareLinkUploader*>(argument)->taskLoop();
  }

  void taskLoop() {
    uint32_t backoff = INITIAL_RETRY_MS;
    bool clockReported = false;
    for (;;) {
      if (!clockReported && time(nullptr) >= 1700000000) {
        Serial.println("[CareLink] UTC clock synchronized.");
        clockReported = true;
      }
      if (WiFi.status() != WL_CONNECTED || queueSize() == 0) {
        vTaskDelay(pdMS_TO_TICKS(2000));
        continue;
      }
      const int result = uploadBatch();
      if (result > 0) {
        backoff = INITIAL_RETRY_MS;
        vTaskDelay(pdMS_TO_TICKS(1000));
      } else {
        const uint32_t waitMs = result == -401 ? AUTH_RETRY_MS : backoff + (esp_random() % 2000);
        backoff = std::min<uint32_t>(backoff * 2, MAX_RETRY_MS);
        vTaskDelay(pdMS_TO_TICKS(waitMs));
      }
    }
  }

  int uploadBatch() {
    std::vector<String> rows = firstRows(BATCH_SIZE);
    if (rows.empty()) return 1;
    JsonDocument body;
    body["firmware_version"] = FIRMWARE_VERSION;
    JsonArray measurements = body["measurements"].to<JsonArray>();
    for (size_t index = 0; index < rows.size(); ++index) {
      const String& row = rows[index];
      JsonDocument measurement;
      if (deserializeJson(measurement, row)) {
        Serial.println("[CareLink] Corrupt queued row dropped.");
        removeAt(index);
        return 1;
      }
      measurements.add(measurement.as<JsonObject>());
    }
    String payload;
    serializeJson(body, payload);
    WiFiClientSecure client;
    client.setCACert(CARELINK_ROOT_CA);
    HTTPClient http;
    http.setConnectTimeout(8000);
    http.setTimeout(10000);
    if (!http.begin(client, CARELINK_INGEST_URL)) return -1;
    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-carelink-device-id", CARELINK_DEVICE_ID);
    http.addHeader("Authorization", String("Device ") + CARELINK_DEVICE_CREDENTIAL);
    const int status = http.POST(payload);
    const String response = http.getString();
    http.end();
    client.stop();
    if (status == 200) {
      JsonDocument result;
      if (!deserializeJson(result, response)) {
        const int inserted = result["inserted"].as<int>();
        const int duplicates = result["duplicates"].as<int>();
        const int accepted = inserted + duplicates;
        if (accepted == static_cast<int>(rows.size())) {
          dropFirst(rows.size());
          Serial.printf("[CareLink] Acknowledged %u measurement(s): %d inserted, %d duplicate.\n",
                        rows.size(), inserted, duplicates);
          return accepted;
        }
      }
      Serial.println("[CareLink] Unexpected success response; queue retained.");
      return -1;
    }
    Serial.printf("[CareLink] Upload failed (HTTP %d); queue retained.\n", status);
    return status == 401 ? -401 : -1;
  }

  void appendBounded(const String& row) {
    take();
    std::vector<String> rows = readRowsUnlocked();
    if (rows.size() >= MAX_QUEUE) {
      rows.erase(rows.begin());
      incrementDropsUnlocked();
      Serial.println("[CareLink] Queue full; oldest measurement dropped.");
    }
    rows.push_back(row);
    writeRowsUnlocked(rows);
    Serial.printf("[CareLink] Measurement queued: %u/%u.\n", rows.size(), MAX_QUEUE);
    give();
  }

  size_t queueSize() {
    if (!ready_) return 0;
    take(); const size_t count = readRowsUnlocked().size(); give(); return count;
  }

  std::vector<String> firstRows(size_t count) {
    take();
    std::vector<String> rows = readRowsUnlocked();
    give();
    if (rows.size() > count) rows.resize(count);
    return rows;
  }

  void dropFirst(size_t count) {
    take();
    std::vector<String> rows = readRowsUnlocked();
    count = std::min(count, rows.size());
    rows.erase(rows.begin(), rows.begin() + count);
    writeRowsUnlocked(rows);
    give();
  }

  void removeAt(size_t index) {
    take();
    std::vector<String> rows = readRowsUnlocked();
    if (index < rows.size()) rows.erase(rows.begin() + index);
    writeRowsUnlocked(rows);
    give();
  }

  std::vector<String> readRowsUnlocked() {
    std::vector<String> rows;
    File file = LittleFS.open(QUEUE_PATH, FILE_READ);
    while (file && file.available()) {
      String row = file.readStringUntil('\n'); row.trim();
      if (!row.isEmpty()) rows.push_back(row);
    }
    if (file) file.close();
    return rows;
  }

  void writeRowsUnlocked(const std::vector<String>& rows) {
    constexpr const char* temporaryPath = "/carelink-queue.tmp";
    File file = LittleFS.open(temporaryPath, FILE_WRITE);
    if (!file) { Serial.println("[CareLink] Queue write failed."); return; }
    for (const String& row : rows) file.println(row);
    file.flush(); file.close();
    LittleFS.remove(BACKUP_PATH);
    if (LittleFS.exists(QUEUE_PATH)) LittleFS.rename(QUEUE_PATH, BACKUP_PATH);
    if (!LittleFS.rename(temporaryPath, QUEUE_PATH)) {
      Serial.println("[CareLink] Queue commit failed.");
      if (LittleFS.exists(BACKUP_PATH)) LittleFS.rename(BACKUP_PATH, QUEUE_PATH);
    } else LittleFS.remove(BACKUP_PATH);
  }

  unsigned long overflowDrops() {
    File file = LittleFS.open(DROP_PATH, FILE_READ);
    const unsigned long value = file ? file.parseInt() : 0;
    if (file) file.close();
    return value;
  }

  void incrementDropsUnlocked() {
    const unsigned long next = overflowDrops() + 1;
    File file = LittleFS.open(DROP_PATH, FILE_WRITE);
    if (file) { file.print(next); file.close(); }
  }

  void take() { xSemaphoreTake(mutex_, portMAX_DELAY); }
  void give() { xSemaphoreGive(mutex_); }

  static void formatTime(time_t value, char* output, size_t size) {
    struct tm utc;
    gmtime_r(&value, &utc);
    strftime(output, size, "%Y-%m-%dT%H:%M:%SZ", &utc);
  }

  static void makeUuid(char output[37]) {
    uint8_t bytes[16];
    esp_fill_random(bytes, sizeof(bytes));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    snprintf(output, 37,
      "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
      bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
      bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]);
  }
};

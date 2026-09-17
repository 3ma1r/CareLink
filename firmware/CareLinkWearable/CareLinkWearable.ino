/***************************************************************
   AI-ENABLED ELDERLY HEALTH SMARTWATCH

   ESP32 NodeMCU-32S

   NORMAL SCREENS:
   1. ACTIVITY
   2. VITALS
   3. HOME

   VITALS:
   - MAX30100 HR + SpO2
   - MLX90614 Temperature
   - All acquired during same measurement period

   IMPORTANT MAX30100 CHANGE:
   - MAX30100 is reinitialized at start of VITALS
   - MAX30100 uses 400 kHz during pulse acquisition
   - MLX90614 is temporarily read at 100 kHz
   - Then bus immediately returns to 400 kHz
   - MAX30100 is shut down after VITALS

   Prototype monitoring device only.
***************************************************************/


// ============================================================
// BLYNK
// ============================================================

#include "secrets.h"
#define BLYNK_PRINT Serial


// ============================================================
// LIBRARIES
// ============================================================

#include <WiFi.h>
#include <WiFiClient.h>
#include <BlynkSimpleEsp32.h>

#include <Wire.h>

#include "MAX30100_PulseOximeter.h"

#include <Adafruit_MLX90614.h>

#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

#include <U8g2lib.h>

#include <TinyGPS++.h>

#include <time.h>
#include <math.h>
#include "CareLinkUploader.h"


// ============================================================
// WIFI
// ============================================================

CareLinkUploader careLinkUploader;


// ============================================================
// I2C
// ============================================================

#define I2C_SDA 21
#define I2C_SCL 22

#define SLOW_I2C_CLOCK 100000UL
#define PULSE_I2C_CLOCK 400000UL


// ============================================================
// BLYNK VIRTUAL PINS
// ============================================================

#define VPIN_SOS          V0
#define VPIN_ACCEL_X      V2
#define VPIN_TEMP         V4
#define VPIN_GYRO_X       V5
#define VPIN_HEART_RATE   V6
#define VPIN_SPO2         V7
#define VPIN_LATITUDE     V8
#define VPIN_LONGITUDE    V9

#define VPIN_OVERALL      V10
#define VPIN_TERMINAL     V11

#define VPIN_HR_STATUS    V12
#define VPIN_SPO2_STATUS  V13
#define VPIN_TEMP_STATUS  V14
#define VPIN_FALL_STATUS  V15
#define VPIN_GPS_STATUS   V16


// ============================================================
// SENSOR OBJECTS
// ============================================================

Adafruit_MPU6050 mpu;

PulseOximeter pox;

Adafruit_MLX90614 mlx =
  Adafruit_MLX90614();

TinyGPSPlus gps;


// ============================================================
// OLED
// ============================================================

U8G2_SH1106_128X64_NONAME_F_HW_I2C u8g2(
  U8G2_R0,
  U8X8_PIN_NONE
);


// ============================================================
// GPS
// ============================================================

#define GPS_RX_PIN 4
#define GPS_TX_PIN 5

#define GPS_BAUD 9600

#define GPSSerial Serial1


// ============================================================
// GSM
// ============================================================

#define GSM_RX_PIN 16
#define GSM_TX_PIN 17

#define GSM_BAUD 115200

#define GSMSerial Serial2


// ============================================================
// SOS
// ============================================================

#define SOS_BUTTON_PIN 0

volatile bool sosRequested =
  false;


// ============================================================
// SENSOR AVAILABILITY
// ============================================================

bool mpuReady = false;

bool mlxReady = false;

bool poxReady = false;


// ============================================================
// MPU VALUES
// ============================================================

float Ax = 0.0;
float Ay = 0.0;
float Az = 0.0;

float Rx = 0.0;
float Ry = 0.0;
float Rz = 0.0;

float totalAcceleration = 0.0;

float totalRotation = 0.0;


// ============================================================
// VITAL VALUES
// ============================================================

float heartRate = 0.0;

float spo2 = 0.0;

float bodyTemperature = 0.0;


// ============================================================
// SIGNAL QUALITY
// ============================================================

bool hrStable = false;

bool spo2Stable = false;

bool tempStable = false;


// ============================================================
// GPS
// ============================================================

double latitude = 0.0;

double longitude = 0.0;

bool gpsHasFix = false;


// ============================================================
// STATUS
// ============================================================

String activityStatus =
  "Resting";

String fallStatus =
  "NO FALL";

String hrStatus =
  "NO READING";

String spo2Status =
  "NO READING";

String tempStatus =
  "NO READING";

String vitalsStatus =
  "NO DATA";

String gpsStatus =
  "SEARCHING";

String overallStatus =
  "STARTING";


// ============================================================
// STAGE DURATIONS
// ============================================================

#define ACTIVITY_STAGE_MS 10000UL
#define FINGER_PREPARE_MS 2000UL
#define VITALS_WARMUP_MS 8000UL
#define VITALS_SAMPLE_MS 20000UL
#define VITALS_RESULT_MS 8000UL
#define HOME_STAGE_MS 8000UL

// Prototype-sensor quality thresholds. Values remain available when quality is unstable.
constexpr int MIN_RESULT_SAMPLES = 3;
constexpr int MIN_HR_GOOD_SAMPLES = 8;
constexpr int MIN_SPO2_GOOD_SAMPLES = 8;
constexpr int MIN_TEMP_GOOD_SAMPLES = 5;
constexpr unsigned long MIN_HR_GOOD_BEATS = 3;
constexpr float MAX_HR_MAD_BPM = 12.0;
constexpr float MAX_SPO2_MAD_PERCENT = 3.0;
constexpr float MAX_TEMP_MAD_C = 0.5;


// ============================================================
// SENSOR INTERVALS
// ============================================================

#define MPU_READ_MS 100UL
#define MPU_SERIAL_MS 500UL
#define SCREEN_REFRESH_MS 500UL
#define PULSE_REPORT_MS 1000UL
#define TEMP_READ_MS 2000UL


// ============================================================
// FALL DETECTION
// ============================================================

const float FALL_ACCEL_THRESHOLD =
  16.5;

const float FALL_ROTATION_THRESHOLD =
  1.8;

const float STRONG_FALL_ACCEL =
  22.0;

const float STRONG_FALL_ROTATION =
  2.5;

const unsigned long FALL_CONFIRM_WINDOW_MS =
  800;

int fallCandidateHits = 0;

unsigned long fallCandidateStart = 0;

bool fallDetected = false;


// ============================================================
// ACTIVITY THRESHOLDS
// ============================================================

const float MOVEMENT_ACCEL_DIFFERENCE =
  1.5;

const float MOVEMENT_ROTATION =
  0.50;


// ============================================================
// ALERT COOLDOWN
// ============================================================

#define ALERT_COOLDOWN_MS 300000UL

unsigned long lastFallAlert = 0;

unsigned long lastHealthAlert = 0;


// ============================================================
// ALERT SCREEN
// ============================================================

bool alertScreenActive = false;

unsigned long alertScreenUntil = 0;

String alertTitle = "";

String alertLine1 = "";

String alertLine2 = "";


// ============================================================
// NETWORK TIMERS
// ============================================================

unsigned long lastWiFiAttempt = 0;

unsigned long lastBlynkAttempt = 0;

#define NETWORK_RETRY_MS 10000UL


// ============================================================
// MAX30100 BEAT COUNTER
// ============================================================

volatile unsigned long beatCount = 0;


// ============================================================
// FUNCTION DECLARATIONS
// ============================================================

void runActivityStage();
void runVitalsStage();
void runHomeStage();

void showActivityScreen();
void showVitalsPreparingScreen();
void showVitalsCollectingScreen();
void showVitalsResultsScreen();
void showHomeScreen();
void showAlertScreen();

void evaluateActivity();
void updateFallDetection();
void evaluateHealthStatus();

void serviceGPS();
void serviceNetwork();
void serviceNetworkLight();

void handleSOS();
void sendSMS(String message);

void triggerFallAlert();
void checkHealthAlerts();

void sendDataToBlynk();

void checkSerialBenchCommands();

float medianValue(
  float values[],
  int count
);

float medianAbsoluteDeviation(
  float values[],
  int count,
  float median
);


// ============================================================
// BEAT CALLBACK
// ============================================================

void onBeatDetected() {

  beatCount++;
}


// ============================================================
// SOS INTERRUPT
// ============================================================

void IRAM_ATTR sosInterrupt() {

  sosRequested = true;
}


// ============================================================
// BLYNK SOS
// ============================================================

BLYNK_WRITE(VPIN_SOS) {

  if (
    param.asInt() == 1
  ) {

    sosRequested = true;
  }
}


// ============================================================
// ALERT
// ============================================================

void triggerWatchAlert(
  String title,
  String line1,
  String line2,
  unsigned long duration
) {

  alertTitle =
    title;

  alertLine1 =
    line1;

  alertLine2 =
    line2;

  alertScreenActive =
    true;

  alertScreenUntil =
    millis() +
    duration;

  showAlertScreen();
}


// ============================================================
// ALERT EXPIRATION
// ============================================================

void updateAlertState() {

  if (
    alertScreenActive

    &&

    (long)(
      millis() -
      alertScreenUntil
    ) >= 0
  ) {

    alertScreenActive =
      false;
  }
}


// ============================================================
// GPS SERVICE
// ============================================================

void serviceGPS() {

  static unsigned long lastGPSPrint =
    0;


  while (
    GPSSerial.available() > 0
  ) {

    gps.encode(
      GPSSerial.read()
    );
  }


  if (
    gps.location.isValid()

    &&

    gps.location.age() <
    10000
  ) {

    latitude =
      gps.location.lat();

    longitude =
      gps.location.lng();

    gpsHasFix =
      true;

    gpsStatus =
      "GPS CONNECTED";
  }

  else {

    gpsStatus =
      "SEARCHING";
  }


  // ==========================================================
  // GPS SERIAL DIAGNOSTIC
  // ==========================================================

  if (
    millis() -
    lastGPSPrint >=
    1000
  ) {

    lastGPSPrint =
      millis();


    Serial.println();

    Serial.println(
      "--------- GPS ---------"
    );


    Serial.print(
      "Characters received: "
    );

    Serial.println(
      gps.charsProcessed()
    );


    Serial.print(
      "Satellites: "
    );


    if (
      gps.satellites.isValid()
    ) {

      Serial.println(
        gps.satellites.value()
      );
    }

    else {

      Serial.println(
        "Not available"
      );
    }


    Serial.print(
      "Location valid: "
    );


    if (
      gps.location.isValid()
    ) {

      Serial.println(
        "YES"
      );
    }

    else {

      Serial.println(
        "NO"
      );
    }


    if (
      gps.location.isValid()
    ) {

      Serial.print(
        "Latitude: "
      );


      Serial.println(
        gps.location.lat(),
        6
      );


      Serial.print(
        "Longitude: "
      );


      Serial.println(
        gps.location.lng(),
        6
      );


      Serial.print(
        "Location age: "
      );


      Serial.print(
        gps.location.age()
      );


      Serial.println(
        " ms"
      );
    }


    Serial.print(
      "Status: "
    );


    Serial.println(
      gpsStatus
    );


    Serial.println(
      "-----------------------"
    );
  }
}


// ============================================================
// NETWORK - LIGHT
// ============================================================

void serviceNetworkLight() {

  if (
    Blynk.connected()
  ) {

    Blynk.run();
  }
}


// ============================================================
// NORMAL NETWORK
// ============================================================

void serviceNetwork() {

  unsigned long now =
    millis();


  if (
    WiFi.status() !=
    WL_CONNECTED
  ) {

    if (
      now -
      lastWiFiAttempt >=
      NETWORK_RETRY_MS
    ) {

      lastWiFiAttempt =
        now;

      Serial.println(
        "[WiFi] Reconnecting..."
      );

      WiFi.begin(
        WIFI_SSID,
        WIFI_PASSWORD
      );
    }

    return;
  }


  if (
    !Blynk.connected()
  ) {

    if (
      now -
      lastBlynkAttempt >=
      NETWORK_RETRY_MS
    ) {

      lastBlynkAttempt =
        now;

      Serial.println(
        "[Blynk] Reconnecting..."
      );

      Blynk.connect(
        250
      );
    }
  }

  else {

    Blynk.run();
  }
}


// ============================================================
// ALERT OLED
// ============================================================

void showAlertScreen() {

  Wire.setClock(
    SLOW_I2C_CLOCK
  );


  u8g2.clearBuffer();


  u8g2.setFont(
    u8g2_font_helvB10_tf
  );


  int titleWidth =
    u8g2.getStrWidth(
      alertTitle.c_str()
    );


  u8g2.drawStr(
    (128 - titleWidth) / 2,
    14,
    alertTitle.c_str()
  );


  u8g2.setFont(
    u8g2_font_6x10_tf
  );


  int width1 =
    u8g2.getStrWidth(
      alertLine1.c_str()
    );


  u8g2.drawStr(
    (128 - width1) / 2,
    37,
    alertLine1.c_str()
  );


  int width2 =
    u8g2.getStrWidth(
      alertLine2.c_str()
    );


  u8g2.drawStr(
    (128 - width2) / 2,
    54,
    alertLine2.c_str()
  );


  u8g2.sendBuffer();
}


// ============================================================
// ACTIVITY SCREEN
// ============================================================

void showActivityScreen() {

  if (
    alertScreenActive
  ) {

    return;
  }


  Wire.setClock(
    SLOW_I2C_CLOCK
  );


  u8g2.clearBuffer();


  u8g2.setFont(
    u8g2_font_helvB10_tf
  );


  const char* title =
    "ACTIVITY";


  int titleWidth =
    u8g2.getStrWidth(
      title
    );


  u8g2.drawStr(
    (128 - titleWidth) / 2,
    13,
    title
  );


  u8g2.setFont(
    u8g2_font_6x10_tf
  );


  String statusLine =
    "Status: " +
    activityStatus;


  u8g2.drawStr(
    7,
    29,
    statusLine.c_str()
  );


  String fallLine;


  if (
    fallDetected
  ) {

    fallLine =
      "Fall Guard: ALERT";
  }

  else {

    fallLine =
      "Fall Guard: ON";
  }


  u8g2.drawStr(
    7,
    44,
    fallLine.c_str()
  );


  u8g2.drawStr(
    7,
    59,
    "SOS: Ready"
  );


  u8g2.sendBuffer();
}


// ============================================================
// VITALS - PREPARING
// ============================================================

void showVitalsPreparingScreen() {

  Wire.setClock(
    SLOW_I2C_CLOCK
  );


  u8g2.clearBuffer();


  u8g2.setFont(
    u8g2_font_helvB10_tf
  );


  const char* title =
    "VITALS";


  int titleWidth =
    u8g2.getStrWidth(
      title
    );


  u8g2.drawStr(
    (128 - titleWidth) / 2,
    13,
    title
  );


  u8g2.setFont(
    u8g2_font_6x10_tf
  );


  u8g2.drawStr(
    9,
    31,
    "Place finger still"
  );


  u8g2.drawStr(
    9,
    46,
    "on MAX30100"
  );


  u8g2.drawStr(
    9,
    61,
    "Preparing..."
  );


  u8g2.sendBuffer();
}


// ============================================================
// VITALS - COLLECTING
// ============================================================

void showVitalsCollectingScreen() {

  Wire.setClock(
    SLOW_I2C_CLOCK
  );


  u8g2.clearBuffer();


  u8g2.setFont(
    u8g2_font_helvB10_tf
  );


  const char* title =
    "VITALS";


  int titleWidth =
    u8g2.getStrWidth(
      title
    );


  u8g2.drawStr(
    (128 - titleWidth) / 2,
    13,
    title
  );


  u8g2.setFont(
    u8g2_font_6x10_tf
  );


  u8g2.drawStr(
    8,
    30,
    "HR:    collecting"
  );


  u8g2.drawStr(
    8,
    45,
    "SpO2:  collecting"
  );


  u8g2.drawStr(
    8,
    60,
    "Temp:  collecting"
  );


  u8g2.sendBuffer();
}


// ============================================================
// VITALS RESULTS
// ============================================================

void showVitalsResultsScreen() {

  Wire.setClock(
    SLOW_I2C_CLOCK
  );


  u8g2.clearBuffer();


  u8g2.setFont(
    u8g2_font_helvB10_tf
  );


  const char* title =
    "VITALS";


  int titleWidth =
    u8g2.getStrWidth(
      title
    );


  u8g2.drawStr(
    (128 - titleWidth) / 2,
    13,
    title
  );


  u8g2.setFont(
    u8g2_font_6x10_tf
  );


  String hrLine;


  if (
    heartRate > 0
  ) {

    hrLine =
      "HR:    " +
      String(
        heartRate,
        0
      ) +
      " bpm";
  }

  else {

    hrLine =
      "HR:    -- bpm";
  }


  String spo2Line;


  if (
    spo2 > 0
  ) {

    spo2Line =
      "SpO2:  " +
      String(
        spo2,
        0
      ) +
      " %";
  }

  else {

    spo2Line =
      "SpO2:  -- %";
  }


  String tempLine;


  if (
    bodyTemperature > 0
  ) {

    tempLine =
      "Temp:  " +
      String(
        bodyTemperature,
        1
      ) +
      " C";
  }

  else {

    tempLine =
      "Temp:  -- C";
  }


  u8g2.drawStr(
    8,
    29,
    hrLine.c_str()
  );


  u8g2.drawStr(
    8,
    44,
    spo2Line.c_str()
  );


  u8g2.drawStr(
    8,
    59,
    tempLine.c_str()
  );


  u8g2.sendBuffer();
}


// ============================================================
// HOME
// ============================================================

void showHomeScreen() {

  if (
    alertScreenActive
  ) {

    return;
  }


  Wire.setClock(
    SLOW_I2C_CLOCK
  );


  u8g2.clearBuffer();


  struct tm timeinfo;


  String timeText =
    "--:--";

  String dateText =
    "-- --- ----";


  if (
    getLocalTime(
      &timeinfo,
      10
    )
  ) {

    char timeBuffer[20];

    char dateBuffer[20];


    strftime(
      timeBuffer,
      sizeof(timeBuffer),
      "%I:%M %p",
      &timeinfo
    );


    strftime(
      dateBuffer,
      sizeof(dateBuffer),
      "%d %b %Y",
      &timeinfo
    );


    timeText =
      String(timeBuffer);


    dateText =
      String(dateBuffer);


    dateText.toUpperCase();


    if (
      timeText.charAt(0) ==
      '0'
    ) {

      timeText.remove(
        0,
        1
      );
    }
  }


  u8g2.setFont(
    u8g2_font_helvB14_tf
  );


  int timeWidth =
    u8g2.getStrWidth(
      timeText.c_str()
    );


  u8g2.drawStr(
    (128 - timeWidth) / 2,
    17,
    timeText.c_str()
  );


  u8g2.setFont(
    u8g2_font_6x10_tf
  );


  int dateWidth =
    u8g2.getStrWidth(
      dateText.c_str()
    );


  u8g2.drawStr(
    (128 - dateWidth) / 2,
    31,
    dateText.c_str()
  );


  String vitalLine =
    "Vitals: " +
    vitalsStatus;


  u8g2.drawStr(
    3,
    46,
    vitalLine.c_str()
  );


  String connectionLine;


  if (
    WiFi.status() ==
    WL_CONNECTED
  ) {

    connectionLine =
      "WiFi OK";
  }

  else {

    connectionLine =
      "WiFi X";
  }


  if (
    gpsHasFix

    &&

    gps.location.age() <
    10000
  ) {

    connectionLine +=
      "   GPS OK";
  }

  else {

    connectionLine +=
      "   GPS ...";
  }


  u8g2.drawStr(
    3,
    61,
    connectionLine.c_str()
  );


  u8g2.sendBuffer();
}


// ============================================================
// ACTIVITY DETECTION
// ============================================================

void evaluateActivity() {

  float difference =
    fabs(
      totalAcceleration -
      9.81
    );


  if (
    difference >
    MOVEMENT_ACCEL_DIFFERENCE

    ||

    totalRotation >
    MOVEMENT_ROTATION
  ) {

    activityStatus =
      "Moving";
  }

  else {

    activityStatus =
      "Resting";
  }
}


// ============================================================
// FALL DETECTION
// ============================================================

void updateFallDetection() {

  unsigned long now =
    millis();


  bool strongImpact =
    totalAcceleration >=
    STRONG_FALL_ACCEL

    &&

    totalRotation >=
    STRONG_FALL_ROTATION;


  bool possibleImpact =
    totalAcceleration >=
    FALL_ACCEL_THRESHOLD

    &&

    totalRotation >=
    FALL_ROTATION_THRESHOLD;


  if (
    strongImpact
  ) {

    Serial.println();

    Serial.println(
      "********************************"
    );

    Serial.println(
      "[FALL] STRONG IMPACT DETECTED"
    );


    Serial.print(
      "Acceleration: "
    );

    Serial.println(
      totalAcceleration,
      2
    );


    Serial.print(
      "Rotation: "
    );

    Serial.println(
      totalRotation,
      2
    );


    Serial.println(
      "********************************"
    );


    fallDetected =
      true;


    fallStatus =
      "FALL DETECTED";


    fallCandidateHits =
      0;


    triggerFallAlert();


    return;
  }


  if (
    possibleImpact
  ) {

    if (
      fallCandidateHits == 0

      ||

      now -
      fallCandidateStart >
      FALL_CONFIRM_WINDOW_MS
    ) {

      fallCandidateHits =
        1;


      fallCandidateStart =
        now;


      Serial.println(
        "[FALL] Candidate #1"
      );
    }

    else {

      fallCandidateHits++;


      Serial.print(
        "[FALL] Candidate hit: "
      );


      Serial.println(
        fallCandidateHits
      );
    }


    if (
      fallCandidateHits >= 2
    ) {

      fallDetected =
        true;


      fallStatus =
        "FALL DETECTED";


      fallCandidateHits =
        0;


      Serial.println();

      Serial.println(
        "********************************"
      );

      Serial.println(
        "*** POSSIBLE FALL DETECTED ***"
      );

      Serial.println(
        "********************************"
      );


      triggerFallAlert();
    }
  }


  if (
    fallCandidateHits > 0

    &&

    now -
    fallCandidateStart >
    FALL_CONFIRM_WINDOW_MS
  ) {

    Serial.println(
      "[FALL] Candidate expired."
    );


    fallCandidateHits =
      0;
  }
}


// ============================================================
// SERIAL FALL TEST
// ============================================================

void checkSerialBenchCommands() {

  while (
    Serial.available() > 0
  ) {

    char command =
      Serial.read();


    if (
      command == 'F'

      ||

      command == 'f'
    ) {

      Serial.println();

      Serial.println(
        "=============================="
      );

      Serial.println(
        "SAFE FALL DISPLAY TEST"
      );

      Serial.println(
        "=============================="
      );


      triggerWatchAlert(
        "FALL TEST",
        "Detector display OK",
        "Bench test only",
        4000
      );
    }
  }
}


// ============================================================
// ACTIVITY STAGE
// ============================================================

void runActivityStage() {

  Serial.println();

  Serial.println(
    "================================"
  );

  Serial.println(
    "ACTIVITY / FALL MONITORING"
  );

  Serial.println(
    "================================"
  );


  fallDetected =
    false;


  fallStatus =
    "NO FALL";


  fallCandidateHits =
    0;


  unsigned long start =
    millis();


  unsigned long lastMPU =
    0;


  unsigned long lastSerial =
    0;


  unsigned long lastScreen =
    0;


  showActivityScreen();


  while (
    millis() -
    start <
    ACTIVITY_STAGE_MS
  ) {

    unsigned long now =
      millis();


    serviceGPS();

    serviceNetwork();

    handleSOS();

    checkSerialBenchCommands();

    updateAlertState();


    if (
      mpuReady

      &&

      now -
      lastMPU >=
      MPU_READ_MS
    ) {

      lastMPU =
        now;


      Wire.setClock(
        SLOW_I2C_CLOCK
      );


      sensors_event_t a;

      sensors_event_t g;

      sensors_event_t temp;


      mpu.getEvent(
        &a,
        &g,
        &temp
      );


      Ax =
        a.acceleration.x;


      Ay =
        a.acceleration.y;


      Az =
        a.acceleration.z;


      Rx =
        g.gyro.x;


      Ry =
        g.gyro.y;


      Rz =
        g.gyro.z;


      totalAcceleration =
        sqrt(
          Ax * Ax +
          Ay * Ay +
          Az * Az
        );


      totalRotation =
        sqrt(
          Rx * Rx +
          Ry * Ry +
          Rz * Rz
        );


      evaluateActivity();


      updateFallDetection();
    }


    if (
      now -
      lastSerial >=
      MPU_SERIAL_MS
    ) {

      lastSerial =
        now;


      Serial.print(
        "[MPU] A="
      );


      Serial.print(
        totalAcceleration,
        2
      );


      Serial.print(
        " m/s2 | G="
      );


      Serial.print(
        totalRotation,
        2
      );


      Serial.print(
        " rad/s | Activity="
      );


      Serial.print(
        activityStatus
      );


      Serial.print(
        " | Candidate="
      );


      Serial.print(
        fallCandidateHits
      );


      Serial.print(
        " | Fall="
      );


      Serial.println(
        fallStatus
      );
    }


    if (
      !alertScreenActive

      &&

      now -
      lastScreen >=
      SCREEN_REFRESH_MS
    ) {

      lastScreen =
        now;


      showActivityScreen();
    }
  }
}


// ============================================================
// MEDIAN
// ============================================================

float medianValue(
  float values[],
  int count
) {

  if (
    count <= 0
  ) {

    return 0.0;
  }


  if (
    count > 24
  ) {

    count = 24;
  }


  float copyValues[24];


  for (
    int i = 0;
    i < count;
    i++
  ) {

    copyValues[i] =
      values[i];
  }


  for (
    int i = 0;
    i < count - 1;
    i++
  ) {

    for (
      int j = i + 1;
      j < count;
      j++
    ) {

      if (
        copyValues[j] <
        copyValues[i]
      ) {

        float temporary =
          copyValues[i];


        copyValues[i] =
          copyValues[j];


        copyValues[j] =
          temporary;
      }
    }
  }


  if (
    count % 2 == 1
  ) {

    return copyValues[
      count / 2
    ];
  }


  return (
    copyValues[
      count / 2 - 1
    ]

    +

    copyValues[
      count / 2
    ]
  ) / 2.0;
}


// ============================================================
// MEDIAN ABSOLUTE DEVIATION
// ============================================================

float medianAbsoluteDeviation(
  float values[],
  int count,
  float median
) {

  if (
    count <= 0
  ) {

    return 0.0;
  }


  if (
    count > 24
  ) {

    count = 24;
  }


  float deviations[24];


  for (
    int i = 0;
    i < count;
    i++
  ) {

    deviations[i] =
      fabs(values[i] - median);
  }


  return medianValue(
    deviations,
    count
  );
}


// ============================================================
// VITALS STAGE
// ============================================================

void runVitalsStage() {

  Serial.println();

  Serial.println(
    "================================"
  );

  Serial.println(
    "VITALS"
  );

  Serial.println(
    "HR + SpO2 + Temperature"
  );

  Serial.println(
    "================================"
  );


  showVitalsPreparingScreen();


  Serial.println(
    "[MAX30100] Place finger on sensor now."
  );


  unsigned long prepareStart =
    millis();


  while (
    millis() -
    prepareStart <
    FINGER_PREPARE_MS
  ) {

    serviceNetworkLight();

    handleSOS();

    delay(5);
  }


  Serial.println(
    "[MAX30100] Starting fresh pulse session..."
  );


  Wire.setClock(
    PULSE_I2C_CLOCK
  );


  poxReady =
    pox.begin();


  Wire.setClock(
    PULSE_I2C_CLOCK
  );


  if (
    !poxReady
  ) {

    Serial.println(
      "[MAX30100] INITIALIZATION FAILED"
    );


    heartRate =
      0;


    spo2 =
      0;


    hrStable =
      false;


    spo2Stable =
      false;
  }

  else {

    Serial.println(
      "[MAX30100] INITIALIZATION SUCCESS"
    );


    pox.setOnBeatDetectedCallback(
      onBeatDetected
    );
  }


  beatCount =
    0;


  showVitalsCollectingScreen();


  Wire.setClock(
    PULSE_I2C_CLOCK
  );


  const int MAX_SAMPLES =
    24;


  float hrSamples[
    MAX_SAMPLES
  ];


  float spo2Samples[
    MAX_SAMPLES
  ];


  float tempSamples[
    MAX_SAMPLES
  ];


  int hrCount =
    0;


  int spo2Count =
    0;


  int tempCount =
    0;


  unsigned long vitalsStart =
    millis();


  unsigned long fullDuration =
    VITALS_WARMUP_MS +
    VITALS_SAMPLE_MS;


  unsigned long lastPulseReport =
    millis();


  unsigned long lastTempRead =
    millis();


  unsigned long lastNetwork =
    millis();


  while (
    millis() -
    vitalsStart <
    fullDuration
  ) {

    unsigned long now =
      millis();


    bool warmupComplete =
      now -
      vitalsStart >=
      VITALS_WARMUP_MS;


    if (
      poxReady
    ) {

      pox.update();
    }


    if (
      sosRequested
    ) {

      Serial.println(
        "[VITALS] SOS INTERRUPT"
      );


      if (
        poxReady
      ) {

        pox.shutdown();
      }


      Wire.setClock(
        SLOW_I2C_CLOCK
      );


      handleSOS();


      return;
    }


    if (
      now -
      lastNetwork >=
      100
    ) {

      lastNetwork =
        now;


      serviceNetworkLight();


      if (
        poxReady
      ) {

        pox.update();
      }
    }


    if (
      mlxReady

      &&

      now -
      lastTempRead >=
      TEMP_READ_MS
    ) {

      lastTempRead =
        now;


      if (
        poxReady
      ) {

        pox.update();
      }


      Wire.setClock(
        SLOW_I2C_CLOCK
      );


      double currentTemperature =
        mlx.readObjectTempC();


      Wire.setClock(
        PULSE_I2C_CLOCK
      );


      if (
        poxReady
      ) {

        pox.update();
      }


      Serial.print(
        "[TEMP] "
      );


      if (
        !isnan(
          currentTemperature
        )

        &&

        warmupComplete
      ) {

        Serial.print(
          currentTemperature,
          2
        );


        Serial.println(
          " C"
        );
      }

      else {

        Serial.println(
          "INVALID"
        );
      }


      if (
        !isnan(
          currentTemperature
        )

        &&

        currentTemperature >=
        20.0

        &&

        currentTemperature <=
        45.0

        &&

        tempCount <
        MAX_SAMPLES
      ) {

        tempSamples[
          tempCount
        ] =
          currentTemperature;


        tempCount++;
      }
    }


    if (
      now -
      lastPulseReport >=
      PULSE_REPORT_MS
    ) {

      lastPulseReport =
        now;


      float currentHR =
        0.0;


      float currentSpO2 =
        0.0;


      if (
        poxReady
      ) {

        pox.update();


        currentHR =
          pox.getHeartRate();


        currentSpO2 =
          pox.getSpO2();
      }


      Serial.print(
        "[PULSE] HR="
      );


      Serial.print(
        currentHR,
        2
      );


      Serial.print(
        " bpm | SpO2="
      );


      Serial.print(
        currentSpO2,
        0
      );


      Serial.print(
        "% | Beats="
      );


      Serial.print(
        beatCount
      );


      if (
        !warmupComplete
      ) {

        Serial.println(
          " | ACQUIRING"
        );
      }

      else {

        Serial.println(
          " | COLLECTING"
        );
      }


      if (
        warmupComplete
      ) {

        if (
          currentHR >= 40.0

          &&

          currentHR <= 180.0

          &&

          hrCount <
          MAX_SAMPLES
        ) {

          hrSamples[
            hrCount
          ] =
            currentHR;


          hrCount++;
        }


        if (
          currentSpO2 >= 70.0

          &&

          currentSpO2 <= 100.0

          &&

          spo2Count <
          MAX_SAMPLES
        ) {

          spo2Samples[
            spo2Count
          ] =
            currentSpO2;


          spo2Count++;
        }
      }
    }
  }


  if (
    poxReady
  ) {

    pox.shutdown();
  }


  Wire.setClock(
    SLOW_I2C_CLOCK
  );


  if (
    hrCount >= MIN_RESULT_SAMPLES
  ) {

    heartRate =
      medianValue(
        hrSamples,
        hrCount
      );


    float hrMad =
      medianAbsoluteDeviation(
        hrSamples,
        hrCount,
        heartRate
      );


    hrStable =
      (
        hrCount >= MIN_HR_GOOD_SAMPLES

        &&

        beatCount >= MIN_HR_GOOD_BEATS

        &&

        hrMad <= MAX_HR_MAD_BPM
      );


    Serial.print(
      "[RESULT] HR median: "
    );


    Serial.print(
      heartRate,
      1
    );


    Serial.print(
      " bpm | samples="
    );


    Serial.print(
      hrCount
    );


    Serial.print(
      " | MAD="
    );


    Serial.println(
      hrMad,
      1
    );
  }

  else {

    heartRate =
      0.0;


    hrStable =
      false;


    Serial.print(
      "[RESULT] HR FAILED - valid samples: "
    );


    Serial.println(
      hrCount
    );
  }


  if (
    spo2Count >= MIN_RESULT_SAMPLES
  ) {

    spo2 =
      medianValue(
        spo2Samples,
        spo2Count
      );


    float spo2Mad =
      medianAbsoluteDeviation(
        spo2Samples,
        spo2Count,
        spo2
      );


    spo2Stable =
      (
        spo2Count >= MIN_SPO2_GOOD_SAMPLES

        &&

        spo2Mad <= MAX_SPO2_MAD_PERCENT
      );


    Serial.print(
      "[RESULT] SpO2 median: "
    );


    Serial.print(
      spo2,
      1
    );


    Serial.print(
      "% | samples="
    );


    Serial.print(
      spo2Count
    );


    Serial.print(
      " | MAD="
    );


    Serial.println(
      spo2Mad,
      1
    );
  }

  else {

    spo2 =
      0.0;


    spo2Stable =
      false;


    Serial.print(
      "[RESULT] SpO2 FAILED - valid samples: "
    );


    Serial.println(
      spo2Count
    );
  }


  if (
    tempCount >= MIN_RESULT_SAMPLES
  ) {

    bodyTemperature =
      medianValue(
        tempSamples,
        tempCount
      );


    float tempMad =
      medianAbsoluteDeviation(
        tempSamples,
        tempCount,
        bodyTemperature
      );


    tempStable =
      (
        tempCount >= MIN_TEMP_GOOD_SAMPLES

        &&

        tempMad <= MAX_TEMP_MAD_C
      );


    Serial.print(
      "[RESULT] Temperature: "
    );


    Serial.print(
      bodyTemperature,
      2
    );


    Serial.print(
      " C | samples="
    );


    Serial.println(
      tempCount
    );


    Serial.print(
      "[RESULT] Temperature MAD: "
    );


    Serial.println(
      tempMad,
      2
    );
  }

  else {

    bodyTemperature =
      0.0;


    tempStable =
      false;


    Serial.println(
      "[RESULT] Temperature FAILED"
    );
  }


  evaluateHealthStatus();

  careLinkUploader.enqueue(
    heartRate,
    heartRate > 0,
    hrStable,
    spo2,
    spo2 > 0,
    spo2Stable,
    bodyTemperature,
    bodyTemperature > 0,
    tempStable,
    totalAcceleration,
    mpuReady,
    gps.location.isValid() && gps.location.age() < 10000,
    latitude,
    longitude
  );


  sendDataToBlynk();


  Serial.println();

  Serial.println(
    "================================"
  );

  Serial.println(
    "FINAL VITALS"
  );

  Serial.println(
    "================================"
  );


  Serial.print(
    "Heart Rate: "
  );


  Serial.print(
    heartRate,
    1
  );


  Serial.print(
    " bpm | "
  );


  Serial.println(
    hrStatus
  );


  Serial.print(
    "SpO2: "
  );


  Serial.print(
    spo2,
    1
  );


  Serial.print(
    "% | "
  );


  Serial.println(
    spo2Status
  );


  Serial.print(
    "Temperature: "
  );


  Serial.print(
    bodyTemperature,
    1
  );


  Serial.print(
    " C | "
  );


  Serial.println(
    tempStatus
  );


  Serial.print(
    "Vitals Status: "
  );


  Serial.println(
    vitalsStatus
  );


  showVitalsResultsScreen();


  unsigned long resultStart =
    millis();


  while (
    millis() -
    resultStart <
    VITALS_RESULT_MS
  ) {

    serviceGPS();

    serviceNetwork();

    handleSOS();

    checkSerialBenchCommands();
  }


  checkHealthAlerts();
}


// ============================================================
// HEALTH STATUS
// ============================================================

void evaluateHealthStatus() {

  if (
    heartRate <= 0
  ) {

    hrStatus =
      "NO READING";
  }

  else if (
    heartRate < 50
  ) {

    hrStatus =
      "LOW";
  }

  else if (
    heartRate < 60
  ) {

    hrStatus =
      "SLIGHTLY LOW";
  }

  else if (
    heartRate <= 100
  ) {

    hrStatus =
      "NORMAL";
  }

  else if (
    heartRate <= 120
  ) {

    hrStatus =
      "ELEVATED";
  }

  else {

    hrStatus =
      "HIGH";
  }


  if (
    spo2 <= 0
  ) {

    spo2Status =
      "NO READING";
  }

  else if (
    spo2 < 90
  ) {

    spo2Status =
      "CRITICAL LOW";
  }

  else if (
    spo2 <= 94
  ) {

    spo2Status =
      "CAUTION";
  }

  else {

    spo2Status =
      "NORMAL";
  }


  if (
    bodyTemperature <= 0
  ) {

    tempStatus =
      "NO READING";
  }

  else if (
    bodyTemperature < 35.0
  ) {

    tempStatus =
      "LOW";
  }

  else if (
    bodyTemperature <= 37.5
  ) {

    tempStatus =
      "NORMAL";
  }

  else if (
    bodyTemperature <= 38.0
  ) {

    tempStatus =
      "ELEVATED";
  }

  else {

    tempStatus =
      "HIGH";
  }


  bool missing =
    hrStatus == "NO READING"

    ||

    spo2Status == "NO READING"

    ||

    tempStatus == "NO READING";


  bool unstable =
    (heartRate > 0 && !hrStable)

    ||

    (spo2 > 0 && !spo2Stable)

    ||

    (bodyTemperature > 0 && !tempStable);


  bool warning =
    (hrStable && hrStatus == "SLIGHTLY LOW")

    ||

    (hrStable && hrStatus == "ELEVATED")

    ||

    (spo2Stable && spo2Status == "CAUTION")

    ||

    (tempStable && tempStatus == "LOW")

    ||

    (tempStable && tempStatus == "ELEVATED");


  bool alert =
    (hrStable && hrStatus == "LOW")

    ||

    (hrStable && hrStatus == "HIGH")

    ||

    (spo2Stable && spo2Status == "CRITICAL LOW")

    ||

    (tempStable && tempStatus == "HIGH");


  if (
    alert
  ) {

    vitalsStatus =
      "ALERT";
  }

  else if (
    missing
  ) {

    vitalsStatus =
      "NO DATA";
  }

  else if (
    unstable ||
    warning
  ) {

    vitalsStatus =
      "CHECK";
  }

  else {

    vitalsStatus =
      "NORMAL";
  }


  if (
    fallDetected
  ) {

    overallStatus =
      "EMERGENCY";
  }

  else if (
    vitalsStatus ==
    "ALERT"
  ) {

    overallStatus =
      "ATTENTION REQUIRED";
  }

  else if (
    vitalsStatus ==
    "CHECK"
  ) {

    overallStatus =
      "CHECK READINGS";
  }

  else if (
    vitalsStatus ==
    "NO DATA"
  ) {

    overallStatus =
      "CHECK SENSORS";
  }

  else {

    overallStatus =
      "NORMAL";
  }
}


// ============================================================
// HOME STAGE
// ============================================================

void runHomeStage() {

  Serial.println();

  Serial.println(
    "================================"
  );

  Serial.println(
    "HOME"
  );

  Serial.println(
    "================================"
  );


  alertScreenActive =
    false;


  unsigned long start =
    millis();


  unsigned long lastScreen =
    0;


  showHomeScreen();


  while (
    millis() -
    start <
    HOME_STAGE_MS
  ) {

    unsigned long now =
      millis();


    serviceGPS();

    serviceNetwork();

    handleSOS();

    checkSerialBenchCommands();

    updateAlertState();


    if (
      !alertScreenActive

      &&

      now -
      lastScreen >=
      SCREEN_REFRESH_MS
    ) {

      lastScreen =
        now;


      showHomeScreen();
    }
  }
}


// ============================================================
// FALL ALERT
// ============================================================

void triggerFallAlert() {

  unsigned long now =
    millis();


  if (
    lastFallAlert != 0

    &&

    now -
    lastFallAlert <
    ALERT_COOLDOWN_MS
  ) {

    return;
  }


  lastFallAlert =
    now;


  triggerWatchAlert(
    "FALL DETECTED",
    "Alerting caregiver",
    "Checking location",
    6000
  );


  if (
    Blynk.connected()
  ) {

    Blynk.logEvent(
      "fall_alert",
      "Possible fall detected."
    );
  }


  String message =
    "Possible fall detected by health smartwatch.";


  if (
    gpsHasFix

    &&

    gps.location.age() <
    60000
  ) {

    message +=
      " Lat: ";


    message +=
      String(
        latitude,
        6
      );


    message +=
      " Lon: ";


    message +=
      String(
        longitude,
        6
      );
  }


  sendSMS(
    message
  );
}


// ============================================================
// HEALTH ALERT
// ============================================================

void checkHealthAlerts() {

  if (
    vitalsStatus !=
    "ALERT"
  ) {

    return;
  }


  unsigned long now =
    millis();


  if (
    lastHealthAlert != 0

    &&

    now -
    lastHealthAlert <
    ALERT_COOLDOWN_MS
  ) {

    return;
  }


  lastHealthAlert =
    now;


  String reason =
    "Abnormal vital";


  if (
    spo2Status ==
    "CRITICAL LOW"
  ) {

    reason =
      "SpO2 " +
      String(
        spo2,
        0
      ) +
      "%";


    if (
      Blynk.connected()
    ) {

      Blynk.logEvent(
        "spo2_alert",
        "Low SpO2 reading detected."
      );
    }
  }

  else if (
    tempStatus ==
    "HIGH"
  ) {

    reason =
      "Temp " +
      String(
        bodyTemperature,
        1
      ) +
      " C";


    if (
      Blynk.connected()
    ) {

      Blynk.logEvent(
        "temperature_alert",
        "High temperature reading detected."
      );
    }
  }

  else if (
    hrStatus == "LOW"

    ||

    hrStatus == "HIGH"
  ) {

    reason =
      "HR " +
      String(
        heartRate,
        0
      ) +
      " bpm";


    if (
      Blynk.connected()
    ) {

      Blynk.logEvent(
        "heart_rate_alert",
        "Heart rate reading requires attention."
      );
    }
  }


  triggerWatchAlert(
    "VITALS ALERT",
    reason,
    "Caregiver notified",
    6000
  );


  sendSMS(
    "Health alert: " +
    reason
  );
}


// ============================================================
// SOS
// ============================================================

void handleSOS() {

  if (
    !sosRequested
  ) {

    return;
  }


  sosRequested =
    false;


  Serial.println();

  Serial.println(
    "********************************"
  );

  Serial.println(
    "SOS ACTIVATED"
  );

  Serial.println(
    "********************************"
  );


  triggerWatchAlert(
    "SOS ALERT",
    "Emergency sent",
    "Contacting caregiver",
    6000
  );


  if (
    Blynk.connected()
  ) {

    Blynk.logEvent(
      "sos_alert",
      "SOS emergency button activated."
    );
  }


  String message =
    "SOS emergency button activated.";


  if (
    gpsHasFix

    &&

    gps.location.age() <
    60000
  ) {

    message +=
      " Lat: ";


    message +=
      String(
        latitude,
        6
      );


    message +=
      " Lon: ";


    message +=
      String(
        longitude,
        6
      );
  }


  sendSMS(
    message
  );
}


// ============================================================
// GSM SMS
// ============================================================

void sendSMS(
  String message
) {

  Serial.println(
    "[GSM] Sending SMS..."
  );


  GSMSerial.println(
    "AT+CMGF=1"
  );


  delay(400);


  GSMSerial.print(
    "AT+CMGS=\""
  );


  GSMSerial.print(
    CAREGIVER_PHONE
  );


  GSMSerial.println(
    "\""
  );


  delay(400);


  GSMSerial.print(
    message
  );


  delay(250);


  GSMSerial.write(
    26
  );


  delay(800);


  Serial.println(
    "[GSM] SMS command completed."
  );
}


// ============================================================
// BLYNK DATA
// ============================================================

void sendDataToBlynk() {

  if (
    !Blynk.connected()
  ) {

    return;
  }


  Blynk.virtualWrite(
    VPIN_ACCEL_X,
    Ax
  );


  Blynk.virtualWrite(
    VPIN_GYRO_X,
    Rx
  );


  Blynk.virtualWrite(
    VPIN_HEART_RATE,
    heartRate
  );


  Blynk.virtualWrite(
    VPIN_SPO2,
    spo2
  );


  Blynk.virtualWrite(
    VPIN_TEMP,
    bodyTemperature
  );


  if (
    gpsHasFix
  ) {

    Blynk.virtualWrite(
      VPIN_LATITUDE,
      latitude
    );


    Blynk.virtualWrite(
      VPIN_LONGITUDE,
      longitude
    );
  }


  Blynk.virtualWrite(
    VPIN_OVERALL,
    overallStatus
  );


  Blynk.virtualWrite(
    VPIN_HR_STATUS,
    hrStatus
  );


  Blynk.virtualWrite(
    VPIN_SPO2_STATUS,
    spo2Status
  );


  Blynk.virtualWrite(
    VPIN_TEMP_STATUS,
    tempStatus
  );


  Blynk.virtualWrite(
    VPIN_FALL_STATUS,
    fallStatus
  );


  Blynk.virtualWrite(
    VPIN_GPS_STATUS,
    gpsStatus
  );


  String terminal =
    "HR:" +
    String(
      heartRate,
      0
    )

    +

    " SpO2:" +
    String(
      spo2,
      0
    )

    +

    " Temp:" +
    String(
      bodyTemperature,
      1
    )

    +

    " Vitals:" +
    vitalsStatus;


  Blynk.virtualWrite(
    VPIN_TERMINAL,
    terminal
  );
}


// ============================================================
// SETUP
// ============================================================

void setup() {

  Serial.begin(
    115200
  );


  delay(500);


  Serial.println();

  Serial.println(
    "================================"
  );

  Serial.println(
    "SMART HEALTH WATCH"
  );

  Serial.println(
    "STARTING..."
  );

  Serial.println(
    "================================"
  );


  Wire.begin(
    I2C_SDA,
    I2C_SCL
  );


  Wire.setClock(
    SLOW_I2C_CLOCK
  );


  u8g2.begin();


  u8g2.clearBuffer();


  u8g2.setFont(
    u8g2_font_helvB10_tf
  );


  const char* startup =
    "SMART HEALTH";


  int startupWidth =
    u8g2.getStrWidth(
      startup
    );


  u8g2.drawStr(
    (128 - startupWidth) / 2,
    28,
    startup
  );


  u8g2.setFont(
    u8g2_font_6x10_tf
  );


  const char* watch =
    "WATCH";


  int watchWidth =
    u8g2.getStrWidth(
      watch
    );


  u8g2.drawStr(
    (128 - watchWidth) / 2,
    46,
    watch
  );


  u8g2.sendBuffer();


  Wire.setClock(
    SLOW_I2C_CLOCK
  );


  if (
    mlx.begin(
      0x5A,
      &Wire
    )
  ) {

    mlxReady =
      true;


    Serial.println(
      "MLX90614 connected."
    );
  }

  else {

    mlxReady =
      false;


    Serial.println(
      "MLX90614 NOT FOUND."
    );
  }


  Wire.setClock(
    SLOW_I2C_CLOCK
  );


  if (
    mpu.begin()
  ) {

    mpuReady =
      true;


    mpu.setAccelerometerRange(
      MPU6050_RANGE_8_G
    );


    mpu.setGyroRange(
      MPU6050_RANGE_500_DEG
    );


    mpu.setFilterBandwidth(
      MPU6050_BAND_21_HZ
    );


    Serial.println(
      "MPU6050 connected."
    );
  }

  else {

    mpuReady =
      false;


    Serial.println(
      "MPU6050 NOT FOUND."
    );
  }


  Serial.print(
    "Checking MAX30100..."
  );


  Wire.setClock(
    PULSE_I2C_CLOCK
  );


  poxReady =
    pox.begin();


  if (
    poxReady
  ) {

    Serial.println(
      "SUCCESS"
    );


    pox.setOnBeatDetectedCallback(
      onBeatDetected
    );


    pox.shutdown();
  }

  else {

    Serial.println(
      "FAILED"
    );
  }


  Wire.setClock(
    SLOW_I2C_CLOCK
  );


  GPSSerial.begin(
    GPS_BAUD,
    SERIAL_8N1,
    GPS_RX_PIN,
    GPS_TX_PIN
  );


  Serial.println(
    "GPS serial started."
  );


  GSMSerial.begin(
    GSM_BAUD,
    SERIAL_8N1,
    GSM_RX_PIN,
    GSM_TX_PIN
  );


  Serial.println(
    "GSM serial started."
  );


  pinMode(
    SOS_BUTTON_PIN,
    INPUT_PULLUP
  );


  attachInterrupt(
    digitalPinToInterrupt(
      SOS_BUTTON_PIN
    ),
    sosInterrupt,
    FALLING
  );


  WiFi.mode(
    WIFI_STA
  );


  WiFi.begin(
    WIFI_SSID,
    WIFI_PASSWORD
  );


  Blynk.config(
    BLYNK_AUTH_TOKEN
  );


  Serial.println(
    "WiFi connection started in background."
  );


  configTime(
    4 * 3600,
    0,
    "pool.ntp.org",
    "time.nist.gov"
  );


  Serial.println(
    "Time synchronization started."
  );


  careLinkUploader.begin();


  triggerWatchAlert(
    "SYSTEM READY",
    "Watch online",
    "Monitoring started",
    3000
  );


  Serial.println();

  Serial.println(
    "Type F in Serial Monitor"
  );


  Serial.println(
    "for safe fall-display test."
  );
}


// ============================================================
// LOOP
// ============================================================

void loop() {

  runActivityStage();

  runVitalsStage();

  runHomeStage();
}

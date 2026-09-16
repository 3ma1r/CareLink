# CareLink · Stage 4

CareLink is a responsive React, TypeScript, Vite and Supabase caregiver PWA. Stage 4 connects the existing NodeMCU-32S wearable firmware to the deployed Stage 3 ingestion endpoint and shows the paired device's real measurements and GPS fixes. Stages 1–3 remain intact: caregiver authentication, patient ownership, secure device provisioning and pairing, RLS, idempotent ingestion, PWA behavior, themes, sensor screens, Blynk, SOS/SMS and fall detection.

## Web application

Requires Node.js 22.12+ and npm.

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

The browser `.env` contains only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Never put a service-role key, device credential or pairing code in a `VITE_*` variable. Auth uses persisted PKCE sessions. Browser roles can select only the device and measurements related to their owned patient; they cannot ingest readings or access credential hashes.

The shared `DeviceProvider` fetches up to 2,000 measurements from the last 30 days and separately fetches the latest row as a fallback. It refreshes once per minute only while the tab is visible and online, and refreshes when the tab becomes visible or the browser reconnects. Dashboard, History and Location map database rows into the established chart and GPS models. A paired device with no measurements shows honest empty states. The sample adapter and demo controls are enabled only in test builds, so production never combines sample readings with wearable readings.

## Backend contract

The deployed `device-ingest` Edge Function accepts HTTPS `POST` requests with:

```text
Content-Type: application/json
x-carelink-device-id: CL-XXXXXXXXXXXX
Authorization: Device <64-character credential>
```

The body contains `firmware_version` and one to ten `measurements`. Each measurement uses a durable `message_id`, UTC `measured_at`, nullable `heart_rate`, `spo2`, `sensor_temperature` and `movement`, quality (`good`, `unstable` or `missing`), plus optional valid `latitude`, `longitude` and `gps_fix_at`. The server validates ranges, rejects stale/future timestamps and deduplicates `(device_id, message_id)`. Retried packets retain their original ID and measurement time.

The Stage 2 and Stage 3 database definitions and checks remain in `supabase/migrations` and `supabase/tests`. Hosted functions are in `supabase/functions`. `ALLOWED_ORIGIN=http://localhost:3000` is configured on the existing CareLink project.

## Trusted provisioning and pairing

1. On a trusted administrator machine, copy `.env.provisioning.example` to ignored `.env.provisioning.local` and set its privileged provisioning values.
2. Run `npm run device:provision`.
3. Securely record the one-time displayed device ID, permanent device credential and pairing code. The credential cannot be recovered later.
4. Copy `firmware/CareLinkWearable/secrets.example.h` to ignored `secrets.h`. Put only the device ID and permanent credential there with the Wi-Fi, Blynk and caregiver phone values. Put no Supabase user, publishable or service-role key on the wearable.
5. Compile and upload `firmware/CareLinkWearable` to the physical NodeMCU-32S.
6. Sign into CareLink as the caregiver.
7. Complete patient setup if the account has no patient.
8. Open **Pair wearable** and enter the same device ID and unused temporary pairing code. Codes expire after 30 minutes by default and lock after five incorrect attempts.
9. If the device has not uploaded, confirm the UI says **Paired — awaiting first connection**.
10. Power the wearable and confirm serial output shows time synchronization, queueing and an HTTP 200 upload.
11. Verify Profile has distinct **Last contact** and **Last measured** values and Dashboard, History and Location show the real packet.
12. Attempt the original pairing code again only in the controlled verification flow and confirm it cannot be reused.

Rotate a credential by unpairing and running trusted provisioning again. Unpairing preserves historical rows but revokes the credential and removes caregiver access. Reflash `secrets.h` with the new credential before reconnecting. The Stage 3 simulator remains available for backend diagnosis via `npm run device:simulate`; it is not used by the normal production UI.

## Firmware build and libraries

The sketch targets **NodeMCU-32S** using Arduino ESP32 core **2.0.17**. Stage 4 was compiled with Arduino CLI **1.5.1** and these installed libraries:

- Blynk 1.3.5
- MAX30100lib 1.2.1
- Adafruit MLX90614 Library 2.1.6
- Adafruit MPU6050 2.2.9
- U8g2 2.36.19
- TinyGPSPlus 1.0.3
- ArduinoJson 7.4.3

Arduino Library Manager also installs Adafruit BusIO 1.17.4, Adafruit Unified Sensor 1.1.15, Adafruit GFX Library 1.12.6 and Adafruit SSD1306 2.5.17. BlynkNcpDriver 0.7.0 is installed with Blynk.

The repository-local CLI setup used for verification is ignored. Equivalent commands are:

```powershell
arduino-cli core update-index --additional-urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli core install esp32:esp32@2.0.17
arduino-cli lib install Blynk@1.3.5 MAX30100lib@1.2.1 "Adafruit MLX90614 Library@2.1.6" "Adafruit MPU6050@2.2.9" U8g2@2.36.19 TinyGPSPlus@1.0.3 ArduinoJson@7.4.3
arduino-cli compile --fqbn esp32:esp32:nodemcu-32s firmware/CareLinkWearable
arduino-cli upload --fqbn esp32:esp32:nodemcu-32s --port COMx firmware/CareLinkWearable
arduino-cli monitor --port COMx --config baudrate=115200
```

The actual firmware keeps these hardware assignments: I²C SDA GPIO 21 and SCL GPIO 22 for MAX30100, MLX90614, MPU-6050 and SH1106 OLED; GPS UART1 RX GPIO 4 and TX GPIO 5 at 9,600 baud; GSM UART2 RX GPIO 16 and TX GPIO 17 at 115,200 baud; SOS button GPIO 0 with pull-up and falling-edge interrupt. Replace `COMx` with the board port. Save the working sketch and private `secrets.h` before flashing the board.

The firmware obtains UTC from NTP and refuses to queue a measurement until the clock is plausible, avoiding false epoch timestamps. Each completed vitals cycle gets a random UUID v4 before it is stored. LittleFS retains an oldest-first NDJSON queue across resets; it holds 64 readings, uploads batches of five, removes rows only after the server confirms every item as inserted or duplicate, and records/logs overflow drops. Failed requests keep their rows and use capped exponential backoff with jitter; authentication failures wait 15 minutes. HTTPS uses `WiFiClientSecure` with a CA root and never calls `setInsecure()` or pins a leaf certificate.

On 2026-09-15 the deployed host presented `supabase.co → Google Trust Services WE1 → GTS Root R4 → GlobalSign Root CA`. The tracked GlobalSign root expires 2028-01-28. Re-check the live chain and update `carelink_root_ca.h` before that date or if TLS validation begins failing.

The device credential is stored in ESP32 flash in this controlled capstone prototype. A production medical device should use secure hardware storage, secure boot and flash encryption with a managed rotation process.

Uploads run in a FreeRTOS task pinned away from the Arduino loop. The existing sensor stages continue servicing `pox.update()`, GPS, OLED, fall detection, SOS and Blynk. Wi-Fi connection starts without the former eight-second setup wait. No board was flashed and no physical sensor behavior is claimed until verified on the actual wearable.

## Troubleshooting

- **Clock is not synchronized:** confirm Wi-Fi and UDP/NTP access. Measurements are intentionally not timestamped or queued before valid time is available.
- **HTTP 401:** confirm the device ID and credential came from the same latest provisioning run and that the device is active. Do not print the credential.
- **TLS failure:** confirm the wall clock first, then inspect the endpoint's current certificate chain and update the trusted root if it changed. Never use `setInsecure()` as a workaround.
- **Queue grows:** inspect Wi-Fi, TLS and HTTP serial messages. The oldest reading is dropped only after the persistent queue reaches 64 rows; a persistent drop counter is printed at boot.
- **Paired but no readings:** check firmware serial logs and Profile's Last contact/Last measured fields. The UI does not replace missing real rows with samples.
- **No map marker:** GPS fields are sent only for a recent, finite, non-zero fix within valid latitude/longitude ranges.

## Verification

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
npm audit
```

The web tests use an isolated test-mode adapter. Unit tests cover real measurement mapping, null/quality behavior and GPS fix selection. Database tests cover pairing, RLS, ingestion, null preservation, retry deduplication and revocation. Physical verification still requires flashing the real NodeMCU-32S, observing sensor cadence and reset recovery, interrupting Wi-Fi to exercise the LittleFS queue, and confirming delayed rows arrive once each with their original timestamps.

Use this physical end-to-end checklist after provisioning:

1. Pair the device and confirm the one-time pairing code cannot be reused.
2. Before the first upload, confirm **Paired — awaiting first connection**.
3. Watch the MAX30100, other sensor and OLED diagnostics continue while HTTPS runs.
4. Confirm one real row, its original `measured_at`, and separate Last contact/Last measured values in the app.
5. Resend the same queued record and confirm the database still contains one `(device_id, message_id)` row.
6. Disconnect Wi-Fi, capture several cycles, restart once, then reconnect and verify oldest-first delivery with unchanged IDs/timestamps.
7. Wait past two minutes and confirm offline status, then upload and confirm online recovery.
8. Confirm missing sensor values remain unavailable, invalid/missing GPS produces no `0,0`, and a valid fix appears with its own time.
9. Using a separate caregiver account, confirm RLS denies the device and measurements.
10. Unpair, confirm the credential can no longer ingest, then reprovision before using the physical device again.

## Stage 5 remains

AI analysis, automatic alert generation, push notifications, caregiver notification delivery and production reporting are intentionally deferred. Stage 4 adds no AI inference, alert automation or notification sending.

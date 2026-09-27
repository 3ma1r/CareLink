# CareLink · Stage 5B

CareLink is a responsive React, TypeScript, Vite and Supabase caregiver PWA. Stage 5B adds caregiver-controlled Web Push delivery for new Stage 5A alerts while preserving authentication, patient ownership, secure device pairing, deterministic analysis, RLS, idempotent ingestion, offline PWA behavior, themes and the existing wearable flow.

## Stage 5A alert architecture

The device-authenticated Edge Function validates a packet and calls the existing privileged ingestion RPC. Newly inserted measurements are collected and analyzed in chronological order inside the same database transaction; acknowledged duplicate messages are not analyzed again. The private analyzer reads versioned rules from `private.care_alert_rule_definitions` and writes `public.care_alerts`. Browser roles cannot call the analyzer or insert alerts.

The global version 1 rules mirror the thresholds already used by the firmware and web status labels:

| Rule                    | Trigger                                                     | Severity |
| ----------------------- | ----------------------------------------------------------- | -------- |
| Low heart rate          | Heart rate below 50 bpm                                     | High     |
| High heart rate         | Heart rate above 120 bpm                                    | High     |
| Low SpO₂                | SpO₂ below 90%                                              | Critical |
| Low sensor temperature  | Sensor temperature below 35°C                               | Moderate |
| High sensor temperature | Sensor temperature above 38°C                               | High     |
| Confirmed fall          | Authenticated packet explicitly sets `confirmed_fall: true` | Critical |

Vital rules require the two latest good-quality values for that metric to remain abnormal within 15 minutes. Unstable and missing values remain visible but never confirm, trigger or resolve a health alert. A quality problem in one metric does not block another good-quality metric. The analyzer falls back to the legacy row-level `quality` only for historical-format packets whose per-metric quality fields are absent.

An open vital alert is updated with a newer `last_seen_at` and incremented occurrence count instead of creating repeated records. After an alert closes, the same patient/device/rule has a 60-minute suppression window. Two later good-quality normal values within 15 minutes auto-resolve a vital alert. Falls trigger immediately once per newly accepted source measurement, are idempotent on retry, and never auto-resolve.

Alerts start `active`, may be `acknowledged` by the owning caregiver, and may be `resolved`. Acknowledgement records the authenticated caregiver and server time. History is preserved. `care_alerts` has RLS plus explicit grants: authenticated caregivers can select alerts for their patient and update only the `status` column; anonymous users and browser inserts have no access. The update policy has both `USING` and `WITH CHECK` ownership predicates, while a database trigger owns acknowledgement and resolution metadata.

The Alerts page loads real RLS-filtered records newest-first, exposes acknowledgement/resolution, and shows values, reasons, lifecycle, measurement time and creation time. Dashboard shows the active count and most important recent active alert; History shows alert event lines. These records refresh through the existing controlled one-minute, visibility and reconnect cycle. Test builds retain isolated sample alerts only for Playwright presentation scenarios; production has no sample fallback.

The current physical sketch keeps a confirmed fall only in its in-memory `fallDetected` state and does not put that state in its Stage 4 upload payload. Stage 5A accepts and safely tests the optional authenticated `confirmed_fall` field, but no firmware was changed or flashed, so physical fall-to-PWA delivery remains unavailable until a separately authorized firmware stage transmits that existing state.

## Stage 5B push architecture

Profile contains the notification control. Permission is requested only after the caregiver presses **Enable notifications**. CareLink distinguishes unsupported browsers, iPhone/iPad browser tabs that must first be installed to the Home Screen, permission not requested, denied permission, a registered subscription, an expired/unregistered subscription and temporary service errors. The UI reports enabled only when the browser has a current `PushSubscription` and the authenticated backend confirms that exact endpoint is active. Disabling deactivates the caregiver-owned server row and then unsubscribes the browser. The explicit logout flow performs the same cleanup before ending the session.

The custom Workbox service worker retains the generated shell precache, update flow and navigation fallback. A `push` event always shows the privacy-safe title **CareLink health alert** and body **A new health alert needs your attention.** It includes no patient, alert, reading, credential or token data. Clicking focuses an existing same-origin window or opens `/alerts`; authentication and RLS still protect the details.

`public.push_subscriptions` stores the caregiver ID, endpoint, Web Push encryption public material, an optional generic browser label and delivery health timestamps/state. It has forced RLS. Authenticated users can select or delete only their own rows; anonymous users have no privileges. Registration goes through `push-subscriptions`, which accepts exact allowed origins, answers preflight before authentication, validates the caregiver access token inside the Function and uses server privileges only after establishing the user ID. The browser receives neither a Supabase privileged key nor the VAPID private key.

An insert-only trigger on `care_alerts` creates one private outbox row per active subscription only when a genuinely new active alert is inserted. The unique `(alert_id, subscription_id)` constraint prevents duplicate delivery. Updates to occurrence count, acknowledgement, resolution and `last_seen_at` do not enqueue. Adding a subscription does not backfill historical alerts. All Stage 5A alert types use the same route, including a backend confirmed-fall alert; the current firmware limitation described above still applies.

The scheduled `push-worker` atomically claims due rows with `FOR UPDATE SKIP LOCKED` and five-minute leases, then performs standards-based RFC 8291 `aes128gcm` payload encryption and VAPID signing with Web Crypto. Successful delivery records its HTTP status and time. Temporary network, rate-limit and server failures use exponential delays starting at 30 seconds, capped at one hour, with five total attempts. HTTP 404/410 permanently fails the delivery and deactivates the endpoint. The worker endpoint accepts only a constant-time checked internal bearer secret. Supabase Cron runs once per minute through `pg_cron` and `pg_net`; its database function reads the worker URL and matching secret from Vault at invocation time. It does nothing while either Vault entry is absent. This follows the current [Supabase scheduled Functions guidance](https://supabase.com/docs/guides/functions/schedule-functions).

### Push configuration

No production web origin is present in this repository. The deployed caregiver Function therefore currently accepts the existing exact `http://localhost:3000` origin through `ALLOWED_ORIGIN`; it never uses a wildcard. Before production use, set `ALLOWED_ORIGINS` to a comma-separated list containing localhost and the exact deployed HTTPS origin. Do not add a guessed preview or production URL.

Required browser and Edge Function configuration names are listed with blank values in `.env.example` and `supabase/functions/.env.example`:

- Browser: `VITE_CARELINK_VAPID_PUBLIC_KEY`
- Edge Functions: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_WORKER_SECRET`, `ALLOWED_ORIGINS`
- Supabase Vault: `CARELINK_PUSH_WORKER_URL`, `CARELINK_PUSH_WORKER_SECRET`

Generate one P-256 VAPID pair with a trusted Web Push tool. Put the same public key in the browser build and Edge secrets. Put the private key only in Edge Function secrets. `VAPID_SUBJECT` must be a monitored `mailto:` or HTTPS contact. Use the exact dedicated Function URL for the Vault worker URL, and store the same high-entropy worker value in the Edge `PUSH_WORKER_SECRET` and Vault `CARELINK_PUSH_WORKER_SECRET`. Do not commit, echo, log or place either private value in a `VITE_*` variable. Setting the Edge secrets does not require another Function deployment, but changing the browser public key requires a new web build.

Rotating VAPID keys invalidates existing browser subscriptions: deploy the new public key and Edge key pair together, then have caregivers enable notifications again. To rotate the worker secret, update the Edge secret and Vault value together; the scheduler remains safe and dormant if they temporarily differ. Revoke the old values after verifying the new configuration.

Android installed PWAs and compatible desktop browsers support this flow when served from HTTPS (localhost is the development secure-context exception). On iOS/iPadOS 16.4 or later, add CareLink to the Home Screen, launch it from that icon, sign in and then enable notifications. A normal Safari tab is intentionally shown installation guidance instead of a permission prompt.

The Vite development server does not install the production service worker. For localhost push testing, configure the public key, run `npm run build`, then serve the production output on the already allowed origin with `npm run preview -- --port 3000`. Offline caching and notification handling should be verified from that preview. A real mobile device cannot use another computer's `localhost`; use the final HTTPS deployment for physical Android and iPhone tests.

Manual mobile verification after the missing configuration is supplied:

1. Deploy the frontend over HTTPS with the public VAPID key and add its exact origin to `ALLOWED_ORIGINS`.
2. Add the worker URL and internal worker secret to Vault, and set the matching Edge secrets plus the VAPID pair and subject.
3. On Android, install/open the PWA, sign in, open Profile and press **Enable notifications**; accept the browser prompt.
4. On iPhone/iPad 16.4+, use Share → **Add to Home Screen**, launch that installed icon, sign in, open Profile and press **Enable notifications**.
5. Confirm Profile reports enabled, close or background the PWA, and create one controlled new Stage 5A alert through the existing authenticated ingestion test path.
6. Confirm exactly one generic system notification arrives on each enabled device, opens `/alerts`, and reveals details only after authentication.
7. Acknowledge and resolve the alert and confirm neither action creates another system notification.
8. Disable notifications and confirm the browser no longer receives later alerts. Sign out and verify protected alert data cannot be opened from the notification route.

## Web application

Requires Node.js 22.12+ and npm.

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

The browser `.env` contains `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and the safe public `VITE_CARELINK_VAPID_PUBLIC_KEY`. Never put a service-role key, VAPID private key, worker secret, device credential or pairing code in a `VITE_*` variable. Auth uses persisted PKCE sessions. Browser roles can select only the device, measurements, alerts and push subscriptions related to their owned account; they cannot ingest readings or access credential hashes.

The shared `DeviceProvider` fetches up to 2,000 measurements from the last 30 days and separately fetches the latest row as a fallback. It refreshes once per minute only while the tab is visible and online, and refreshes when the tab becomes visible or the browser reconnects. Dashboard, History and Location map database rows into the established chart and GPS models. A paired device with no measurements shows honest empty states. The sample adapter and demo controls are enabled only in test builds, so production never combines sample readings with wearable readings.

## Backend contract

The deployed `device-ingest` Edge Function accepts HTTPS `POST` requests with:

```text
Content-Type: application/json
x-carelink-device-id: CL-XXXXXXXXXXXX
Authorization: Device <64-character credential>
```

The body contains `firmware_version` and one to ten `measurements`. Each measurement uses a durable `message_id`, UTC `measured_at`, nullable `heart_rate`, `spo2`, `sensor_temperature` and `movement`, quality (`good`, `unstable` or `missing`), plus optional valid `latitude`, `longitude`, `gps_fix_at` and boolean `confirmed_fall`. The server validates ranges and types, rejects stale/future timestamps and deduplicates `(device_id, message_id)`. Retried packets retain their original ID and measurement time.

The Stage 2–5B database definitions and checks remain in `supabase/migrations` and `supabase/tests`. Hosted functions are in `supabase/functions`. `ALLOWED_ORIGIN=http://localhost:3000` is configured on the existing CareLink project; use `ALLOWED_ORIGINS` when the exact production origin becomes known.

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

The safe alert-engine fixture is `supabase/tests/stage_5a_alerts.sql`. The Stage 5B fixture is `supabase/tests/stage_5b_push.sql`; it covers no backfill, ownership/RLS, multiple subscriptions, exact-once enqueueing, lifecycle non-resends, atomic leases, delivery success, retry backoff, retry bounds and 410 invalidation. Both create isolated records inside transactions and roll back. External push HTTP is mocked in unit tests, so a passing suite does not claim a notification reached a physical phone.

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

## Later stages

Stage 5C remains responsible for AI-assisted analysis, personalized caregiver-approved thresholds/baselines and reporting. Stage 5B performs no AI or machine-learning inference.

All thresholds and alerts are prototype monitoring aids. They are not medically validated diagnostic criteria and do not establish a diagnosis.

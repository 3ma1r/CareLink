# CareLink · Personalized Insights

CareLink is a responsive React, TypeScript, Vite and Supabase caregiver PWA. AI Part 1 provides explainable, quality-aware personalized anomaly detection; AI Part 2 now turns verified facts into deterministic caregiver summaries. Authentication, patient ownership, secure device pairing, deterministic safety alerts, Web Push, RLS, idempotent ingestion, offline PWA behavior, themes and the existing wearable flow remain independent.

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

The permanent production origin is `https://carelinkk.netlify.app`. The deployed caregiver Function accepts that origin and `http://localhost:3000` through the exact `ALLOWED_ORIGINS` list; it never uses a wildcard. The VAPID pair, worker secret and matching Vault values are configured in the dedicated CareLink project without placing private values in the repository.

Required browser and Edge Function configuration names are listed with blank values in `.env.example` and `supabase/functions/.env.example`:

- Browser: `VITE_CARELINK_VAPID_PUBLIC_KEY`
- Edge Functions: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_WORKER_SECRET`, `ALLOWED_ORIGINS`
- Supabase Vault: `CARELINK_PUSH_WORKER_URL`, `CARELINK_PUSH_WORKER_SECRET`

Generate one P-256 VAPID pair with a trusted Web Push tool. Put the same public key in the browser build and Edge secrets. Put the private key only in Edge Function secrets. `VAPID_SUBJECT` must be a monitored `mailto:` or HTTPS contact. Use the exact dedicated Function URL for the Vault worker URL, and store the same high-entropy worker value in the Edge `PUSH_WORKER_SECRET` and Vault `CARELINK_PUSH_WORKER_SECRET`. Do not commit, echo, log or place either private value in a `VITE_*` variable. Setting the Edge secrets does not require another Function deployment, but changing the browser public key requires a new web build.

Rotating VAPID keys invalidates existing browser subscriptions: deploy the new public key and Edge key pair together, then have caregivers enable notifications again. To rotate the worker secret, update the Edge secret and Vault value together; the scheduler remains safe and dormant if they temporarily differ. Revoke the old values after verifying the new configuration.

Android installed PWAs and compatible desktop browsers support this flow when served from HTTPS (localhost is the development secure-context exception). On iOS/iPadOS 16.4 or later, add CareLink to the Home Screen, launch it from that icon, sign in and then enable notifications. A normal Safari tab is intentionally shown installation guidance instead of a permission prompt.

The Vite development server does not install the production service worker. For localhost push testing, configure the public key, run `npm run build`, then serve the production output on the already allowed origin with `npm run preview -- --port 3000`. Offline caching and notification handling should be verified from that preview. A real mobile device cannot use another computer's `localhost`; use the final HTTPS deployment for physical Android and iPhone tests.

Safe mobile regression check for the configured production deployment:

1. On Android, install/open the PWA, sign in, open Profile and press **Enable notifications**; accept the browser prompt.
2. On iPhone/iPad 16.4+, use Share → **Add to Home Screen**, launch that installed icon, sign in, open Profile and press **Enable notifications**.
3. Confirm Profile reports enabled, close or background the PWA, and create one controlled new Stage 5A alert through the existing authenticated ingestion test path.
4. Confirm exactly one generic system notification arrives on each enabled device, opens `/alerts`, and reveals details only after authentication.
5. Acknowledge and resolve the alert and confirm neither action creates another system notification.
6. Disable notifications and confirm the browser no longer receives later alerts. Sign out and verify protected alert data cannot be opened from the notification route.

## AI Part 1 personalized-analysis architecture

Personalized Insights are deterministic statistical decision support. They do not call an LLM or external AI service, do not send health data outside the dedicated Supabase project, and do not predict a disease, fall, hospitalization or treatment. The fixed Stage 5A rules remain the authoritative safety path and continue to work when no personal baseline exists. An insight never creates, acknowledges, resolves, delays or suppresses a health alert and never creates a push-delivery row.

The active configuration is stored as `carelink_personalized_mad_v1`. Each metric learns independently from the patient's own event timestamps in UTC:

| Constant | Version 1 value |
| --- | --- |
| Rolling baseline window | 14 days |
| Baseline exclusion immediately before evaluation | 15 minutes |
| Minimum baseline evidence | 30 good readings |
| Minimum observation spread | 3 distinct UTC days and 48 hours of coverage |
| Recent evaluation window | 15 minutes |
| Recent evidence | Latest 3–5 good readings |
| Unusual robust-score threshold | 3.5 |
| Minimum directional consistency | 75% |
| Resolution evidence | 3 later close readings within 30 minutes |
| Resolution robust-score threshold | 1.5 |

Only finite, non-null, good-quality values inside the versioned sensor-valid ranges are candidates: heart rate 30–220 bpm, SpO₂ 70–100%, and sensor temperature 25–45°C. A historical row whose independent quality field is null uses the legacy row-level quality; current rows use the independent per-metric field. Missing, unstable and out-of-range values are never changed to zero. GPS and upload time do not participate.

For candidate values `x`, the baseline center is `median(x)`. Dispersion is `MAD = median(abs(x - median(x)))`, and the robust scale is `max(1.4826 × MAD, noise floor)`. Noise floors are 2 bpm for heart rate, 1 percentage point for SpO₂, and 0.2°C for temperature. A zero-MAD baseline therefore remains safe and finite. The recent score is `abs(recent median - baseline median) / robust scale`.

Statistical distance alone is insufficient. Version 1 also requires an absolute change of at least 10 bpm, 3 SpO₂ percentage points, or 0.5°C and directionally consistent repeated evidence. This prevents tiny low-noise fluctuations from being labelled unusual. A single outlier cannot move either median enough to trigger the sustained-change rule. Confidence is `low`, `moderate` or `high` based on baseline volume, day coverage, recent sample count and directional consistency; it is not a probability of illness.

The current 15-minute evaluation window is excluded from its own baseline, preventing leakage. Measurements during deterministic-alert periods and personalized-anomaly periods are excluded from later training, so a continuing abnormal condition cannot immediately redefine itself as usual. The rolling median/MAD changes only as good historical candidates enter or leave the bounded 14-day window. Chronological, idempotent processing plus fixed versioned constants makes those gradual updates reproducible.

`public.personalized_baselines` exposes per-metric learning progress and the latest evaluation state. `public.personalized_insights` stores active/resolved lifecycle records with direction, evaluation window, sample counts, medians, deviation, score, confidence, version, first/last source IDs and occurrence count. The private evaluation audit has one unique `(measurement, metric, version)` row. A partial unique index permits only one active insight per device, metric and version. Repeated evidence updates that row; three later good readings close to baseline resolve it. Missing or unstable readings can neither create nor resolve an insight.

Historical good measurements are used once to calculate readiness at deployment, but deployment creates no historical evaluations or insights. Only measurements inserted after the version activation timestamp are eligible for new evaluations. The current implementation-time aggregate inspection found 202 measurements over seven UTC days at an approximately 57-second median interval. Explicit independent quality had 6 good HR, 33 good SpO₂ and 79 good temperature values; the safe legacy fallback found 9, 36 and 82 valid good values across six, six and seven days before leakage and alert-period exclusions. The deployed baseline snapshot retains 8 HR values across five days, 35 SpO₂ values across five days, and 14 temperature values across three days. SpO₂ is ready; HR and temperature remain `learning`. Temperature loses most candidates because an acknowledged deterministic temperature-alert period is deliberately excluded. These counts describe sensor-data readiness, not medically normal health.

Analysis runs server-side once per minute through a direct Supabase Cron database-function call. It performs no network request and adds no Edge Function, Vault value or secret. A bounded run handles at most 100 pending measurements in chronological event-time order. An advisory transaction lock prevents overlapping workers, unique constraints make reruns safe, and each measurement is retried if analysis fails. Because the analyzer is scheduled separately and no measurement trigger was added, analysis failure cannot reject or delay a valid ESP32 ingestion. Expected insight latency is up to about one minute plus database execution time.

The analysis functions live in `private`, use `SECURITY DEFINER` only for the scheduled trusted calculation, pin `search_path` to empty, schema-qualify referenced objects, and revoke execution from `PUBLIC`, `anon`, `authenticated` and `service_role`. The two exposed tables have forced RLS and grant authenticated caregivers read-only access only through ownership of the linked patient. Browser users cannot insert or alter baselines, scores or insight lifecycle. Anonymous and cross-caregiver reads are denied. This follows the current Supabase guidance for [database-function security](https://supabase.com/docs/guides/database/functions), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) and [direct database Cron jobs](https://supabase.com/docs/guides/cron/quickstart).

Dashboard presents `learning`, `usual`, `unusual` and `insufficient_recent_data` separately for each metric. Technical medians, MAD, robust scores and algorithm version stay behind accessible disclosure controls. The main message uses plain language, explicitly distinguishes personalized insights from fixed safety alerts, and states that these observed patterns are not medically validated ranges and do not replace professional medical advice. Production never substitutes sample insights; synthetic presentation states exist only in the test build.

Safe manual verification uses future real readings only: open Dashboard and confirm each metric's stored progress; wait for three good post-deployment readings within 15 minutes; verify that ordinary variation remains usual; and review any naturally created insight against the underlying History rows without manufacturing data in the real patient's record. A resolved insight can reflect three later good readings close to baseline **or** an opposite-direction unusual change; the summary only calls it a return when the latest stored usual evaluation matches the resolution. Do not alter sensor values or fixed alert thresholds to force a production result.

Limitations: the real dataset is small, HR has too few good samples, readings are unevenly distributed, sensor temperature is a wearable sensor measurement rather than a clinical core-temperature measurement, and the constants are prototype engineering settings rather than clinically validated criteria. Neither AI Part 1 nor Part 2 changes the fixed alert rules. Physical confirmed-fall upload remains deferred until the enclosure and separately authorized firmware work are complete.

## AI Part 2 deterministic caregiver summaries

The Dashboard's **Personalized Health Summary** presents rolling previous 24-hour and 7-day windows. `src/summaries/summary.ts` is the versioned, pure TypeScript rule source (`carelink_summary_v1`). It combines the caregiver-owned wearable readings, Part 1 baseline readiness and latest evaluations, active and resolved personalized insights, and independently stored fixed-rule health alerts. It does not run or alter Part 1, modify alerts, or send push notifications. All window comparisons use UTC; displayed timestamps use the existing Muscat/GST formatter.

The normal 30-day chart query is capped and cannot prove seven-day coverage. A separate, paged seven-day measurement query fetches the complete window; active and in-window resolved alert/insight records are fetched separately, with a fail-closed 1,000-record bound per event category. A measurement window over 10,000 rows or an event category at the bound produces a summary error instead of a partial conclusion. The browser calculates only from a coherent successful refresh and filters records again by the selected patient and device. The one-minute visible/online refresh updates it automatically. A failed refresh or offline state retains the prior in-session summary only with an explicit stale indicator and last-successful-update time. A new account or device does not reuse a previous patient's summary. Test-mode samples are never substituted into a production summary.

Each metric counts finite, accepted, **good-quality** readings independently. The accepted-value filters mirror the versioned Part 1 metric config (heart rate 30–220 bpm, SpO₂ 70–100%, sensor temperature 25–45 °C); a unit test checks them against the SQL migration. Unstable values stay visible elsewhere but cannot determine the summary trend. Missing or unusable quality is a coverage notice, not a medical warning. A descriptive trend needs at least three good readings in **each half** of the selected UTC period, at least 10% period time span within each half, and at least 50% total period span. Early and late medians are compared; a direction is named only when their difference exceeds both twice the sensor-resolution floor (1 bpm, 1% SpO₂, 0.1 °C) and three times the pooled median absolute deviation around the half-window medians. Otherwise the summary says “little change” when evidence is adequate, or “insufficient reliable data.” These are presentation-only trend criteria, not Part 1 anomaly, readiness, alert or resolution thresholds. A lone outlier cannot set the median direction.

Personalized changes describe deviation from a patient's established observed baseline; fixed-rule health alerts are separate lifecycle records. “Returned close to the personal baseline” is used only when a resolved insight's resolution time matches the latest stored `usual` Part 1 evaluation and no active insight remains for that metric. Other resolved insights are simply called resolved, because a reversal can also close an insight. No phrase asserts a return to a fixed normal health range. Main text is calm and non-diagnostic; technical counts and rule evidence are available in expandable details. Sensor temperature is not clinical core temperature. The summary is caregiver awareness support, not diagnosis or treatment advice.

All computation stays inside the authenticated browser session on already permitted RLS-protected data. No summary table, migration, Edge Function, external AI/LLM service, API key, usage fee, health-data telemetry, or external health-data request is required. There are no AI-generated notifications. Verify with `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, and `npm run test:e2e`; `src/summaries/summary.test.ts` covers rule and isolation cases. Manual production review should compare the summary with owned History, Insights and Alerts without creating artificial patient readings. Physical-device confirmation is a separate future verification step.

## Web application

### Splash and first-use introduction

Every fresh app load shows the dark CareLink splash while the existing Supabase provider restores or checks the session. The splash has a 180 ms minimum display and a 180 ms fade, then promptly releases the route when authentication is known; an offline or configuration failure goes to the existing status screen rather than trapping the user. The splash and two introduction screens use local SVG artwork, CSS motion, safe-area spacing and no internal app navigation. Reduced-motion preferences disable the nonessential animations. The launch manifest and initial theme color use the same dark navy as the splash; the existing service worker, precache, push and notification-click behavior are unchanged.

For a first visit without a session, `/` leads from splash to two introduction pages and then to the **existing** sign-in page. Continue advances to page two; Skip from either page finishes immediately. A valid restored session goes straight from splash to the Dashboard. A previously completed introduction is not replayed on later signed-out launches. Logout still uses the existing notification-disable and secure Supabase sign-out path, then routes directly to sign-in. Direct protected routes, confirmation callbacks and password recovery bypass the first-use redirect and continue through their existing guards. A signed-in caregiver can choose **View introduction** in Profile; replay keeps the session, and Skip or Back to profile returns to Profile. Browser Back leaves the replay for Profile.

Only `carelink-onboarding-completed-v1=complete` is stored locally. It contains no account, patient, health or credential data, is not user metadata, and survives logout and ordinary service-worker updates. If storage is restricted, the current visit still completes without crashing, but a later reload may show the introduction again. Clearing site data or reinstalling the PWA can likewise reset this local marker. No database, Edge Function, firmware or dependency change was needed for app entry. `src/entry/onboarding.test.ts` and `tests/entry.spec.ts` cover the marker, route flow, replay, storage restrictions, accessibility and responsive entry screens; run the verification commands below.

Requires Node.js 22.12+ and npm.

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

The browser `.env` contains `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and the safe public `VITE_CARELINK_VAPID_PUBLIC_KEY`. Never put a service-role key, VAPID private key, worker secret, device credential or pairing code in a `VITE_*` variable. Auth uses persisted PKCE sessions. Browser roles can select only the device, measurements, alerts and push subscriptions related to their owned account; they cannot ingest readings or access credential hashes.

The shared `DeviceProvider` fetches up to 2,000 measurements from the last 30 days for charting, the latest row as a fallback, deterministic alerts, read-only personalized baseline progress and personalized insights. Part 2 additionally fetches a complete rolling seven-day slice for summaries as described above. It refreshes once per minute only while the tab is visible and online, and refreshes when the tab becomes visible or the browser reconnects. Dashboard, History and Location map database rows into the established chart and GPS models. A paired device with no measurements shows honest empty states. The sample adapter and demo controls are enabled only in test builds, so production never combines sample readings or insights with wearable data.

## Backend contract

The deployed `device-ingest` Edge Function accepts HTTPS `POST` requests with:

```text
Content-Type: application/json
x-carelink-device-id: CL-XXXXXXXXXXXX
Authorization: Device <64-character credential>
```

The body contains `firmware_version` and one to ten `measurements`. Each measurement uses a durable `message_id`, UTC `measured_at`, nullable `heart_rate`, `spo2`, `sensor_temperature` and `movement`, quality (`good`, `unstable` or `missing`), plus optional valid `latitude`, `longitude`, `gps_fix_at` and boolean `confirmed_fall`. The server validates ranges and types, rejects stale/future timestamps and deduplicates `(device_id, message_id)`. Retried packets retain their original ID and measurement time.

The Stage 2–5B and AI Part 1 database definitions and checks remain in `supabase/migrations` and `supabase/tests`. Hosted functions are in `supabase/functions`. Personalized analysis adds no Edge Function and does not change ingestion, notification or CORS configuration.

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

The safe alert-engine fixture is `supabase/tests/stage_5a_alerts.sql`. The Stage 5B fixture is `supabase/tests/stage_5b_push.sql`; it covers no backfill, ownership/RLS, multiple subscriptions, exact-once enqueueing, lifecycle non-resends, atomic leases, delivery success, retry backoff, retry bounds and 410 invalidation. The AI Part 1 fixture is `supabase/tests/ai_part1_personalized_insights.sql`; it covers independent readiness, quality/range filters, time spread, leakage and alert-period exclusions, median/MAD and zero-MAD fallback, sustained higher/lower changes, absolute floors, lifecycle, idempotency, active-row concurrency constraints, RLS/privileges, fixed-alert preservation and absence of push delivery. All fixtures use isolated synthetic records inside transactions and roll back. External push HTTP is mocked in unit tests, so a passing suite does not claim a notification reached a physical phone.

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

Future work may include caregiver-reviewed export/reporting and physical-device validation. Physical confirmed-fall upload remains a separate, explicitly authorized firmware stage. AI-generated push notifications, disease prediction, treatment recommendations and silent threshold changes are not part of this implementation.

All thresholds and alerts are prototype monitoring aids. They are not medically validated diagnostic criteria and do not establish a diagnosis.

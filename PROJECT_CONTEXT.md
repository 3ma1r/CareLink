# CareLink project context

Prompt 2 is the internal caregiver presentation polish. The approved splash/onboarding, current top/mobile navigation, authentication/session handling, device ownership/pairing, ingestion, quality rules, GPS, AI Part 1/2 calculations, health-alert lifecycle and push delivery remain the existing implementations. Do not begin firmware or physical-fall work as part of this change.

Dashboard uses one Personalized Insights section with independently evaluated metric states, active changes and compact evidence disclosures. The summary is collapsed on entry; its mounted accessible disclosure retains the period selection without refetching. The existing provider manages data refresh and offline/stale states.

Profile has an unboxed caregiver header and a desktop information/settings split. One form contains caregiver, patient, emergency-contact and health-note fields. Settings contains saved appearance, real notification controls and introduction replay. Wearable details and masked identifier are disclosed on demand. Account retains secure logout. Small screens stack these sections in normal flow.

Temperature formatting is display-only: canonical degree-Celsius, one decimal, a preceding space, finite checks. Structured alert evidence replaces trust in historical malformed prose. No thresholds, stored numeric values, alert status or timestamps are changed. The summary rule file changes only its displayed formatter.

Reports are local, dynamically loaded jsPDF 4.2.1 documents. Authenticated paginated reads are scoped to the owned patient/device. A report has selected-period readings/quality, relevant or open alerts, personalized changes, and a clearly labelled existing seven-day summary. Explicit field selection keeps IDs/secrets/debug data out. Limits fail closed; production has no sample fallback. Report delivery is abandoned after owner/device changes or leaving History. On iOS a click-opened preview supports the native sharing interface; real-device validation remains necessary. The embedded existing DM Sans Latin font has limited script coverage.

Accessibility: semantic sections and fieldsets, keyboard disclosure controls, aria-expanded/controls, visible focus, labelled live feedback, theme tokens, natural scrolling, responsive single-column layouts, and reduced-motion handling. Regression matrix covers both themes from 320px through desktop, landscape and 200% CSS zoom.

Validation commands and audit details are in README. Docker's local engine was unavailable, so database fixtures were not run. Four inherited transitive audit findings remain for a separate dependency task. No database migrations, backend deployments, firmware changes, commits, pushes or deployments are part of Prompt 2.

## Manual verification with an existing account

1. Open the local production preview, sign in, and compare Dashboard metric states with existing patient data. Expand the summary, switch 24 hours/7 days, hide and reopen; confirm the choice is retained. Open evidence details.
2. Open Profile at desktop and phone sizes. Check all stored values, read-only email, theme, notification status and introduction replay. Save only intentional changes. Do not unpair or reprovision the wearable for this check.
3. Inspect existing low/high temperature alerts and their details. Compare unrounded evidence against one-decimal display and the stored thresholds; statuses/timestamps must remain unchanged.
4. Select a History period and download a PDF. Confirm patient, dates, readings, quality, alert statuses and summary against the app. Keep the file private. Repeat an empty period and confirm it makes no health conclusion.
5. On Android verify normal download. In installed iPhone/iPad PWA verify PDF preview and Share → Save to Files, then return to CareLink. Verify popup-blocked handling if applicable.
6. Confirm notification permission and logout still behave as expected, and that the app shell opens offline with its existing offline warning. Actual push delivery requires an existing authorized test event; do not fabricate production health readings.

Unfinished: physical fall transmission, physical wearable/notification validation, native iOS share verification, wider report font coverage and a separately scoped dependency remediation. The report export itself is implemented, not a preview placeholder.

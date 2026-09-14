# CareLink · Stage 1

A responsive caregiver PWA built with React, TypeScript, Vite, Tailwind CSS, React Router, Recharts, Lucide and Leaflet. The approved light/dark references guide the shared theme, rounded cards and mobile navigation.

## Run locally

Requires Node.js 22.12+ and npm.

```powershell
cd C:\Users\3mair\Downloads\Capstone
npm install
npm run dev
```

Open **http://localhost:3000**. For a production preview, including the service worker:

```powershell
npm run build
npm run preview
```

Open **http://localhost:4173**. PWA installation requires localhost or HTTPS and browser support. Visit online first to cache the app shell. Tiles require an internet connection and are not cached for offline use.

## Implemented

- Dashboard with fictional caregiver Omair and patient Ahmed, 72, Muscat; patient/device summaries; date selection; vital sparklines; movement; fall status; filtered trend; AI presentation states; History access.
- Health History with three metrics, day/week/month/custom periods, short chart windows, keyboard-accessible Recharts tooltips, period summaries, movement, event markers and recent readings. The PDF button opens a report preview and explicitly explains that export is pending.
- Alerts with All/New/Viewed/Resolved filters and session-only actions. Cancelled suspected falls and escalated, uncancelled suspected falls have distinct descriptions. No fall is described as independently verified.
- Location with attributed OpenStreetMap tiles, recenter/zoom, exact displayed coordinates and an external Maps link. Blocked/offline tiles show a labelled illustrative preview. Unavailable/invalid GPS never produces a marker or a Maps link.
- Profile with session-only patient edits, optional local avatar, device details, persistent System/Light/Dark themes and disabled notification previews.
- Manifest, PNG icons including a maskable icon, standalone display, a precached app-shell navigation fallback, safe areas, keyboard focus, reduced-motion support and a browser-offline banner.

## Demo model

The fixed sample clock is **14 September 2026, 12:00 GST (UTC+4, Muscat)**. “Today” always refers to this sample day. The latest typical measurement is 11:59, last device contact is 11:59:45, and last GPS fix is 11:58. Renders, navigation and filters never refresh these times. All screens say that the readings are samples, including when offline.

Use **Demo controls** near the page footer to explore typical readings, device offline, missing/unstable vitals, stale/unavailable GPS, SOS, suspected fall and empty history. The adjacent AI control previews six reusable presentation states; none runs an AI model. Scenario changes reset alert actions; a page reload resets patient/demo state. Only the theme preference is stored in localStorage.

`src/data/demo.ts` owns typed readings, alert/location snapshots, validity checks, date filters and summaries. `CareDataSource` is the small replacement boundary for a later protected backend client. Invalid/non-finite/missing vital values become chart gaps and are excluded from statistics. Sensor temperature is explicitly not validated core body temperature. Summary cards cover the full selected period; the 1H/6H/24H controls narrow only the chart window. Daily movement bars aggregate valid movement samples.

Local, original SVG illustrations live at `public/assets/patient-avatar.svg` and `public/assets/wearable.svg`; replace these paths to update the imagery. They do not reuse the reference screenshots. App PNG icons are checked in and can be regenerated on Windows using `powershell -File scripts/generate-icons.ps1`.

## Verification

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

The browser suite uses installed Google Chrome in headless mode and starts its own production preview on port 4173 (keep that port free). It checks 320/390/768/1440px layouts in both themes, navigation, theme persistence, profile edits, date/metric filters, chart tooltips, alert actions, demo states, report preview, GPS fallback, offline route loading and accessibility. Screenshots and browser reports are written to ignored `qa/`. Run the production build before browser tests after making changes. Data tests cover validity, statistics, timestamp separation, date boundaries, alert linkage and coordinate validation.

## Remaining stages

No Supabase connection, backend, real authentication, pairing, firmware changes, deployment, Python/AI analysis, notification delivery, background monitoring or PDF generation is implemented. OpenStreetMap tiles are the only external data request; clicking Open in Maps opens the displayed fictional coordinates in a new tab. The profile does not collect passwords. This is a monitoring prototype, not a medical device or medical assessment.

Future stages can replace the demo adapter, connect the protected backend/wearable and AI service, and implement reporting. Stage 1 ends here.

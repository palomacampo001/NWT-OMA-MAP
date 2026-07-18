# Handoff

This is a frozen handoff snapshot of the current No Wrong Turns / NWT OMA application.

## Current Production URLs

- Public: https://nwt-oma.vercel.app
- Admin: https://nwt-oma.vercel.app/?admin=1
- Previous Vercel alias still used by the project: https://files-mentioned-by-the-user-build-seven.vercel.app

## Current Branch

`codex/directory-map-v2`

## Current App State

The app is a React/Vite frontend with an Express API. The current public map is PDF-derived and stored in committed JSON/PNG/GeoJSON assets. The application should not be regenerated during handoff.

Important current data:

- `public/published-map.json`: public map payload used by the app.
- `server/data/indoor-map-db.json`: file-backed backend database snapshot.
- `public/maps/directory-v2/`: PDF-derived floor map assets, GeoJSON layers, and route graphs.
- `public/directory-map/`: rendered directory map PNGs.
- `handoff/ibm-oma-directory-map-v2/`: original PDF-derived handoff source package and scripts.
- `handoff/ibm-oma-directory-map-v2.zip`: archived copy of that package.

## Local Storage Keys Used By The App

These keys are device/browser-specific and are not committed:

- `svg-indoor-map-state-v1`: locally saved map state from admin/public use.
- `svg-indoor-route-graphs-v1`: admin route graph patches. Current code saves only manual admin nodes/edges.
- `nwt-high-contrast`: high contrast setting.
- `nwt-voice-guidance`: voice guidance setting.
- `nwt-oma-last-indoor-start`: last user-confirmed indoor start point.

Because browser storage is per-device, Bob should test with a fresh browser profile and with an existing profile when validating continuity.

## Snapshot Rule

Do not regenerate maps, routing graphs, SVGs, GeoJSON, or PNG backgrounds unless intentionally starting a new data-preparation phase. This handoff preserves the current working app.

## Verification Commands

```bash
npm install
npm run dev
npm run build
```

Then open:

- `http://localhost:5173/`
- `http://localhost:5173/?admin=1`


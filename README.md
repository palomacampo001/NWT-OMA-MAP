# No Wrong Turns / SVG Indoor Map App

This project is the current working indoor map web app for the IBM OMA building. It renders prepared indoor floor data in a Leaflet-based map viewer, supports public navigation and admin editing, and preserves the current visual behavior of the stakeholder demo.

The app was originally called "SVG Indoor Map Converter"; the current user-facing name is **No Wrong Turns**. The home-screen shortcut name is **NWT OMA**.

## What Is Included

- React/Vite frontend in `src/`
- Leaflet indoor map viewer using `CRS.Simple`
- Express API in `server/src/`
- Vercel serverless entrypoint in `api/index.js`
- File-backed database at `server/data/indoor-map-db.json`
- Prepared OMA floor assets in `work/`
- Published static fallback map at `public/published-map.json`
- App icons and manifest in `public/`
- Handoff documentation in `docs/`

## Important Preservation Notes

Do not casually regenerate the prepared floor data. The current OMA map depends on prepared clean SVG backgrounds plus prepared GeoJSON/features. The original raw CAD/Illustrator SVG parsing path produced broken "spiderweb" geometry and should not be used for the stable OMA floors unless a developer is intentionally rebuilding the data pipeline.

The current stable behavior includes:

- Floor 1, Floor 2, Floor 8, Floor 9, Floor 10
- Progressive map detail by zoom level
- Public and admin views
- Search and destination routing
- Mobile layout and bottom navigation drawer
- High contrast and voice guidance controls
- Admin POI, area, and route graph tools
- Floor 1 corrected Main IBM Entrance / Lobby start area
- Omaha-specific vertical routing rules

## Requirements

- Node.js 20+ recommended
- npm or pnpm

This repo includes `pnpm-lock.yaml`. Either package manager can run it, but pnpm is closest to the current development setup.

## Install

```bash
cd svg-indoor-map-app
pnpm install
```

If Bob uses npm:

```bash
cd svg-indoor-map-app
npm install
```

## Run Locally

Using pnpm:

```bash
pnpm run dev
```

Using npm:

```bash
npm run dev
```

Local URLs:

- Public map: `http://localhost:5173/`
- Admin view: `http://localhost:5173/?admin=1`
- Backend API: `http://localhost:4000/`
- Published map API: `http://localhost:4000/api/public/published-map`

If the combined dev command has trouble finding `npm` inside a constrained environment, run the two processes separately:

```bash
node server/src/server.js
pnpm run dev:client
```

## Build

```bash
pnpm run build
```

Build output goes to `dist/`.

## Deploy

The current deployment target is Vercel. The project includes `vercel.json`.

Known live URLs at handoff time:

- Public: `https://files-mentioned-by-the-user-build-seven.vercel.app/`
- Admin: `https://files-mentioned-by-the-user-build-seven.vercel.app/?admin=1`

Deploy command:

```bash
pnpm dlx vercel --prod
```

## Data Locations

- Current backend database: `server/data/indoor-map-db.json`
- Static published fallback: `public/published-map.json`
- Prepared package files: `work/`
- Route graph browser storage key: `svg-indoor-route-graphs-v1`
- Local map browser storage key: see `src/utils/storage.js`

## Docs To Read First

1. `docs/HANDOFF.md`
2. `docs/ARCHITECTURE.md`
3. `docs/ROUTING_RULES.md`
4. `docs/FLOOR_ASSETS.md`
5. `docs/KNOWN_LIMITATIONS.md`

## Smoke Test

- [ ] App starts locally
- [ ] Floor 1 loads
- [ ] Floor 2 loads
- [ ] Floor 8 loads
- [ ] Floor 9 loads
- [ ] Floor 10 loads
- [ ] Floor tabs switch correctly
- [ ] Low zoom shows simplified blocks
- [ ] Zooming in reveals detail
- [ ] Search works
- [ ] POIs are not all visible by default
- [ ] Selected labels show full names
- [ ] Floor 1 corrected entrance/lobby appears at bottom-left
- [ ] Non-working Floor 1 elevator is not used for routing
- [ ] Public view works
- [ ] Admin view works
- [ ] Mobile layout works
- [ ] No spiderweb lines appear

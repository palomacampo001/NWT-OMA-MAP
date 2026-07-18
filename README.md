# No Wrong Turns - NWT OMA

This repository is the current working handoff snapshot of the No Wrong Turns indoor map application for the IBM OMA building.

Live app: https://nwt-oma.vercel.app  
Admin app: https://nwt-oma.vercel.app/?admin=1

## What This App Does Today

- Shows the PDF-derived IBM OMA indoor maps for Floor 2, Floor 7, Floor 8, Floor 9, and Floor 10.
- Renders clean colored spaces and black hallway areas in the current visual style.
- Lets users search for rooms/spaces and tap map labels/spaces as destinations.
- Routes through the hallway graph, including cross-floor routing through known vertical connectors.
- Supports mobile-first public navigation, floor switching, route drawer instructions, sharing, voice guidance, and high contrast mode.
- Supports admin editing for POIs, areas, and route graph corrections.
- Uses browser geolocation only as a low-confidence outside/near-building signal, then starts from a smart default indoor anchor when exact indoor location is not known.

## Install

```bash
npm install
```

The project also has a `pnpm-lock.yaml`. If using pnpm:

```bash
pnpm install
```

## Run Locally

```bash
npm run dev
```

This starts:

- backend API on `http://localhost:4000`
- Vite app on `http://localhost:5173`

Open:

- Public: `http://localhost:5173/`
- Admin: `http://localhost:5173/?admin=1`

## Build

```bash
npm run build
```

## Environment

Copy `server/.env.example` to `server/.env` if needed:

```bash
cp server/.env.example server/.env
```

Current variable:

```bash
DATABASE_URL="file:./dev.db"
```

The current local backend uses `server/data/indoor-map-db.json` as the file-backed source of truth.

## Read First

1. `HANDOFF.md`
2. `ARCHITECTURE.md`
3. `ROUTING.md`
4. `ADMIN_GUIDE.md`
5. `DATA_FORMATS.md`
6. `DEPLOYMENT.md`
7. `KNOWN_ISSUES.md`


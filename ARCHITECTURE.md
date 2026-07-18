# Architecture

## Runtime Pieces

- Frontend: React + Vite in `src/`.
- Map viewer: Leaflet with `CRS.Simple`, implemented mainly in `src/components/IndoorMapViewer.jsx`.
- Backend: Express API in `server/src/`.
- Vercel serverless adapter: `api/index.js`.
- Data store: file-backed storage through `server/data/indoor-map-db.json`.
- Public static map payload: `public/published-map.json`.

## Frontend Flow

1. `src/main.jsx` mounts `src/App.jsx`.
2. `App.jsx` loads either the published public map or admin backend map.
3. `AppShell.jsx` lays out the left/admin/search panels, central map, right panel, floor controls, and navigation drawer.
4. `IndoorMapViewer.jsx` renders floor backgrounds, colored spaces, POIs, route lines, user marker, and admin drawing/editing overlays.
5. `SearchPanel.jsx` handles destination search and route start.
6. `NavigationDrawer.jsx` shows route instructions, voice controls, share location, clear route, and floor leg buttons.

## Backend Flow

- `server/src/server.js` registers routes for buildings, floors, features, search, GeoJSON, routing, and QR endpoints.
- `server/src/db/prisma.js` exposes a Prisma-like wrapper backed by JSON data.
- `server/src/services/versionService.js` publishes and retrieves map versions.
- Vercel routes `/api/*` to `api/index.js`, which loads the same Express app.

## Map Rendering

The current active maps are PDF-derived directory maps. They are not generated on app launch. The app renders:

- PNG/PDF-derived floor backgrounds.
- Prepared feature data and colored space polygons.
- Prepared route graph data.
- Runtime route lines and markers.

## Location Model

The app uses browser geolocation for outside/near-building detection. It does not claim exact indoor GPS. If location is near or inside but uncertain, routing starts from the best default indoor anchor, currently Main Entrance / Lobby or last known start.


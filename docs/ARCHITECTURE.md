# Architecture

## Project Shape

The repo is not split into separate `client/` and `server/` directories at the root. The actual current structure is:

```txt
/
  src/                  React/Vite frontend
  server/src/           Express API
  server/data/          file-backed database
  api/index.js          Vercel serverless wrapper
  public/               published fallback data, icons, manifest
  work/                 prepared floor packages and reference assets
  docs/                 handoff docs
```

This structure should be preserved unless Bob intentionally migrates the app.

## Frontend

Main entry:

- `src/main.jsx`
- `src/App.jsx`

Key components:

- `AppShell.jsx`: main layout, public/admin panels, top bar, mobile controls
- `IndoorMapViewer.jsx`: Leaflet map renderer and progressive visual layers
- `SearchPanel.jsx`: destination search and route start
- `NavigationDrawer.jsx`: mobile route directions drawer
- `RoutePanel.jsx`: desktop route summary
- `FeatureInspector.jsx`: admin edit/autosave panel
- `RouteGraphEditor.jsx`: admin graph controls
- `SvgUploader.jsx`: admin upload UI
- `ExportPanel.jsx`: JSON/GeoJSON export
- `FloorSelector.jsx`: floor tabs

## Backend

Main server:

- `server/src/server.js`

Vercel entry:

- `api/index.js`

The backend uses a lightweight Prisma-like adapter implemented in:

- `server/src/db/prisma.js`

It stores rows in:

- `server/data/indoor-map-db.json`

Main API routes:

- `/api/buildings`
- `/api/floors`
- `/api/features`
- `/api/search`
- `/api/public/published-map`
- `/api/buildings/:id/geojson`
- `/api/buildings/:id/publish`

## Map Rendering

The app uses Leaflet as an interactive map viewer, not as the SVG parser.

Important rendering choices:

- Leaflet `CRS.Simple`
- Prepared SVG background as image overlay
- Prepared map features rendered as Leaflet markers/polygons
- Local SVG/GeoJSON coordinate space
- Source point `{ x, y }` maps to Leaflet `L.latLng(y, x)`
- No Y inversion for prepared OMA packages

## Progressive Zoom Layers

`IndoorMapViewer.jsx` chooses map detail based on zoom:

- Low zoom: simplified visual overview, limited labels
- Medium zoom: key POIs and important spaces
- High/detail zoom: more labels and feature outlines
- During active navigation: clutter is hidden unless selected/active

CSS for these layers lives mainly in:

- `src/styles/indoorMapTheme.css`
- `src/styles/app.css`

## Public/Admin Modes

Admin mode is enabled by URL:

```txt
/?admin=1
```

Public mode is:

```txt
/
```

Admin mode loads editable backend map data. Public mode loads the latest published map from `/api/public/published-map`.

## State Management

The app uses React state in `App.jsx`, not Redux or another state manager.

Important state:

- `mapData`: building/floors/features
- `activeFloorId`
- `selectedId`
- `highlightId`
- `query`
- `userLocation`
- `locationState`
- `routeDestinationId`
- `routeGraphs`
- `connectorPreference`
- `highContrast`
- `voiceGuidance`
- `adminMode`

## Persistence

Backend persistence:

- `server/data/indoor-map-db.json`

Browser persistence:

- map draft state via `src/utils/storage.js`
- route graphs via localStorage key `svg-indoor-route-graphs-v1`
- high contrast via `nwt-high-contrast`
- voice guidance via `nwt-voice-guidance`

## Build And Deployment

Vite builds the frontend to `dist/`. Vercel serves `dist/` and rewrites `/api/*` to `api/index.js`, which imports the Express app.

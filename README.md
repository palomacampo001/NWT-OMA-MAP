# SVG Indoor Map Converter

Local indoor map admin + public viewer prototype.

## Run Locally

```bash
npm install
npm run dev
```

The app runs:

- Backend API: `http://localhost:4000`
- Admin/client app: `http://localhost:5173`
- Admin mode: `http://localhost:5173/?admin=1`
- Phone/client mode on same Wi-Fi: `http://192.168.68.181:5173/`

If using pnpm directly in this Codex environment:

```bash
pnpm install
pnpm run dev
```

## Backend

The backend is an Express REST API under `server/src`.

It includes:

- Buildings
- Floors
- Uploaded SVG storage
- Server-side SVG conversion into map features
- Feature editing
- Search
- GeoJSON export
- Indoor map JSON export
- QR anchors
- Route nodes and edges
- Dijkstra routing when graph data exists
- Versioning and publish workflow

The requested Prisma schema is included at `server/prisma/schema.prisma`. The local MVP runtime uses `server/data/indoor-map-db.json` as a file-backed store because the local Prisma schema engine failed in this environment. The API shape remains aligned with the Prisma models so it can be switched to SQLite/Postgres later.

## Admin Workflow

1. Open `http://localhost:5173/?admin=1`.
2. Upload one or more SVG files.
3. Each SVG becomes a backend floor.
4. The backend stores the SVG and detected features.
5. Review/edit detected features in the inspector.
6. Use export buttons for indoor JSON or GeoJSON.
7. Click **Publish map**.

## Public Workflow

1. Open `http://localhost:5173/` or the Wi-Fi URL on a phone.
2. The viewer loads the published backend map.
3. Search for a destination.
4. Set your location or use QR anchors when configured.
5. Routing will only run when route nodes and edges exist.

If no route graph exists, the backend returns:

```json
{
  "status": "not_available",
  "message": "Routing requires route nodes and edges to be created for this floor."
}
```

## Key API Endpoints

- `GET /api/buildings`
- `POST /api/buildings`
- `GET /api/buildings/:buildingId/floors`
- `POST /api/buildings/:buildingId/floors`
- `POST /api/floors/:floorId/upload-svg`
- `GET /api/floors/:floorId/features`
- `PATCH /api/features/:featureId`
- `GET /api/search?buildingId=...&q=...`
- `GET /api/buildings/:buildingId/geojson`
- `GET /api/buildings/:buildingId/indoor-map-json`
- `POST /api/buildings/:buildingId/publish`
- `GET /api/public/published-map`

# Data Formats

## Main Public Map

File: `public/published-map.json`

Top-level shape:

```json
{
  "building": {},
  "floors": []
}
```

Current floors:

- `floor-directory-02` / Floor 2
- `floor-directory-07` / Floor 7
- `floor-directory-08` / Floor 8
- `floor-directory-09` / Floor 9
- `floor-directory-10` / Floor 10

Each floor contains:

- `id`
- `name`
- `levelNumber`
- `viewBox`
- `features`
- `routeGraph`
- background references

## Feature Shape

Feature records are used for spaces, POIs, labels, and admin-created areas.

Common fields:

- `id`
- `floorId`
- `type`
- `category`
- `name`
- `displayName`
- `roomNumber`
- `geometry`
- `bbox`
- `visible`
- `confidence`
- `sourceSvg`

Point features use:

```json
{ "type": "Point", "coordinates": [x, y] }
```

Polygon features use:

```json
{ "type": "Polygon", "coordinates": [[[x, y], [x, y]]] }
```

Coordinates are local map coordinates. Leaflet uses `L.latLng(y, x)` with `CRS.Simple`.

## Route Graph

Each floor route graph contains:

- `floorId`
- `status`
- `nodes`
- `edges`

Node fields:

- `id`
- `floorId`
- `x`
- `y`
- `type`
- `name`
- optional `linkedFeatureId`
- optional `linkedPoiId`
- optional `connectorGroupId`
- `source`

Edge fields:

- `id`
- `floorId`
- `fromNodeId`
- `toNodeId`
- `distance`
- `accessible`
- `source`

## Backend Database Snapshot

File: `server/data/indoor-map-db.json`

Current lists include:

- `building`
- `floor`
- `uploadedFile`
- `mapFeature`
- `pOI`
- `routeNode`
- `routeEdge`
- `qrAnchor`
- `mapVersion`


# Data Formats

## Prepared Floor Package Pattern

Each stable OMA floor came from a prepared package. These packages are trusted map data. They should be treated as source assets for the current app.

Typical package files:

- `*-clean-base.svg`: clean visual floorplan background
- `*-blocks-only.svg`: simplified low-zoom/overview reference
- `*-simplified-blocks.svg`: visual/reference preview
- `*-combined.geojson`: combined interactive overlay data
- `*-pois.geojson`: searchable labels and POIs
- `*-spaces.geojson`: simplified clickable space/block shapes
- `*-indoor-map.json`: custom indoor-map JSON representation

The current app's live data is stored in `server/data/indoor-map-db.json`, with the original prepared package assets kept in `work/`.

## Feature Shape In The Frontend

Features sent to the frontend look like:

```json
{
  "id": "feature-id",
  "type": "room",
  "category": "office",
  "name": "Blue Bar",
  "roomNumber": "B220",
  "displayName": "Blue Bar B220",
  "confidence": 1,
  "visible": true,
  "geometry": {
    "type": "Point",
    "coordinates": [65, 596]
  },
  "bbox": [65, 596, 0, 0],
  "sourceSvg": {
    "preparedPackage": true,
    "manualApproved": true
  },
  "editable": true
}
```

Polygon features use GeoJSON polygon coordinates:

```json
{
  "geometry": {
    "type": "Polygon",
    "coordinates": [[[x, y], [x, y], [x, y]]]
  }
}
```

## Coordinate Rules

Prepared data uses SVG/GeoJSON local coordinates:

```js
const x = point.x;
const y = point.y;
```

Leaflet `CRS.Simple` uses:

```js
L.latLng(y, x)
```

Do not flip Y for prepared OMA packages.

## Custom Admin Areas

Admin-drawn areas are stored as `type: "custom_area"` with polygon geometry and metadata similar to:

```json
{
  "type": "custom_area",
  "category": "custom",
  "sourceSvg": {
    "tag": "polygon",
    "source": "admin-drawn",
    "editable": true,
    "manualApproved": true
  }
}
```

Admin areas can be edited by dragging numbered vertices in the map.

## Route Graph Format

Route graphs are stored in browser localStorage and can be exported/imported from the Admin Route Graph Editor.

Graph shape:

```json
{
  "floorId": "floor-us-oma-01",
  "status": "admin_reviewed",
  "nodes": [
    {
      "id": "node-id",
      "floorId": "floor-us-oma-01",
      "x": 100,
      "y": 600,
      "type": "hallway",
      "name": "Hallway node",
      "source": "admin"
    }
  ],
  "edges": [
    {
      "id": "edge-id",
      "floorId": "floor-us-oma-01",
      "fromNodeId": "node-a",
      "toNodeId": "node-b",
      "accessible": true,
      "source": "admin"
    }
  ]
}
```

Valid route node types:

- `hallway`
- `intersection`
- `turn`
- `doorway`
- `destination_approach`
- `entrance`
- `reception`
- `elevator`
- `escalator`
- `stair`

## Connector Override Logic

Connector behavior is currently implemented in code, not a separate JSON file.

See:

- `src/utils/navigation.js`

Important current rules:

- Floor 1 elevators are blocked for public routing.
- Floor 1 escalator must be the Entrance Escalator.
- Floor 2 escalator landing is `ESC-G`.
- Floors above Floor 2 use named elevators such as `08EL01`, `09EL01`, `10EL01`.
- False-positive elevator labels are filtered by requiring real elevator-style names.

## Database Tables In JSON

The file-backed database has arrays:

- `building`
- `floor`
- `uploadedFile`
- `mapFeature`
- `pOI`
- `routeNode`
- `routeEdge`
- `qrAnchor`
- `mapVersion`

At handoff time, `routeNode` and `routeEdge` are empty in the bundled DB; route graph edits are browser-local unless later persisted.

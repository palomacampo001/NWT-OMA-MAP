# Admin Guide

Admin URL:

```text
https://nwt-oma.vercel.app/?admin=1
```

Local admin URL:

```text
http://localhost:5173/?admin=1
```

## Current Admin Capabilities

- View all current floors.
- Search and select spaces/POIs.
- Edit selected feature fields in the inspector.
- Add POIs.
- Draw custom area boundaries.
- Edit custom area vertices.
- Hide/mark noise for features.
- Restore hidden features.
- Publish map data.
- Export indoor JSON and GeoJSON.
- Edit route graph data.
- Draw learned route paths.

## Route Graph Editing

Open `Edit route graph`.

Current simple workflow:

1. Choose `Draw route path`.
2. Drag along the hallway path like a pencil.
3. Release to save the drawn path.
4. Search the route again to use the learned graph connection.

Manual node editing still exists:

- Place node on map.
- Select two nodes.
- Connect 2.
- Mark selected node type.
- Delete selected nodes or edges.

## Storage Warning

Admin route graph patches are browser-local under `svg-indoor-route-graphs-v1`. Published map data and backend data are committed in `public/published-map.json` and `server/data/indoor-map-db.json`.

## Do Not Regenerate During Handoff

The current project includes scripts for map extraction and route graph generation, but this handoff is a snapshot. Do not rerun those scripts unless intentionally starting a new map-data revision.


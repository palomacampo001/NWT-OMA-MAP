# Admin Tools

Admin mode is available at:

```txt
/?admin=1
```

## Upload SVG Floorplans

Admin can upload SVG files. The code still includes a conversion path:

- `src/utils/parseSvg.js`
- `src/utils/extractSvgGeometry.js`
- `src/utils/detectFeatures.js`
- `server/src/services/svgImportService.js`

For the current OMA floor map, do not regenerate prepared floor data from raw messy SVGs. The stable OMA map should use the prepared data already bundled in `work/` and `server/data/indoor-map-db.json`.

## Add POI

1. Click "Add POI".
2. Click the map.
3. Select the new point.
4. Rename it in the inspector.

The inspector autosaves feature edits to the backend when possible.

## Add Area / Boundary

1. Click "Add Area".
2. Click the map to place boundary points.
3. Add at least 3 points.
4. Click "Finish area".
5. Give the area a name.

The area is saved as a `custom_area` polygon.

## Edit Area

1. Select a custom area.
2. Drag numbered vertices on the map.
3. Click a small edge plus marker to insert a point.
4. Use "Delete point" in the inspector for the selected vertex.

## Edit Feature Metadata

Select a room/POI/area and use the inspector to edit:

- Name
- Room number
- Display name
- Type
- Category
- Confidence
- Visibility

The inspector shows "Saved automatically" after changes.

## Route Graph Editor

Admin can:

- Generate suggested hallway graph nodes
- Add graph nodes
- Mark selected node type
- Snap a selected node to nearest POI
- Connect two selected nodes
- Delete selected nodes
- Delete edges
- Copy graph JSON
- Import graph JSON
- Mark graph as reviewed/published

Current limitation: route graph data is browser-local unless exported and re-imported.

## Cleanup Tools

Admin has cleanup actions:

- Clean map
- Clear corrupted features
- Restore hidden

Use with care. The stable OMA map is based on curated prepared data.

## Export Tools

Export panel supports:

- Copy indoor JSON
- Copy GeoJSON
- Download JSON
- Download GeoJSON

Exports reflect the current client map data.

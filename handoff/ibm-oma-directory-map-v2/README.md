# IBM OMA Directory Map V2

This handoff contains the PDF-derived indoor map data for Floors 02, 07, 08, 09, and 10.

## Source

The source of truth is `260708_IBM_OMA_DI_Directory Map_2-7-8-9-10F.pdf`. The extraction pipeline does not use the former CAD/SVG packages.

## Floor Packages

Each folder under `public-maps/` contains:

- `background.png`: cleaned map image without the legend or static yellow location marker
- `spaces.geojson`: color-derived editable space/zone polygons
- `hallways.geojson`: walkable hallway centerline edges
- `pois.geojson`: classified searchable POIs
- `labels.geojson`: searchable PDF labels
- `route-graph.json`: nodes and edges used by routing
- `floor.json`: floor manifest and coordinate metadata

## Run

From the main project:

```bash
pnpm install
pnpm dev
```

Public map: `http://localhost:5173/`

Admin review: `http://localhost:5173/?admin=1`

## Review

- Click a POI or label in Admin to edit its name, category, and visibility.
- Use **Edit route graph** in Admin to review or adjust hallway nodes and edges.
- Use the route preference control to test Best, Accessible, Elevator, Escalator, and Stairs routing.
- Publish after review to update the public map.

## Regenerate

`build_directory_v2.py` creates the V2 floor package and app data. `generate_directory_route_graphs.py` rebuilds hallway graphs from black internal paths.

## Known Limitations

- Space polygons are conservative color-segmented bounds and should be reviewed where rooms have angled or irregular edges.
- Repeated labels such as Focus, Workstations, Open, and Office may require unique admin names.
- Unlabeled PDF icons cannot always be classified confidently without manual review.
- Accurate indoor position requires a manually confirmed point or a future QR/beacon system.

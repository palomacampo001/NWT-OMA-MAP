# Developer Handoff

## Current State

This is the current working No Wrong Turns indoor map app. It is a React/Vite app with a Leaflet map viewer and an Express backend using a file-backed database. It currently serves the prepared IBM OMA indoor map with five floors:

- Floor 1
- Floor 2
- Floor 8
- Floor 9
- Floor 10

The app has both public and admin modes. Public mode is the mobile/stakeholder navigation view. Admin mode exposes upload, edit, export, area drawing, route graph, and cleanup tools.

## Stable Behavior To Preserve

- Leaflet map rendering with local SVG coordinate space
- Prepared clean SVG background rendering
- Progressive zoom behavior
- Floor tabs and floor accent colors
- Search suggestions and route start
- Selected feature labels
- Current route panel and mobile drawer behavior
- Location fallback to the Main IBM Entrance / Lobby start anchor
- User marker as a route-facing compass arrow
- Accessibility/high contrast toggle
- Voice guidance toggle and repeat action
- Admin feature inspector autosave
- Admin Add POI
- Admin Add Area / boundary drawing and vertex editing
- Admin Route Graph editor
- Export JSON and GeoJSON
- Public/admin toggle

## Do Not Touch Casually

- Prepared OMA floor assets in `work/`
- `server/data/indoor-map-db.json`
- Current coordinate transform behavior
- Floor 1 corrected start data
- Routing rules in `src/utils/navigation.js`
- Progressive level-of-detail rendering in `src/components/IndoorMapViewer.jsx`
- POI visibility/hide-clutter logic
- Current CSS theme and mobile layout

## Key Fragile Parts

- The original generic SVG parser remains in the codebase for upload/conversion experiments, but the current OMA floors should not be rebuilt from raw messy SVGs.
- Leaflet uses `CRS.Simple`; feature coordinates must map as `[x, y]` source data to `L.latLng(y, x)`. Do not flip Y for prepared packages.
- Hallway-perfect routing requires route graph edges. Without reviewed graph edges, the app shows dashed preview guidance rather than claiming a confirmed walkable hallway path.
- On Vercel, the API uses the bundled file-backed database as a baseline. Runtime writes may be ephemeral.
- Admin route graphs are currently seeded from floor data and persisted in browser localStorage via `svg-indoor-route-graphs-v1`.

## Recommended Development Flow For Bob

1. Unzip the package.
2. Install dependencies.
3. Run the app locally.
4. Complete the smoke test from `README.md`.
5. Read `ROUTING_RULES.md` before touching navigation.
6. Read `DATA_FORMATS.md` before touching floor data.
7. If adding better routing, add/admin-review route graph nodes and edges rather than drawing direct lines through rooms.

## Current Git Snapshot At Handoff

Recent relevant commits:

- `b496e03` Keep user arrow above route origin
- `62b4214` Show user as route compass arrow
- `23ffd0a` Add Omaha vertical routing rules
- `23a05e7` Fix voice guidance render order
- `f580f19` Improve accessibility contrast and voice guidance
- `368937c` Add hallway graph generator
- `322f62b` Restore dashed preview route guidance
- `d972855` Require hallway graph for routes

## Smoke Test Checklist

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

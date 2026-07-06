# Known Limitations

## SVGs Are Drawings, Not Navigation Networks

The original floorplan SVGs are CAD/Illustrator-style visual drawings. They include paths, hatches, text fragments, furniture, walls, symbols, and decorative geometry. They are not semantic indoor navigation networks.

The current stable OMA app works because it uses prepared floor packages and filtered feature data, not direct raw SVG path rendering.

## Do Not Casually Regenerate Prepared Data

Regenerating from raw SVG can reintroduce:

- spiderweb lines
- thousands of noisy paths
- false rooms
- false POIs
- false elevators/stairs
- broken routing anchors

Only rebuild prepared data if Bob is intentionally rebuilding the conversion pipeline.

## Hallway-Perfect Routing Requires Graph Data

The app can show approximate dashed guidance, but confirmed hallway routing requires route graph edges. Without a route graph, the app cannot truly know which hallway segments are walkable.

## Indoor GPS Is Not Reliable

Phone GPS is usually not accurate inside buildings. The app currently supports:

- GPS geofence awareness
- manual "Locate me" placement
- default start at Main IBM Entrance / Lobby

Better future positioning options:

- QR anchors
- NFC tags
- BLE beacons
- Wi-Fi RTT
- manual kiosk/start-point selection

## Route Graph Persistence Is Browser-Local

The Admin Route Graph editor stores graphs in localStorage. If route graphs need to be shared across users/devices, Bob should persist nodes and edges to the backend tables already present in the file-backed DB shape:

- `routeNode`
- `routeEdge`

## Vercel File Writes Are Ephemeral

The server uses a file-backed database. On local development this is durable in `server/data/indoor-map-db.json`. On Vercel, runtime writes may go to temporary storage and may not survive redeploys.

For a production app, move persistence to a real database.

## Accessibility Is Improved, Not Complete

The app includes high contrast and voice guidance controls, but a full accessibility audit has not been completed.

## Routing Rules Are Building-Specific

The Omaha connector rules are currently hard-coded. That is correct for this demo, but it should become configurable if the app expands to more buildings.

# Known Issues

These are current implementation limitations, not requested future features.

## Indoor Location Accuracy

Browser geolocation cannot reliably identify exact indoor hallway position or floor. The app uses GPS for outside/near-building state and a smart default indoor start anchor when exact indoor position is uncertain.

## Device-Local Admin Patches

Some admin route graph patches can live in browser local storage under `svg-indoor-route-graphs-v1`. They are device-specific unless exported/published separately.

## Route Graph Quality

The route engine uses prepared hallway graph data plus runtime repair for missing links. If graph data is incomplete, routing can still require admin correction.

## No True Indoor Positioning Backend

The app does not currently integrate enterprise Wi-Fi positioning, BLE beacons, or native indoor positioning services.

## PDF-Derived Data

The current visual map is based on PDF-derived directory map assets. The old raw SVG converter code still exists, but the current public map is not generated from the failed raw CAD-style SVG parsing flow.

## Private Environment

`server/.env` is ignored by Git. Use `server/.env.example` for setup.


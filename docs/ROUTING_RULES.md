# Routing Rules

## Current Routing Model

Routing lives in:

- `src/utils/navigation.js`
- `src/utils/routeGraphs.js`

The app never asks Leaflet to invent indoor routes. The app creates route legs from known map points, route graph nodes, and building-specific connector rules.

## Hallway Graph Limitation

Perfect indoor routing needs reviewed hallway graph edges. A graph has:

- walkable nodes
- edges between nodes
- connector nodes for elevators/escalators/stairs

If a reviewed graph does not exist, the app shows dashed preview guidance. Preview guidance is intentionally not labeled as a confirmed wall-safe hallway route.

The app should not draw solid "real" route lines through walls.

## Approximate Guidance

When a route graph is missing or incomplete:

- The app still gives useful directional guidance.
- The line is dashed.
- The route panel says the guidance is approximate/preview.
- The line points to the correct building connector based on the current rules.

## Omaha Building-Specific Connector Rules

The current app includes hard-coded Omaha routing rules in `src/utils/navigation.js`.

### Disabled Floor 1 Elevator

The elevator near the Floor 1 IBM Registration Desk / 01A23 area is not a working public navigation elevator.

Do not route users to:

- `01EL01`
- `01E25`
- registration-desk elevator markers
- Floor 1 elevators in general

### Floor 1 To Floor 2

Users starting on Floor 1 must use:

1. Main IBM Entrance / Lobby
2. Turnstiles
3. Entrance Escalator
4. Floor 2 escalator landing
5. Destination on Floor 2

### Floor 1 To Floors 8, 9, 10

Users starting on Floor 1 and going to an upper floor must use:

1. Main IBM Entrance / Lobby
2. Turnstiles
3. Entrance Escalator to Floor 2
4. Floor 2 elevator bank
5. Destination floor elevator bank
6. Destination

### Floor 2 To Floors 8, 9, 10

Users starting on Floor 2 and going up must use:

1. Current Floor 2 location
2. Floor 2 elevator bank
3. Destination floor elevator bank
4. Destination

### Floors 8, 9, 10 To Floor 1

Users returning to Floor 1 must use:

1. Current floor elevator bank
2. Elevator to Floor 2
3. Floor 2 escalator landing
4. Entrance escalator down to Floor 1
5. Turnstiles / lobby / destination

## Connector Selection

Current connector filters:

- Floor 1: elevators blocked, Entrance Escalator allowed
- Floor 2: named elevators allowed, `ESC-G` / entrance escalator landing allowed
- Floors above Floor 2: named elevators allowed, escalators blocked
- Named elevators must look like `02EL01`, `08EL01`, `09EL01`, `10EL01`, etc.

This prevents false-positive labels like "ELECTRICAL" from acting like elevators.

## How To Add/Edit Route Graph Nodes Later

In Admin:

1. Open `/?admin=1`.
2. Select a floor.
3. Open "Edit route graph".
4. Add nodes.
5. Mark node types (`hallway`, `intersection`, `doorway`, `elevator`, `escalator`, etc.).
6. Select two nodes and press "Connect 2".
7. Save as reviewed or publish graph.
8. Use "Copy graph JSON" to back up the graph.

Important: route graph edits currently persist in browser localStorage, not in the bundled backend JSON. If Bob wants durable shared route graph editing, persist these graph objects to `routeNode` and `routeEdge` in the backend.

# Routing

## Current Routing Implementation

Routing is implemented in:

- `src/utils/navigation.js`
- `src/utils/routeGraphs.js`
- `server/src/services/routingService.js`

The frontend route engine is the active user-facing route behavior.

## Same-Floor Routing

Same-floor routing:

1. Finds the current route origin.
2. Finds the destination feature center.
3. Snaps to route graph nodes and destination approach nodes.
4. Runs shortest-path routing over graph edges.
5. Repairs obviously incomplete hallway graph links when a route is missing or suspiciously long.
6. Draws the resulting route on the active floor.

The route graph repair adds line-of-sight edges only when samples stay near the existing hallway graph/mask approximation. This is intended to avoid straight wall-crossing while reducing large unnecessary loops.

## Cross-Floor Routing

Cross-floor routing uses building-specific connector logic in `src/utils/navigation.js`.

Current rules include:

- Floor 1/lobby movement uses the entrance escalator first.
- After the first escalator to Floor 2, cross-floor movement uses elevators.
- Named elevator banks are preferred for upper-floor transfers.
- Routes are split into walking legs plus transfer legs.

## Route UI

Route instructions are shown in `NavigationDrawer.jsx`. The drawer can be collapsed without clearing the route. The explicit `Clear route` action clears the destination.

## Admin Route Editing

Admin route graph editing is in `RouteGraphEditor.jsx` and `IndoorMapViewer.jsx`.

Current behavior:

- Admin can draw learned hallway paths like a pencil.
- Manual route graph patches are stored locally in `svg-indoor-route-graphs-v1`.
- Saving route graphs stores admin nodes/edges only, then merges them with prepared graph data on load.

## Important Constraint

Do not fall back to fake straight-line routes through walls. If a graph route cannot be found, the app should show a review-needed state or use only the existing preview behavior.


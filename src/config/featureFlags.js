/**
 * Feature flags for live follow navigation.
 *
 * All flags default to false.
 * Production builds must never enable projection or step advancement
 * until on-site calibration is verified.
 *
 * DEV_LOCATION_SIMULATOR_ENABLED
 *   Controlled by the env var VITE_DEV_LOCATION_SIMULATOR_ENABLED.
 *   Set to "true" in the Vercel project for the Preview environment only.
 *   Never set in the Production environment.
 *   This makes the simulator panel visible on preview deployments while
 *   remaining completely absent from nwt-oma-map.vercel.app.
 *
 * LIVE_LOCATION_PROJECTION_ENABLED — convert real lat/lng into map XY (requires verified calibration)
 * LIVE_ROUTE_MATCHING_ENABLED      — snap marker to route, detect off-route
 * LIVE_STEP_ADVANCEMENT_ENABLED    — auto-advance steps from proximity checks
 */

export const DEV_LOCATION_SIMULATOR_ENABLED =
  import.meta.env.VITE_DEV_LOCATION_SIMULATOR_ENABLED === 'true';

export const LIVE_LOCATION_PROJECTION_ENABLED = false;
export const LIVE_ROUTE_MATCHING_ENABLED = false;
export const LIVE_STEP_ADVANCEMENT_ENABLED = false;

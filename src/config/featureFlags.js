/**
 * Feature flags for live follow navigation.
 *
 * All flags are false by default.
 * Production builds must never enable projection or step advancement
 * until on-site calibration is verified.
 *
 * DEV_LOCATION_SIMULATOR_ENABLED  — show the dev sim panel (never in production)
 * LIVE_LOCATION_PROJECTION_ENABLED — convert real lat/lng into map XY (requires calibration)
 * LIVE_ROUTE_MATCHING_ENABLED      — snap marker to route, detect off-route
 * LIVE_STEP_ADVANCEMENT_ENABLED    — auto-advance steps from proximity checks
 */

// Safe to read Vite dev mode at build time — falsy in production bundles.
const IS_DEV = import.meta.env.DEV === true;

export const DEV_LOCATION_SIMULATOR_ENABLED = IS_DEV;
export const LIVE_LOCATION_PROJECTION_ENABLED = false;
export const LIVE_ROUTE_MATCHING_ENABLED = false;
export const LIVE_STEP_ADVANCEMENT_ENABLED = false;

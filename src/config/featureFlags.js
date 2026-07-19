/**
 * Feature flags for live follow navigation and calibration.
 *
 * All flags default to false.
 * Each flag is driven by a VITE_* environment variable so they can be
 * enabled per-deployment in Vercel without code changes.
 *
 * Production Vercel project: no VITE_ env vars set → all flags false.
 * Calibration deployment:    VITE_CALIBRATION_MODE_ENABLED=true etc.
 * Preview deployments:       VITE_DEV_LOCATION_SIMULATOR_ENABLED=true
 *
 * DEV_LOCATION_SIMULATOR_ENABLED
 *   Shows the dev simulator panel.
 *   Preview env only — never production.
 *
 * CALIBRATION_MODE_ENABLED
 *   Shows the calibration panel, GPS live data, capture/record tools.
 *   Calibration deployment only — never production.
 *
 * LIVE_LOCATION_PROJECTION_ENABLED
 *   Converts real lat/lng into map XY using verified calibration points.
 *   Requires isCalibrationReady() to return true for the current floor.
 *
 * LIVE_ROUTE_MATCHING_ENABLED
 *   Snaps the marker to the nearest route segment; detects off-route.
 *
 * LIVE_STEP_ADVANCEMENT_ENABLED
 *   Auto-advances navigation steps based on proximity to waypoints.
 */

export const DEV_LOCATION_SIMULATOR_ENABLED =
  import.meta.env.VITE_DEV_LOCATION_SIMULATOR_ENABLED === 'true';

export const CALIBRATION_MODE_ENABLED =
  import.meta.env.VITE_CALIBRATION_MODE_ENABLED === 'true';

export const LIVE_LOCATION_PROJECTION_ENABLED =
  import.meta.env.VITE_LIVE_LOCATION_PROJECTION_ENABLED === 'true';

export const LIVE_ROUTE_MATCHING_ENABLED =
  import.meta.env.VITE_LIVE_ROUTE_MATCHING_ENABLED === 'true';

export const LIVE_STEP_ADVANCEMENT_ENABLED =
  import.meta.env.VITE_LIVE_STEP_ADVANCEMENT_ENABLED === 'true';

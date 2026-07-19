/**
 * Shared location update pipeline.
 *
 * All location sources — real GPS, simulation, manual tap — must pass through
 * processLocationUpdate(). Downstream consumers (marker, route matching,
 * step advancement, voice, follow-camera) always see the same shape.
 *
 * This module exports a factory function that receives app-level callbacks.
 * App.jsx creates one pipeline instance and passes it to the simulator and
 * to the watchPosition callback.
 *
 * LocationUpdate shape (all fields optional except timestamp):
 * {
 *   latitude:  number | null,   — WGS-84; null when source === 'simulation'
 *   longitude: number | null,
 *   mapX:      number | null,   — map pixel X; supplied by sim, or projection
 *   mapY:      number | null,   — map pixel Y; supplied by sim, or projection
 *   accuracy:  number,          — metres (GPS) or synthetic value
 *   heading:   number | null,   — degrees true-north or route-derived
 *   speed:     number | null,   — m/s
 *   timestamp: number,          — Date.now()
 *   floorId:   string | null,   — required for marker update
 *   source:    'gps' | 'simulation' | 'manual',
 * }
 *
 * Pipeline steps (each guarded by its own feature flag):
 *   1. Validation & sanity check
 *   2. GPS → map XY projection  (LIVE_LOCATION_PROJECTION_ENABLED)
 *   3. Exponential smoothing    (always active when mapX/mapY available)
 *   4. Marker update            (always active when mapX/mapY available)
 *   5. Route matching & snap    (LIVE_ROUTE_MATCHING_ENABLED)
 *   6. Step advancement         (LIVE_STEP_ADVANCEMENT_ENABLED)
 *   7. Off-route detection      (LIVE_ROUTE_MATCHING_ENABLED)
 */

import { LIVE_LOCATION_PROJECTION_ENABLED, LIVE_ROUTE_MATCHING_ENABLED, LIVE_STEP_ADVANCEMENT_ENABLED } from '../config/featureFlags.js';
import { latLngToMapPoint } from './locationProjection.js';
import { findNearestRoutePosition, computeNearestStep, computeRouteHeading, isOffRoute } from './routeMatcher.js';

/** Smoothing factor α ∈ (0,1]. Higher = more responsive, lower = smoother. */
const SMOOTHING_ALPHA = 0.35;

/** Off-route threshold in map units (roughly 3–5 m at OMA scale). */
const OFF_ROUTE_THRESHOLD_MAP_UNITS = 28;

/** Minimum distance to move the smoothed position (noise gate). */
const NOISE_GATE_MAP_UNITS = 2;

/**
 * Create a location pipeline instance.
 *
 * @param {{
 *   getActiveRoute: () => object | null,
 *   getActiveFloorId: () => string,
 *   getCurrentStepIndex: () => number,
 *   onMarkerUpdate: (loc: { floorId, point: {x,y}, heading: number, source: string }) => void,
 *   onStepAdvance: (newIndex: number) => void,
 *   onOffRoute: (isOff: boolean) => void,
 *   onFloorChange: (floorId: string) => void,
 * }} callbacks
 * @returns {{ processLocationUpdate: Function, reset: Function }}
 */
export function createLocationPipeline(callbacks) {
  const {
    getActiveRoute,
    getActiveFloorId,
    getCurrentStepIndex,
    onMarkerUpdate,
    onStepAdvance,
    onOffRoute,
    onFloorChange,
  } = callbacks;

  // Smoothed map position (exponential moving average)
  let smoothX = null;
  let smoothY = null;
  let offRouteState = false;

  /**
   * Reset smoothing and off-route state.
   * Must be called on floor transitions — each floor has its own coordinate
   * space so the EMA must not interpolate from the previous floor's position.
   */
  function reset() {
    smoothX = null;
    smoothY = null;
    offRouteState = false;
    if (import.meta.env.DEV || import.meta.env.VITE_DEV_LOCATION_SIMULATOR_ENABLED === 'true') {
      console.info('[locationPipeline] reset (floor transition or route change)');
    }
  }

  /**
   * Main entry point. Call this from watchPosition callback and from simulator.
   * Returns the processed location object (useful for testing), or null on error.
   */
  function processLocationUpdate(update) {
    try {
      return _process(update);
    } catch (err) {
      // Fail silently — never break navigation
      if (import.meta.env.DEV) console.warn('[locationPipeline] Error:', err);
      return null;
    }
  }

  function _process(update) {
    const { source = 'gps', timestamp = Date.now() } = update;
    let { mapX, mapY, floorId, heading, accuracy } = update;

    // ── Step 1: GPS → map XY projection ─────────────────────────────────────
    if (mapX == null || mapY == null) {
      if (
        LIVE_LOCATION_PROJECTION_ENABLED &&
        update.latitude != null &&
        update.longitude != null &&
        floorId
      ) {
        const projected = latLngToMapPoint(update.latitude, update.longitude, floorId);
        if (projected) {
          mapX = projected.x;
          mapY = projected.y;
        }
      }
    }

    // Without a map position, we can't move the marker.
    if (mapX == null || mapY == null || !floorId) return null;

    const rawPoint = { x: mapX, y: mapY };

    // ── Step 2: Exponential smoothing ───────────────────────────────────────
    if (smoothX == null) {
      smoothX = mapX;
      smoothY = mapY;
    } else {
      const dx = mapX - smoothX;
      const dy = mapY - smoothY;
      // Noise gate — ignore micro-jitter below threshold
      if (Math.hypot(dx, dy) >= NOISE_GATE_MAP_UNITS) {
        smoothX = smoothX + SMOOTHING_ALPHA * dx;
        smoothY = smoothY + SMOOTHING_ALPHA * dy;
      }
    }
    const smoothedPoint = { x: smoothX, y: smoothY };

    // ── Step 3: Route matching & snap ────────────────────────────────────────
    let markerPoint = smoothedPoint;
    let routeHeading = heading;
    const activeRoute = getActiveRoute();
    const currentFloorId = getActiveFloorId();

    if (LIVE_ROUTE_MATCHING_ENABLED && activeRoute) {
      const activeLeg = activeRoute.legs?.find((leg) => leg.floorId === floorId);
      const points = activeLeg?.points;
      if (points?.length >= 2) {
        const match = findNearestRoutePosition(smoothedPoint, points);
        if (match) {
          // Only snap if close enough; otherwise show raw position (off-route)
          const offRoute = isOffRoute(match.distanceToRoute, OFF_ROUTE_THRESHOLD_MAP_UNITS);
          if (!offRoute) {
            markerPoint = match.snappedPoint;
            routeHeading = computeRouteHeading(match.snappedPoint, points, match.segmentIndex);
          }
          // Emit off-route state change
          if (offRoute !== offRouteState) {
            offRouteState = offRoute;
            onOffRoute?.(offRoute);
          }
        }
      }
    }

    // ── Step 4: Marker update ────────────────────────────────────────────────
    // Switch floor if needed
    if (floorId && floorId !== currentFloorId) {
      onFloorChange?.(floorId);
    }

    onMarkerUpdate?.({
      floorId,
      point: markerPoint,
      heading: routeHeading ?? 0,
      source,
      accuracy: accuracy ?? 0,
      raw: rawPoint,
      smoothed: smoothedPoint,
      timestamp,
    });

    // ── Step 5: Step advancement ─────────────────────────────────────────────
    if (LIVE_STEP_ADVANCEMENT_ENABLED && activeRoute) {
      const instructions = activeRoute.instructions || [];
      const currentStep = getCurrentStepIndex();
      const newStep = computeNearestStep(markerPoint, instructions, currentStep);
      if (newStep > currentStep) {
        onStepAdvance?.(newStep);
      }
    }

    return { floorId, point: markerPoint, heading: routeHeading, source, timestamp };
  }

  return { processLocationUpdate, reset };
}

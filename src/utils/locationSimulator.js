/**
 * Route walk simulator for development.
 *
 * Moves a synthetic position along the active route at configurable speed,
 * feeding every update through the same processLocationUpdate() pipeline as
 * real GPS.
 *
 * Only instantiated when DEV_LOCATION_SIMULATOR_ENABLED = true.
 * This file must never be imported in production code paths.
 *
 * Usage:
 *   const sim = createRouteSimulator({ getActiveRoute, processLocationUpdate });
 *   sim.start();   sim.pause();   sim.resume();   sim.reset();
 *   sim.setSpeed(2);
 *   sim.setOffRoute(true);   // drift off-route briefly
 *   sim.setLowAccuracy(true);
 */

import { distance } from './geometryHelpers.js';

/** Map units per second at 1× speed (roughly normal walking pace). */
const BASE_SPEED_MAP_UNITS_PER_SEC = 55;
const TICK_INTERVAL_MS = 100;

/** How far to drift off-route laterally when simulating off-route. */
const OFF_ROUTE_DRIFT = 45;

/**
 * @param {{
 *   getActiveRoute: () => object | null,
 *   getActiveFloorId: () => string,
 *   processLocationUpdate: (update: object) => void,
 * }} opts
 */
export function createRouteSimulator(opts) {
  const { getActiveRoute, getActiveFloorId, processLocationUpdate } = opts;

  let state = 'idle'; // 'idle' | 'running' | 'paused'
  let speedMultiplier = 1;
  let lowAccuracy = false;
  let offRouteDrift = false;
  let tickTimer = null;

  // Walk state
  let routePoints = [];    // flat array of {x, y} from the active leg
  let floorId = null;
  let segmentIndex = 0;
  let tOnSegment = 0;      // 0→1 progress along current segment

  function _buildRoutePoints(route) {
    if (!route) return [];
    const flr = getActiveFloorId();
    const leg = route.legs?.find((l) => l.floorId === flr) || route.legs?.[0];
    if (!leg?.points?.length) return [];
    floorId = leg.floorId;
    return leg.points;
  }

  function _currentPosition() {
    if (routePoints.length < 2 || segmentIndex >= routePoints.length - 1) {
      return routePoints[routePoints.length - 1] || null;
    }
    const a = routePoints[segmentIndex];
    const b = routePoints[segmentIndex + 1];
    return {
      x: a.x + (b.x - a.x) * tOnSegment,
      y: a.y + (b.y - a.y) * tOnSegment,
    };
  }

  function _computeHeading() {
    if (routePoints.length < 2 || segmentIndex >= routePoints.length - 1) return 0;
    const a = routePoints[segmentIndex];
    const b = routePoints[segmentIndex + 1];
    return Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI) + 90;
  }

  function _tick() {
    const route = getActiveRoute();
    if (!route || routePoints.length < 2) {
      // Re-initialize if a route just became available
      const pts = _buildRoutePoints(route);
      if (pts.length >= 2) {
        routePoints = pts;
        segmentIndex = 0;
        tOnSegment = 0;
      }
      return;
    }

    const dt = TICK_INTERVAL_MS / 1000; // seconds
    const speed = BASE_SPEED_MAP_UNITS_PER_SEC * speedMultiplier;
    let distToMove = speed * dt;

    // Advance along segments
    while (distToMove > 0 && segmentIndex < routePoints.length - 1) {
      const a = routePoints[segmentIndex];
      const b = routePoints[segmentIndex + 1];
      const segLen = distance(a, b);
      if (segLen === 0) { segmentIndex++; continue; }
      const remainingOnSeg = segLen * (1 - tOnSegment);
      if (distToMove >= remainingOnSeg) {
        distToMove -= remainingOnSeg;
        segmentIndex++;
        tOnSegment = 0;
      } else {
        tOnSegment += distToMove / segLen;
        distToMove = 0;
      }
    }

    // End of route
    if (segmentIndex >= routePoints.length - 1) {
      tOnSegment = 1;
      state = 'paused'; // Auto-pause at destination
      clearInterval(tickTimer);
      tickTimer = null;
    }

    let pos = _currentPosition();
    if (!pos) return;

    // Apply off-route drift (perpendicular offset)
    if (offRouteDrift) {
      const heading = _computeHeading();
      const perpRad = (heading - 90) * (Math.PI / 180);
      pos = { x: pos.x + Math.cos(perpRad) * OFF_ROUTE_DRIFT, y: pos.y + Math.sin(perpRad) * OFF_ROUTE_DRIFT };
    }

    processLocationUpdate({
      latitude: null,
      longitude: null,
      mapX: pos.x,
      mapY: pos.y,
      accuracy: lowAccuracy ? 35 : 5,
      heading: _computeHeading(),
      speed: BASE_SPEED_MAP_UNITS_PER_SEC * speedMultiplier,
      timestamp: Date.now(),
      floorId: floorId || getActiveFloorId(),
      source: 'simulation',
    });
  }

  function start() {
    const route = getActiveRoute();
    const pts = _buildRoutePoints(route);
    if (pts.length < 2) return false;
    routePoints = pts;
    segmentIndex = 0;
    tOnSegment = 0;
    state = 'running';
    clearInterval(tickTimer);
    tickTimer = setInterval(_tick, TICK_INTERVAL_MS);
    return true;
  }

  function pause() {
    if (state !== 'running') return;
    state = 'paused';
    clearInterval(tickTimer);
    tickTimer = null;
  }

  function resume() {
    if (state !== 'paused') return;
    state = 'running';
    tickTimer = setInterval(_tick, TICK_INTERVAL_MS);
  }

  function reset() {
    clearInterval(tickTimer);
    tickTimer = null;
    state = 'idle';
    routePoints = [];
    segmentIndex = 0;
    tOnSegment = 0;
    offRouteDrift = false;
  }

  function setSpeed(multiplier) {
    speedMultiplier = Math.max(0.1, Math.min(10, multiplier));
  }

  function setLowAccuracy(enabled) {
    lowAccuracy = enabled;
  }

  function setOffRoute(enabled) {
    offRouteDrift = enabled;
  }

  function returnToRoute() {
    offRouteDrift = false;
  }

  function getState() {
    return state;
  }

  function destroy() {
    clearInterval(tickTimer);
    tickTimer = null;
  }

  return { start, pause, resume, reset, setSpeed, setLowAccuracy, setOffRoute, returnToRoute, getState, destroy };
}

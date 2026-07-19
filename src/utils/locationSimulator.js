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
 * Multi-floor handling
 * ────────────────────
 * A multi-floor route has legs: [walkLeg, transferLeg, walkLeg, ...]
 *
 * Bug (original): _buildRoutePoints only loaded ONE floor's leg. When that
 * leg's points ran out the simulator auto-paused. The next floor was never
 * walked.
 *
 * Fix: _buildWalkPlan flattens all walk legs in order into a legPlan array.
 * Each entry: { floorId, points[] }. Transfer legs (no points) are skipped —
 * they represent the instant moment of taking an elevator/escalator/stair.
 * When the current leg's points run out we advance to the next leg, reset
 * the smoothing state in the pipeline (different floors have independent
 * coordinate spaces), and continue ticking without any pause or restart.
 */

import { distance } from './geometryHelpers.js';

/** Map units per second at 1× speed (roughly normal walking pace). */
const BASE_SPEED_MAP_UNITS_PER_SEC = 55;
const TICK_INTERVAL_MS = 100;

/** How far to drift off-route laterally when simulating off-route. */
const OFF_ROUTE_DRIFT = 45;

/**
 * @param {{
 *   getActiveRoute:          () => object | null,
 *   getActiveFloorId:        () => string,
 *   processLocationUpdate:   (update: object) => void,
 *   onPipelineReset?:        () => void,   — called when crossing a floor boundary
 * }} opts
 */
export function createRouteSimulator(opts) {
  const { getActiveRoute, getActiveFloorId, processLocationUpdate, onPipelineReset } = opts;

  let state = 'idle'; // 'idle' | 'running' | 'paused'
  let speedMultiplier = 1;
  let lowAccuracy = false;
  let offRouteDrift = false;
  let tickTimer = null;

  // ── Walk plan ─────────────────────────────────────────────────────────────
  // legPlan: ordered array of { floorId, points[] } — one entry per walk leg.
  // Transfer legs are excluded (they have no points and are instantaneous).
  let legPlan = [];
  let currentLegIndex = 0;  // index into legPlan
  let segmentIndex = 0;     // index into legPlan[currentLegIndex].points
  let tOnSegment = 0;       // 0→1 progress along current segment

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Build the full walk plan from a route. Returns [] if no walk legs found. */
  function _buildWalkPlan(route) {
    if (!route) return [];
    const legs = route.legs || [];
    const plan = [];
    for (const leg of legs) {
      // Skip transfer legs (elevator/escalator/stair instant teleport)
      if (leg.type !== 'walk') continue;
      if (!leg.points?.length) continue;
      plan.push({ floorId: leg.floorId, points: leg.points });
    }
    // If no multi-floor legs, fall back to the top-level route points
    if (!plan.length && route.points?.length && route.floorId) {
      plan.push({ floorId: route.floorId, points: route.points });
    }
    return plan;
  }

  function _currentLeg() {
    return legPlan[currentLegIndex] || null;
  }

  function _currentPosition() {
    const leg = _currentLeg();
    if (!leg) return null;
    const { points } = leg;
    if (points.length < 2 || segmentIndex >= points.length - 1) {
      return points[points.length - 1] || null;
    }
    const a = points[segmentIndex];
    const b = points[segmentIndex + 1];
    return {
      x: a.x + (b.x - a.x) * tOnSegment,
      y: a.y + (b.y - a.y) * tOnSegment,
    };
  }

  function _computeHeading() {
    const leg = _currentLeg();
    if (!leg) return 0;
    const { points } = leg;
    if (points.length < 2 || segmentIndex >= points.length - 1) return 0;
    const a = points[segmentIndex];
    const b = points[segmentIndex + 1];
    return Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI) + 90;
  }

  // ── Tick ──────────────────────────────────────────────────────────────────

  function _tick() {
    const route = getActiveRoute();

    // If no plan yet, try to build one now (route may have just become available)
    if (!legPlan.length) {
      const plan = _buildWalkPlan(route);
      if (plan.length) {
        legPlan = plan;
        currentLegIndex = 0;
        segmentIndex = 0;
        tOnSegment = 0;
        _devLog('plan built on tick', legPlan.map((l) => l.floorId));
      } else {
        return; // still no route
      }
    }

    let leg = _currentLeg();
    if (!leg) return;

    const dt = TICK_INTERVAL_MS / 1000;
    const speed = BASE_SPEED_MAP_UNITS_PER_SEC * speedMultiplier;
    let distToMove = speed * dt;

    // Advance along segments — may cross leg boundaries
    while (distToMove > 0) {
      leg = _currentLeg();
      if (!leg) break;

      const { points } = leg;

      // Advance within current leg
      while (distToMove > 0 && segmentIndex < points.length - 1) {
        const a = points[segmentIndex];
        const b = points[segmentIndex + 1];
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

      // Check if this leg is exhausted
      if (segmentIndex >= points.length - 1) {
        if (currentLegIndex < legPlan.length - 1) {
          // ── Floor transition ──────────────────────────────────────────────
          const prevFloor = leg.floorId;
          currentLegIndex++;
          segmentIndex = 0;
          tOnSegment = 0;
          const nextLeg = _currentLeg();
          _devLog(
            `floor transition: ${prevFloor} → ${nextLeg?.floorId}`,
            `next leg has ${nextLeg?.points?.length} points`,
          );
          // Reset smoothing so the EMA doesn't interpolate across floor boundaries.
          // Each floor has its own independent coordinate space.
          onPipelineReset?.();
          // Emit a position at the start of the new leg immediately
          if (nextLeg?.points?.length) {
            const startPt = nextLeg.points[0];
            processLocationUpdate({
              latitude: null, longitude: null,
              mapX: startPt.x, mapY: startPt.y,
              accuracy: lowAccuracy ? 35 : 5,
              heading: 0,
              speed: 0,
              timestamp: Date.now(),
              floorId: nextLeg.floorId,
              source: 'simulation',
            });
          }
          // Continue consuming remaining distToMove on the new leg
        } else {
          // ── End of entire route ───────────────────────────────────────────
          tOnSegment = 1;
          state = 'paused';
          clearInterval(tickTimer);
          tickTimer = null;
          _devLog('route complete — simulator paused at destination');
          distToMove = 0;
        }
      }
    }

    // Emit position from current leg
    leg = _currentLeg();
    if (!leg) return;
    let pos = _currentPosition();
    if (!pos) return;

    // Apply off-route drift (perpendicular offset)
    if (offRouteDrift) {
      const hdg = _computeHeading();
      const perpRad = (hdg - 90) * (Math.PI / 180);
      pos = {
        x: pos.x + Math.cos(perpRad) * OFF_ROUTE_DRIFT,
        y: pos.y + Math.sin(perpRad) * OFF_ROUTE_DRIFT,
      };
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
      floorId: leg.floorId,
      source: 'simulation',
    });
  }

  // ── Dev logging ───────────────────────────────────────────────────────────

  function _devLog(...args) {
    // Guarded by Vite's DEV constant — stripped in production builds
    if (import.meta.env.DEV || import.meta.env.VITE_DEV_LOCATION_SIMULATOR_ENABLED === 'true') {
      console.info('[simulator]', ...args);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function start() {
    const route = getActiveRoute();
    const plan = _buildWalkPlan(route);
    if (!plan.length) {
      _devLog('start() — no walk plan available (route:', route?.id, ')');
      return false;
    }
    legPlan = plan;
    currentLegIndex = 0;
    segmentIndex = 0;
    tOnSegment = 0;
    state = 'running';
    clearInterval(tickTimer);
    tickTimer = setInterval(_tick, TICK_INTERVAL_MS);
    _devLog(
      `started — ${plan.length} leg(s):`,
      plan.map((l) => `${l.floorId}(${l.points.length}pts)`).join(' → '),
    );
    return true;
  }

  function pause() {
    if (state !== 'running') return;
    state = 'paused';
    clearInterval(tickTimer);
    tickTimer = null;
    _devLog('paused at leg', currentLegIndex, 'seg', segmentIndex);
  }

  function resume() {
    if (state !== 'paused') return;
    state = 'running';
    tickTimer = setInterval(_tick, TICK_INTERVAL_MS);
    _devLog('resumed');
  }

  function reset() {
    clearInterval(tickTimer);
    tickTimer = null;
    state = 'idle';
    legPlan = [];
    currentLegIndex = 0;
    segmentIndex = 0;
    tOnSegment = 0;
    offRouteDrift = false;
    onPipelineReset?.();
    _devLog('reset');
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

  /** Returns the current debug snapshot — used by SimulatorPanel for logging. */
  function getDebugInfo() {
    const leg = _currentLeg();
    const pos = _currentPosition();
    return {
      state,
      legCount: legPlan.length,
      currentLegIndex,
      currentFloorId: leg?.floorId ?? null,
      segmentIndex,
      tOnSegment: Math.round(tOnSegment * 100) / 100,
      pointsInLeg: leg?.points?.length ?? 0,
      posX: pos ? Math.round(pos.x) : null,
      posY: pos ? Math.round(pos.y) : null,
    };
  }

  function destroy() {
    clearInterval(tickTimer);
    tickTimer = null;
    _devLog('destroyed');
  }

  return {
    start, pause, resume, reset,
    setSpeed, setLowAccuracy, setOffRoute, returnToRoute,
    getState, getDebugInfo, destroy,
  };
}

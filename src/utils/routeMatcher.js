/**
 * Route matcher: nearest-segment search, marker snapping, off-route detection.
 *
 * All functions are pure — they receive data and return results.
 * No state or side effects here.
 *
 * LIVE_ROUTE_MATCHING_ENABLED guards actual use in the pipeline;
 * this module is always importable for testing.
 */

import { distance } from './geometryHelpers.js';

/** Distance from point P to line segment AB (in map units). */
function pointToSegmentDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Nearest point on segment AB from P, with t ∈ [0,1]. */
function nearestPointOnSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { point: a, t: 0, segDist: distance(p, a) };
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const point = { x: a.x + t * dx, y: a.y + t * dy };
  return { point, t, segDist: distance(p, point) };
}

/**
 * Find the nearest position on the active route polyline.
 *
 * @param {{ x: number, y: number }} mapPoint  — user's current map position
 * @param {Array<{ x: number, y: number }>} points — route leg points
 * @returns {{
 *   snappedPoint: {x, y},
 *   segmentIndex: number,
 *   distanceToRoute: number,
 *   progressFraction: number   0→1 along the whole polyline
 * } | null}
 */
export function findNearestRoutePosition(mapPoint, points) {
  if (!points || points.length < 2) return null;

  let bestDist = Infinity;
  let bestSegIdx = 0;
  let bestSnap = points[0];

  // Pre-compute cumulative lengths for progress fraction
  const segLengths = [];
  let totalLength = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const len = distance(points[i], points[i + 1]);
    segLengths.push(len);
    totalLength += len;
  }

  let distanceTravelled = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const { point, t, segDist } = nearestPointOnSegment(mapPoint, points[i], points[i + 1]);
    if (segDist < bestDist) {
      bestDist = segDist;
      bestSegIdx = i;
      bestSnap = point;
    }
    distanceTravelled += segLengths[i];
  }

  // Recompute progress for the best segment
  let progressDist = 0;
  for (let i = 0; i < bestSegIdx; i++) progressDist += segLengths[i];
  if (segLengths[bestSegIdx] > 0) {
    const { t } = nearestPointOnSegment(mapPoint, points[bestSegIdx], points[bestSegIdx + 1]);
    progressDist += t * segLengths[bestSegIdx];
  }
  const progressFraction = totalLength > 0 ? progressDist / totalLength : 0;

  return {
    snappedPoint: bestSnap,
    segmentIndex: bestSegIdx,
    distanceToRoute: bestDist,
    progressFraction: Math.min(1, Math.max(0, progressFraction)),
  };
}

/**
 * Check whether user is off-route.
 *
 * @param {number} distanceToRoute — map units
 * @param {number} threshold       — map units; default 30 (roughly 3–5 m at OMA scale)
 */
export function isOffRoute(distanceToRoute, threshold = 30) {
  return distanceToRoute > threshold;
}

/**
 * Find which step/waypoint the user is currently nearest to,
 * given a set of instructions with associated positions.
 *
 * @param {{ x: number, y: number }} mapPoint
 * @param {Array<{ position?: {x,y}, text: string }>} instructions
 * @param {number} currentStepIndex  — don't go backward
 * @param {number} advanceThreshold  — map units to trigger advance (default 25)
 * @returns {number} new step index (same or higher)
 */
export function computeNearestStep(mapPoint, instructions, currentStepIndex, advanceThreshold = 25) {
  if (!instructions?.length) return currentStepIndex;
  let next = currentStepIndex;
  // Look ahead from current step — never go backward
  for (let i = currentStepIndex + 1; i < instructions.length; i++) {
    const pos = instructions[i]?.position;
    if (!pos) continue;
    if (distance(mapPoint, pos) <= advanceThreshold) {
      next = i;
    }
  }
  return next;
}

/**
 * Compute heading from a snapped position toward the next route point.
 * Returns degrees (0 = north/up, 90 = east/right in SVG space).
 */
export function computeRouteHeading(snappedPoint, points, segmentIndex) {
  const nextPt = points[segmentIndex + 1] || points[segmentIndex];
  if (!nextPt) return 0;
  return Math.atan2(nextPt.y - snappedPoint.y, nextPt.x - snappedPoint.x) * (180 / Math.PI) + 90;
}

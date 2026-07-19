/**
 * Indoor coordinate projection: lat/lng → map XY.
 *
 * Uses an affine (linear) transform computed from verified control points.
 * Requires at least 3 non-collinear points. Uses a least-squares fit when
 * more than 3 are available.
 *
 * This module is INERT until LIVE_LOCATION_PROJECTION_ENABLED is true
 * AND isCalibrationReady() returns true for the target floor.
 */

import { getVerifiedControlPoints, isCalibrationReady } from '../config/buildingCalibration.js';

/**
 * Solve a 6-parameter affine transform from an array of control points.
 * Each point: { latitude, longitude, mapX, mapY }
 *
 * Transform:  mapX = a*lng + b*lat + c
 *             mapY = d*lng + e*lat + f
 *
 * Returns { a, b, c, d, e, f } or null if the system is degenerate.
 */
function solveAffineTransform(points) {
  // Build matrix rows [lng, lat, 1] → mapX and mapY
  // Use least-squares via normal equations for N >= 3 points.
  const n = points.length;
  if (n < 3) return null;

  // Accumulators for 3×3 normal equation matrix [A^T A] and 3×1 RHS
  let sLat = 0, sLng = 0, sLatLat = 0, sLngLng = 0, sLatLng = 0;
  let sX = 0, sY = 0, sLatX = 0, sLngX = 0, sLatY = 0, sLngY = 0;

  for (const p of points) {
    sLat += p.latitude;
    sLng += p.longitude;
    sLatLat += p.latitude * p.latitude;
    sLngLng += p.longitude * p.longitude;
    sLatLng += p.latitude * p.longitude;
    sX += p.mapX;
    sY += p.mapY;
    sLatX += p.latitude * p.mapX;
    sLngX += p.longitude * p.mapX;
    sLatY += p.latitude * p.mapY;
    sLngY += p.longitude * p.mapY;
  }

  // A = [[sLngLng, sLatLng, sLng], [sLatLng, sLatLat, sLat], [sLng, sLat, n]]
  const A = [
    [sLngLng, sLatLng, sLng],
    [sLatLng, sLatLat, sLat],
    [sLng,    sLat,    n   ],
  ];
  const bX = [sLngX, sLatX, sX];
  const bY = [sLngY, sLatY, sY];

  const sol = (b) => solve3x3(A, b);
  const xCoeffs = sol(bX);
  const yCoeffs = sol(bY);
  if (!xCoeffs || !yCoeffs) return null;

  return {
    // mapX = a*lng + b*lat + c
    a: xCoeffs[0], b: xCoeffs[1], c: xCoeffs[2],
    // mapY = d*lng + e*lat + f
    d: yCoeffs[0], e: yCoeffs[1], f: yCoeffs[2],
  };
}

/** Solve a 3×3 linear system Ax = b using Cramer's rule. Returns null if singular. */
function solve3x3(A, b) {
  const det = (m) => (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
  const d = det(A);
  if (Math.abs(d) < 1e-12) return null; // degenerate / collinear
  const replaceCol = (col) => A.map((row, r) => row.map((v, c) => (c === col ? b[r] : v)));
  return [0, 1, 2].map((col) => det(replaceCol(col)) / d);
}

// Per-floor transform cache so we don't re-solve on every GPS update.
const _transformCache = new Map();

/**
 * Get (or compute and cache) the affine transform for a floor.
 * Returns null if calibration is not ready.
 */
function getTransform(floorId) {
  if (_transformCache.has(floorId)) return _transformCache.get(floorId);
  if (!isCalibrationReady(floorId)) {
    _transformCache.set(floorId, null);
    return null;
  }
  const points = getVerifiedControlPoints(floorId);
  const t = solveAffineTransform(points);
  _transformCache.set(floorId, t);
  return t;
}

/** Invalidate the cache (call after control-point data changes). */
export function invalidateTransformCache() {
  _transformCache.clear();
}

/**
 * Convert a WGS-84 lat/lng to map pixel coordinates for the given floor.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {string} floorId
 * @returns {{ x: number, y: number } | null}  null if calibration not ready
 */
export function latLngToMapPoint(latitude, longitude, floorId) {
  try {
    const t = getTransform(floorId);
    if (!t) return null;
    return {
      x: t.a * longitude + t.b * latitude + t.c,
      y: t.d * longitude + t.e * latitude + t.f,
    };
  } catch {
    return null;
  }
}

/**
 * Compute the residual error (in map units) for all verified control points
 * on a floor. Useful for validating calibration quality.
 * Returns an array of { id, errorMapUnits } or null if calibration not ready.
 */
export function calibrationResiduals(floorId) {
  const t = getTransform(floorId);
  if (!t) return null;
  const points = getVerifiedControlPoints(floorId);
  return points.map((p) => {
    const px = t.a * p.longitude + t.b * p.latitude + t.c;
    const py = t.d * p.longitude + t.e * p.latitude + t.f;
    const err = Math.hypot(px - p.mapX, py - p.mapY);
    return { id: p.id, errorMapUnits: err };
  });
}

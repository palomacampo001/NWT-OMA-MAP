/**
 * Building calibration control points.
 *
 * IMPORTANT: All control points below are UNVERIFIED placeholders.
 * Do not enable LIVE_LOCATION_PROJECTION_ENABLED until:
 *   1. At least THREE non-collinear points are measured on-site.
 *   2. Each measured point is marked verified: true.
 *   3. The projection error is < 3 m for all verified points.
 *
 * Shape of a control point:
 * {
 *   id: string,
 *   description: string,
 *   latitude: number,       — WGS-84 decimal degrees
 *   longitude: number,      — WGS-84 decimal degrees
 *   mapX: number,           — SVG/map pixel X coordinate
 *   mapY: number,           — SVG/map pixel Y coordinate
 *   floorId: string,        — must match floor.id in map data
 *   verified: boolean,      — false = not yet measured on-site
 *   source: string,         — who/how this was measured
 * }
 */

export const OMA_CALIBRATION = {
  buildingId: 'oma',
  // Minimum required verified points before projection is allowed.
  minVerifiedPoints: 3,
  floorCalibrations: [
    {
      floorId: 'floor-02',
      controlPoints: [
        {
          id: 'floor02-main-entrance',
          description: 'Main IBM OMA Entrance (Floor 2, ground-level lobby)',
          latitude: 41.2565,      // PLACEHOLDER — not surveyed
          longitude: -95.9345,    // PLACEHOLDER — not surveyed
          mapX: 145,              // approx from map asset
          mapY: 570,              // approx from map asset
          verified: false,
          source: 'placeholder — replace with on-site GPS measurement',
        },
        {
          id: 'floor02-sw-corner',
          description: 'South-west corner of Floor 2 footprint',
          latitude: 41.2561,      // PLACEHOLDER
          longitude: -95.9352,    // PLACEHOLDER
          mapX: 50,
          mapY: 750,
          verified: false,
          source: 'placeholder — replace with on-site GPS measurement',
        },
        {
          id: 'floor02-ne-corner',
          description: 'North-east corner of Floor 2 footprint',
          latitude: 41.2569,      // PLACEHOLDER
          longitude: -95.9338,    // PLACEHOLDER
          mapX: 1150,
          mapY: 80,
          verified: false,
          source: 'placeholder — replace with on-site GPS measurement',
        },
        {
          id: 'floor02-nw-corner',
          description: 'North-west corner of Floor 2 footprint',
          latitude: 41.2569,      // PLACEHOLDER
          longitude: -95.9352,    // PLACEHOLDER
          mapX: 50,
          mapY: 80,
          verified: false,
          source: 'placeholder — replace with on-site GPS measurement',
        },
      ],
    },
    // Additional floors share the same horizontal calibration;
    // add floor-specific entries here if vertical offset differs.
  ],
};

/**
 * Return the verified control points for a given floorId.
 * Returns an empty array if floorId not found or no verified points exist.
 */
export function getVerifiedControlPoints(floorId) {
  const entry = OMA_CALIBRATION.floorCalibrations.find((c) => c.floorId === floorId)
    || OMA_CALIBRATION.floorCalibrations[0]; // fall back to floor 2 (same building footprint)
  return (entry?.controlPoints || []).filter((p) => p.verified);
}

/**
 * Returns true only if the minimum verified-point requirement is met for this floor.
 */
export function isCalibrationReady(floorId) {
  return getVerifiedControlPoints(floorId).length >= OMA_CALIBRATION.minVerifiedPoints;
}

/**
 * CalibrationMapOverlay — renders raw projected GPS dot, route-matched dot,
 * accuracy radius circle, and captured calibration points on the Leaflet map.
 *
 * This is a pure React component that issues Leaflet layer mutations as a side-effect.
 * It is a sibling of IndoorMapViewer's internal layers and does NOT modify the viewer.
 *
 * Props:
 *   mapRef         — React ref to the Leaflet map instance (exposed by IndoorMapViewer via onMapReady)
 *   rawPoint       — { x, y } | null  (projected GPS position before smoothing/snapping)
 *   matchedPoint   — { x, y } | null  (route-matched position)
 *   markerPoint    — { x, y } | null  (actual navigation marker position)
 *   accuracyRadiusPx — number | null  (accuracy circle radius in map units)
 *   calibPoints    — CalibrationPoint[]
 *   currentFloorId — string
 *   showRaw        — boolean
 *   showMatched    — boolean
 *   showAccRadius  — boolean
 *   showCalibPts   — boolean
 */

import { useEffect, useRef } from 'react';

// Leaflet is loaded by IndoorMapViewer so we can reference the global L.
function getL() { return typeof window !== 'undefined' ? window.L : null; }

function pointLatLng(point) {
  // IndoorMapViewer's CRS maps pixel y → lat, pixel x → lng
  return [point.y, point.x];
}

export default function CalibrationMapOverlay({
  mapRef,
  rawPoint,
  matchedPoint,
  accuracyRadiusPx,
  calibPoints = [],
  currentFloorId,
  showRaw = true,
  showMatched = true,
  showAccRadius = true,
  showCalibPts = true,
}) {
  const rawMarkerRef      = useRef(null);
  const matchedMarkerRef  = useRef(null);
  const accCircleRef      = useRef(null);
  const calibLayerRef     = useRef(null);

  function ensureCalibLayer(map) {
    const L = getL();
    if (!L || !map) return null;
    if (!calibLayerRef.current) {
      calibLayerRef.current = L.layerGroup().addTo(map);
    }
    return calibLayerRef.current;
  }

  // Raw GPS dot (orange)
  useEffect(() => {
    const L = getL();
    const map = mapRef?.current;
    if (!L || !map) return;
    if (rawMarkerRef.current) { rawMarkerRef.current.remove(); rawMarkerRef.current = null; }
    if (!showRaw || !rawPoint) return;
    const icon = L.divIcon({
      className: '',
      html: `<div class="cal-raw-dot" title="Raw GPS position"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    rawMarkerRef.current = L.marker(pointLatLng(rawPoint), { icon, pane: 'markerPane', zIndexOffset: 4000 }).addTo(map);
  }, [rawPoint?.x, rawPoint?.y, showRaw]);

  // Route-matched dot (green)
  useEffect(() => {
    const L = getL();
    const map = mapRef?.current;
    if (!L || !map) return;
    if (matchedMarkerRef.current) { matchedMarkerRef.current.remove(); matchedMarkerRef.current = null; }
    if (!showMatched || !matchedPoint) return;
    const icon = L.divIcon({
      className: '',
      html: `<div class="cal-matched-dot" title="Route-matched position"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    matchedMarkerRef.current = L.marker(pointLatLng(matchedPoint), { icon, pane: 'markerPane', zIndexOffset: 3900 }).addTo(map);
  }, [matchedPoint?.x, matchedPoint?.y, showMatched]);

  // Accuracy radius circle
  useEffect(() => {
    const L = getL();
    const map = mapRef?.current;
    if (!L || !map) return;
    if (accCircleRef.current) { accCircleRef.current.remove(); accCircleRef.current = null; }
    if (!showAccRadius || !rawPoint || !accuracyRadiusPx) return;
    accCircleRef.current = L.circle(pointLatLng(rawPoint), {
      radius: accuracyRadiusPx,
      color: '#f97316',
      fillColor: '#f97316',
      fillOpacity: 0.08,
      weight: 1.5,
      pane: 'overlayPane',
    }).addTo(map);
  }, [rawPoint?.x, rawPoint?.y, accuracyRadiusPx, showAccRadius]);

  // Calibration point markers
  useEffect(() => {
    const L = getL();
    const map = mapRef?.current;
    if (!L || !map) return;
    const layer = ensureCalibLayer(map);
    if (!layer) return;
    layer.clearLayers();
    if (!showCalibPts) return;
    calibPoints
      .filter((p) => p.floorId === currentFloorId)
      .forEach((p) => {
        const icon = L.divIcon({
          className: '',
          html: `<div class="cal-pt-dot ${p.verified ? 'cal-pt-verified' : 'cal-pt-unverified'}" title="${p.label || 'Calibration point'}"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });
        L.marker([p.mapY, p.mapX], { icon, pane: 'markerPane' }).addTo(layer);
      });
  }, [calibPoints, currentFloorId, showCalibPts]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      rawMarkerRef.current?.remove();
      matchedMarkerRef.current?.remove();
      accCircleRef.current?.remove();
      calibLayerRef.current?.clearLayers();
    };
  }, []);

  return null; // all rendering is done via Leaflet
}

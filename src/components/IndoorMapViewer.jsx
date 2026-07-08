import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { AlertTriangle, Compass, Crosshair, LocateFixed, Navigation, Plus } from 'lucide-react';
import { featureCenter } from '../utils/navigation.js';

const svgCoordinateCrs = L.extend({}, L.CRS.Simple, {
  transformation: new L.Transformation(1, 0, 1, 0),
});

const amenityCategories = new Set([
  'cafeteria',
  'workspace',
  'meeting_area',
  'restricted',
  'event_area',
  'department',
  'wayfinding_zone',
  'custom',
  'kitchen',
  'pantry',
  'restroom',
  'reception',
  'elevator',
  'stairs',
  'entrance',
  'exit',
  'copy_print',
]);

const majorPoiCategories = new Set(['restroom', 'elevator', 'stairs', 'entrance', 'exit', 'reception']);

const paneZ = {
  overviewPane: 150,
  detailSvgPane: 200,
  spacePane: 300,
  graphPane: 420,
  majorPoiPane: 500,
  labelPane: 600,
  routeHaloPane: 880,
  routePane: 900,
  endpointPane: 930,
  activeLabelPane: 950,
};

const floorAccents = {
  'floor-us-oma-01': '#2563eb',
  'floor-us-oma-02': '#0f766e',
  'floor-03': '#7c3aed',
  'floor-04': '#ea580c',
  'floor-05': '#15803d',
};

function areaRatio(feature, viewBox) {
  return viewBox[2] * viewBox[3] ? (feature.bbox[2] * feature.bbox[3]) / (viewBox[2] * viewBox[3]) : 0;
}

function hasUsefulLabel(feature) {
  const label = `${feature.displayName || ''} ${feature.name || ''} ${feature.roomNumber || ''}`.trim().toLowerCase();
  const sourceId = String(feature.sourceSvg?.id || '').trim().toLowerCase();
  const displayName = String(feature.displayName || '').trim().toLowerCase();
  const name = String(feature.name || '').trim().toLowerCase();
  const sourceOnly = sourceId && (displayName === sourceId || name === sourceId);
  const technicalId = /^[a-z]?\d+[a-z]?\d*$/i.test(displayName) && !feature.roomNumber;
  return Boolean(label) && !sourceOnly && !technicalId && !['unknown', 'room', 'decorative'].includes(label);
}

function isVisualFeature(feature, viewBox) {
  if (feature.visible === false || feature.category === 'decorative' || feature.geometry?.type === 'LineString') return false;
  if (!['room', 'poi', 'custom_area'].includes(feature.type)) return false;
  if (feature.category === 'corridor' || feature.category === 'unknown' || feature.confidence < 0.75) return false;
  if (feature.sourceSvg?.preparedPackage || feature.sourceSvg?.manualApproved) return true;
  if (feature.geometry?.type === 'Polygon' && !['rect', 'polygon'].includes(feature.sourceSvg?.tag)) return false;
  if (!feature.bbox || feature.bbox.length < 4) return false;
  const ratio = areaRatio(feature, viewBox);
  const skinny = Math.max(feature.bbox[2], feature.bbox[3]) / Math.max(1, Math.min(feature.bbox[2], feature.bbox[3])) > 10;
  if (ratio > 0.85 && !hasUsefulLabel(feature) && !amenityCategories.has(feature.category)) return false;
  if (skinny && feature.category !== 'corridor' && !amenityCategories.has(feature.category)) return false;
  if (feature.category === 'unknown' && !hasUsefulLabel(feature)) return false;
  if (!hasUsefulLabel(feature) && ratio < 0.0012) return false;
  if (!hasUsefulLabel(feature) && skinny) return false;
  return ratio > 0.00008 || hasUsefulLabel(feature) || amenityCategories.has(feature.category);
}

function latLng(point) {
  return L.latLng(point[1], point[0]);
}

function pointLatLng(point) {
  return L.latLng(point.y, point.x);
}

function floorBoundsFromViewBox(viewBox) {
  return L.latLngBounds([viewBox[1], viewBox[0]], [viewBox[1] + viewBox[3], viewBox[0] + viewBox[2]]);
}

function boundsFromFeatures(features = [], fallbackBounds) {
  const boxes = features
    .filter((feature) => feature.visible !== false && feature.bbox?.length >= 4 && feature.type !== 'poi')
    .map((feature) => feature.bbox)
    .filter(([, , width, height]) => width > 0 && height > 0);
  if (!boxes.length) return fallbackBounds;
  const minX = Math.min(...boxes.map((box) => box[0]));
  const minY = Math.min(...boxes.map((box) => box[1]));
  const maxX = Math.max(...boxes.map((box) => box[0] + box[2]));
  const maxY = Math.max(...boxes.map((box) => box[1] + box[3]));
  return L.latLngBounds([minY, minX], [maxY, maxX]);
}

function focusInitialMobileFloor(map, bounds) {
  const isMobile = window.innerWidth < 768;
  if (isMobile) {
    map.fitBounds(bounds, {
      paddingTopLeft: [24, 132],
      paddingBottomRight: [24, 150],
      animate: false,
    });
    const currentZoom = map.getZoom();
    map.setZoom(Math.min(currentZoom + 0.9, map.getMaxZoom()), { animate: false });
  } else {
    map.fitBounds(bounds, { padding: [48, 48], animate: false });
  }
  map.invalidateSize({ animate: false });
}

function colorFor(feature) {
  const colors = {
    corridor: { fill: '#fdfdfb', stroke: '#aeb8b2' },
    restroom: { fill: '#e7f5ee', stroke: '#0f766e' },
    reception: { fill: '#d8e8ff', stroke: '#1967d2' },
    cafeteria: { fill: '#fff0bd', stroke: '#9a5b00' },
    kitchen: { fill: '#fff0bd', stroke: '#9a5b00' },
    pantry: { fill: '#fff0bd', stroke: '#9a5b00' },
    meeting_room: { fill: '#f0ecff', stroke: '#7c3aed' },
    elevator: { fill: '#efe7ff', stroke: '#5b21b6' },
    stairs: { fill: '#efe7ff', stroke: '#5b21b6' },
    lounge: { fill: '#ebf7f7', stroke: '#0f766e' },
    workspace: { fill: '#e7f5ee', stroke: '#0f766e' },
    meeting_area: { fill: '#f0ecff', stroke: '#7c3aed' },
    restricted: { fill: '#ffe4e6', stroke: '#be123c' },
    event_area: { fill: '#fff0bd', stroke: '#9a5b00' },
    department: { fill: '#e0f2fe', stroke: '#0369a1' },
    wayfinding_zone: { fill: '#e6f4ef', stroke: '#0f5132' },
    custom: { fill: '#eaf2ff', stroke: '#1967d2' },
  };
  return colors[feature.category] || { fill: '#f8faf8', stroke: '#9fa9a3' };
}

function iconFor(category) {
  const icons = {
    cafeteria: '☕',
    kitchen: '🍽',
    pantry: '☕',
    restroom: 'WC',
    reception: 'i',
    elevator: '↕',
    stairs: '↕',
    entrance: '↪',
    exit: 'Exit',
    copy_print: '⎙',
  };
  return icons[category] || '•';
}

function markerHtml(feature, variant = 'major') {
  const pulse = variant === 'selected' ? ' selected-marker-pulse' : '';
  return `<div class="leaflet-amenity leaflet-amenity-${variant} leaflet-amenity-${feature.category}${pulse}">${iconFor(feature.category)}</div>`;
}

function getFeatureTitle(feature) {
  const p = feature?.properties || feature || {};
  const candidates = [p.displayName, p.name, p.roomNumber, p.label, p.title, p.id, feature?.id];
  return candidates.map((value) => String(value || '').trim()).find(Boolean) || 'Unnamed location';
}

function lodForZoom(zoom, baseZoom) {
  const delta = zoom - baseZoom;
  return {
    delta,
    isLow: delta < 1.15,
    isMedium: delta >= 1.15 && delta < 2.55,
    isHigh: delta >= 2.55,
    isVeryHigh: delta >= 3.55,
  };
}

function backgroundOpacityForZoom(zoom, baseZoom) {
  const lod = lodForZoom(zoom, baseZoom);
  if (lod.isLow) return 0;
  if (lod.isMedium) return 0.24;
  if (lod.isVeryHigh) return 0.82;
  return 0.6;
}

function backgroundOpacityForFloor(floor, zoom, baseZoom) {
  if (String(floor?.id || '').startsWith('floor-directory-')) return 1;
  return backgroundOpacityForZoom(zoom, baseZoom);
}

function overviewStyleForZoom({ active, hovered, accent, zoom, baseZoom }) {
  const lod = lodForZoom(zoom, baseZoom);
  if (active) {
    return { color: accent, weight: 4, fillColor: accent, fillOpacity: 0.42, opacity: 1 };
  }
  return {
    color: hovered ? '#334155' : accent,
    weight: lod.isLow ? 1.9 : 1.35,
    fillColor: accent,
    fillOpacity: lod.isLow ? 0.26 : lod.isMedium ? 0.16 : 0.07,
    opacity: lod.isLow ? 0.82 : lod.isMedium ? 0.56 : 0.34,
  };
}

function spaceStyleForZoom({ active, hovered, colors, accent, zoom, baseZoom }) {
  const lod = lodForZoom(zoom, baseZoom);
  if (active) {
    return { color: accent, weight: 4, fillColor: colors.fill, fillOpacity: 0.42, opacity: 1 };
  }
  const fillOpacity = lod.isLow ? 0 : lod.isMedium ? 0.22 : lod.isVeryHigh ? 0.24 : 0.16;
  const opacity = lod.isLow ? 0 : lod.isMedium ? 0.7 : lod.isVeryHigh ? 0.95 : 0.84;
  return {
    color: hovered ? '#4a8be8' : colors.stroke,
    weight: lod.isVeryHigh ? 1.7 : 1.35,
    fillColor: colors.fill,
    fillOpacity,
    opacity,
  };
}

function isMajorPoi(feature) {
  return majorPoiCategories.has(feature.category);
}

function shouldRenderPoi(feature, { selectedId, highlightId, zoomLevel, baseZoom, activeRoute, layerOptions }) {
  const active = feature.id === selectedId || feature.id === highlightId;
  const lod = lodForZoom(zoomLevel, baseZoom);
  if (active) return true;
  if (activeRoute && layerOptions.hideClutterDuringNavigation) return false;
  if (layerOptions.showAllPois) return true;
  if (layerOptions.showMajorPois && isMajorPoi(feature)) return true;
  return layerOptions.showRoomLabels && lod.isVeryHigh && feature.category === 'room_label';
}

function labelHtml(feature, variant = 'selected') {
  const text = getFeatureTitle(feature);
  const longClass = text.length > 28 ? ' is-long' : '';
  return `<div class="leaflet-active-label leaflet-active-label-${variant}${longClass}" title="${text.replace(/"/g, '&quot;')}" aria-label="${text.replace(/"/g, '&quot;')}"><span class="leaflet-active-label-text">${text}</span></div>`;
}

function addLabel(group, feature, center, variant = 'selected') {
  if (!center) return;
  L.marker(pointLatLng(center), {
    pane: 'activeLabelPane',
    interactive: false,
    icon: L.divIcon({
      className: '',
      html: labelHtml(feature, variant),
    }),
  }).addTo(group);
}

function activeLegForFloor(route, floorId) {
  if (!route) return null;
  if (route.legs?.length) return route.legs.find((leg) => leg.type === 'walk' && leg.floorId === floorId) || null;
  return route.floorId === floorId ? route : null;
}

function editableRing(feature) {
  const ring = feature?.geometry?.coordinates?.[0] || [];
  if (!ring.length) return [];
  const openRing = ring.slice(0, -1);
  return openRing.map(([x, y]) => ({ x, y }));
}

function canDrawRouteLine(leg) {
  return ['manualGraph', 'previewGuidance'].includes(leg?.quality) && leg?.points?.length > 1;
}

export default function IndoorMapViewer({
  floor,
  selectedId,
  hoveredId,
  highlightId,
  addPoiMode,
  areaDrawingMode,
  areaDraftPoints = [],
  selectedVertexIndex,
  locatingMode,
  userLocation,
  locationState,
  startAnchor,
  routeGraph,
  activeRoute,
  adminMode = false,
  onSelectFeature,
  onHoverFeature,
  onAddPoi,
  onAddAreaPoint,
  onUpdateAreaVertex,
  onInsertAreaVertex,
  onSelectAreaVertex,
  onSetLocation,
}) {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const backgroundRef = useRef(null);
  const backgroundUrlRef = useRef('');
  const layerRef = useRef(null);
  const routeRef = useRef(null);
  const graphRef = useRef(null);
  const areaEditRef = useRef(null);
  const userMarkerRef = useRef(null);
  const anchorMarkerRef = useRef(null);
  const addPoiModeRef = useRef(addPoiMode);
  const areaDrawingModeRef = useRef(areaDrawingMode);
  const locatingModeRef = useRef(locatingMode);
  const [trackingMode, setTrackingMode] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(0);
  const [baseZoom, setBaseZoom] = useState(0);
  const [floorTransitioning, setFloorTransitioning] = useState(false);
  const [layerOptions, setLayerOptions] = useState({
    showMajorPois: true,
    showRoomLabels: false,
    showAllPois: false,
    showSpaces: true,
    hideClutterDuringNavigation: true,
  });
  const viewBox = floor?.viewBox || [0, 0, 1200, 800];
  const activeFloorLeg = activeLegForFloor(activeRoute, floor?.id);
  const floorAccent = floorAccents[floor?.id] || '#1967d2';
  const lod = lodForZoom(zoomLevel, baseZoom);
  const visualFeatures = useMemo(() => floor?.features?.filter((feature) => isVisualFeature(feature, viewBox)) || [], [floor, viewBox]);
  const selectedFeature = useMemo(() => visualFeatures.find((feature) => feature.id === selectedId || feature.id === highlightId) || null, [visualFeatures, selectedId, highlightId]);
  const renderStats = useMemo(() => {
    const spaces = visualFeatures.filter((feature) => feature.geometry?.type !== 'Point').length;
    const poiFeatures = visualFeatures.filter((feature) => feature.geometry?.type === 'Point');
    const visiblePoiCount = poiFeatures.filter((feature) => shouldRenderPoi(feature, {
      selectedId,
      highlightId,
      zoomLevel,
      baseZoom,
      activeRoute,
      layerOptions,
    })).length;
    return {
      searchable: floor?.features?.filter((feature) => feature.visible !== false).length || 0,
      spaces,
      visiblePoiCount,
      hiddenLabels: Math.max(0, poiFeatures.length - visiblePoiCount),
    };
  }, [visualFeatures, floor?.features, selectedId, highlightId, zoomLevel, baseZoom, activeRoute, layerOptions]);

  useEffect(() => {
    addPoiModeRef.current = addPoiMode;
    areaDrawingModeRef.current = areaDrawingMode;
    locatingModeRef.current = locatingMode;
  }, [addPoiMode, areaDrawingMode, locatingMode]);

  useEffect(() => {
    if (!floor?.id) return undefined;
    setFloorTransitioning(true);
    const timer = window.setTimeout(() => setFloorTransitioning(false), 260);
    return () => window.clearTimeout(timer);
  }, [floor?.id, selectedId, activeRoute, startAnchor, viewBox]);

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;
    const map = L.map(hostRef.current, {
      crs: svgCoordinateCrs,
      zoomControl: false,
      attributionControl: false,
      minZoom: -5,
      maxZoom: 5,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      maxBoundsViscosity: 0.85,
      preferCanvas: true,
    });
    Object.entries(paneZ).forEach(([name, zIndex]) => {
      map.createPane(name);
      map.getPane(name).style.zIndex = String(zIndex);
    });
    L.control.zoom({ position: 'topleft' }).addTo(map);
    map.on('zoomend', () => setZoomLevel(map.getZoom()));
    map.on('dragstart', () => setTrackingMode(false));
    map.on('click', (event) => {
      const point = { x: event.latlng.lng, y: event.latlng.lat };
      if (areaDrawingModeRef.current) {
        onAddAreaPoint(point);
        return;
      }
      if (addPoiModeRef.current) onAddPoi(point);
      if (locatingModeRef.current) {
        onSetLocation(point);
        setTrackingMode(true);
        map.setView(event.latlng, Math.max(map.getZoom(), 0));
      }
    });
    mapRef.current = map;
    setZoomLevel(map.getZoom());
    layerRef.current = L.layerGroup().addTo(map);
    routeRef.current = L.layerGroup().addTo(map);
    graphRef.current = L.layerGroup().addTo(map);
    areaEditRef.current = L.layerGroup().addTo(map);
    requestAnimationFrame(() => map.invalidateSize());
  }, [onAddPoi, onAddAreaPoint, onSetLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hostRef.current) return undefined;
    const observer = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    observer.observe(hostRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const container = map?.getContainer();
    if (!map || !container) return undefined;
    if (areaDrawingMode) {
      map.dragging.disable();
      container.classList.add('drawing-area-active');
    } else {
      map.dragging.enable();
      container.classList.remove('drawing-area-active');
    }
    return () => {
      map.dragging.enable();
      container.classList.remove('drawing-area-active');
    };
  }, [areaDrawingMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !floor) return;
    const bounds = floorBoundsFromViewBox(viewBox);
    map.setMaxBounds(bounds);
    const fittedZoom = map.getBoundsZoom(bounds, false, [32, 32]);
    setBaseZoom(fittedZoom);
    if (startAnchor?.floorId === floor.id && !selectedId && !activeRoute) {
      const isMobile = window.innerWidth < 768;
      const zoomBoost = isMobile ? 2.35 : 1.05;
      map.setView(pointLatLng(startAnchor.mapPoint), Math.min(fittedZoom + zoomBoost, map.getMaxZoom()), { animate: false });
      if (isMobile) {
        window.setTimeout(() => map.panBy([0, 72], { animate: false }), 0);
      }
    } else {
      focusInitialMobileFloor(map, boundsFromFeatures(visualFeatures, bounds));
    }
    map.setMinZoom(Math.max(-5, fittedZoom - 0.25));
    requestAnimationFrame(() => map.invalidateSize());
    window.setTimeout(() => map.invalidateSize({ animate: false }), 120);
    window.setTimeout(() => map.invalidateSize({ animate: false }), 420);
  }, [floor?.id]);

  useEffect(() => {
    if (!adminMode || floor?.id !== 'floor-us-oma-01') return;
    const entrance = floor.features?.find((feature) => feature.id === 'poi-main-ibm-entrance');
    if (entrance?.geometry?.type !== 'Point') return;
    const [x, y] = entrance.geometry.coordinates;
    const rendered = pointLatLng({ x, y });
    console.info(`Main IBM Entrance source point: x=${x}, y=${y}`);
    console.info(`Rendered Leaflet point: lat=${rendered.lat}, lng=${rendered.lng}`);
  }, [adminMode, floor]);

  useEffect(() => {
    const group = graphRef.current;
    if (!group) return;
    group.clearLayers();
    if (!adminMode || !routeGraph) return;
    const byId = new Map((routeGraph.nodes || []).map((node) => [node.id, node]));
    (routeGraph.edges || []).forEach((edge) => {
      const from = byId.get(edge.fromNodeId);
      const to = byId.get(edge.toNodeId);
      if (!from || !to) return;
      L.polyline([pointLatLng(from), pointLatLng(to)], {
        pane: 'graphPane',
        color: floorAccent,
        weight: 2,
        opacity: 0.72,
        dashArray: '4 6',
        interactive: false,
      }).addTo(group);
    });
    (routeGraph.nodes || []).forEach((node) => {
      L.circleMarker(pointLatLng(node), {
        pane: 'graphPane',
        radius: ['elevator', 'stair', 'escalator', 'entrance', 'reception'].includes(node.type) ? 5 : 3.5,
        color: '#ffffff',
        weight: 2,
        fillColor: floorAccent,
        fillOpacity: 0.92,
        opacity: 1,
        interactive: false,
      }).addTo(group);
    });
  }, [adminMode, routeGraph, floorAccent]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !floor) return undefined;
    if (backgroundRef.current) {
      backgroundRef.current.remove();
      backgroundRef.current = null;
    }
    if (backgroundUrlRef.current) {
      URL.revokeObjectURL(backgroundUrlRef.current);
      backgroundUrlRef.current = '';
    }
    const backgroundSource = floor.svgBackgroundUrl || floor.svgBackground;
    if (!backgroundSource) return undefined;
    const bounds = floorBoundsFromViewBox(viewBox);
    const url = floor.svgBackgroundUrl || URL.createObjectURL(new Blob([floor.svgBackground], { type: 'image/svg+xml' }));
    backgroundUrlRef.current = url;
    backgroundRef.current = L.imageOverlay(url, bounds, {
      opacity: backgroundOpacityForFloor(floor, zoomLevel, baseZoom),
      interactive: false,
      pane: 'detailSvgPane',
      className: 'leaflet-svg-background',
    }).addTo(map);
    backgroundRef.current.bringToBack();
    return () => {
      if (backgroundRef.current) {
        backgroundRef.current.remove();
        backgroundRef.current = null;
      }
      if (backgroundUrlRef.current && !floor.svgBackgroundUrl) {
        URL.revokeObjectURL(backgroundUrlRef.current);
        backgroundUrlRef.current = '';
      }
    };
  }, [floor?.id, floor?.svgBackground, floor?.svgBackgroundUrl, viewBox, baseZoom]);

  useEffect(() => {
    if (backgroundRef.current) backgroundRef.current.setOpacity(backgroundOpacityForFloor(floor, zoomLevel, baseZoom));
  }, [floor, zoomLevel, baseZoom]);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerRef.current;
    if (!map || !group) return;
    group.clearLayers();
    visualFeatures.forEach((feature) => {
      const active = feature.id === selectedId || feature.id === highlightId;
      const hovered = feature.id === hoveredId;
      if (feature.geometry.type === 'Point') {
        if (!shouldRenderPoi(feature, { selectedId, highlightId, zoomLevel, baseZoom, activeRoute, layerOptions })) return;
        const major = majorPoiCategories.has(feature.category);
        const variant = active ? 'selected' : major ? 'major' : 'tiny';
        const marker = L.marker(latLng(feature.geometry.coordinates), {
          pane: active ? 'endpointPane' : major ? 'majorPoiPane' : 'labelPane',
          interactive: !areaDrawingMode,
          icon: L.divIcon({ className: '', html: markerHtml(feature, variant), iconSize: active ? [34, 34] : major ? [20, 20] : [6, 6], iconAnchor: active ? [17, 17] : major ? [10, 10] : [3, 3] }),
        });
        if (!areaDrawingMode) {
          marker.on('click', () => onSelectFeature(feature));
          marker.on('mouseover', () => onHoverFeature(feature.id));
        }
        marker.addTo(group);
        if (active) addLabel(group, feature, featureCenter(feature), 'selected');
        return;
      }
      if (!layerOptions.showSpaces && !active) return;
      const ring = feature.geometry.coordinates?.[0] || [];
      if (!ring.length) return;
      const colors = colorFor(feature);
      const overviewStyle = overviewStyleForZoom({ active, hovered, accent: floorAccent, zoom: zoomLevel, baseZoom });
      const overviewPolygon = L.polygon(ring.map(latLng), {
        pane: 'overviewPane',
        className: `leaflet-overview-feature leaflet-category-${feature.category}`,
        interactive: !areaDrawingMode && (lod.isLow || active),
        ...overviewStyle,
      });
      if (!areaDrawingMode) {
        overviewPolygon.on('click', () => onSelectFeature(feature));
        overviewPolygon.on('mouseover', () => onHoverFeature(feature.id));
        overviewPolygon.on('mouseout', () => onHoverFeature(''));
      }
      overviewPolygon.addTo(group);
      if (activeRoute && layerOptions.hideClutterDuringNavigation && !active) return;
      if (lod.isLow && !active) return;
      const style = spaceStyleForZoom({ active, hovered, colors, accent: floorAccent, zoom: zoomLevel, baseZoom });
      const polygon = L.polygon(ring.map(latLng), {
        pane: 'spacePane',
        className: `leaflet-feature leaflet-category-${feature.category}`,
        interactive: !areaDrawingMode,
        ...style,
      });
      if (!areaDrawingMode) {
        polygon.on('click', () => onSelectFeature(feature));
        polygon.on('mouseover', () => onHoverFeature(feature.id));
        polygon.on('mouseout', () => onHoverFeature(''));
      }
      polygon.addTo(group);
      if (active) {
        const center = featureCenter(feature);
        addLabel(group, feature, center, 'selected');
      } else if (layerOptions.showRoomLabels && lod.isVeryHigh && hasUsefulLabel(feature) && areaRatio(feature, viewBox) > 0.0025) {
        const center = featureCenter(feature);
        addLabel(group, feature, center, 'quiet');
      }
    });
  }, [visualFeatures, selectedId, hoveredId, highlightId, onSelectFeature, onHoverFeature, viewBox, zoomLevel, baseZoom, floorAccent, lod.isLow, lod.isVeryHigh, activeRoute, layerOptions, areaDrawingMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const feature = visualFeatures.find((item) => item.id === selectedId);
    if (!feature || activeRoute) return;
    const [x, y, width, height] = feature.bbox;
    map.fitBounds(L.latLngBounds([y, x], [y + height, x + width]), { padding: [80, 80], maxZoom: 1.75, animate: true, duration: 0.45 });
  }, [selectedId]);

  useEffect(() => {
    const group = routeRef.current;
    const map = mapRef.current;
    if (!group || !map) return;
    group.clearLayers();
    const showUserArrow = userLocation?.floorId === floor?.id;
    if (canDrawRouteLine(activeFloorLeg)) {
      const routeLatLngs = activeFloorLeg.points.map(pointLatLng);
      const approximate = ['approximateGuidance', 'previewGuidance'].includes(activeFloorLeg.quality);
      const halo = L.polyline(routeLatLngs, {
        pane: 'routeHaloPane',
        color: '#ffffff',
        weight: approximate ? 17 : 16,
        opacity: 0.94,
        lineCap: 'round',
        lineJoin: 'round',
        className: 'route-halo',
      }).addTo(group);
      const line = L.polyline(routeLatLngs, {
        pane: 'routePane',
        color: '#0f62fe',
        weight: approximate ? 6 : 7,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round',
        dashArray: approximate ? '12 12' : null,
        className: approximate ? 'route-line-approximate route-line-preview' : 'route-line-real',
      }).addTo(group);
      const flow = !approximate
        ? L.polyline(routeLatLngs, { pane: 'routePane', color: '#93c5fd', weight: 3, opacity: 0.78, lineCap: 'round', lineJoin: 'round', dashArray: '12 18', className: 'route-line-flow-highlight' }).addTo(group)
        : null;
      const origin = showUserArrow ? null : L.marker(routeLatLngs[0], {
        pane: 'endpointPane',
        icon: L.divIcon({ className: '', html: '<div class="route-endpoint route-origin"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
      }).addTo(group);
      const destination = L.marker(routeLatLngs[routeLatLngs.length - 1], {
        pane: 'endpointPane',
        icon: L.divIcon({ className: '', html: `<div class="route-focus-ring"></div><div class="route-endpoint ${activeFloorLeg.connector ? 'route-transfer' : 'route-destination'}"></div>`, iconSize: [42, 42], iconAnchor: [21, 21] }),
      }).addTo(group);
      addLabel(group, { displayName: activeFloorLeg.connector ? `Go to ${activeFloorLeg.connector.name}` : activeFloorLeg.destinationName }, activeFloorLeg.points[activeFloorLeg.points.length - 1], 'selected');
      if (activeFloorLeg.endpointConnector?.from && activeFloorLeg.endpointConnector?.to) {
        L.polyline([pointLatLng(activeFloorLeg.endpointConnector.from), pointLatLng(activeFloorLeg.endpointConnector.to)], {
          pane: 'routePane',
          color: '#0f62fe',
          weight: 4,
          opacity: 0.72,
          lineCap: 'round',
          lineJoin: 'round',
          dashArray: '3 10',
          className: 'route-endpoint-connector',
        }).addTo(group);
        addLabel(group, { displayName: activeFloorLeg.endpointConnector.label || 'Destination is just off the hallway.' }, activeFloorLeg.endpointConnector.to, 'quiet');
      }
      halo.bringToFront();
      line.bringToFront();
      flow?.bringToFront();
      origin?.setZIndexOffset(1000);
      destination.setZIndexOffset(1000);
    } else if (activeFloorLeg?.routeAvailable && activeFloorLeg?.points?.length > 1) {
      const routeLatLngs = activeFloorLeg.points.map(pointLatLng);
      const origin = showUserArrow ? null : L.marker(routeLatLngs[0], {
        pane: 'endpointPane',
        icon: L.divIcon({ className: '', html: '<div class="route-endpoint route-origin"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
      }).addTo(group);
      const target = L.marker(routeLatLngs[routeLatLngs.length - 1], {
        pane: 'endpointPane',
        icon: L.divIcon({ className: '', html: `<div class="route-focus-ring"></div><div class="route-endpoint ${activeFloorLeg.connector ? 'route-transfer' : 'route-destination'}"></div>`, iconSize: [42, 42], iconAnchor: [21, 21] }),
      }).addTo(group);
      addLabel(group, { displayName: activeFloorLeg.connector ? `Go to ${activeFloorLeg.connector.name}` : activeFloorLeg.destinationName }, activeFloorLeg.points[activeFloorLeg.points.length - 1], 'selected');
      origin?.setZIndexOffset(1000);
      target.setZIndexOffset(1000);
    }
    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }
    if (userLocation?.floorId === floor?.id) {
      const userHeading = activeFloorLeg?.heading ?? activeRoute?.heading ?? 0;
      userMarkerRef.current = L.marker(pointLatLng(userLocation.point), {
        pane: 'endpointPane',
        icon: L.divIcon({
          className: '',
          html: `<div class="leaflet-you-ring"></div><div class="leaflet-you-heading" style="transform: rotate(${userHeading}deg)"><div class="leaflet-you-arrow"></div></div>`,
          iconSize: [44, 44],
          iconAnchor: [22, 22],
        }),
      }).addTo(map);
      userMarkerRef.current.setZIndexOffset(2500);
      if (trackingMode) map.setView(pointLatLng(userLocation.point), Math.max(map.getZoom(), 0));
    }
    if (anchorMarkerRef.current) {
      anchorMarkerRef.current.remove();
      anchorMarkerRef.current = null;
    }
    if (startAnchor?.floorId === floor?.id && ['outside', 'nearBuilding', 'denied'].includes(locationState?.mode) && !userLocation) {
      anchorMarkerRef.current = L.marker(pointLatLng(startAnchor.mapPoint), {
        pane: 'endpointPane',
        icon: L.divIcon({
          className: '',
          html: `<div class="route-focus-ring entrance-focus"></div><div class="start-anchor-marker"></div>`,
          iconSize: [46, 46],
          iconAnchor: [23, 23],
        }),
      }).addTo(map);
      addLabel(group, { displayName: startAnchor.name || 'Main Entrance' }, startAnchor.mapPoint, 'selected');
    }
  }, [activeRoute, activeFloorLeg, userLocation, floor?.id, trackingMode, startAnchor, locationState?.mode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !activeFloorLeg?.points?.length) return;
    const points = activeFloorLeg.points.map(pointLatLng);
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, {
      paddingTopLeft: [42, 96],
      paddingBottomRight: [42, 150],
      maxZoom: 2.35,
      animate: true,
      duration: 0.45,
    });
  }, [activeRoute?.id, activeFloorLeg?.id, floor?.id]);

  useEffect(() => {
    const group = areaEditRef.current;
    if (!group) return;
    group.clearLayers();

    if (adminMode && areaDrawingMode && areaDraftPoints.length) {
      const draftLatLngs = areaDraftPoints.map(pointLatLng);
      if (draftLatLngs.length > 1) {
        L.polyline(draftLatLngs, {
          pane: 'endpointPane',
          color: '#0f62fe',
          weight: 3,
          dashArray: '8 8',
          opacity: 0.9,
          interactive: false,
        }).addTo(group);
      }
      if (draftLatLngs.length > 2) {
        L.polygon(draftLatLngs, {
          pane: 'endpointPane',
          color: '#0f62fe',
          weight: 2,
          fillColor: '#0f62fe',
          fillOpacity: 0.12,
          dashArray: '8 8',
          interactive: false,
        }).addTo(group);
      }
      areaDraftPoints.forEach((point, index) => {
        L.marker(pointLatLng(point), {
          pane: 'endpointPane',
          interactive: false,
          icon: L.divIcon({ className: '', html: `<div class="area-vertex-handle draft">${index + 1}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] }),
        }).addTo(group);
      });
    }

    if (!adminMode || !selectedFeature || selectedFeature.type !== 'custom_area') return;
    const ring = editableRing(selectedFeature);
    if (ring.length < 3) return;

    ring.forEach((point, index) => {
      const marker = L.marker(pointLatLng(point), {
        pane: 'endpointPane',
        draggable: true,
        icon: L.divIcon({
          className: '',
          html: `<div class="area-vertex-handle ${selectedVertexIndex === index ? 'selected' : ''}">${index + 1}</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
      }).addTo(group);
      marker.on('click', (event) => {
        L.DomEvent.stopPropagation(event);
        onSelectAreaVertex?.(index);
      });
      marker.on('dragend', () => {
        const latlng = marker.getLatLng();
        onUpdateAreaVertex?.(selectedFeature, index, { x: latlng.lng, y: latlng.lat });
      });
    });

    ring.forEach((point, index) => {
      const next = ring[(index + 1) % ring.length];
      const midpoint = { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 };
      const marker = L.marker(pointLatLng(midpoint), {
        pane: 'endpointPane',
        icon: L.divIcon({
          className: '',
          html: '<div class="area-edge-add">+</div>',
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        }),
      }).addTo(group);
      marker.on('click', (event) => {
        L.DomEvent.stopPropagation(event);
        onInsertAreaVertex?.(selectedFeature, index, midpoint);
      });
    });
  }, [
    adminMode,
    areaDrawingMode,
    areaDraftPoints,
    selectedFeature,
    selectedVertexIndex,
    onSelectAreaVertex,
    onUpdateAreaVertex,
    onInsertAreaVertex,
  ]);

  function recenterOnMe() {
    const map = mapRef.current;
    if (!map || userLocation?.floorId !== floor?.id) return;
    setTrackingMode(true);
    map.setView(pointLatLng(userLocation.point), Math.max(map.getZoom(), 0.5));
  }

  function toggleLayerOption(key) {
    setLayerOptions((current) => ({ ...current, [key]: !current[key] }));
  }

  function captureAreaPoint(event) {
    const map = mapRef.current;
    const host = hostRef.current;
    if (!map || !host) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = host.getBoundingClientRect();
    const containerPoint = L.point(event.clientX - rect.left, event.clientY - rect.top);
    const latlng = map.containerPointToLatLng(containerPoint);
    onAddAreaPoint?.({ x: latlng.lng, y: latlng.lat });
  }

  return (
    <div className={['map-viewer leaflet-viewer', addPoiMode || locatingMode ? 'adding-poi' : '', floorTransitioning ? 'floor-layer-enter' : ''].filter(Boolean).join(' ')}>
      <div className="leaflet-map-host" ref={hostRef} />
      {adminMode && areaDrawingMode && (
        <button
          type="button"
          className="area-click-capture"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={captureAreaPoint}
          aria-label="Place area boundary point"
        />
      )}
      {(floor?.svgBackground || floor?.svgBackgroundUrl) && visualFeatures.length === 0 && (
        <div className="safe-mode-message">
          No reliable interactive rooms detected yet. Use review mode or manual POI/room tools.
        </div>
      )}
      <div className="map-toolbar leaflet-floating-toolbar">
        <button onClick={() => mapRef.current?.zoomIn()} title="Zoom in"><Plus size={17} /></button>
        <button onClick={() => mapRef.current?.zoomOut()} title="Zoom out">−</button>
        <button onClick={() => {
          const bounds = floorBoundsFromViewBox(viewBox);
          if (mapRef.current) focusInitialMobileFloor(mapRef.current, boundsFromFeatures(visualFeatures, bounds));
          setTrackingMode(false);
        }} title="Fit floor"><Crosshair size={17} /></button>
        <button className={trackingMode ? 'tracking-on' : ''} onClick={recenterOnMe} title="My location"><LocateFixed size={17} /></button>
      </div>
      {adminMode && (
        <div className="layer-toggles">
          <label><input type="checkbox" checked={layerOptions.showMajorPois} onChange={() => toggleLayerOption('showMajorPois')} /> Major POIs</label>
          <label><input type="checkbox" checked={layerOptions.showRoomLabels} onChange={() => toggleLayerOption('showRoomLabels')} /> Room labels</label>
          <label><input type="checkbox" checked={layerOptions.showAllPois} onChange={() => toggleLayerOption('showAllPois')} /> All POIs</label>
          <label><input type="checkbox" checked={layerOptions.showSpaces} onChange={() => toggleLayerOption('showSpaces')} /> Spaces</label>
          <label><input type="checkbox" checked={layerOptions.hideClutterDuringNavigation} onChange={() => toggleLayerOption('hideClutterDuringNavigation')} /> Hide clutter</label>
        </div>
      )}
      <div className="compass-widget">
        <div className="compass-ring">
          <Navigation size={24} style={{ transform: `rotate(${activeRoute?.heading || 0}deg)` }} />
        </div>
        <span>{activeRoute ? `To ${activeRoute.destinationName}` : 'No route'}</span>
      </div>
      {activeRoute && activeRoute.routeAvailable === false && (
        <div className="route-unavailable-banner">
          {activeRoute.unavailableReason}
        </div>
      )}
      {activeRoute?.quality === 'approximateGuidance' && activeRoute.routeAvailable !== false && (
        <div className="route-unavailable-banner approximate">
          Approximate guidance shown — follow visible hallways.
        </div>
      )}
      {!activeRoute && locationState?.message && (
        <div className={`location-guidance location-${locationState.mode || 'idle'}`}>
          <strong>{locationState.mode === 'outside' ? 'Outside building' : locationState.mode === 'nearBuilding' ? 'Near building' : locationState.mode === 'indoorAnchored' ? 'Indoor start set' : locationState.mode === 'denied' ? 'Location off' : 'Locating'}</strong>
          <span>{locationState.message}</span>
          {['outside', 'nearBuilding', 'denied'].includes(locationState.mode) && <small>Phone GPS may be inaccurate indoors. Tap Locate me to set your start.</small>}
        </div>
      )}
      <div className="map-status">
        <span>{floor.name}</span>
        <span>{renderStats.searchable} searchable</span>
        <span>{renderStats.visiblePoiCount} visible POIs</span>
        <span>{renderStats.spaces} spaces</span>
        <span>{renderStats.hiddenLabels} hidden labels</span>
        <span>{lod.isLow ? 'Overview' : lod.isMedium ? 'Medium detail' : lod.isVeryHigh ? 'Full detail' : 'Detail'}</span>
        {addPoiMode && <strong><AlertTriangle size={14} /> Click the map to place a POI</strong>}
        {locatingMode && <strong><Compass size={14} /> Click your indoor position</strong>}
        {activeRoute && <strong><Navigation size={14} /> Route active</strong>}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import AppShell from './components/AppShell.jsx';
import { parseSvg } from './utils/parseSvg.js';
import { generateIndoorMapData } from './utils/detectFeatures.js';
import { loadMapState, saveMapState } from './utils/storage.js';
import { planIndoorRoute } from './utils/navigation.js';
import { BUILDING_GEOFENCE, formatDistanceFeet, getDefaultStartAnchor, haversineDistanceMeters, isInsideBuildingGeofence } from './utils/locationConfig.js';
import { generateHallwayGraph, loadRouteGraphs, saveRouteGraphs } from './utils/routeGraphs.js';
import sampleMap from './data/sampleConvertedMap.json';
import {
  createBuilding,
  createFloor,
  cleanupFloorNoise,
  getIndoorMapJson,
  getPublishedMap,
  listBuildings,
  publishBuilding,
  createFeature as createFeatureApi,
  deleteFeature as deleteFeatureApi,
  updateFeature as updateFeatureApi,
  uploadSvgToFloor,
} from './api/indoorMapApi.js';

const initialMap = {
  building: 'Imported SVG Map',
  source: { type: 'svg', filename: '', viewBox: [0, 0, 1200, 820] },
  floors: [],
};

function floorName(index) {
  return `Floor ${index + 1}`;
}

function defaultStartAreaId(floors = []) {
  const floor = floors.find((item) => item.id === 'floor-us-oma-01') || floors[0];
  const feature = floor?.features?.find((item) => item.visible !== false && item.isDefaultStartArea)
    || floor?.features?.find((item) => item.visible !== false && item.id === 'space-main-ibm-entrance-lobby')
    || floor?.features?.find((item) => item.visible !== false && item.isDefaultStart);
  return feature?.id || '';
}

function closeRing(points) {
  if (!points.length) return points;
  const first = points[0];
  const last = points[points.length - 1];
  return first.x === last.x && first.y === last.y ? points : [...points, first];
}

function bboxFromMapPoints(points) {
  if (!points.length) return [0, 0, 0, 0];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return [minX, minY, Math.max(...xs) - minX, Math.max(...ys) - minY];
}

function polygonArea(points) {
  if (points.length < 3) return 0;
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2);
}

function polygonGeometry(points) {
  return {
    type: 'Polygon',
    coordinates: [closeRing(points).map((point) => [point.x, point.y])],
  };
}

export default function App() {
  const savedState = loadMapState();
  const isAdminUrl = new URLSearchParams(window.location.search).get('admin') === '1';
  const [mapData, setMapData] = useState(() => savedState || initialMap);
  const [activeFloorId, setActiveFloorId] = useState(() => savedState?.floors?.[0]?.id || '');
  const [selectedId, setSelectedId] = useState('');
  const [hoveredId, setHoveredId] = useState('');
  const [highlightId, setHighlightId] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState({ type: 'idle', message: '' });
  const [addPoiMode, setAddPoiMode] = useState(false);
  const [locatingMode, setLocatingMode] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [locationState, setLocationState] = useState({ mode: 'idle', message: 'Locating you…' });
  const [routeDestinationId, setRouteDestinationId] = useState('');
  const [adminMode, setAdminMode] = useState(isAdminUrl);
  const [published, setPublished] = useState(() => Boolean(savedState?.floors?.length));
  const [buildingId, setBuildingId] = useState(savedState?.building?.id || '');
  const [routeGraphs, setRouteGraphs] = useState({});
  const [connectorPreference, setConnectorPreference] = useState('any');
  const [areaDrawingMode, setAreaDrawingMode] = useState(false);
  const [areaDraftPoints, setAreaDraftPoints] = useState([]);
  const [selectedVertexIndex, setSelectedVertexIndex] = useState(null);

  useEffect(() => {
    const load = isAdminUrl
      ? async () => {
        const buildings = await listBuildings();
        for (const building of buildings) {
          const backendMap = await getIndoorMapJson(building.id).catch(() => null);
          if (backendMap?.floors?.length) return backendMap;
        }
        return null;
      }
      : () => getPublishedMap();

    load()
      .then((publishedMap) => {
        if (!publishedMap?.floors?.length) return;
        setMapData(publishedMap);
        setActiveFloorId(publishedMap.floors[0]?.id || '');
        setHighlightId(defaultStartAreaId(publishedMap.floors));
        setBuildingId(publishedMap.building?.id || '');
        setPublished(true);
        setAdminMode(isAdminUrl);
      })
      .catch(() => {
        if (!savedState?.floors?.length && sampleMap?.floors?.length) {
          setMapData(sampleMap);
          setActiveFloorId(sampleMap.floors[0]?.id || '');
          setHighlightId(defaultStartAreaId(sampleMap.floors));
          setPublished(true);
        }
      });
  }, [isAdminUrl]);

  useEffect(() => {
    if (adminMode || !mapData.floors.length || !navigator.geolocation) {
      if (!navigator.geolocation) setLocationState({ mode: 'denied', message: 'Location is off. You can still search or set your location manually.' });
      return undefined;
    }
    setLocationState({ mode: 'locating', message: 'Locating you…' });
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const latLng = { lat: position.coords.latitude, lng: position.coords.longitude };
        const meters = haversineDistanceMeters(latLng, BUILDING_GEOFENCE.center);
        if (isInsideBuildingGeofence(latLng, BUILDING_GEOFENCE)) {
          setLocationState({
            mode: 'nearBuilding',
            gps: latLng,
            accuracy: position.coords.accuracy,
            message: 'You’re near the building. For accurate indoor guidance, scan a QR code or set your starting point.',
          });
        } else {
          setLocationState({
            mode: 'outside',
            gps: latLng,
            accuracy: position.coords.accuracy,
            distanceMeters: meters,
            message: `Looks like you’re outside the building. Walk ${formatDistanceFeet(meters)} toward the highlighted entrance to start.`,
          });
        }
      },
      (error) => {
        setLocationState({
          mode: 'denied',
          message: error.code === 1
            ? 'Location permission is off. You can still search or set your location manually.'
            : 'Location is unavailable. Search or tap Locate me to set your indoor position.',
        });
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [adminMode, mapData.floors]);

  useEffect(() => {
    if (!isAdminUrl || buildingId) return;
    createBuilding({ name: 'Imported SVG Map', description: 'Created from admin uploader' })
      .then((building) => setBuildingId(building.id))
      .catch(() => {});
  }, [isAdminUrl, buildingId]);

  useEffect(() => {
    saveMapState(mapData);
  }, [mapData]);

  useEffect(() => {
    if (!mapData.floors.length) return;
    setRouteGraphs(loadRouteGraphs(mapData.floors));
  }, [mapData.floors]);

  function updateRouteGraph(floorId, updater) {
    setRouteGraphs((current) => {
      const next = { ...current, [floorId]: updater(current[floorId] || { floorId, status: 'admin_reviewed', nodes: [], edges: [] }) };
      saveRouteGraphs(next);
      return next;
    });
  }

  function generateActiveFloorRouteGraph() {
    if (!activeFloor) return;
    const graph = generateHallwayGraph(activeFloor);
    setRouteGraphs((current) => {
      const next = { ...current, [activeFloor.id]: graph };
      saveRouteGraphs(next);
      return next;
    });
    setStatus({ type: 'success', message: `Generated ${graph.nodes.length} hallway nodes and ${graph.edges.length} edges for review.` });
  }

  function selectFloor(floorId) {
    const nextFloor = mapData.floors.find((floor) => floor.id === floorId);
    setActiveFloorId(floorId);
    if (!nextFloor?.features.some((feature) => feature.id === selectedId)) setSelectedId('');
    if (!nextFloor?.features.some((feature) => feature.id === highlightId)) setHighlightId('');
    setSelectedVertexIndex(null);
    setAreaDrawingMode(false);
    setAreaDraftPoints([]);
    setAddPoiMode(false);
    setLocatingMode(false);
  }

  useEffect(() => {
    if (!activeFloorId && mapData.floors.length) {
      setActiveFloorId(mapData.floors[0].id);
    }
  }, [activeFloorId, mapData.floors]);

  const activeFloor = useMemo(
    () => mapData.floors.find((floor) => floor.id === activeFloorId) || mapData.floors[0],
    [mapData.floors, activeFloorId],
  );

  const selectedFeature = useMemo(() => {
    if (!selectedId) return null;
    return mapData.floors.flatMap((floor) => floor.features).find((feature) => feature.id === selectedId) || null;
  }, [mapData.floors, selectedId]);

  const routeDestination = useMemo(() => {
    if (!routeDestinationId) return null;
    return mapData.floors.flatMap((floor) => floor.features).find((feature) => feature.id === routeDestinationId) || null;
  }, [mapData.floors, routeDestinationId]);

  const routeDestinationFloor = useMemo(() => {
    if (!routeDestinationId) return null;
    return mapData.floors.find((floor) => floor.features.some((feature) => feature.id === routeDestinationId)) || null;
  }, [mapData.floors, routeDestinationId]);

  const activeRoute = useMemo(() => {
    if (!userLocation || !routeDestination || !routeDestinationFloor) return null;
    return planIndoorRoute({
      floors: mapData.floors,
      originFloorId: userLocation.floorId,
      originPoint: userLocation.point,
      destinationFloorId: routeDestinationFloor.id,
      destinationFeature: routeDestination,
      routeGraphs,
      connectorPreference,
    });
  }, [mapData.floors, userLocation, routeDestination, routeDestinationFloor, routeGraphs, connectorPreference]);

  function updateFloor(floorId, updater) {
    setMapData((current) => ({
      ...current,
      floors: current.floors.map((floor) => (floor.id === floorId ? updater(floor) : floor)),
    }));
  }

  async function handleUpload(files) {
    const svgFiles = Array.from(files).filter((file) => file.name.toLowerCase().endsWith('.svg'));
    if (!svgFiles.length) {
      setStatus({ type: 'error', message: 'Choose one or more .svg files.' });
      return;
    }

    try {
      setStatus({ type: 'loading', message: `Converting ${svgFiles.length} SVG file${svgFiles.length > 1 ? 's' : ''}...` });
      const building = buildingId ? { id: buildingId } : await createBuilding({ name: 'Imported SVG Map', description: 'Created from admin uploader' });
      setBuildingId(building.id);
      for (let i = 0; i < svgFiles.length; i += 1) {
        const file = svgFiles[i];
        const floorIndex = mapData.floors.length + i;
        const floor = await createFloor(building.id, { name: floorName(floorIndex), levelNumber: floorIndex + 1, sortOrder: floorIndex });
        await uploadSvgToFloor(floor.id, file);
      }
      const nextMap = await getIndoorMapJson(building.id);
      setMapData(nextMap);
      setActiveFloorId(nextMap.floors[0]?.id || activeFloorId);
      setSelectedId('');
      setRouteDestinationId('');
      setUserLocation(null);
      setStatus({ type: 'success', message: `Converted ${svgFiles.length} SVG floor${svgFiles.length > 1 ? 's' : ''} and saved to backend.` });
      setAdminMode(true);
    } catch (error) {
      // Fallback to local conversion if the backend is not running.
      try {
        const newFloors = [];
        for (let i = 0; i < svgFiles.length; i += 1) {
          const file = svgFiles[i];
          const svgText = await file.text();
          const parsed = parseSvg(svgText, file.name);
          const floorIndex = mapData.floors.length + i;
          newFloors.push(generateIndoorMapData(parsed, {
            floorId: `floor-${String(floorIndex + 1).padStart(2, '0')}-${Date.now()}-${i}`,
            floorName: floorName(floorIndex),
          }).floor);
        }
        setMapData((current) => ({ ...current, floors: [...current.floors, ...newFloors] }));
        setActiveFloorId(newFloors[0]?.id || activeFloorId);
        setStatus({ type: 'error', message: `Backend unavailable, saved as local draft only: ${error.message}` });
      } catch {
        setStatus({ type: 'error', message: error.message || 'The SVG could not be parsed.' });
      }
    }
  }

  function updateFeature(featureId, patch) {
    setMapData((current) => ({
      ...current,
      floors: current.floors.map((floor) => ({
        ...floor,
        features: floor.features.map((feature) => {
          if (feature.id !== featureId) return feature;
          const next = { ...feature, ...patch };
          if (!patch.displayName) {
            next.displayName = [next.name, next.roomNumber].filter(Boolean).join(' ') || next.category;
          }
          return next;
        }),
      })),
    }));
    const allowed = ['type', 'category', 'name', 'displayName', 'roomNumber', 'confidence', 'visible', 'isDeleted'];
    const apiPatch = Object.fromEntries(Object.entries(patch).filter(([key]) => allowed.includes(key)));
    if (patch.geometry) apiPatch.geometryJson = JSON.stringify(patch.geometry);
    if (patch.bbox) apiPatch.bboxJson = JSON.stringify(patch.bbox);
    updateFeatureApi(featureId, apiPatch).catch(() => {});
  }

  function addFeatureToFloor(floorId, feature) {
    setMapData((current) => ({
      ...current,
      floors: current.floors.map((floor) => (
        floor.id === floorId
          ? { ...floor, features: [...floor.features.filter((item) => item.id !== feature.id), feature] }
          : floor
      )),
    }));
  }

  function removeFeatureFromFloor(featureId) {
    setMapData((current) => ({
      ...current,
      floors: current.floors.map((floor) => ({
        ...floor,
        features: floor.features.filter((feature) => feature.id !== featureId),
      })),
    }));
  }

  function addPoi(point) {
    if (!activeFloor) return;
    const id = `poi-${Date.now()}`;
    const size = Math.max(activeFloor.viewBox[2], activeFloor.viewBox[3]) * 0.012;
    const feature = {
      id,
      type: 'poi',
      category: 'landmark',
      name: 'New POI',
      roomNumber: '',
      displayName: 'New POI',
      confidence: 1,
      visible: true,
      geometry: {
        type: 'Point',
        coordinates: [point.x, point.y],
      },
      bbox: [point.x - size, point.y - size, size * 2, size * 2],
      sourceSvg: { id: '', class: '', fill: '', stroke: '' },
      manual: true,
    };
    updateFloor(activeFloor.id, (floor) => ({ ...floor, features: [...floor.features, feature] }));
    setSelectedId(id);
    setHighlightId(id);
    setAddPoiMode(false);
    setStatus({ type: 'success', message: 'Saved New POI. Rename it in the inspector.' });
    createFeatureApi({
      id: feature.id,
      buildingId,
      floorId: activeFloor.id,
      sourceSvgId: null,
      type: feature.type,
      category: feature.category,
      name: feature.name,
      displayName: feature.displayName,
      roomNumber: feature.roomNumber,
      geometryJson: JSON.stringify(feature.geometry),
      bboxJson: JSON.stringify(feature.bbox),
      confidence: feature.confidence,
      visible: true,
      isDeleted: false,
      sourceMetadataJson: JSON.stringify({ source: 'admin-added-poi', editable: true, manualApproved: true }),
    }).catch(() => {});
  }

  function startAreaDrawing() {
    setAreaDrawingMode((value) => !value);
    setAreaDraftPoints([]);
    setSelectedVertexIndex(null);
    setAddPoiMode(false);
    setLocatingMode(false);
  }

  function addAreaPoint(point) {
    if (!areaDrawingMode) return;
    setAreaDraftPoints((points) => [...points, point]);
  }

  function undoAreaPoint() {
    setAreaDraftPoints((points) => points.slice(0, -1));
  }

  function cancelAreaDrawing() {
    setAreaDrawingMode(false);
    setAreaDraftPoints([]);
    setSelectedVertexIndex(null);
  }

  async function finishAreaDrawing() {
    if (!activeFloor) return;
    if (areaDraftPoints.length < 3 || polygonArea(areaDraftPoints) < 25) {
      setStatus({ type: 'error', message: 'Draw at least 3 points and make the area a little larger before saving.' });
      return;
    }
    const name = window.prompt('Area name', 'New area');
    if (!name?.trim()) {
      setStatus({ type: 'error', message: 'Area needs a name before saving.' });
      return;
    }
    const now = new Date().toISOString();
    const geometry = polygonGeometry(areaDraftPoints);
    const bbox = bboxFromMapPoints(areaDraftPoints);
    const feature = {
      id: `area-${Date.now()}`,
      floorId: activeFloor.id,
      type: 'custom_area',
      category: 'custom',
      name: name.trim(),
      displayName: name.trim(),
      visible: true,
      editable: true,
      source: 'admin-drawn',
      confidence: 1,
      geometry,
      bbox,
      createdAt: now,
      updatedAt: now,
      sourceSvg: { tag: 'polygon', source: 'admin-drawn', editable: true, manualApproved: true },
    };
    addFeatureToFloor(activeFloor.id, feature);
    setSelectedId(feature.id);
    setHighlightId(feature.id);
    setAreaDrawingMode(false);
    setAreaDraftPoints([]);
    setSelectedVertexIndex(null);
    setStatus({ type: 'success', message: `Saved ${feature.displayName}.` });
    createFeatureApi({
      id: feature.id,
      buildingId,
      floorId: activeFloor.id,
      sourceSvgId: null,
      type: feature.type,
      category: feature.category,
      name: feature.name,
      displayName: feature.displayName,
      roomNumber: '',
      geometryJson: JSON.stringify(feature.geometry),
      bboxJson: JSON.stringify(feature.bbox),
      confidence: 1,
      visible: true,
      isDeleted: false,
      sourceMetadataJson: JSON.stringify({ tag: 'polygon', source: 'admin-drawn', editable: true, manualApproved: true }),
    }).catch(() => {});
  }

  function updateAreaGeometry(featureId, points) {
    if (points.length < 3) return;
    updateFeature(featureId, {
      geometry: polygonGeometry(points),
      bbox: bboxFromMapPoints(points),
      updatedAt: new Date().toISOString(),
    });
  }

  function updateAreaVertex(feature, index, point) {
    const ring = feature.geometry.coordinates?.[0]?.slice(0, -1).map(([x, y]) => ({ x, y })) || [];
    if (!ring[index]) return;
    ring[index] = point;
    updateAreaGeometry(feature.id, ring);
  }

  function insertAreaVertex(feature, index, point) {
    const ring = feature.geometry.coordinates?.[0]?.slice(0, -1).map(([x, y]) => ({ x, y })) || [];
    ring.splice(index + 1, 0, point);
    updateAreaGeometry(feature.id, ring);
    setSelectedVertexIndex(index + 1);
  }

  function deleteSelectedAreaVertex() {
    const feature = selectedFeature;
    if (!feature || feature.type !== 'custom_area' || selectedVertexIndex == null) return;
    const ring = feature.geometry.coordinates?.[0]?.slice(0, -1).map(([x, y]) => ({ x, y })) || [];
    if (ring.length <= 3) {
      setStatus({ type: 'error', message: 'An area needs at least 3 points.' });
      return;
    }
    ring.splice(selectedVertexIndex, 1);
    setSelectedVertexIndex(null);
    updateAreaGeometry(feature.id, ring);
  }

  function deleteSelectedFeature() {
    const feature = selectedFeature;
    if (!feature) return;
    removeFeatureFromFloor(feature.id);
    setSelectedId('');
    setHighlightId('');
    setSelectedVertexIndex(null);
    deleteFeatureApi(feature.id).catch(() => {});
  }

  function setLocation(point) {
    if (!activeFloor) return;
    setUserLocation({ floorId: activeFloor.id, point });
    setLocationState({
      mode: 'indoorAnchored',
      floorId: activeFloor.id,
      mapPoint: point,
      message: 'Indoor start set. Phone GPS may still be inaccurate indoors.',
    });
    setLocatingMode(false);
  }

  function startRouteTo(feature, floorId) {
    if (!feature) return;
    setSelectedId(feature.id);
    setHighlightId(feature.id);
    setRouteDestinationId(feature.id);
    if (!userLocation && floorId) {
      const entrance = getDefaultStartAnchor(mapData.floors);
      if (entrance) {
        setActiveFloorId(entrance.floorId);
        setUserLocation({ floorId: entrance.floorId, point: entrance.mapPoint, approximate: true });
        setLocationState({
          mode: 'indoorAnchored',
          floorId: entrance.floorId,
          mapPoint: entrance.mapPoint,
          message: 'Starting from the highlighted entrance. Confirm your indoor position for best accuracy.',
        });
      } else {
        setActiveFloorId(floorId);
      }
    }
  }

  function restoreHidden() {
    if (!activeFloor) return;
    updateFloor(activeFloor.id, (floor) => ({
      ...floor,
      features: floor.features.map((feature) => ({ ...feature, visible: true })),
    }));
  }

  async function cleanupActiveFloor() {
    if (!activeFloor || !buildingId) return;
    try {
      const result = await cleanupFloorNoise(activeFloor.id);
      const nextMap = await getIndoorMapJson(buildingId);
      setMapData(nextMap);
      setStatus({ type: 'success', message: `Cleaned ${result.hidden} noisy detections from ${activeFloor.name}.` });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Cleanup failed.' });
    }
  }

  async function cleanupAllFloors() {
    if (!mapData.floors.length || !buildingId) return;
    try {
      let hidden = 0;
      for (const floor of mapData.floors) {
        const result = await cleanupFloorNoise(floor.id);
        hidden += result.hidden || 0;
      }
      const nextMap = await getIndoorMapJson(buildingId);
      setMapData(nextMap);
      setStatus({ type: 'success', message: `Cleared ${hidden} corrupted or unsafe features across all floors.` });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Cleanup failed.' });
    }
  }

  function resetDemo() {
    setMapData(sampleMap);
    setActiveFloorId(sampleMap.floors[0]?.id || '');
    setSelectedId('');
    setRouteDestinationId('');
    setUserLocation(null);
    setStatus({ type: 'success', message: 'Loaded sample converted indoor map.' });
    setPublished(true);
  }

  function clearAll() {
    setMapData(initialMap);
    setActiveFloorId('');
    setSelectedId('');
    setRouteDestinationId('');
    setUserLocation(null);
    setQuery('');
    setStatus({ type: 'idle', message: '' });
    setPublished(false);
    setAdminMode(false);
  }

  async function publishMap() {
    try {
      if (!buildingId) throw new Error('No backend building exists. Upload SVGs in admin mode first.');
      await publishBuilding(buildingId);
      const publishedMap = await getPublishedMap(buildingId);
      setMapData(publishedMap);
      setPublished(true);
      setAdminMode(false);
      setStatus({ type: 'success', message: 'Published map for public navigation.' });
    } catch {
      setPublished(true);
      setAdminMode(false);
      setStatus({ type: 'error', message: 'Published in this browser only. Restart dev server if the phone cannot load it.' });
    }
  }

  return (
    <AppShell
      mapData={mapData}
      activeFloor={activeFloor}
      activeFloorId={activeFloorId}
      selectedFeature={selectedFeature}
      selectedId={selectedId}
      hoveredId={hoveredId}
      highlightId={highlightId}
      query={query}
      status={status}
      addPoiMode={addPoiMode}
      areaDrawingMode={areaDrawingMode}
      areaDraftPoints={areaDraftPoints}
      selectedVertexIndex={selectedVertexIndex}
      locatingMode={locatingMode}
      userLocation={userLocation}
      locationState={locationState}
      startAnchor={getDefaultStartAnchor(mapData.floors)}
      routeGraphs={routeGraphs}
      activeRoute={activeRoute}
      connectorPreference={connectorPreference}
      routeDestinationId={routeDestinationId}
      buildingId={buildingId}
      adminMode={adminMode}
      published={published}
      onUpload={handleUpload}
      onSelectFloor={selectFloor}
      onSelectFeature={(feature, floorId) => {
        if (floorId) selectFloor(floorId);
        setSelectedId(feature?.id || '');
        setHighlightId(feature?.id || '');
      }}
      onHoverFeature={setHoveredId}
      onUpdateFeature={updateFeature}
      onAddAreaPoint={addAreaPoint}
      onStartAreaDrawing={startAreaDrawing}
      onFinishAreaDrawing={finishAreaDrawing}
      onUndoAreaPoint={undoAreaPoint}
      onCancelAreaDrawing={cancelAreaDrawing}
      onUpdateAreaVertex={updateAreaVertex}
      onInsertAreaVertex={insertAreaVertex}
      onSelectAreaVertex={setSelectedVertexIndex}
      onDeleteAreaVertex={deleteSelectedAreaVertex}
      onDeleteFeature={deleteSelectedFeature}
      onUpdateRouteGraph={updateRouteGraph}
      onGenerateRouteGraph={generateActiveFloorRouteGraph}
      onQueryChange={setQuery}
      onHighlight={setHighlightId}
      onAddPoi={addPoi}
      onSetLocation={setLocation}
      onToggleLocate={() => {
        setAddPoiMode(false);
        setAreaDrawingMode(false);
        setAreaDraftPoints([]);
        setLocatingMode((value) => !value);
      }}
      onRouteTo={startRouteTo}
      onConnectorPreferenceChange={setConnectorPreference}
      onClearRoute={() => setRouteDestinationId('')}
      onToggleAdmin={() => setAdminMode((value) => !value)}
      onPublish={publishMap}
      onToggleAddPoi={() => {
        setLocatingMode(false);
        setAreaDrawingMode(false);
        setAreaDraftPoints([]);
        setAddPoiMode((value) => !value);
      }}
      onRestoreHidden={restoreHidden}
      onCleanupFloor={cleanupActiveFloor}
      onCleanupAllFloors={cleanupAllFloors}
      onLoadSample={resetDemo}
      onClearAll={clearAll}
    />
  );
}

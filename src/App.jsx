import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import AppShell from './components/AppShell.jsx';
import VoiceTestDialog from './components/VoiceTestDialog.jsx';
import StartLocationSheet from './components/StartLocationSheet.jsx';
import RouteOriginRow from './components/RouteOriginRow.jsx';
// DEV_LOCATION_SIMULATOR_ENABLED is a compile-time boolean derived from
// VITE_DEV_LOCATION_SIMULATOR_ENABLED. Vite replaces import.meta.env.*
// with literals before bundling, turning this into `false` in production.
// Simulator modules use React.lazy / dynamic import so they are never
// included in production bundles (Vite DCE removes dead dynamic import branches
// when the condition is a compile-time constant).
import { CALIBRATION_MODE_ENABLED, DEV_LOCATION_SIMULATOR_ENABLED } from './config/featureFlags.js';
import { createLocationPipeline } from './utils/locationPipeline.js';
import { latLngToMapPoint } from './utils/locationProjection.js';
import { findNearestRoutePosition } from './utils/routeMatcher.js';
// SimulatorPanel — only bundled in preview builds (flag = true).
// React.lazy with a false condition is fully DCE'd by Vite/Rolldown.
const SimulatorPanel = DEV_LOCATION_SIMULATOR_ENABLED
  ? lazy(() => import('./components/SimulatorPanel.jsx'))
  : null;
// Calibration components — only bundled when CALIBRATION_MODE_ENABLED is true.
const CalibrationPanel = CALIBRATION_MODE_ENABLED
  ? lazy(() => import('./components/CalibrationPanel.jsx'))
  : null;
const CalibrationPointManager = CALIBRATION_MODE_ENABLED
  ? lazy(() => import('./components/CalibrationPointManager.jsx'))
  : null;
const CalibrationMapOverlay = CALIBRATION_MODE_ENABLED
  ? lazy(() => import('./components/CalibrationMapOverlay.jsx'))
  : null;
import {
  SMART_START_LOCATION_ENABLED,
  resolveProbableOrigin,
  saveConfirmedLocation,
  setRouteArrivalLocation,
  floorLabelFromId,
} from './utils/locationContextService.js';
import { parseSvg } from './utils/parseSvg.js';
import { generateIndoorMapData } from './utils/detectFeatures.js';
import { loadMapState, saveMapState } from './utils/storage.js';
import { featureCenter, formatFeatureLabel, planIndoorRoute } from './utils/navigation.js';
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
const LAST_INDOOR_START_KEY = 'nwt-oma-last-indoor-start';

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

function loadLastIndoorStart(floors = []) {
  try {
    const parsed = JSON.parse(localStorage.getItem(LAST_INDOOR_START_KEY) || 'null');
    if (!parsed?.floorId || !parsed?.point) return null;
    if (!floors.some((floor) => floor.id === parsed.floorId)) return null;
    if (!Number.isFinite(parsed.point.x) || !Number.isFinite(parsed.point.y)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveLastIndoorStart(location) {
  if (!location?.floorId || !location?.point) return;
  localStorage.setItem(LAST_INDOOR_START_KEY, JSON.stringify({
    floorId: location.floorId,
    point: location.point,
    savedAt: new Date().toISOString(),
  }));
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

function routeNodeDistance(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function nearestAttachableRouteNode(node, nodes, draftIds) {
  return (nodes || [])
    .filter((candidate) => candidate.id !== node?.id && !draftIds.has(candidate.id))
    .map((candidate) => ({ node: candidate, distance: routeNodeDistance(node, candidate) }))
    .sort((a, b) => a.distance - b.distance)[0] || null;
}

function routeEdgeKey(a, b) {
  return [a, b].sort().join('|');
}

function learnedRouteEdge(floorId, from, to, suffix = '') {
  return {
    id: `${floorId}-learned-edge-${Date.now().toString(36)}-${suffix}-${Math.round(Math.random() * 1000)}`,
    floorId,
    fromNodeId: from.id,
    toNodeId: to.id,
    distance: Math.round(routeNodeDistance(from, to)),
    accessible: true,
    source: 'admin',
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
  const [highContrast, setHighContrast] = useState(() => localStorage.getItem('nwt-high-contrast') === 'true');
  const [voiceGuidance, setVoiceGuidance] = useState(() => localStorage.getItem('nwt-voice-guidance') === 'true');
  // Show the voice-test bottom sheet after the user enables voice for the first time.
  const [showVoiceTest, setShowVoiceTest] = useState(false);
  // Live navigation step index — drives voice, floor, waypoint progression.
  // Never changed by step preview. Reset to 0 when a new route starts.
  const [activeNavigationStepIndex, setActiveNavigationStepIndex] = useState(0);
  // Smart start location state (only active when SMART_START_LOCATION_ENABLED = true)
  const [showStartSheet, setShowStartSheet] = useState(false);
  const [pendingDestinationFeature, setPendingDestinationFeature] = useState(null);
  const [pendingDestinationFloorId, setPendingDestinationFloorId] = useState(null);
  const [smartOriginLabel, setSmartOriginLabel] = useState('');
  const [areaDrawingMode, setAreaDrawingMode] = useState(false);
  const [areaDraftPoints, setAreaDraftPoints] = useState([]);
  const [selectedVertexIndex, setSelectedVertexIndex] = useState(null);
  const [routeNodeMode, setRouteNodeMode] = useState(false);
  const [routePathMode, setRoutePathMode] = useState(false);
  const [routePathDraftNodeIds, setRoutePathDraftNodeIds] = useState([]);
  const [routeNodeType, setRouteNodeType] = useState('hallway');
  const [startFloorPromptDismissed, setStartFloorPromptDismissed] = useState(false);
  const spokenRouteRef = useRef('');
  const routePathDraftNodeIdsRef = useRef([]);
  const routePathLastPointRef = useRef(null);
  const voicesRef = useRef([]);
  // Mirror voiceGuidance into a ref — always current even in stale closures.
  const voiceGuidanceRef = useRef(false);

  // ── Live-follow pipeline & simulator refs ─────────────────────────────────
  // These are refs (not state) so creation doesn't trigger renders.
  const activeRouteRef = useRef(null);
  const activeFloorIdRef = useRef('');
  const activeNavStepRef = useRef(0);
  const pipelineRef = useRef(null);
  const simulatorRef = useRef(null);

  // ── Calibration state ────────────────────────────────────────────────────
  const [calGpsState, setCalGpsState] = useState(null);
  const [calMapState, setCalMapState] = useState({});
  const [calStatusState, setCalStatusState] = useState({ watchActive: false, offRoute: false, permissionState: 'unknown' });
  const [calPoints, setCalPoints] = useState(() => {
    if (!CALIBRATION_MODE_ENABLED) return [];
    try { return JSON.parse(localStorage.getItem('nwt-cal-points') || '[]'); } catch { return []; }
  });
  const [calWalks, setCalWalks] = useState(() => {
    if (!CALIBRATION_MODE_ENABLED) return [];
    try { return JSON.parse(localStorage.getItem('nwt-cal-walks') || '[]'); } catch { return []; }
  });
  const [showCalManager, setShowCalManager] = useState(false);
  const [showCalOverlays, setShowCalOverlays] = useState({ raw: true, matched: true, radius: true, points: true });
  const [capturingPoint, setCapturingPoint] = useState(false);
  const [pendingGpsForCapture, setPendingGpsForCapture] = useState(null);
  const calMapRef = useRef(null);
  const walkRecorderRef = useRef(null);
  const [isRecordingWalk, setIsRecordingWalk] = useState(false);
  const offRouteStateRef = useRef(false);
  const activeLegIndexRef = useRef(0);
  // On iOS, speechSynthesis.speak() is blocked unless called synchronously
  // inside a user gesture. We store any pending speech here so the next
  // button tap (Repeat step, or any other tap) can drain it.
  const pendingSpeechRef = useRef('');

  // Populate voice list as soon as the browser makes it available.
  // speechSynthesis.getVoices() is async on Chrome/Android — it fires
  // the voiceschanged event when ready. Safari/iOS provides voices synchronously.
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    const loadVoices = () => { voicesRef.current = window.speechSynthesis.getVoices(); };
    loadVoices();
    if (!voicesRef.current.length) {
      window.speechSynthesis.addEventListener('voiceschanged', loadVoices, { once: true });
    }
  }

  function bestVoice() {
    const voices = voicesRef.current.length ? voicesRef.current : window.speechSynthesis.getVoices();
    const preferred = [
      'Samantha', 'Karen', 'Moira', 'Tessa', 'Veena',
      'Google US English', 'Google UK English Female', 'Google UK English Male',
      'Microsoft Aria Online (Natural)', 'Microsoft Jenny Online (Natural)',
      'Microsoft Guy Online (Natural)',
    ];
    return (
      preferred.reduce((found, name) => found || voices.find((v) => v.name === name), null) ||
      voices.find((v) => v.lang.startsWith('en') && /Natural|Enhanced|Premium|Online/.test(v.name)) ||
      voices.find((v) => v.lang.startsWith('en') && v.localService === false) ||
      voices.find((v) => v.lang.startsWith('en')) ||
      null
    );
  }

  // Keep ref in sync on every render.
  voiceGuidanceRef.current = voiceGuidance;

  function _doSpeak(text) {
    if (!text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.92;
    utterance.pitch = 1;
    utterance.volume = 1;
    const pick = bestVoice();
    if (pick) utterance.voice = pick;
    window.speechSynthesis.speak(utterance);
  }

  function speakInstruction(text, { force = false } = {}) {
    if ((!voiceGuidanceRef.current && !force) || !text) return;
    // Store as pending regardless — if iOS blocked the call below, the next
    // user tap via drainPendingSpeech() will speak it.
    pendingSpeechRef.current = text;
    _doSpeak(text);
  }

  // Called inside every direct user-gesture handler so iOS gets a chance to
  // speak anything that was queued by a useEffect (which iOS blocks).
  function drainPendingSpeech() {
    const text = pendingSpeechRef.current;
    if (!text || !voiceGuidanceRef.current) return;
    pendingSpeechRef.current = '';
    _doSpeak(text);
  }

  function currentRouteInstruction(route = activeRoute) {
    if (!route) return '';
    if (route.routeAvailable === false) return route.instructions?.[0]?.text || route.unavailableReason || '';
    return route.instructions?.[0]?.text || route.notice || `Walking to ${route.destinationName}`;
  }

  useEffect(() => {
    document.documentElement.classList.toggle('high-contrast', highContrast);
    localStorage.setItem('nwt-high-contrast', String(highContrast));
  }, [highContrast]);

  useEffect(() => {
    localStorage.setItem('nwt-voice-guidance', String(voiceGuidance));
    if (!voiceGuidance && window.speechSynthesis) window.speechSynthesis.cancel();
  }, [voiceGuidance]);

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

  const defaultStartAnchor = useMemo(() => getDefaultStartAnchor(mapData.floors), [mapData.floors]);
  const defaultRouteOrigin = useMemo(() => {
    if (userLocation) return userLocation;
    const saved = loadLastIndoorStart(mapData.floors);
    if (saved) return { floorId: saved.floorId, point: saved.point, source: 'lastKnownIndoorStart' };
    if (!defaultStartAnchor?.mapPoint) return null;
    return { floorId: defaultStartAnchor.floorId, point: defaultStartAnchor.mapPoint, source: 'defaultStartAnchor' };
  }, [mapData.floors, userLocation, defaultStartAnchor]);

  useEffect(() => {
    if (adminMode || !mapData.floors.length || !navigator.geolocation) {
      if (!navigator.geolocation) setLocationState({ mode: 'denied', message: 'Location is off. You can still search or set your location manually.' });
      return undefined;
    }
    navigator.geolocation.getCurrentPosition(
      () => {},
      () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 },
    );
    if (!userLocation) setLocationState({ mode: 'locating', message: 'Locating you…' });
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const latLng = { lat: position.coords.latitude, lng: position.coords.longitude };
        const meters = haversineDistanceMeters(latLng, BUILDING_GEOFENCE.center);

        // ── Calibration mode: feed every GPS update into the pipeline ────────
        if (CALIBRATION_MODE_ENABLED) {
          const gps = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            heading: position.coords.heading,
            speed: position.coords.speed,
            altitude: position.coords.altitude,
            timestamp: position.timestamp,
          };
          setCalGpsState(gps);
          setCalStatusState((prev) => ({ ...prev, watchActive: true }));
          setPendingGpsForCapture(gps);

          // Project to map XY if calibration points are available
          const projected = latLngToMapPoint(position.coords.latitude, position.coords.longitude, activeFloorIdRef.current);
          let matchResult = null;
          if (projected && pipelineRef.current) {
            pipelineRef.current.processLocationUpdate({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              mapX: projected.x,
              mapY: projected.y,
              accuracy: position.coords.accuracy,
              heading: position.coords.heading,
              speed: position.coords.speed,
              timestamp: position.timestamp,
              floorId: activeFloorIdRef.current,
              source: 'gps',
            });
            // Compute route match for display
            const activeRouteCurrent = activeRouteRef.current;
            if (activeRouteCurrent) {
              const leg = activeRouteCurrent.legs?.find((l) => l.floorId === activeFloorIdRef.current);
              if (leg?.points?.length >= 2) {
                matchResult = findNearestRoutePosition({ x: projected.x, y: projected.y }, leg.points);
              }
            }
          }
          setCalMapState({
            floorId: activeFloorIdRef.current,
            projectedX: projected?.x ?? null,
            projectedY: projected?.y ?? null,
            markerX: null,
            markerY: null,
            distToRoute: matchResult?.distanceToRoute ?? null,
            routeConfidence: matchResult ? (offRouteStateRef.current ? 'off-route' : 'good') : 'no-route',
            activeStep: activeNavStepRef.current,
          });
          // Walk recorder
          if (walkRecorderRef.current?.isRecording()) {
            walkRecorderRef.current.addSample({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              heading: position.coords.heading,
              speed: position.coords.speed,
              projectedX: projected?.x ?? null,
              projectedY: projected?.y ?? null,
              matchedX: matchResult?.snappedPoint?.x ?? null,
              matchedY: matchResult?.snappedPoint?.y ?? null,
              nearestSegmentId: matchResult?.segmentIndex != null ? `seg-${matchResult.segmentIndex}` : null,
            });
          }
        }

        if (userLocation) {
          setLocationState({
            mode: position.coords.accuracy > 40 ? 'indoorLowConfidence' : 'indoorUserConfirmed',
            floorId: userLocation.floorId,
            mapPoint: userLocation.point,
            gps: latLng,
            accuracy: position.coords.accuracy,
            message: position.coords.accuracy > 40
              ? 'Indoor start set. GPS accuracy is low indoors, so update your position manually if needed.'
              : 'Indoor start set. GPS is updating, but indoor accuracy may vary.',
          });
          return;
        }
        if (isInsideBuildingGeofence(latLng, BUILDING_GEOFENCE)) {
          const saved = loadLastIndoorStart(mapData.floors);
          const origin = saved || defaultRouteOrigin;
          if (origin?.floorId) setActiveFloorId(origin.floorId);
          setLocationState({
            mode: position.coords.accuracy > 55 ? 'indoorLowConfidence' : 'indoorDefaultAnchor',
            gps: latLng,
            accuracy: position.coords.accuracy,
            floorId: origin?.floorId,
            mapPoint: origin?.point,
            message: origin?.source === 'lastKnownIndoorStart'
              ? 'Using your last start point. Tap Locate me to change.'
              : 'Using Main Entrance as your start point. Tap Locate me to change.',
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
      { enableHighAccuracy: true, maximumAge: 1500, timeout: 10000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [adminMode, mapData.floors, userLocation?.floorId, userLocation?.point?.x, userLocation?.point?.y, defaultRouteOrigin]);

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

  // ── Mirror live-follow refs so closures inside the pipeline always see
  //    current values without re-creating the pipeline on every render. ────────
  useEffect(() => { activeRouteRef.current = activeRoute; });
  useEffect(() => { activeFloorIdRef.current = activeFloorId; });
  useEffect(() => { activeNavStepRef.current = activeNavigationStepIndex; });

  // ── Initialize location pipeline & simulator once ─────────────────────────
  useEffect(() => {
    const pipeline = createLocationPipeline({
      getActiveRoute:      () => activeRouteRef.current,
      getActiveFloorId:    () => activeFloorIdRef.current,
      getCurrentStepIndex: () => activeNavStepRef.current,
      onMarkerUpdate: (loc) => {
        // Only move the marker when the update came from simulation or (future) live GPS.
        // Manual updates already call setUserLocation directly.
        if (loc.source === 'manual') return;
        setUserLocation({ floorId: loc.floorId, point: loc.point, source: loc.source });
      },
      onStepAdvance: (newIndex) => {
        setActiveNavigationStepIndex(newIndex);
      },
      onOffRoute: (offRoute) => {
        // Future: show off-route banner
        if (import.meta.env.DEV) console.info('[pipeline] off-route:', offRoute);
      },
      onFloorChange: (floorId) => {
        setActiveFloorId(floorId);
      },
    });
    pipelineRef.current = pipeline;

    // ── Walk recorder ───────────────────────────────────────────────────────
    if (CALIBRATION_MODE_ENABLED) {
      import('./utils/walkRecorder.js').then(({ createWalkRecorder }) => {
        walkRecorderRef.current = createWalkRecorder({
          getActiveRoute:      () => activeRouteRef.current,
          getActiveFloorId:    () => activeFloorIdRef.current,
          getCurrentStepIndex: () => activeNavStepRef.current,
          getActiveLegIndex:   () => activeLegIndexRef.current,
          isOffRoute:          () => offRouteStateRef.current,
          onSampleAdded:       () => setIsRecordingWalk(true), // force re-render for count update
        });
      });
    }

    if (DEV_LOCATION_SIMULATOR_ENABLED) {
      // Dynamic import — Vite eliminates this entire branch (including the
      // import() call) in production builds where DEV_LOCATION_SIMULATOR_ENABLED
      // compiles to `false`.
      import('./utils/locationSimulator.js').then(({ createRouteSimulator }) => {
        const sim = createRouteSimulator({
          getActiveRoute:          () => activeRouteRef.current,
          getActiveFloorId:        () => activeFloorIdRef.current,
          processLocationUpdate:   pipeline.processLocationUpdate,
          // Called by the simulator on every floor transition so the pipeline's
          // exponential smoothing state does not bleed across floor boundaries.
          onPipelineReset:         () => pipeline.reset(),
        });
        simulatorRef.current = sim;
      });
    }

    return () => {
      simulatorRef.current?.destroy();
      simulatorRef.current = null;
      pipelineRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once — refs keep values current

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

  function addRouteGraphNode(point, type = routeNodeType) {
    if (!activeFloor) return;
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) {
      setRouteNodeMode(false);
      setStatus({ type: 'error', message: 'That click was outside the map. Try Place node on map again and click directly on the hallway.' });
      return;
    }
    const node = {
      id: `${activeFloor.id}-manual-${Date.now().toString(36)}`,
      floorId: activeFloor.id,
      x: Math.round(point.x),
      y: Math.round(point.y),
      type,
      name: `${type.replace('_', ' ')} node`,
      source: 'admin',
    };
    updateRouteGraph(activeFloor.id, (current) => ({
      floorId: activeFloor.id,
      status: 'admin_reviewed',
      nodes: [],
      edges: [],
      ...current,
      nodes: [...(current.nodes || []), node],
    }));
    setRouteNodeMode(false);
    setStatus({ type: 'success', message: 'Route node added. Select two manual nodes in Admin and tap Connect 2.' });
  }

  function addRoutePathPoint(point) {
    if (!activeFloor) return;
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) {
      setStatus({ type: 'error', message: 'That click was outside the map. Keep clicking directly on the hallway.' });
      return;
    }
    const lastPoint = routePathLastPointRef.current;
    if (lastPoint && Math.hypot(lastPoint.x - point.x, lastPoint.y - point.y) < 18) return;
    routePathLastPointRef.current = point;
    const previousNodeId = routePathDraftNodeIdsRef.current.at(-1);
    const node = {
      id: `${activeFloor.id}-path-${Date.now().toString(36)}-${Math.round(Math.random() * 1000)}`,
      floorId: activeFloor.id,
      x: Math.round(point.x),
      y: Math.round(point.y),
      type: 'hallway',
      name: 'Learned route point',
      source: 'admin',
    };
    updateRouteGraph(activeFloor.id, (current) => {
      const nodes = [...(current.nodes || []), node];
      const previousNode = previousNodeId ? nodes.find((item) => item.id === previousNodeId) : null;
      const edges = [...(current.edges || [])];
      if (previousNode) {
        edges.push({
          id: `${activeFloor.id}-path-edge-${Date.now().toString(36)}-${Math.round(Math.random() * 1000)}`,
          floorId: activeFloor.id,
          fromNodeId: previousNode.id,
          toNodeId: node.id,
          distance: Math.round(Math.hypot(previousNode.x - node.x, previousNode.y - node.y)),
          accessible: true,
          source: 'admin',
        });
      }
      return {
        floorId: activeFloor.id,
        status: 'admin_reviewed',
        nodes: [],
        edges: [],
        ...current,
        nodes,
        edges,
      };
    });
    const nextDraft = [...routePathDraftNodeIdsRef.current, node.id];
    routePathDraftNodeIdsRef.current = nextDraft;
    setRoutePathDraftNodeIds(nextDraft);
    setStatus({ type: 'success', message: nextDraft.length === 1 ? 'First route point added. Keep clicking along the hallway.' : `Route path has ${nextDraft.length} points. Finish when it reaches the destination.` });
  }

  function startRoutePathDrawing() {
    routePathDraftNodeIdsRef.current = [];
    routePathLastPointRef.current = null;
    setRoutePathDraftNodeIds([]);
    setRoutePathMode(true);
    setRouteNodeMode(false);
    setAddPoiMode(false);
    setAreaDrawingMode(false);
    setAreaDraftPoints([]);
    setLocatingMode(false);
    setStatus({ type: 'info', message: 'Pencil mode: drag along the hallway route you want.' });
  }

  function finishRoutePathDrawing() {
    const pointCount = routePathDraftNodeIdsRef.current.length;
    const draftIds = new Set(routePathDraftNodeIdsRef.current);
    if (pointCount > 1 && activeFloor) {
      updateRouteGraph(activeFloor.id, (current) => {
        const nodes = [...(current.nodes || [])];
        const edges = [...(current.edges || [])];
        const draftNodes = routePathDraftNodeIdsRef.current
          .map((id) => nodes.find((node) => node.id === id))
          .filter(Boolean);
        const first = draftNodes[0];
        const last = draftNodes[draftNodes.length - 1];
        const existingEdgeKeys = new Set(edges.map((edge) => routeEdgeKey(edge.fromNodeId, edge.toNodeId)));

        [first, last].filter(Boolean).forEach((node, index) => {
          const nearest = nearestAttachableRouteNode(node, nodes, draftIds);
          if (!nearest?.node || nearest.distance > 260) return;
          const key = routeEdgeKey(node.id, nearest.node.id);
          if (existingEdgeKeys.has(key)) return;
          existingEdgeKeys.add(key);
          edges.push(learnedRouteEdge(activeFloor.id, node, nearest.node, index ? 'end' : 'start'));
        });

        if (routeDestination && routeDestinationFloor?.id === activeFloor.id && last) {
          const destinationPoint = featureCenter(routeDestination);
          const snapDistance = destinationPoint ? routeNodeDistance(last, destinationPoint) : 0;
          const snapNode = {
            id: `${activeFloor.id}-learned-destination-${routeDestination.id}-${Date.now().toString(36)}`,
            floorId: activeFloor.id,
            x: last.x,
            y: last.y,
            type: 'destination_approach',
            name: `${formatFeatureLabel(routeDestination)} learned approach`,
            linkedPoiId: routeDestination.id,
            linkedFeatureId: routeDestination.id,
            source: 'admin',
          };
          const existingSnap = nodes.find((node) => (
            node.source === 'admin'
            && node.linkedFeatureId === routeDestination.id
            && routeNodeDistance(node, snapNode) < 12
          ));
          let destinationNode = existingSnap || null;
          if (!destinationNode && snapDistance <= 420) {
            destinationNode = snapNode;
            nodes.push(destinationNode);
          }
          const key = destinationNode ? routeEdgeKey(last.id, destinationNode.id) : '';
          if (destinationNode && !existingEdgeKeys.has(key) && last.id !== destinationNode.id) {
            existingEdgeKeys.add(key);
            edges.push(learnedRouteEdge(activeFloor.id, last, destinationNode, 'destination'));
          }
        }

        return { ...current, status: 'admin_reviewed', nodes, edges };
      });
    }
    routePathDraftNodeIdsRef.current = [];
    routePathLastPointRef.current = null;
    setRoutePathDraftNodeIds([]);
    setRoutePathMode(false);
    setStatus({
      type: pointCount > 1 ? 'success' : 'error',
      message: pointCount > 1
        ? 'Learned route path saved and connected. Search the route again to use it.'
        : 'Draw a longer route path by dragging along the hallway.',
    });
  }

  function cancelRoutePathDrawing() {
    if (!activeFloor) return;
    const draftIds = new Set(routePathDraftNodeIdsRef.current);
    updateRouteGraph(activeFloor.id, (current) => ({
      ...current,
      nodes: (current.nodes || []).filter((node) => !draftIds.has(node.id)),
      edges: (current.edges || []).filter((edge) => !draftIds.has(edge.fromNodeId) && !draftIds.has(edge.toNodeId)),
    }));
    routePathDraftNodeIdsRef.current = [];
    routePathLastPointRef.current = null;
    setRoutePathDraftNodeIds([]);
    setRoutePathMode(false);
    setStatus({ type: 'idle', message: '' });
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
    setRouteNodeMode(false);
    setRoutePathMode(false);
    routePathDraftNodeIdsRef.current = [];
    routePathLastPointRef.current = null;
    setRoutePathDraftNodeIds([]);
  }

  function chooseStartFloor(floorId) {
    selectFloor(floorId);
    setLocatingMode(true);
    setStartFloorPromptDismissed(true);
    setLocationState({
      mode: 'chooseIndoorStart',
      floorId,
      message: 'Tap your current position on the map so guidance starts from the right place.',
    });
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

  useEffect(() => {
    if (adminMode || userLocation || locatingMode || startFloorPromptDismissed || !defaultStartAnchor?.mapPoint) return;
    setActiveFloorId(defaultStartAnchor.floorId);
    setLocationState({
      mode: 'indoorDefaultAnchor',
      floorId: defaultStartAnchor.floorId,
      mapPoint: defaultStartAnchor.mapPoint,
      message: 'Using Main Entrance as your start point. Tap Locate me to change.',
    });
  }, [adminMode, userLocation, locatingMode, startFloorPromptDismissed, defaultStartAnchor]);

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

  const routeOrigin = useMemo(() => {
    if (userLocation) return userLocation;
    if (['outside', 'denied'].includes(locationState?.mode)) return null;
    return defaultRouteOrigin;
  }, [userLocation, locationState?.mode, defaultRouteOrigin]);

  const activeRoute = useMemo(() => {
    if (!routeOrigin || !routeDestination || !routeDestinationFloor) return null;
    return planIndoorRoute({
      floors: mapData.floors,
      originFloorId: routeOrigin.floorId,
      originPoint: routeOrigin.point,
      destinationFloorId: routeDestinationFloor.id,
      destinationFeature: routeDestination,
      routeGraphs,
      connectorPreference,
    });
  }, [mapData.floors, routeOrigin, routeDestination, routeDestinationFloor, routeGraphs, connectorPreference]);

  // Single effect handles both route-change reset and voice guidance.
  // Keeping them merged avoids a React state-update race where the reset
  // effect's setActiveNavigationStepIndex(0) is async, causing the separate
  // voice effect to run with a stale step index and a stale spokenRouteRef.
  const lastRouteIdRef = useRef('');
  useEffect(() => {
    // Detect a new route and reset the step index synchronously inside this effect
    const isNewRoute = activeRoute?.id && activeRoute.id !== lastRouteIdRef.current;
    if (isNewRoute) {
      lastRouteIdRef.current = activeRoute.id;
      setActiveNavigationStepIndex(0);
      spokenRouteRef.current = '';
      // Reset simulator position so it walks the new route from the start
      simulatorRef.current?.reset();
    }

    if (!voiceGuidance || !activeRoute) return;
    // Voice always follows activeNavigationStepIndex, never the preview index.
    // For a brand-new route we always use step 0 regardless of stale state.
    const stepIndex = isNewRoute ? 0 : activeNavigationStepIndex;
    const instructions = activeRoute.instructions || [];
    const step = instructions[stepIndex] || instructions[0];
    const instruction = step?.text || currentRouteInstruction(activeRoute);
    // Include activeFloorId so floor switches can re-trigger the instruction.
    const signature = `${activeRoute.id}:${stepIndex}:${activeFloorId}:${instruction}`;
    if (spokenRouteRef.current === signature) return;
    spokenRouteRef.current = signature;
    speakInstruction(instruction);
  }, [activeRoute?.id, activeRoute?.quality, activeRoute?.routeAvailable, activeNavigationStepIndex, activeFloorId, voiceGuidance]);

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

  // ── Calibration: capture a point at the current GPS position + tapped map XY
  function captureCalibrationPoint(mapPoint) {
    if (!CALIBRATION_MODE_ENABLED) return;
    const gps = pendingGpsForCapture;
    if (!gps?.lat) { alert('No GPS fix yet — wait for a location update.'); return; }
    const newPoint = {
      id: `cal-${Date.now()}`,
      floorId: activeFloorId,
      latitude: gps.lat,
      longitude: gps.lng,
      accuracy: gps.accuracy,
      heading: gps.heading,
      mapX: mapPoint.x,
      mapY: mapPoint.y,
      timestamp: gps.timestamp,
      label: 'Unnamed',
      notes: '',
      verified: false,
    };
    setCalPoints((prev) => {
      const next = [...prev, newPoint];
      try { localStorage.setItem('nwt-cal-points', JSON.stringify(next)); } catch {}
      return next;
    });
    setCapturingPoint(false);
    const label = window.prompt('Label for this calibration point:', 'Main entrance');
    if (label) {
      setCalPoints((prev) => {
        const next = prev.map((p) => p.id === newPoint.id ? { ...p, label } : p);
        try { localStorage.setItem('nwt-cal-points', JSON.stringify(next)); } catch {}
        return next;
      });
    }
  }

  function setLocation(point) {
    if (!activeFloor) return;
    const nextLocation = { floorId: activeFloor.id, point, source: 'userConfirmed' };
    setUserLocation(nextLocation);
    saveLastIndoorStart(nextLocation);
    setStartFloorPromptDismissed(true);
    setLocationState({
      mode: 'indoorUserConfirmed',
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
    setQuery(formatFeatureLabel(feature));

    if (SMART_START_LOCATION_ENABLED) {
      // ── Smart path ───────────────────────────────────────────────────────────
      const resolved = resolveProbableOrigin({
        userLocation,
        activeRoutePosition: null,
        activeFloorId,
        floors: mapData.floors,
        locationState,
      });

      if (resolved && resolved.point) {
        // High confidence with a usable point — start immediately, show origin row
        setSmartOriginLabel(resolved.label || floorLabelFromId(resolved.floorId, mapData.floors));
        setRouteDestinationId(feature.id);
        if (!userLocation) {
          setStartFloorPromptDismissed(true);
          setActiveFloorId(resolved.floorId);
          setLocationState({
            mode: 'indoorDefaultAnchor',
            floorId: resolved.floorId,
            mapPoint: resolved.point,
            message: `Starting from ${resolved.label || resolved.floorId}.`,
          });
          // Treat this as a confirmed user location for routing
          setUserLocation({ floorId: resolved.floorId, point: resolved.point, source: resolved.source });
        }
        if (resolved.confidence !== 'high') {
          // Medium confidence — remember destination and open sheet before routing
          setPendingDestinationFeature(feature);
          setPendingDestinationFloorId(floorId);
          setShowStartSheet(true);
          return; // don't set destination yet
        }
      } else {
        // Low / unknown — open sheet before routing
        setPendingDestinationFeature(feature);
        setPendingDestinationFloorId(floorId);
        setShowStartSheet(true);
        return; // don't set destination yet
      }
      setRouteDestinationId(feature.id);
      return;
    }

    // ── Legacy path (SMART_START_LOCATION_ENABLED = false) ───────────────────
    setRouteDestinationId(feature.id);
    if (!userLocation && defaultRouteOrigin) {
      setStartFloorPromptDismissed(true);
      setActiveFloorId(defaultRouteOrigin.floorId);
      setLocationState({
        mode: defaultRouteOrigin.source === 'lastKnownIndoorStart' ? 'indoorLowConfidence' : 'indoorDefaultAnchor',
        floorId: defaultRouteOrigin.floorId,
        mapPoint: defaultRouteOrigin.point,
        message: defaultRouteOrigin.source === 'lastKnownIndoorStart'
          ? 'Starting from your last saved start point. Tap Locate me to change.'
          : 'Starting from Main Entrance. Tap Locate me to change start.',
      });
    }
  }

  function clearRoute() {
    // When smart start is on, save the destination as the likely next origin
    if (SMART_START_LOCATION_ENABLED && routeDestination && activeRoute?.routeAvailable !== false) {
      const destCenter = featureCenter(routeDestination);
      const destFloor = mapData.floors.find((f) => f.features.some((feat) => feat.id === routeDestinationId));
      if (destFloor && destCenter) {
        const label = `${floorLabelFromId(destFloor.id, mapData.floors)} – ${formatFeatureLabel(routeDestination)}`;
        setRouteArrivalLocation({ floorId: destFloor.id, point: destCenter, label, featureId: routeDestination.id });
        setSmartOriginLabel('');
      }
    }
    setRouteDestinationId('');
    setSelectedId('');
    setHighlightId('');
    setQuery('');
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
    <>
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
      routeNodeMode={routeNodeMode}
      routePathMode={routePathMode}
      routePathDraftCount={routePathDraftNodeIds.length}
      locatingMode={locatingMode}
      userLocation={userLocation}
      locationState={locationState}
      startAnchor={defaultStartAnchor}
      routeGraphs={routeGraphs}
      activeRoute={activeRoute}
      connectorPreference={connectorPreference}
      routeDestinationId={routeDestinationId}
      highContrast={highContrast}
      voiceGuidance={voiceGuidance}
      buildingId={buildingId}
      adminMode={adminMode}
      published={published}
      onUpload={handleUpload}
      onSelectFloor={selectFloor}
      onSelectFeature={(feature, floorId) => {
        if (floorId) selectFloor(floorId);
        setSelectedId(feature?.id || '');
        setHighlightId(feature?.id || '');
        if (!adminMode && featureCenter(feature)) {
          setQuery(formatFeatureLabel(feature));
          startRouteTo(feature, floorId);
        }
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
      onStartRoutePathDrawing={startRoutePathDrawing}
      onFinishRoutePathDrawing={finishRoutePathDrawing}
      onCancelRoutePathDrawing={cancelRoutePathDrawing}
      onStartRouteNodePlacement={(type) => {
        setRouteNodeType(type);
        setAddPoiMode(false);
        setAreaDrawingMode(false);
        setAreaDraftPoints([]);
        setLocatingMode(false);
        setRoutePathMode(false);
        setRouteNodeMode(true);
        setStatus({ type: 'info', message: 'Click the hallway on the map to place a route node.' });
      }}
      onQueryChange={setQuery}
      onHighlight={setHighlightId}
      onAddPoi={addPoi}
      onAddRouteNode={addRouteGraphNode}
      onAddRoutePathPoint={addRoutePathPoint}
      onSetLocation={(point) => {
        if (capturingPoint) { captureCalibrationPoint(point); } else { setLocation(point); }
      }}
      onMapReady={(ref) => { calMapRef.current = ref; }}
      onToggleLocate={() => {
        setAddPoiMode(false);
        setAreaDrawingMode(false);
        setAreaDraftPoints([]);
        setRouteNodeMode(false);
        setRoutePathMode(false);
        setStartFloorPromptDismissed(true);
        setLocatingMode((value) => !value);
      }}
      showStartFloorPrompt={false}
      onChooseStartFloor={chooseStartFloor}
      onDismissStartFloorPrompt={() => setStartFloorPromptDismissed(true)}
      onRouteTo={startRouteTo}
      onConnectorPreferenceChange={setConnectorPreference}
      onToggleHighContrast={() => setHighContrast((value) => !value)}
      onToggleVoiceGuidance={() => {
        const next = !voiceGuidance;
        setVoiceGuidance(next);
        if (next && window.speechSynthesis) {
          // Speak confirmation immediately — this IS a user-gesture handler
          // so iOS Safari allows it. We always speak the confirmation first,
          // then queue the current route instruction if one exists.
          _doSpeak('Voice guidance is now enabled.');
          pendingSpeechRef.current = currentRouteInstruction() || '';
          // Show the voice test sheet so the user can confirm they heard it.
          setShowVoiceTest(true);
        }
      }}
      onDrainSpeech={drainPendingSpeech}
      onRepeatInstruction={() => {
        drainPendingSpeech();
        speakInstruction(currentRouteInstruction(), { force: true });
      }}
      activeNavigationStepIndex={activeNavigationStepIndex}
      onAdvanceStep={(index) => setActiveNavigationStepIndex(index)}
      smartOriginLabel={SMART_START_LOCATION_ENABLED ? smartOriginLabel : ''}
      onChangeOrigin={SMART_START_LOCATION_ENABLED ? () => setShowStartSheet(true) : undefined}
      onClearRoute={clearRoute}
      onToggleAdmin={() => setAdminMode((value) => !value)}
      onPublish={publishMap}
      onToggleAddPoi={() => {
        setLocatingMode(false);
        setAreaDrawingMode(false);
        setAreaDraftPoints([]);
        setRouteNodeMode(false);
        setRoutePathMode(false);
        setAddPoiMode((value) => !value);
      }}
      onRestoreHidden={restoreHidden}
      onCleanupFloor={cleanupActiveFloor}
      onCleanupAllFloors={cleanupAllFloors}
      onLoadSample={resetDemo}
      onClearAll={clearAll}
    />
    {showVoiceTest && (
      <VoiceTestDialog
        onSpeak={(text) => _doSpeak(text)}
        onConfirm={() => setShowVoiceTest(false)}
        onDismiss={() => {
          setShowVoiceTest(false);
          setVoiceGuidance(false);
          if (window.speechSynthesis) window.speechSynthesis.cancel();
        }}
      />
    )}
    {SMART_START_LOCATION_ENABLED && showStartSheet && (
      <StartLocationSheet
        resolvedOrigin={resolveProbableOrigin({
          userLocation,
          activeRoutePosition: null,
          activeFloorId,
          floors: mapData.floors,
          locationState,
        })}
        floors={mapData.floors}
        activeFloorId={activeFloorId}
        onConfirm={(loc) => {
          setShowStartSheet(false);
          // Apply confirmed origin
          const nextLoc = { floorId: loc.floorId, point: loc.point, source: 'smartStartConfirmed' };
          setUserLocation(nextLoc);
          saveConfirmedLocation({ ...loc, source: 'smartStartConfirmed' });
          setSmartOriginLabel(loc.label || floorLabelFromId(loc.floorId, mapData.floors));
          setStartFloorPromptDismissed(true);
          setActiveFloorId(loc.floorId);
          setLocationState({ mode: 'indoorUserConfirmed', floorId: loc.floorId, mapPoint: loc.point, message: `Starting from ${loc.label}.` });
          // Now start the pending route
          if (pendingDestinationFeature) {
            setSelectedId(pendingDestinationFeature.id);
            setHighlightId(pendingDestinationFeature.id);
            setQuery(formatFeatureLabel(pendingDestinationFeature));
            setRouteDestinationId(pendingDestinationFeature.id);
            setPendingDestinationFeature(null);
            setPendingDestinationFloorId(null);
          }
          if (voiceGuidance) _doSpeak(`Starting from ${loc.label}.`);
        }}
        onDismiss={() => {
          setShowStartSheet(false);
          setPendingDestinationFeature(null);
          setPendingDestinationFloorId(null);
        }}
      />
    )}
    {DEV_LOCATION_SIMULATOR_ENABLED && SimulatorPanel && (
      <Suspense fallback={null}>
        <SimulatorPanel
          simulator={simulatorRef.current}
          activeRoute={activeRoute}
          activeNavigationStepIndex={activeNavigationStepIndex}
        />
      </Suspense>
    )}
    {CALIBRATION_MODE_ENABLED && CalibrationPanel && (
      <Suspense fallback={null}>
        <CalibrationPanel
          gpsState={calGpsState}
          mapState={calMapState}
          statusState={calStatusState}
          floors={mapData.floors}
          activeFloorId={activeFloorId}
          activeRoute={activeRoute}
          activeNavigationStepIndex={activeNavigationStepIndex}
          onFloorChange={(fid) => { selectFloor(fid); pipelineRef.current?.reset(); }}
          onCapturePoint={() => { setCapturingPoint(true); setLocatingMode(true); }}
          calibrationPoints={calPoints}
          walkRecorder={walkRecorderRef.current}
          onStartRecording={(name) => { walkRecorderRef.current?.start(name); setIsRecordingWalk(true); }}
          onStopRecording={() => {
            const finished = walkRecorderRef.current?.stop();
            setIsRecordingWalk(false);
            if (finished) setCalWalks((prev) => {
              const next = prev.filter((w) => w.id !== finished.id);
              next.push(finished);
              return next;
            });
          }}
          onOpenPointManager={() => setShowCalManager(true)}
        />
      </Suspense>
    )}
    {CALIBRATION_MODE_ENABLED && showCalManager && CalibrationPointManager && (
      <Suspense fallback={null}>
        <CalibrationPointManager
          points={calPoints}
          walks={calWalks}
          floors={mapData.floors}
          onPointsChange={(pts) => { setCalPoints(pts); try { localStorage.setItem('nwt-cal-points', JSON.stringify(pts)); } catch {} }}
          onWalksChange={setCalWalks}
          onClose={() => setShowCalManager(false)}
          onReplayWalk={(walk) => {
            if (!pipelineRef.current) return;
            import('./utils/walkRecorder.js').then(({ replayWalkRecording }) => {
              replayWalkRecording({
                recording: walk,
                processLocationUpdate: pipelineRef.current.processLocationUpdate,
                onPipelineReset: () => pipelineRef.current?.reset(),
              });
            });
          }}
        />
      </Suspense>
    )}
    {CALIBRATION_MODE_ENABLED && CalibrationMapOverlay && (
      <Suspense fallback={null}>
        <CalibrationMapOverlay
          mapRef={calMapRef}
          rawPoint={calMapState.projectedX != null ? { x: calMapState.projectedX, y: calMapState.projectedY } : null}
          matchedPoint={calMapState.matchedX != null ? { x: calMapState.matchedX, y: calMapState.matchedY } : null}
          accuracyRadiusPx={calGpsState?.accuracy ?? null}
          calibPoints={calPoints}
          currentFloorId={activeFloorId}
          showRaw={showCalOverlays.raw}
          showMatched={showCalOverlays.matched}
          showAccRadius={showCalOverlays.radius}
          showCalibPts={showCalOverlays.points}
        />
      </Suspense>
    )}
    {CALIBRATION_MODE_ENABLED && capturingPoint && (
      <div className="cal-capture-banner" onClick={() => setCapturingPoint(false)}>
        📍 Tap a point on the map to capture your GPS position there — or tap here to cancel
      </div>
    )}
    </>
  );
}

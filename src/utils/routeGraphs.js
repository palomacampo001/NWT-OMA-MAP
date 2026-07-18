import { distance } from './geometryHelpers.js';
import { entranceAnchorForFloor } from './locationConfig.js';

function featureCenter(feature) {
  if (!feature) return null;
  if (feature.geometry?.type === 'Point') return { x: feature.geometry.coordinates[0], y: feature.geometry.coordinates[1] };
  if (!feature.bbox) return null;
  return { x: feature.bbox[0] + feature.bbox[2] / 2, y: feature.bbox[1] + feature.bbox[3] / 2 };
}

function formatFeatureLabel(feature) {
  return feature?.displayName || feature?.name || feature?.roomNumber || feature?.category || 'Location';
}

const STORAGE_KEY = 'svg-indoor-route-graphs-v1';
const graphStatuses = new Set(['generated_suggestion', 'admin_reviewed', 'published']);
const repairCache = new WeakMap();
const repairNodeTypes = new Set([
  'entrance',
  'reception',
  'hallway',
  'intersection',
  'turn',
  'doorway',
  'destination_approach',
  'destination_snap',
  'elevator',
  'escalator',
  'stair',
  'stairs',
]);
const hallwayMaskNodeTypes = new Set(['hallway', 'intersection', 'turn', 'doorway', 'entrance', 'reception']);

function manualGraphPatch(graph = {}) {
  return {
    floorId: graph.floorId,
    status: graphStatuses.has(graph.status) ? graph.status : 'admin_reviewed',
    nodes: (graph.nodes || []).filter((node) => node.source === 'admin'),
    edges: (graph.edges || []).filter((edge) => edge.source === 'admin'),
  };
}

function mergeSavedGraph(baseGraph, savedGraph) {
  if (!savedGraph) return baseGraph;
  const manualNodes = (savedGraph.nodes || []).filter((node) => node.source === 'admin');
  const manualEdges = (savedGraph.edges || []).filter((edge) => edge.source === 'admin');
  const nodeIds = new Set((baseGraph.nodes || []).map((node) => node.id));
  const edgeKeys = new Set((baseGraph.edges || []).map((edge) => [edge.fromNodeId, edge.toNodeId].sort().join('|')));
  return {
    ...baseGraph,
    status: graphStatuses.has(savedGraph.status) ? savedGraph.status : baseGraph.status,
    nodes: [
      ...(baseGraph.nodes || []),
      ...manualNodes.filter((node) => !nodeIds.has(node.id)),
    ],
    edges: [
      ...(baseGraph.edges || []),
      ...manualEdges.filter((edge) => !edgeKeys.has([edge.fromNodeId, edge.toNodeId].sort().join('|'))),
    ],
  };
}

function connectorType(feature) {
  const text = `${feature?.displayName || ''} ${feature?.name || ''} ${feature?.roomNumber || ''} ${feature?.category || ''}`;
  if (/elevator|\belev\b|\bel\b|\d+EL\d*/i.test(text)) return 'elevator';
  if (/escalator|\besc\b|ESC-G/i.test(text)) return 'escalator';
  if (/stair|stairs|\bst\b|\d+ST\d*/i.test(text)) return 'stair';
  if (/entrance|vestibule|lobby|reception/i.test(text)) return feature.category === 'reception' ? 'reception' : 'entrance';
  return '';
}

function connectorGroupId(feature, type) {
  const raw = `${feature?.roomNumber || feature?.displayName || feature?.name || feature?.id || ''}`.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!raw) return '';
  if (type === 'elevator') return raw.replace(/^\d+/, '');
  if (type === 'stair') return raw.replace(/^\d+/, '');
  if (type === 'escalator') return raw.replace(/^\d+/, '');
  return raw;
}

export function seedRouteGraphs(floors = []) {
  return Object.fromEntries(floors.map((floor) => {
    const anchor = entranceAnchorForFloor(floor);
    const nodes = [];
    if (anchor) {
      nodes.push({
        id: `${floor.id}-start-${anchor.id}`,
        floorId: floor.id,
        x: anchor.mapPoint.x,
        y: anchor.mapPoint.y,
        type: anchor.type === 'reception' ? 'reception' : 'entrance',
        name: anchor.name,
        connectorGroupId: anchor.id,
        source: 'generated',
      });
    }
    (floor.features || []).forEach((feature) => {
      if (feature.visible === false || feature.geometry?.type !== 'Point') return;
      const type = connectorType(feature);
      if (!type) return;
      const point = featureCenter(feature);
      if (!point) return;
      const id = `${floor.id}-node-${feature.id}`;
      if (nodes.some((node) => Math.abs(node.x - point.x) < 2 && Math.abs(node.y - point.y) < 2 && node.type === type)) return;
      nodes.push({
        id,
        floorId: floor.id,
        x: point.x,
        y: point.y,
        type,
        name: formatFeatureLabel(feature),
        linkedPoiId: feature.id,
        linkedFeatureId: feature.id,
        connectorGroupId: connectorGroupId(feature, type),
        source: 'generated',
      });
    });
    return [floor.id, { floorId: floor.id, status: 'admin_reviewed', nodes, edges: [] }];
  }));
}

export function loadRouteGraphs(floors = []) {
  const seeded = seedRouteGraphs(floors);
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return Object.fromEntries(Object.entries(seeded).map(([floorId, graph]) => {
      const floor = floors.find((item) => item.id === floorId);
      const preparedGraph = floor?.routeGraph;
      const savedGraph = saved[floorId];
      if (preparedGraph?.status === 'published' && preparedGraph?.nodes?.length && preparedGraph?.edges?.length) {
        return [floorId, mergeSavedGraph(preparedGraph, savedGraph)];
      }
      if (!savedGraph) return [floorId, graph];
      return [floorId, mergeSavedGraph(graph, savedGraph)];
    }));
  } catch {
    return seeded;
  }
}

export function saveRouteGraphs(graphs) {
  const patches = Object.fromEntries(Object.entries(graphs || {}).map(([floorId, graph]) => [floorId, manualGraphPatch({ floorId, ...graph })]));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(patches));
}

function featureText(feature) {
  return `${feature?.displayName || ''} ${feature?.name || ''} ${feature?.roomNumber || ''} ${feature?.category || ''} ${feature?.type || ''}`.toLowerCase();
}

function featurePoint(feature) {
  const point = featureCenter(feature);
  return point ? { ...point, floorId: feature.floorId } : null;
}

function nodeDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function edgeKey(fromNodeId, toNodeId) {
  return [fromNodeId, toNodeId].sort().join('|');
}

function pointToSegmentDistance(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (!lengthSq) return nodeDistance(point, a);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  const projection = { x: a.x + dx * t, y: a.y + dy * t };
  return nodeDistance(point, projection);
}

function repairCellKey(x, y, cellSize) {
  return `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
}

function addToGrid(grid, key, item) {
  if (!grid.has(key)) grid.set(key, []);
  grid.get(key).push(item);
}

function buildNodeGrid(nodes, cellSize) {
  const grid = new Map();
  nodes.forEach((node) => addToGrid(grid, repairCellKey(node.x, node.y, cellSize), node));
  return grid;
}

function nearbyGridItems(grid, point, radius, cellSize) {
  const minX = Math.floor((point.x - radius) / cellSize);
  const maxX = Math.floor((point.x + radius) / cellSize);
  const minY = Math.floor((point.y - radius) / cellSize);
  const maxY = Math.floor((point.y + radius) / cellSize);
  const items = [];
  for (let gx = minX; gx <= maxX; gx += 1) {
    for (let gy = minY; gy <= maxY; gy += 1) {
      items.push(...(grid.get(`${gx},${gy}`) || []));
    }
  }
  return items;
}

function buildSegmentGrid(segments, cellSize) {
  const grid = new Map();
  segments.forEach((segment) => {
    const minX = Math.floor((Math.min(segment.a.x, segment.b.x) - cellSize) / cellSize);
    const maxX = Math.floor((Math.max(segment.a.x, segment.b.x) + cellSize) / cellSize);
    const minY = Math.floor((Math.min(segment.a.y, segment.b.y) - cellSize) / cellSize);
    const maxY = Math.floor((Math.max(segment.a.y, segment.b.y) + cellSize) / cellSize);
    for (let gx = minX; gx <= maxX; gx += 1) {
      for (let gy = minY; gy <= maxY; gy += 1) {
        addToGrid(grid, `${gx},${gy}`, segment);
      }
    }
  });
  return grid;
}

function edgeLooksLikeHallwayMask(edge, byId) {
  const from = byId.get(edge.fromNodeId);
  const to = byId.get(edge.toNodeId);
  if (!from || !to) return false;
  if (edge.source === 'admin' || edge.source === 'line_of_sight_repair') return true;
  return hallwayMaskNodeTypes.has(from.type) && hallwayMaskNodeTypes.has(to.type);
}

function pointNearWalkableSegment(point, segmentGrid, cellSize, tolerance) {
  const segments = nearbyGridItems(segmentGrid, point, tolerance + cellSize, cellSize);
  return segments.some((segment) => pointToSegmentDistance(point, segment.a, segment.b) <= tolerance);
}

function sampleLine(a, b, step) {
  const length = nodeDistance(a, b);
  const count = Math.max(2, Math.ceil(length / step));
  return Array.from({ length: count + 1 }, (_, index) => {
    const t = index / count;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  });
}

function isRepairSegmentWalkable(a, b, segmentGrid, cellSize, { sampleStep, tolerance, requiredRatio }) {
  const samples = sampleLine(a, b, sampleStep);
  let inside = 0;
  samples.forEach((point) => {
    if (pointNearWalkableSegment(point, segmentGrid, cellSize, tolerance)) inside += 1;
  });
  return inside / samples.length >= requiredRatio;
}

function canRepairNode(node) {
  return node && Number.isFinite(node.x) && Number.isFinite(node.y) && repairNodeTypes.has(node.type);
}

function repairedEdgeAccessible(a, b) {
  return !['stair', 'stairs', 'escalator'].includes(a?.type) && !['stair', 'stairs', 'escalator'].includes(b?.type);
}

export function pathDistance(nodes = []) {
  return nodes.reduce((sum, node, index) => (index ? sum + nodeDistance(nodes[index - 1], node) : sum), 0);
}

export function repairHallwayGraph(graph, {
  radius = 168,
  sampleStep = 5,
  tolerance = 24,
  requiredRatio = 0.96,
  maxNewEdgesPerNode = 8,
} = {}) {
  if (!graph?.nodes?.length || !graph?.edges?.length) return { graph, addedEdges: 0 };
  const cached = repairCache.get(graph);
  if (cached) return cached;

  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const existing = new Set((graph.edges || []).map((edge) => edgeKey(edge.fromNodeId, edge.toNodeId)));
  const walkableSegments = (graph.edges || [])
    .filter((edge) => edgeLooksLikeHallwayMask(edge, byId))
    .map((edge) => ({ a: byId.get(edge.fromNodeId), b: byId.get(edge.toNodeId) }))
    .filter((segment) => segment.a && segment.b && nodeDistance(segment.a, segment.b) > 1);

  if (!walkableSegments.length) {
    const result = { graph, addedEdges: 0 };
    repairCache.set(graph, result);
    return result;
  }

  const cellSize = Math.max(radius, tolerance * 3);
  const segmentGrid = buildSegmentGrid(walkableSegments, cellSize);
  const routeNodes = graph.nodes.filter(canRepairNode);
  const nodeGrid = buildNodeGrid(routeNodes, radius);
  const newEdges = [];
  const addedByNode = new Map();

  routeNodes.forEach((node) => {
    if ((addedByNode.get(node.id) || 0) >= maxNewEdgesPerNode) return;
    const candidates = nearbyGridItems(nodeGrid, node, radius, radius)
      .filter((other) => other.id !== node.id && nodeDistance(node, other) <= radius)
      .filter((other) => !existing.has(edgeKey(node.id, other.id)))
      .sort((a, b) => nodeDistance(node, a) - nodeDistance(node, b));

    candidates.forEach((other) => {
      if ((addedByNode.get(node.id) || 0) >= maxNewEdgesPerNode) return;
      if ((addedByNode.get(other.id) || 0) >= maxNewEdgesPerNode) return;
      const key = edgeKey(node.id, other.id);
      if (existing.has(key)) return;
      if (!isRepairSegmentWalkable(node, other, segmentGrid, cellSize, { sampleStep, tolerance, requiredRatio })) return;
      existing.add(key);
      addedByNode.set(node.id, (addedByNode.get(node.id) || 0) + 1);
      addedByNode.set(other.id, (addedByNode.get(other.id) || 0) + 1);
      newEdges.push({
        id: `${graph.floorId || node.floorId || 'floor'}-los-${newEdges.length + 1}-${node.id}-${other.id}`,
        floorId: graph.floorId || node.floorId || other.floorId,
        fromNodeId: node.id,
        toNodeId: other.id,
        distance: nodeDistance(node, other),
        accessible: repairedEdgeAccessible(node, other),
        source: 'line_of_sight_repair',
      });
    });
  });

  const result = {
    graph: newEdges.length ? { ...graph, edges: [...graph.edges, ...newEdges], repairedEdgeCount: newEdges.length } : graph,
    addedEdges: newEdges.length,
  };
  repairCache.set(graph, result);
  return result;
}

function addNode(nodes, node) {
  if (!node || !Number.isFinite(node.x) || !Number.isFinite(node.y)) return null;
  const existing = nodes.find((item) => nodeDistance(item, node) < 8 && item.type === node.type);
  if (existing) return existing;
  nodes.push(node);
  return node;
}

function addEdge(edges, floorId, from, to, source = 'generated') {
  if (!from || !to || from.id === to.id) return;
  const key = [from.id, to.id].sort().join('|');
  if (edges.some((edge) => [edge.fromNodeId, edge.toNodeId].sort().join('|') === key)) return;
  edges.push({
    id: `${floorId}-generated-edge-${edges.length + 1}`,
    floorId,
    fromNodeId: from.id,
    toNodeId: to.id,
    distance: nodeDistance(from, to),
    accessible: true,
    source,
  });
}

function isOpenOrCorridorLike(feature, mapArea) {
  if (feature.visible === false || feature.geometry?.type !== 'Polygon' || !feature.bbox) return false;
  const [,, width, height] = feature.bbox;
  const area = Math.max(1, width * height);
  const ratio = Math.max(width, height) / Math.max(1, Math.min(width, height));
  const text = featureText(feature);
  const category = String(feature.category || '').toLowerCase();
  return /corridor|circulation|aisle|lobby|reception|vestibule|entrance|open|gallery|hall|walkway|turnstile/i.test(text)
    || ['corridor', 'lobby', 'reception', 'entrance', 'wayfinding_zone', 'meeting_area', 'custom'].includes(category)
    || (area / Math.max(1, mapArea) > 0.018 && ratio > 2.2);
}

function usefulDestination(feature) {
  if (feature.visible === false || feature.geometry?.type !== 'Point') return false;
  if (connectorType(feature)) return false;
  const text = featureText(feature);
  if (!text.trim() || /unknown|decorative|noise/.test(text)) return false;
  return Boolean(feature.displayName || feature.name || feature.roomNumber);
}

function nearestNode(point, nodes, filter = () => true) {
  return nodes
    .filter(filter)
    .map((node) => ({ node, distance: nodeDistance(point, node) }))
    .sort((a, b) => a.distance - b.distance)[0] || null;
}

export function generateHallwayGraph(floor) {
  const [viewX = 0, viewY = 0, viewWidth = 1200, viewHeight = 800] = floor?.viewBox || [];
  const mapArea = viewWidth * viewHeight;
  const nodes = [];
  const edges = [];
  const features = floor?.features || [];
  const openFeatures = features.filter((feature) => isOpenOrCorridorLike(feature, mapArea));

  openFeatures.forEach((feature, index) => {
    const point = featurePoint(feature);
    if (!point) return;
    const node = addNode(nodes, {
      id: `${floor.id}-generated-hall-${index + 1}`,
      floorId: floor.id,
      x: point.x,
      y: point.y,
      type: /intersection|lobby|reception|entrance|vestibule/i.test(featureText(feature)) ? 'intersection' : 'hallway',
      name: formatFeatureLabel(feature),
      linkedFeatureId: feature.id,
      source: 'generated',
    });
    const [x, y, width, height] = feature.bbox || [];
    if (!node || !width || !height) return;
    if (Math.max(width, height) > 180) {
      const horizontal = width >= height;
      const a = addNode(nodes, {
        id: `${floor.id}-generated-hall-${index + 1}-a`,
        floorId: floor.id,
        x: horizontal ? x + width * 0.22 : point.x,
        y: horizontal ? point.y : y + height * 0.22,
        type: 'turn',
        name: `${formatFeatureLabel(feature)} approach`,
        linkedFeatureId: feature.id,
        source: 'generated',
      });
      const b = addNode(nodes, {
        id: `${floor.id}-generated-hall-${index + 1}-b`,
        floorId: floor.id,
        x: horizontal ? x + width * 0.78 : point.x,
        y: horizontal ? point.y : y + height * 0.78,
        type: 'turn',
        name: `${formatFeatureLabel(feature)} approach`,
        linkedFeatureId: feature.id,
        source: 'generated',
      });
      addEdge(edges, floor.id, a, node);
      addEdge(edges, floor.id, node, b);
    }
  });

  if (!nodes.length) {
    const center = { x: viewX + viewWidth / 2, y: viewY + viewHeight / 2 };
    addNode(nodes, {
      id: `${floor.id}-generated-hall-center`,
      floorId: floor.id,
      x: center.x,
      y: center.y,
      type: 'hallway',
      name: 'Suggested hallway center',
      source: 'generated',
    });
  }

  const hallwayNodes = () => nodes.filter((node) => ['hallway', 'intersection', 'turn', 'doorway', 'entrance', 'reception'].includes(node.type));
  hallwayNodes().forEach((node) => {
    const nearby = hallwayNodes()
      .filter((other) => other.id !== node.id)
      .map((other) => ({ node: other, distance: nodeDistance(node, other) }))
      .filter((item) => item.distance < Math.max(180, Math.min(viewWidth, viewHeight) * 0.28))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);
    nearby.forEach((item) => addEdge(edges, floor.id, node, item.node));
  });

  features.forEach((feature, index) => {
    if (feature.visible === false || feature.geometry?.type !== 'Point') return;
    const point = featurePoint(feature);
    if (!point) return;
    const type = connectorType(feature);
    if (type) {
      const connector = addNode(nodes, {
        id: `${floor.id}-generated-connector-${index + 1}`,
        floorId: floor.id,
        x: point.x,
        y: point.y,
        type,
        name: formatFeatureLabel(feature),
        linkedPoiId: feature.id,
        linkedFeatureId: feature.id,
        connectorGroupId: connectorGroupId(feature, type),
        source: 'generated',
      });
      const nearest = nearestNode(connector, hallwayNodes(), (node) => node.id !== connector.id);
      if (nearest) addEdge(edges, floor.id, connector, nearest.node);
    }
  });

  const destinations = features.filter(usefulDestination).slice(0, 220);
  destinations.forEach((feature, index) => {
    const point = featurePoint(feature);
    if (!point) return;
    const nearest = nearestNode(point, hallwayNodes());
    if (!nearest) return;
    const approach = addNode(nodes, {
      id: `${floor.id}-generated-destination-${index + 1}`,
      floorId: floor.id,
      x: nearest.node.x + (point.x - nearest.node.x) * 0.18,
      y: nearest.node.y + (point.y - nearest.node.y) * 0.18,
      type: 'destination_approach',
      name: `${formatFeatureLabel(feature)} approach`,
      linkedPoiId: feature.id,
      linkedFeatureId: feature.id,
      source: 'generated',
    });
    addEdge(edges, floor.id, nearest.node, approach);
  });

  return {
    floorId: floor.id,
    status: 'generated_suggestion',
    nodes,
    edges,
  };
}

export function nearestRouteNode(point, graph, filter = () => true) {
  if (!point || !graph?.nodes?.length) return null;
  return graph.nodes
    .filter(filter)
    .map((node) => ({ node, distance: distance(point, node) }))
    .sort((a, b) => a.distance - b.distance)[0]?.node || null;
}

export function shortestGraphPath(graph, startNodeId, endNodeId, { accessibleOnly = false, blockedEdges = new Set() } = {}) {
  if (!graph || !startNodeId || !endNodeId) return null;
  if (startNodeId === endNodeId) return [graph.nodes.find((node) => node.id === startNodeId)].filter(Boolean);
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const adjacency = new Map(graph.nodes.map((node) => [node.id, []]));
  graph.edges.forEach((edge) => {
    if (accessibleOnly && edge.accessible === false) return;
    if (blockedEdges.has(edge.id) || blockedEdges.has([edge.fromNodeId, edge.toNodeId].sort().join('|'))) return;
    if (!byId.has(edge.fromNodeId) || !byId.has(edge.toNodeId)) return;
    const weight = edge.distance || distance(byId.get(edge.fromNodeId), byId.get(edge.toNodeId));
    adjacency.get(edge.fromNodeId).push({ id: edge.toNodeId, weight });
    adjacency.get(edge.toNodeId).push({ id: edge.fromNodeId, weight });
  });
  const distances = new Map(graph.nodes.map((node) => [node.id, Number.POSITIVE_INFINITY]));
  const previous = new Map();
  const visited = new Set();
  const queue = [];
  distances.set(startNodeId, 0);
  queue.push({ id: startNodeId, score: 0 });
  while (queue.length) {
    queue.sort((a, b) => a.score - b.score);
    const current = queue.shift()?.id;
    if (!current || visited.has(current)) continue;
    if (current === endNodeId) break;
    visited.add(current);
    adjacency.get(current).forEach((next) => {
      if (visited.has(next.id)) return;
      const score = distances.get(current) + next.weight;
      if (score < distances.get(next.id)) {
        distances.set(next.id, score);
        previous.set(next.id, current);
        queue.push({ id: next.id, score });
      }
    });
  }
  if (!previous.has(endNodeId)) return null;
  const ids = [endNodeId];
  while (ids[0] !== startNodeId) ids.unshift(previous.get(ids[0]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export function alternateGraphPaths(graph, primaryPath = [], { accessibleOnly = false, limit = 2 } = {}) {
  if (!graph || primaryPath.length < 4) return [];
  const startNodeId = primaryPath[0]?.id;
  const endNodeId = primaryPath[primaryPath.length - 1]?.id;
  const primaryKey = primaryPath.map((node) => node.id).join('>');
  const alternatives = [];
  const seen = new Set([primaryKey]);
  const primaryPairs = [];
  for (let index = 1; index < primaryPath.length; index += 1) {
    primaryPairs.push([primaryPath[index - 1].id, primaryPath[index].id].sort().join('|'));
  }
  const middleFirst = primaryPairs
    .map((pair, index) => ({ pair, score: Math.abs(index - primaryPairs.length / 2) }))
    .sort((a, b) => a.score - b.score)
    .map((item) => item.pair);
  for (const blocked of middleFirst) {
    const path = shortestGraphPath(graph, startNodeId, endNodeId, { accessibleOnly, blockedEdges: new Set([blocked]) });
    const key = path?.map((node) => node.id).join('>');
    if (!path?.length || seen.has(key)) continue;
    seen.add(key);
    alternatives.push(path);
    if (alternatives.length >= limit) break;
  }
  return alternatives;
}

export function nodesToPoints(nodes = []) {
  return nodes.map((node) => ({ x: node.x, y: node.y, floorId: node.floorId, id: node.id, name: node.name, category: node.type }));
}

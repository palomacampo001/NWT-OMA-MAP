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
        connectorGroupId: connectorGroupId(feature, type),
      });
    });
    return [floor.id, { floorId: floor.id, nodes, edges: [] }];
  }));
}

export function loadRouteGraphs(floors = []) {
  const seeded = seedRouteGraphs(floors);
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return Object.fromEntries(Object.entries(seeded).map(([floorId, graph]) => {
      const savedGraph = saved[floorId];
      if (!savedGraph) return [floorId, graph];
      const nodeIds = new Set(savedGraph.nodes?.map((node) => node.id) || []);
      const seededNodes = graph.nodes.filter((node) => !nodeIds.has(node.id));
      return [floorId, {
        floorId,
        nodes: [...(savedGraph.nodes || []), ...seededNodes],
        edges: savedGraph.edges || [],
      }];
    }));
  } catch {
    return seeded;
  }
}

export function saveRouteGraphs(graphs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(graphs));
}

export function nearestRouteNode(point, graph, filter = () => true) {
  if (!point || !graph?.nodes?.length) return null;
  return graph.nodes
    .filter(filter)
    .map((node) => ({ node, distance: distance(point, node) }))
    .sort((a, b) => a.distance - b.distance)[0]?.node || null;
}

export function shortestGraphPath(graph, startNodeId, endNodeId) {
  if (!graph || !startNodeId || !endNodeId) return null;
  if (startNodeId === endNodeId) return [graph.nodes.find((node) => node.id === startNodeId)].filter(Boolean);
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const adjacency = new Map(graph.nodes.map((node) => [node.id, []]));
  graph.edges.forEach((edge) => {
    if (!byId.has(edge.fromNodeId) || !byId.has(edge.toNodeId)) return;
    const weight = edge.distance || distance(byId.get(edge.fromNodeId), byId.get(edge.toNodeId));
    adjacency.get(edge.fromNodeId).push({ id: edge.toNodeId, weight });
    adjacency.get(edge.toNodeId).push({ id: edge.fromNodeId, weight });
  });
  const distances = new Map(graph.nodes.map((node) => [node.id, Number.POSITIVE_INFINITY]));
  const previous = new Map();
  const unvisited = new Set(graph.nodes.map((node) => node.id));
  distances.set(startNodeId, 0);
  while (unvisited.size) {
    const current = [...unvisited].sort((a, b) => distances.get(a) - distances.get(b))[0];
    if (!current || distances.get(current) === Number.POSITIVE_INFINITY) break;
    if (current === endNodeId) break;
    unvisited.delete(current);
    adjacency.get(current).forEach((next) => {
      if (!unvisited.has(next.id)) return;
      const score = distances.get(current) + next.weight;
      if (score < distances.get(next.id)) {
        distances.set(next.id, score);
        previous.set(next.id, current);
      }
    });
  }
  if (!previous.has(endNodeId)) return null;
  const ids = [endNodeId];
  while (ids[0] !== startNodeId) ids.unshift(previous.get(ids[0]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export function nodesToPoints(nodes = []) {
  return nodes.map((node) => ({ x: node.x, y: node.y, floorId: node.floorId, id: node.id, name: node.name, category: node.type }));
}

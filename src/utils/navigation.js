import { bboxCenter, distance } from './geometryHelpers.js';
import { nearestRouteNode, nodesToPoints, shortestGraphPath } from './routeGraphs.js';

export function featureCenter(feature) {
  if (!feature) return null;
  if (feature.geometry.type === 'Point') {
    return { x: feature.geometry.coordinates[0], y: feature.geometry.coordinates[1] };
  }
  return bboxCenter(feature.bbox);
}

export function formatFeatureLabel(feature) {
  return feature?.displayName || feature?.name || feature?.roomNumber || feature?.category || 'Destination';
}

export function floorLabel(floor) {
  return floor?.name || `Floor ${floor?.levelNumber || ''}`.trim() || 'Floor';
}

function connectorText(feature) {
  return `${feature?.displayName || ''} ${feature?.name || ''} ${feature?.roomNumber || ''} ${feature?.category || ''}`.toLowerCase();
}

function connectorType(feature) {
  const text = connectorText(feature);
  if (/elevator|\belev\b|\bel\b|\d+el\d*/i.test(text)) return 'elevator';
  if (/escalator|\besc\b|esc-g/i.test(text)) return 'escalator';
  if (/stair|stairs|\bst\b|\d+st\d*/i.test(text)) return 'stairs';
  return '';
}

function connectorKey(feature) {
  const text = `${feature?.roomNumber || feature?.displayName || feature?.name || ''}`.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const typed = connectorType(feature);
  if (typed === 'elevator') return text.replace(/^\d+/, '').replace(/^EL$/, 'EL');
  if (typed === 'escalator') return text.replace(/^\d+/, '').replace(/^ESC$/, 'ESC');
  if (typed === 'stairs') return text.replace(/^\d+/, '').replace(/^ST$/, 'ST');
  return text;
}

function connectorTypeLabel(type) {
  if (type === 'elevator') return 'elevator';
  if (type === 'escalator') return 'escalator';
  return 'stairs';
}

function connectorPreferenceLabel(type) {
  if (type === 'any') return 'elevator, escalator, or stair';
  return connectorTypeLabel(type);
}

function verticalConnectorCandidates(floor) {
  return (floor?.features || [])
    .filter((feature) => feature.visible !== false && connectorType(feature))
    .map((feature) => ({
      floorId: floor.id,
      floorName: floorLabel(floor),
      poiId: feature.id,
      name: formatFeatureLabel(feature),
      type: connectorType(feature),
      key: connectorKey(feature),
      point: featureCenter(feature),
      feature,
    }))
    .filter((connector) => connector.point);
}

export function buildVerticalConnectors(floors = []) {
  const connectors = floors.flatMap(verticalConnectorCandidates);
  const exactGroups = new Map();
  connectors.forEach((connector) => {
    const key = `${connector.type}-${connector.key || Math.round(connector.point.x / 80)}-${Math.round(connector.point.y / 80)}`;
    if (!exactGroups.has(key)) exactGroups.set(key, { id: key, type: connector.type, stops: [] });
    exactGroups.get(key).stops.push(connector);
  });
  return [...exactGroups.values()].filter((group) => group.stops.length > 1);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function corridorSnapPoint(point, corridor) {
  const [x, y, width, height] = corridor.bbox;
  const horizontal = width >= height;
  return horizontal
    ? { x: clamp(point.x, x, x + width), y: y + height / 2 }
    : { x: x + width / 2, y: clamp(point.y, y, y + height) };
}

function nearestCorridorSnap(point, corridors) {
  if (!point || !corridors.length) return null;
  return corridors
    .map((corridor) => {
      const snap = corridorSnapPoint(point, corridor);
      return { point: snap, corridor, distance: distance(point, snap) };
    })
    .sort((a, b) => a.distance - b.distance)[0];
}

function dedupePath(points) {
  return points.filter(Boolean).filter((point, index) => {
    const prev = points[index - 1];
    return !prev || Math.abs(prev.x - point.x) > 1 || Math.abs(prev.y - point.y) > 1;
  });
}

function orthogonalBetween(a, b, prefer = 'horizontal') {
  if (!a || !b) return [];
  if (Math.abs(a.x - b.x) < 1 || Math.abs(a.y - b.y) < 1) return [a, b];
  const corner = prefer === 'horizontal' ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  return [a, corner, b];
}

function createFallbackGuidancePath(from, to, floorId) {
  if (!from || !to) return [];
  if (Math.abs(from.x - to.x) < 1 || Math.abs(from.y - to.y) < 1) {
    return [
      { ...from, floorId },
      { ...to, floorId },
    ];
  }
  const midY = from.y + (to.y - from.y) * 0.5;
  return dedupePath([
    { x: from.x, y: from.y, floorId },
    { x: from.x, y: midY, floorId },
    { x: to.x, y: midY, floorId },
    { x: to.x, y: to.y, floorId },
  ]);
}

function cardinal(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'east' : 'west';
  return dy >= 0 ? 'south' : 'north';
}

function generateInstructions(points, destinationName) {
  const steps = [];
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    const length = distance(from, to);
    if (length < 4) continue;
    steps.push({
      id: `step-${i}`,
      text: `${i === 1 ? 'Head' : 'Continue'} ${cardinal(from, to)} for ${Math.round(length)} map units`,
      distance: length,
      direction: cardinal(from, to),
    });
  }
  steps.push({ id: 'arrive', text: `Arrive at ${destinationName}`, distance: 0, direction: 'arrive' });
  return steps;
}

function graphHasEdges(graph) {
  return Boolean(graph?.nodes?.length && graph?.edges?.length);
}

const routeWalkableTypes = new Set(['entrance', 'reception', 'hallway', 'intersection', 'turn', 'doorway', 'destination_approach', 'destination_snap']);

function routeNodePoint(node) {
  return node ? { x: node.x, y: node.y, floorId: node.floorId, id: node.id, name: node.name, category: node.type } : null;
}

function nearestGraphNode(point, graph, types = routeWalkableTypes) {
  return nearestRouteNode(point, graph, (node) => types.has(node.type));
}

function findDestinationApproachNode(destinationFeature, destinationPoint, graph) {
  if (!graphHasEdges(graph)) return null;
  const nodes = graph.nodes || [];
  const linked = nodes.find((node) => (
    node.linkedFeatureId === destinationFeature?.id
    || node.linkedPoiId === destinationFeature?.id
    || node.connectorGroupId === destinationFeature?.id
  ));
  if (linked) return linked;
  const preferences = [
    new Set(['destination_approach', 'destination_snap']),
    new Set(['doorway']),
    new Set(['hallway', 'intersection', 'turn']),
  ];
  for (const types of preferences) {
    const node = nearestGraphNode(destinationPoint, graph, types);
    if (node) return node;
  }
  return null;
}

function findConnectorGraphNode(connector, graph) {
  if (!connector || !graphHasEdges(graph)) return null;
  const type = connector.type === 'stairs' ? 'stair' : connector.type;
  const nodes = graph.nodes || [];
  const linked = nodes.find((node) => (
    node.linkedPoiId === connector.poiId
    || node.linkedFeatureId === connector.poiId
    || (node.connectorGroupId && connector.key && node.connectorGroupId === connector.key)
  ));
  if (linked) return linked;
  return nearestGraphNode(connector.point, graph, new Set([type])) || nearestGraphNode(connector.point, graph);
}

function unavailableRoute({ floorId, destinationId, destinationName, activeFloorIds, reason, legs = [] }) {
  const firstLeg = legs.find((leg) => leg.type === 'walk' && leg.points?.length > 1);
  return {
    floorId,
    destinationId,
    destinationName,
    points: firstLeg?.points || [],
    heading: firstLeg?.heading || 0,
    distance: legs.reduce((sum, leg) => sum + (leg.distance || 0), 0),
    routeAvailable: false,
    quality: legs.length ? 'previewGuidance' : 'unavailable',
    mode: legs.length ? 'preview-guidance' : 'unavailable',
    unavailableReason: reason,
    activeFloorIds,
    legs,
    instructions: [{ id: 'route-graph-needed', text: reason, distance: 0, direction: 'unavailable' }],
  };
}

export function buildRoute(floor, fromPoint, destinationFeature) {
  const destination = featureCenter(destinationFeature);
  if (!floor || !fromPoint || !destination) return null;
  const corridors = floor.features.filter(
    (feature) => feature.visible !== false && feature.category === 'corridor' && feature.geometry.type === 'Polygon',
  );
  const destinationName = formatFeatureLabel(destinationFeature);
  if (!corridors.length) {
    return {
      floorId: floor.id,
      destinationId: destinationFeature.id,
      destinationName,
      points: [],
      heading: 0,
      distance: 0,
      quality: 'unavailable',
      mode: 'unavailable',
      routeAvailable: false,
      unavailableReason: 'Walking route needs a walkable corridor graph. Straight-line routing is disabled because it would cross walls.',
      instructions: [{
        id: 'route-unavailable',
        text: 'Walking route unavailable. This floor needs a walkable corridor graph before turn-by-turn routing can start.',
        distance: 0,
        direction: 'unavailable',
      }],
    };
  }
  const fromSnap = nearestCorridorSnap(fromPoint, corridors);
  const toSnap = nearestCorridorSnap(destination, corridors);
  if (!fromSnap || !toSnap) {
    return {
      floorId: floor.id,
      destinationId: destinationFeature.id,
      destinationName,
      points: [],
      heading: 0,
      distance: 0,
      quality: 'unavailable',
      mode: 'unavailable',
      routeAvailable: false,
      unavailableReason: 'Could not snap the origin and destination to walkable corridor space.',
      instructions: [{
        id: 'route-unavailable',
        text: 'Walking route unavailable. Try setting your location closer to a corridor or review the walkable graph.',
        distance: 0,
        direction: 'unavailable',
      }],
    };
  }
  let points;

  const entry = orthogonalBetween(fromPoint, fromSnap.point, fromSnap.corridor.bbox[2] >= fromSnap.corridor.bbox[3] ? 'vertical' : 'horizontal');
  const connector = orthogonalBetween(fromSnap.point, toSnap.point, 'horizontal').slice(1);
  const exit = orthogonalBetween(toSnap.point, destination, toSnap.corridor.bbox[2] >= toSnap.corridor.bbox[3] ? 'vertical' : 'horizontal').slice(1);
  points = dedupePath([...entry, ...connector, ...exit]);

  const totalDistance = points.reduce((sum, point, index) => {
    if (!index) return sum;
    return sum + distance(points[index - 1], point);
  }, 0);
  const nextPoint = points[1] || destination;
  const heading = Math.atan2(nextPoint.y - fromPoint.y, nextPoint.x - fromPoint.x) * (180 / Math.PI) + 90;
  return {
    floorId: floor.id,
    destinationId: destinationFeature.id,
    destinationName,
    points,
    heading,
    distance: totalDistance,
    quality: 'real',
    routeAvailable: true,
    mode: 'corridor-guided',
    instructions: generateInstructions(points, destinationName),
  };
}

function graphLeg({ id, floor, graph, from, to, destinationName, instruction, connector, startConnector, endConnector, destinationFeature }) {
  if (!graphHasEdges(graph)) return null;
  const start = startConnector
    ? findConnectorGraphNode(startConnector, graph)
    : nearestGraphNode(from, graph);
  const end = endConnector
    ? findConnectorGraphNode(endConnector, graph)
    : destinationFeature
      ? findDestinationApproachNode(destinationFeature, to, graph)
      : nearestGraphNode(to, graph);
  const nodePath = shortestGraphPath(graph, start?.id, end?.id);
  if (!nodePath?.length) return null;
  const graphPoints = nodesToPoints(nodePath);
  const points = dedupePath(graphPoints);
  const distanceTotal = points.reduce((sum, point, index) => (index ? sum + distance(points[index - 1], point) : sum), 0);
  const nextPoint = points[1] || points[0] || to;
  const endPoint = points[points.length - 1];
  const endpointConnector = !connector && endPoint && to && distance(endPoint, to) > 6
    ? {
      from: endPoint,
      to,
      label: 'Destination is just off the hallway.',
    }
    : null;
  return {
    id,
    type: 'walk',
    floorId: floor.id,
    floorName: floorLabel(floor),
    points,
    distance: distanceTotal,
    heading: Math.atan2(nextPoint.y - from.y, nextPoint.x - from.x) * (180 / Math.PI) + 90,
    routeAvailable: true,
    approximate: false,
    quality: 'manualGraph',
    mode: 'route-graph',
    destinationName,
    connector,
    endpointConnector,
    instructions: [{ id: `${id}-step`, text: instruction, distance: distanceTotal, direction: 'graph' }],
  };
}

function approximateLeg({ id, floor, from, to, destinationName, instruction, connector }) {
  const points = createFallbackGuidancePath(from, to, floor.id);
  const totalDistance = points.reduce((sum, point, index) => (index ? sum + distance(points[index - 1], point) : sum), 0);
  const nextPoint = points[1] || to;
  return {
    id,
    type: 'walk',
    floorId: floor.id,
    floorName: floorLabel(floor),
    points,
    distance: totalDistance,
    heading: from && nextPoint ? Math.atan2(nextPoint.y - from.y, nextPoint.x - from.x) * (180 / Math.PI) + 90 : 0,
    routeAvailable: points.length > 1,
    approximate: true,
    quality: points.length > 1 ? 'approximateGuidance' : 'unavailable',
    mode: points.length > 1 ? 'approximate-guidance' : 'unavailable',
    destinationName,
    connector,
    instructions: [{
      id: `${id}-step`,
      text: points.length > 1 ? instruction : 'Route unavailable because the start or destination is missing.',
      distance: totalDistance,
      direction: points.length > 1 ? 'approximate' : 'unavailable',
    }],
  };
}

function previewLeg(args) {
  const leg = approximateLeg(args);
  return {
    ...leg,
    routeAvailable: false,
    quality: leg.points?.length > 1 ? 'previewGuidance' : 'unavailable',
    mode: leg.points?.length > 1 ? 'preview-guidance' : 'unavailable',
    instructions: [{
      ...(leg.instructions?.[0] || {}),
      text: args.instruction || 'Preview guidance shown. Add hallway graph nodes for a confirmed walkable route.',
      direction: 'preview',
    }],
  };
}

function bestConnectorPair({ floors, originFloorId, destinationFloorId, originPoint, destinationPoint, connectorPreference = 'any' }) {
  const originFloor = floors.find((floor) => floor.id === originFloorId);
  const destinationFloor = floors.find((floor) => floor.id === destinationFloorId);
  const originConnectors = verticalConnectorCandidates(originFloor);
  const destinationConnectors = verticalConnectorCandidates(destinationFloor);
  const pairs = [];
  originConnectors.forEach((origin) => {
    destinationConnectors.forEach((destination) => {
      if (origin.type !== destination.type) return;
      const keyBonus = origin.key && destination.key && origin.key === destination.key ? -900 : 0;
      const typeBonus = origin.type === 'elevator' ? -250 : 0;
      const layoutDistance = Math.hypot(origin.point.x - destination.point.x, origin.point.y - destination.point.y);
      const accessDistance = distance(originPoint, origin.point) + distance(destinationPoint, destination.point);
      pairs.push({ origin, destination, score: keyBonus + typeBonus + layoutDistance + accessDistance * 0.08 });
    });
  });
  const preferredPairs = connectorPreference === 'any' ? pairs : pairs.filter((pair) => pair.origin.type === connectorPreference);
  return preferredPairs.sort((a, b) => a.score - b.score)[0] || null;
}

export function planIndoorRoute({ floors, originFloorId, originPoint, destinationFloorId, destinationFeature, routeGraphs = {}, connectorPreference = 'any' }) {
  const originFloor = floors.find((floor) => floor.id === originFloorId);
  const destinationFloor = floors.find((floor) => floor.id === destinationFloorId);
  const destinationPoint = featureCenter(destinationFeature);
  const destinationName = formatFeatureLabel(destinationFeature);
  if (!originFloor || !destinationFloor || !originPoint || !destinationPoint) return null;

  if (originFloorId === destinationFloorId) {
    const graph = routeGraphs[originFloorId];
    const graphRoute = graphLeg({
      id: 'leg-same-floor',
      floor: originFloor,
      graph,
      from: originPoint,
      to: destinationPoint,
      destinationName,
      destinationFeature,
      instruction: `Continue to ${destinationName}.`,
    });
    if (!graphRoute) {
      const leg = previewLeg({
        id: 'leg-same-floor-preview',
        floor: originFloor,
        from: originPoint,
        to: destinationPoint,
        destinationName,
        instruction: `Preview guidance shown to ${destinationName}. Add hallway graph nodes for a confirmed walkable route.`,
      });
      return unavailableRoute({
        floorId: originFloorId,
        destinationId: destinationFeature.id,
        destinationName,
        activeFloorIds: [originFloorId],
        reason: 'Hallway route graph needed for this area. Add connected route nodes in Admin.',
        legs: [leg],
      });
    }
    const leg = graphRoute;
    return {
      id: `route-${originFloorId}-${destinationFloorId}-${destinationFeature.id}`,
      originFloorId,
      destinationFloorId,
      floorId: originFloorId,
      destinationId: destinationFeature.id,
      destinationName,
      routeAvailable: true,
      approximate: false,
      quality: leg.quality || 'manualGraph',
      mode: 'route-graph',
      points: leg.points,
      heading: leg.heading,
      distance: leg.distance,
      legs: [leg],
      activeFloorIds: [originFloorId],
      instructions: leg.instructions,
      notice: 'Hallway route shown.',
    };
  }

  const pair = bestConnectorPair({ floors, originFloorId, destinationFloorId, originPoint, destinationPoint, connectorPreference });
  if (!pair) {
    const requestedConnector = connectorPreferenceLabel(connectorPreference);
    const reason = connectorPreference === 'any'
      ? 'No elevator, escalator, or stair connector was found between these floors.'
      : `No ${requestedConnector} connector was found between these floors. Choose another route option or add matching ${requestedConnector} points on both floors.`;
    return {
      floorId: originFloorId,
      destinationId: destinationFeature.id,
      destinationName,
      points: [],
      heading: 0,
      distance: 0,
      routeAvailable: false,
      quality: 'unavailable',
      mode: 'unavailable',
      unavailableReason: reason,
      activeFloorIds: [originFloorId, destinationFloorId],
      instructions: [{ id: 'no-connector', text: reason, distance: 0, direction: 'unavailable' }],
    };
  }

  const originGraph = routeGraphs[originFloorId];
  const destinationGraph = routeGraphs[destinationFloorId];
  const originLeg = graphLeg({
    id: 'leg-to-connector',
    floor: originFloor,
    graph: originGraph,
    from: originPoint,
    to: pair.origin.point,
    destinationName: pair.origin.name,
    connector: pair.origin,
    endConnector: pair.origin,
    instruction: `Follow the highlighted route to ${connectorTypeLabel(pair.origin.type)} ${pair.origin.name}.`,
  });
  const destinationLeg = graphLeg({
    id: 'leg-from-connector',
    floor: destinationFloor,
    graph: destinationGraph,
    from: pair.destination.point,
    to: destinationPoint,
    destinationName,
    startConnector: pair.destination,
    destinationFeature,
    connector: pair.destination,
    instruction: `From ${connectorTypeLabel(pair.destination.type)} ${pair.destination.name}, follow the highlighted route to ${destinationName}.`,
  });
  if (!originLeg || !destinationLeg) {
    const previewOriginLeg = originLeg || previewLeg({
      id: 'leg-to-connector-preview',
      floor: originFloor,
      from: originPoint,
      to: pair.origin.point,
      destinationName: pair.origin.name,
      connector: pair.origin,
      instruction: `Preview guidance to ${connectorTypeLabel(pair.origin.type)} ${pair.origin.name}. Add hallway graph nodes for a confirmed route.`,
    });
    const previewDestinationLeg = destinationLeg || previewLeg({
      id: 'leg-from-connector-preview',
      floor: destinationFloor,
      from: pair.destination.point,
      to: destinationPoint,
      destinationName,
      connector: pair.destination,
      instruction: `Preview guidance from ${connectorTypeLabel(pair.destination.type)} ${pair.destination.name} to ${destinationName}. Add hallway graph nodes for a confirmed route.`,
    });
    const previewTransfer = {
      id: 'vertical-transfer-preview',
      type: 'transfer',
      connectorType: pair.origin.type,
      fromFloorId: originFloorId,
      toFloorId: destinationFloorId,
      fromFloorName: floorLabel(originFloor),
      toFloorName: floorLabel(destinationFloor),
      from: pair.origin,
      to: pair.destination,
      instructions: [{
        id: 'transfer-step-preview',
        text: `Take the ${connectorTypeLabel(pair.origin.type)} to ${floorLabel(destinationFloor)}.`,
        distance: 0,
        direction: 'transfer',
      }],
    };
    const missing = !originLeg && !destinationLeg
      ? `${floorLabel(originFloor)} and ${floorLabel(destinationFloor)}`
      : !originLeg
        ? floorLabel(originFloor)
        : floorLabel(destinationFloor);
    return unavailableRoute({
      floorId: originFloorId,
      destinationId: destinationFeature.id,
      destinationName,
      activeFloorIds: [originFloorId, destinationFloorId],
      reason: `Hallway route graph needed for ${missing}. Add connected route nodes in Admin before routing through walls is allowed.`,
      legs: [previewOriginLeg, previewTransfer, previewDestinationLeg],
    });
  }
  const transfer = {
    id: 'vertical-transfer',
    type: 'transfer',
    connectorType: pair.origin.type,
    fromFloorId: originFloorId,
    toFloorId: destinationFloorId,
    fromFloorName: floorLabel(originFloor),
    toFloorName: floorLabel(destinationFloor),
    from: pair.origin,
    to: pair.destination,
    instructions: [{
      id: 'transfer-step',
      text: `Take the ${connectorTypeLabel(pair.origin.type)} to ${floorLabel(destinationFloor)}.`,
      distance: 0,
      direction: 'transfer',
    }],
  };
  const instructions = [...originLeg.instructions, ...transfer.instructions, ...destinationLeg.instructions].map((step, index) => ({ ...step, text: `${index + 1}. ${step.text.replace(/^\d+\.\s*/, '')}` }));
  return {
    id: `route-${originFloorId}-${destinationFloorId}-${destinationFeature.id}`,
    originFloorId,
    destinationFloorId,
    connectorGroupId: `${pair.origin.type}-${pair.origin.key || pair.origin.name}`,
    connectorType: pair.origin.type,
    floorId: originFloorId,
    destinationId: destinationFeature.id,
    destinationName,
    routeAvailable: true,
    approximate: false,
    quality: 'manualGraph',
    mode: 'multi-floor-route-graph',
    points: originLeg.points,
    heading: originLeg.heading,
    distance: originLeg.distance + destinationLeg.distance,
    legs: [originLeg, transfer, destinationLeg],
    activeFloorIds: [originFloorId, destinationFloorId],
    transfer,
    instructions,
    notice: 'Hallway route shown.',
  };
}

export function pathD(points = []) {
  if (!points.length) return '';
  return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
}

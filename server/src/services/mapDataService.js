const { prisma } = require('../db/prisma');

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function compactSourceMetadata(value) {
  const metadata = parseJson(value, {});
  const { id, class: className, fill, stroke, tag, d, points, width, height, preparedPackage, manualApproved, manual } = metadata;
  let inferredTag = tag;
  if (!inferredTag && d) inferredTag = 'path';
  if (!inferredTag && points) inferredTag = 'polygon';
  if (!inferredTag && width !== undefined && height !== undefined) inferredTag = 'rect';
  return { id, class: className, fill, stroke, tag: inferredTag, preparedPackage, manualApproved: manualApproved || manual };
}

function hasUsefulLabel(feature) {
  const label = `${feature.displayName || ''} ${feature.name || ''} ${feature.roomNumber || ''}`.trim().toLowerCase();
  const sourceMetadata = parseJson(feature.sourceMetadataJson, {});
  const sourceId = String(sourceMetadata.id || '').trim().toLowerCase();
  const displayName = String(feature.displayName || '').trim().toLowerCase();
  const name = String(feature.name || '').trim().toLowerCase();
  const sourceOnly = sourceId && (displayName === sourceId || name === sourceId);
  const technicalId = /^[a-z]?\d+[a-z]?\d*$/i.test(displayName) && !feature.roomNumber;
  return Boolean(label) && !sourceOnly && !technicalId && !['unknown', 'room', 'decorative'].includes(label);
}

function shouldSendFeature(feature, floor) {
  if (feature.isDeleted || feature.visible === false || feature.category === 'decorative') return false;
  if (!['room', 'poi'].includes(feature.type)) return false;
  if (feature.category === 'corridor' || feature.category === 'unknown' || feature.category === 'noise') return false;
  if (feature.confidence < 0.75) return false;
  const bbox = parseJson(feature.bboxJson, [0, 0, 0, 0]);
  const geometry = parseJson(feature.geometryJson, {});
  const source = compactSourceMetadata(feature.sourceMetadataJson);
  if (geometry.type === 'LineString') return false;
  if (geometry.type !== 'Polygon' && geometry.type !== 'Point') return false;
  if ((source.preparedPackage || source.manualApproved) && ['room', 'poi'].includes(feature.type)) return true;
  if (geometry.type === 'Polygon' && !['rect', 'polygon'].includes(source.tag)) return false;
  const viewBox = parseJson(floor.viewBox, [0, 0, floor.width || 1200, floor.height || 800]);
  const mapArea = viewBox[2] * viewBox[3];
  const areaRatio = mapArea ? (bbox[2] * bbox[3]) / mapArea : 0;
  const skinny = Math.max(bbox[2], bbox[3]) / Math.max(1, Math.min(bbox[2], bbox[3])) > 10;
  const usefulLabel = hasUsefulLabel(feature);
  if (geometry.type === 'Polygon' && !usefulLabel) return false;
  if (areaRatio > 0.85 && !usefulLabel) return false;
  if (feature.category === 'unknown' && !usefulLabel) return false;
  if (!usefulLabel && (areaRatio < 0.0012 || (skinny && feature.category !== 'corridor'))) return false;
  return true;
}

function reviewStats(floor) {
  const stats = {
    highConfidenceRooms: 0,
    lowConfidenceRooms: 0,
    ignoredNoise: 0,
    hiddenCorridors: 0,
    labelsFound: 0,
    manuallyApproved: 0,
  };
  for (const feature of floor.features || []) {
    const source = compactSourceMetadata(feature.sourceMetadataJson);
    const usefulLabel = hasUsefulLabel(feature);
    if (usefulLabel) stats.labelsFound += 1;
    if (feature.visible && feature.type === 'room' && feature.confidence >= 0.75) stats.highConfidenceRooms += 1;
    if (feature.type === 'room' && feature.confidence < 0.75) stats.lowConfidenceRooms += 1;
    if (feature.category === 'corridor' && feature.visible === false) stats.hiddenCorridors += 1;
    if (feature.visible === false || feature.category === 'decorative' || feature.category === 'unknown' || source.tag === 'path') stats.ignoredNoise += 1;
    if (source.manualApproved || source.manual) stats.manuallyApproved += 1;
  }
  return stats;
}

function featureDto(feature) {
  return {
    id: feature.id,
    type: feature.type,
    category: feature.category,
    name: feature.name,
    roomNumber: feature.roomNumber,
    displayName: feature.displayName,
    confidence: feature.confidence,
    visible: feature.visible,
    geometry: parseJson(feature.geometryJson, null),
    bbox: parseJson(feature.bboxJson, [0, 0, 0, 0]),
    sourceSvg: compactSourceMetadata(feature.sourceMetadataJson),
  };
}

async function indoorMapJson(buildingId, options = {}) {
  const includeSvgBackground = options.includeSvgBackground !== false;
  const building = await prisma.building.findUnique({
    where: { id: buildingId },
    include: {
      floors: {
        orderBy: [{ sortOrder: 'asc' }, { levelNumber: 'asc' }],
        include: { svgFile: true, features: true, pois: true, qrAnchors: true, routeNodes: true, routeEdges: true },
      },
    },
  });
  if (!building) return null;
  return {
    building: { id: building.id, name: building.name, address: building.address, description: building.description },
    floors: building.floors.map((floor) => ({
      id: floor.id,
      name: floor.name,
      levelNumber: floor.levelNumber,
      viewBox: parseJson(floor.viewBox, [0, 0, floor.width || 1200, floor.height || 800]),
      svgBackground: '',
      svgBackgroundUrl: includeSvgBackground && floor.svgFile?.rawText ? `/api/floors/${floor.id}/source-svg` : '',
      features: floor.features.filter((feature) => shouldSendFeature(feature, floor)).map(featureDto),
      reviewStats: reviewStats(floor),
      pois: floor.pois,
      qrAnchors: floor.qrAnchors,
      routeGraph: { nodes: floor.routeNodes, edges: floor.routeEdges },
    })),
  };
}

async function floorIndoorMapJson(floorId, options = {}) {
  const includeSvgBackground = options.includeSvgBackground !== false;
  const floor = await prisma.floor.findUnique({
    where: { id: floorId },
    include: { building: true, svgFile: true, features: true, pois: true, qrAnchors: true, routeNodes: true, routeEdges: true },
  });
  if (!floor) return null;
  return {
    building: { id: floor.building.id, name: floor.building.name },
    floors: [{
      id: floor.id,
      name: floor.name,
      levelNumber: floor.levelNumber,
      viewBox: parseJson(floor.viewBox, [0, 0, floor.width || 1200, floor.height || 800]),
      svgBackground: '',
      svgBackgroundUrl: includeSvgBackground && floor.svgFile?.rawText ? `/api/floors/${floor.id}/source-svg` : '',
      features: floor.features.filter((feature) => shouldSendFeature(feature, floor)).map(featureDto),
      reviewStats: reviewStats(floor),
      pois: floor.pois,
      qrAnchors: floor.qrAnchors,
      routeGraph: { nodes: floor.routeNodes, edges: floor.routeEdges },
    }],
  };
}

function toGeoJson(mapJson, floorFilter = null) {
  return {
    type: 'FeatureCollection',
    features: mapJson.floors
      .filter((floor) => !floorFilter || floor.id === floorFilter)
      .flatMap((floor) => floor.features
        .filter((feature) => feature.visible !== false && feature.category !== 'decorative')
        .map((feature) => ({
          type: 'Feature',
          properties: {
            id: feature.id,
            name: feature.name,
            displayName: feature.displayName,
            type: feature.type,
            category: feature.category,
            floor: floor.id,
            floorName: floor.name,
            roomNumber: feature.roomNumber,
            confidence: feature.confidence,
          },
          geometry: feature.geometry,
        }))),
  };
}

module.exports = { featureDto, floorIndoorMapJson, indoorMapJson, parseJson, toGeoJson };

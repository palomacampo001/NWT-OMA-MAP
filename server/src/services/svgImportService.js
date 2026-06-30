const { DOMParser } = require('@xmldom/xmldom');
const { prisma } = require('../db/prisma');
const { bboxFromPoints, center, closeRing, distance, number, parsePoints, pointInBbox, rectToPolygon, roughPathPoints } = require('../utils/geometryHelpers');

const categoryRules = [
  ['restroom', /rest\s*room|bath|toilet|wc|men|women/i],
  ['elevator', /elev|lift/i],
  ['stairs', /stair|steps/i],
  ['cafeteria', /cafe|cafeteria|dining|canteen/i],
  ['kitchen', /kitchen/i],
  ['pantry', /pantry/i],
  ['copy_print', /copy|print|printer|mail/i],
  ['reception', /reception|front desk|lobby/i],
  ['meeting_room', /conference|meeting|huddle|board room|training|brainstorm/i],
  ['entrance', /entrance|entry/i],
  ['exit', /\bexit\b/i],
  ['lounge', /lounge|break/i],
  ['storage', /storage|closet|janitor/i],
  ['mechanical', /mechanical|electrical|server|it room|utility/i],
  ['corridor', /corridor|hall|hallway|aisle/i],
  ['office', /office|room/i],
];

function attrs(node) {
  const out = {};
  if (!node?.attributes) return out;
  for (let i = 0; i < node.attributes.length; i += 1) out[node.attributes[i].name] = node.attributes[i].value;
  return out;
}

function elementsByTag(document, tag) {
  return Array.from(document.getElementsByTagName(tag));
}

function parseViewBox(svg) {
  const value = svg.getAttribute('viewBox');
  if (value) {
    const parts = value.split(/[,\s]+/).map(Number).filter(Number.isFinite);
    if (parts.length === 4) return parts;
  }
  return [0, 0, number(svg.getAttribute('width'), 1200), number(svg.getAttribute('height'), 800)];
}

function extractText(document) {
  return elementsByTag(document, 'text').map((node) => ({
    text: (node.textContent || '').replace(/\s+/g, ' ').trim(),
    point: { x: number(node.getAttribute('x')), y: number(node.getAttribute('y')) },
    source: attrs(node),
  })).filter((item) => item.text);
}

function extractShapes(document) {
  const shapes = [];
  for (const node of elementsByTag(document, 'rect')) {
    const x = number(node.getAttribute('x'));
    const y = number(node.getAttribute('y'));
    const width = number(node.getAttribute('width'));
    const height = number(node.getAttribute('height'));
    if (width > 2 && height > 2) shapes.push({ tag: 'rect', points: rectToPolygon(x, y, width, height), source: { ...attrs(node), tag: 'rect' } });
  }
  for (const node of elementsByTag(document, 'polygon')) {
    const points = closeRing(parsePoints(node.getAttribute('points')));
    if (points.length > 3) shapes.push({ tag: 'polygon', points, source: { ...attrs(node), tag: 'polygon' } });
  }
  for (const node of elementsByTag(document, 'path')) {
    const d = node.getAttribute('d') || '';
    if (!/z\s*$/i.test(d.trim())) continue;
    const points = closeRing(roughPathPoints(d));
    if (points.length > 3) shapes.push({ tag: 'path', points, source: { ...attrs(node), tag: 'path' } });
  }
  return shapes.map((shape) => ({ ...shape, bbox: bboxFromPoints(shape.points) }));
}

function roomNumber(text) {
  return /^[A-Z]?\d{2,5}[A-Z]?$/.test(text.trim()) || /^[A-Z]\d+[A-Z]?$/i.test(text.trim());
}

function textCategory(text) {
  if (roomNumber(text)) return 'room_label';
  return categoryRules.find(([, pattern]) => pattern.test(text))?.[0] || 'label';
}

function classify(text, bbox, viewBox, hasLabel = false) {
  const match = categoryRules.find(([, pattern]) => pattern.test(text));
  const mapArea = viewBox[2] * viewBox[3];
  const areaRatio = mapArea ? (bbox[2] * bbox[3]) / mapArea : 0;
  const skinny = Math.max(bbox[2], bbox[3]) / Math.max(1, Math.min(bbox[2], bbox[3])) > 10;
  let category = match?.[0] || 'unknown';
  if (areaRatio < 0.00008 || areaRatio > 0.7 || (!hasLabel && category === 'unknown') || skinny) category = 'decorative';
  let type = 'room';
  if (category === 'corridor') type = 'corridor';
  if (['restroom', 'elevator', 'stairs', 'reception', 'cafeteria', 'entrance', 'exit'].includes(category)) type = 'poi';
  if (category === 'decorative') type = 'decorative';
  return { type, category };
}

function textOnlyPois(texts, labeledShapes, viewBox) {
  const maxDimension = Math.max(viewBox[2], viewBox[3]);
  const assignedTexts = new Set(labeledShapes.flatMap((shape) => shape.labels.map((label) => `${label.text}:${label.point.x}:${label.point.y}`)));
  return texts
    .filter((text) => !assignedTexts.has(`${text.text}:${text.point.x}:${text.point.y}`))
    .filter((text) => text.text.length >= 2)
    .slice(0, 1600)
    .map((text, index) => {
      const category = textCategory(text.text);
      const isMajorPoi = ['restroom', 'elevator', 'stairs', 'reception', 'cafeteria', 'entrance', 'exit'].includes(category);
      const size = isMajorPoi ? maxDimension * 0.012 : maxDimension * 0.006;
      return {
        type: 'poi',
        category,
        name: text.text,
        displayName: text.text,
        roomNumber: roomNumber(text.text) ? text.text : null,
        geometryJson: JSON.stringify({ type: 'Point', coordinates: [text.point.x, text.point.y] }),
        bboxJson: JSON.stringify([text.point.x - size, text.point.y - size, size * 2, size * 2]),
        confidence: isMajorPoi || roomNumber(text.text) ? 0.85 : 0.72,
        visible: isMajorPoi || roomNumber(text.text),
        sourceMetadataJson: JSON.stringify({ ...text.source, tag: 'text' }),
      };
    });
}

function isReliableAutoOverlay(shape, classified, confidence, viewBox) {
  const [,, width, height] = shape.bbox;
  const mapArea = viewBox[2] * viewBox[3];
  const areaRatio = mapArea ? (width * height) / mapArea : 0;
  const aspectRatio = Math.max(width, height) / Math.max(1, Math.min(width, height));
  const sourceTag = shape.source.tag;
  if (!['rect', 'polygon'].includes(sourceTag)) return false;
  if (!['room', 'poi'].includes(classified.type)) return false;
  if (classified.category === 'unknown' || classified.category === 'corridor' || classified.category === 'decorative') return false;
  if (confidence < 0.75) return false;
  if (shape.points.length < 4) return false;
  if (width < 4 || height < 4) return false;
  if (aspectRatio > 8) return false;
  if (areaRatio < 0.0008 || areaRatio > 0.28) return false;
  return true;
}

function assignLabels(shapes, texts, viewBox) {
  const padding = Math.max(viewBox[2], viewBox[3]) * 0.025;
  return shapes.map((shape) => {
    const shapeCenter = center(shape.bbox);
    const labels = texts
      .map((text) => {
        const inside = pointInBbox(text.point, shape.bbox);
        const close = pointInBbox(text.point, shape.bbox, padding);
        return { ...text, score: inside ? 1 : close ? 0.75 : 0, dist: distance(text.point, shapeCenter) };
      })
      .filter((text) => text.score > 0)
      .sort((a, b) => b.score - a.score || a.dist - b.dist)
      .slice(0, 3);
    const numberLabel = labels.find((label) => roomNumber(label.text));
    const nameLabel = labels.find((label) => !roomNumber(label.text));
    return {
      ...shape,
      labels,
      roomNumber: numberLabel?.text || '',
      name: nameLabel?.text || '',
      labelConfidence: labels[0]?.score || 0,
    };
  });
}

async function importSvgToFloor({ buildingId, floorId, filename, mimeType, svgText }) {
  const document = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svg = document.getElementsByTagName('svg')[0];
  if (!svg) throw new Error('No SVG element found.');
  const viewBox = parseViewBox(svg);
  const uploadedFile = await prisma.uploadedFile.create({
    data: { buildingId, originalFilename: filename, fileType: 'svg', mimeType, rawText: svgText },
  });
  await prisma.floor.update({
    where: { id: floorId },
    data: { svgFileId: uploadedFile.id, viewBox: JSON.stringify(viewBox), width: viewBox[2], height: viewBox[3] },
  });
  await prisma.mapFeature.deleteMany({ where: { floorId } });
  const texts = extractText(document);
  const shapes = assignLabels(extractShapes(document), texts, viewBox)
    .sort((a, b) => (b.bbox[2] * b.bbox[3]) - (a.bbox[2] * a.bbox[3]))
    .slice(0, 1200);
  const features = [];
  for (let i = 0; i < shapes.length; i += 1) {
    const shape = shapes[i];
    const labelText = `${shape.name} ${shape.roomNumber} ${shape.source.class || ''}`;
    const hasLabel = Boolean(shape.name || shape.roomNumber);
    const classified = classify(labelText, shape.bbox, viewBox, hasLabel);
    const confidence = classified.category === 'decorative' ? 0.25 : shape.labelConfidence >= 1 ? 0.95 : shape.labelConfidence > 0 ? 0.8 : 0.65;
    const visible = isReliableAutoOverlay(shape, classified, confidence, viewBox);
    features.push({
      buildingId,
      floorId,
      sourceSvgId: shape.source.id || null,
      type: classified.type,
      category: classified.category,
      name: shape.name || (classified.type === 'room' ? 'Room' : classified.category),
      displayName: [shape.name, shape.roomNumber].filter(Boolean).join(' ') || shape.source.id || classified.category,
      roomNumber: shape.roomNumber || null,
      geometryJson: JSON.stringify({ type: 'Polygon', coordinates: [closeRing(shape.points)] }),
      bboxJson: JSON.stringify(shape.bbox),
      confidence,
      visible,
      isDeleted: false,
      sourceMetadataJson: JSON.stringify(shape.source),
    });
  }
  textOnlyPois(texts, shapes, viewBox).forEach((poi, index) => {
    features.push({
      buildingId,
      floorId,
      sourceSvgId: null,
      isDeleted: false,
      ...poi,
    });
  });
  if (features.length) await prisma.mapFeature.createMany({ data: features });
  const saved = await prisma.mapFeature.findMany({ where: { floorId } });
  return {
    uploadedFileId: uploadedFile.id,
    floorId,
    detectedFeatures: saved.length,
    rooms: saved.filter((feature) => feature.type === 'room').length,
    corridors: saved.filter((feature) => feature.category === 'corridor').length,
    pois: saved.filter((feature) => feature.type === 'poi').length,
    labels: texts.length,
    lowConfidence: saved.filter((feature) => feature.confidence < 0.5).length,
    warnings: [],
  };
}

module.exports = { importSvgToFloor };

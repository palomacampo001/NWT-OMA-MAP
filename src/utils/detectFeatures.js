import { assignLabelsToShapes } from './assignLabels.js';
import { classifyFeature } from './classifyFeatures.js';
import { bboxArea, closeRing, slugify } from './geometryHelpers.js';

function isProbablyDecorative(shape, viewBox) {
  const area = bboxArea(shape.bbox);
  const mapArea = viewBox[2] * viewBox[3];
  const fill = (shape.sourceSvg.fill || '').toLowerCase();
  const stroke = (shape.sourceSvg.stroke || '').toLowerCase();
  if (fill === 'none' && stroke === 'none') return true;
  return mapArea > 0 && area / mapArea < 0.00008;
}

function isUsefulClosedShape(shape, viewBox) {
  if (!shape.closed || shape.geometryType === 'LineString') return false;
  const area = bboxArea(shape.bbox);
  const mapArea = viewBox[2] * viewBox[3];
  const fill = (shape.sourceSvg.fill || '').toLowerCase();
  const stroke = (shape.sourceSvg.stroke || '').toLowerCase();
  if (!area || shape.bbox[2] < 3 || shape.bbox[3] < 3) return false;
  if (fill === 'none' && stroke === 'none') return false;
  return !mapArea || area / mapArea >= 0.00004;
}

function confidenceFor(shape, classified) {
  if (classified.category === 'decorative') return 0.25;
  if (shape.labelConfidence >= 1 && shape.closed) return 0.95;
  if (shape.labelConfidence >= 0.65 && shape.closed) return 0.82;
  if (shape.closed && shape.displayName) return 0.75;
  if (shape.closed) return 0.65;
  return 0.45;
}

function featureId(shape, index, classified) {
  const label = shape.roomNumber || shape.name || shape.sourceSvg.id || `${classified.type}-${index + 1}`;
  return `${classified.type}-${slugify(label) || index + 1}-${index + 1}`;
}

function shapeToFeature(shape, index, viewBox) {
  const classified = classifyFeature({
    text: `${shape.name} ${shape.roomNumber} ${shape.displayName}`,
    bbox: shape.bbox,
    viewBox,
    sourceSvg: shape.sourceSvg,
    closed: shape.closed,
  });
  const decorative = isProbablyDecorative(shape, viewBox) || classified.category === 'decorative';
  const category = decorative ? 'decorative' : classified.category;
  const type = decorative ? 'decorative' : classified.type;
  const confidence = decorative ? 0.25 : confidenceFor(shape, classified);
  const coordinates = [closeRing(shape.points)];
  return {
    id: featureId(shape, index, classified),
    type,
    category,
    name: shape.name || (type === 'room' ? 'Room' : ''),
    roomNumber: shape.roomNumber || '',
    displayName: shape.displayName || shape.name || shape.roomNumber || category,
    confidence,
    visible: !decorative,
    geometry: {
      type: 'Polygon',
      coordinates,
    },
    bbox: shape.bbox,
    sourceSvg: shape.sourceSvg,
    labels: shape.labels.map((label) => label.text),
  };
}

function textOnlyPois(texts, features, viewBox) {
  const usedText = new Set(features.flatMap((feature) => feature.labels || []));
  const poiWords = /cafe|restroom|bath|elev|stair|lobby|reception|exit|entrance|kitchen|pantry|copy|print/i;
  return texts
    .filter((text) => !usedText.has(text.text) && poiWords.test(text.text))
    .map((text, index) => {
      const classified = classifyFeature({ text: text.text, bbox: text.bbox, viewBox });
      return {
        id: `poi-${slugify(text.text)}-${index + 1}`,
        type: 'poi',
        category: classified.category === 'unknown' ? 'landmark' : classified.category,
        name: text.text,
        roomNumber: '',
        displayName: text.text,
        confidence: 0.72,
        visible: true,
        geometry: { type: 'Point', coordinates: [text.point.x, text.point.y] },
        bbox: text.bbox,
        sourceSvg: text.sourceSvg,
        labels: [text.text],
      };
    });
}

export function generateIndoorMapData(parsed, options = {}) {
  const { viewBox, filename, elements } = parsed;
  const maxCandidates = 900;
  const candidates = elements.shapes
    .filter((shape) => isUsefulClosedShape(shape, viewBox))
    .sort((a, b) => bboxArea(b.bbox) - bboxArea(a.bbox))
    .slice(0, maxCandidates);
  const labeled = assignLabelsToShapes(candidates, elements.texts.slice(0, 1200), viewBox);
  const features = labeled
    .map((shape, index) => shapeToFeature(shape, index, viewBox))
    .filter((feature) => feature.geometry.coordinates.length && feature.bbox[2] >= 0 && feature.bbox[3] >= 0);
  const poiFeatures = textOnlyPois(elements.texts, features, viewBox);
  const floor = {
    id: options.floorId || 'floor-01',
    name: options.floorName || 'Floor 1',
    source: { type: 'svg', filename, viewBox },
    viewBox,
    features: [...features, ...poiFeatures],
  };
  return {
    building: 'Imported SVG Map',
    source: { type: 'svg', filename, viewBox },
    floors: [floor],
    floor,
  };
}

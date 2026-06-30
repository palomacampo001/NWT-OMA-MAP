function number(value, fallback = 0) {
  const parsed = Number.parseFloat(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePoints(points = '') {
  const values = points.trim().replace(/,/g, ' ').split(/\s+/).map(Number).filter(Number.isFinite);
  const pairs = [];
  for (let i = 0; i < values.length - 1; i += 2) pairs.push([values[i], values[i + 1]]);
  return pairs;
}

function closeRing(points) {
  if (!points.length) return points;
  const first = points[0];
  const last = points[points.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? points : [...points, first];
}

function rectToPolygon(x, y, width, height) {
  return closeRing([[x, y], [x + width, y], [x + width, y + height], [x, y + height]]);
}

function bboxFromPoints(points) {
  if (!points.length) return [0, 0, 0, 0];
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return [minX, minY, Math.max(...xs) - minX, Math.max(...ys) - minY];
}

function center(bbox) {
  return { x: bbox[0] + bbox[2] / 2, y: bbox[1] + bbox[3] / 2 };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointInBbox(point, bbox, padding = 0) {
  return point.x >= bbox[0] - padding && point.x <= bbox[0] + bbox[2] + padding && point.y >= bbox[1] - padding && point.y <= bbox[1] + bbox[3] + padding;
}

function roughPathPoints(d = '') {
  const matches = String(d).match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
  const values = matches.map(Number).filter(Number.isFinite);
  const points = [];
  for (let i = 0; i < values.length - 1; i += 2) points.push([values[i], values[i + 1]]);
  return points;
}

module.exports = { number, parsePoints, closeRing, rectToPolygon, bboxFromPoints, center, distance, pointInBbox, roughPathPoints };

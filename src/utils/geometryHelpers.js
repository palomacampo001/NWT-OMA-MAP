export function parseNumber(value, fallback = 0) {
  const number = Number.parseFloat(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(number) ? number : fallback;
}

export function parsePoints(points = '') {
  const values = points
    .trim()
    .replace(/,/g, ' ')
    .split(/\s+/)
    .map(Number)
    .filter(Number.isFinite);
  const pairs = [];
  for (let i = 0; i < values.length - 1; i += 2) {
    pairs.push([values[i], values[i + 1]]);
  }
  return pairs;
}

export function closeRing(points) {
  if (!points.length) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return points;
  return [...points, first];
}

export function bboxFromPoints(points) {
  if (!points.length) return [0, 0, 0, 0];
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return [minX, minY, maxX - minX, maxY - minY];
}

export function bboxCenter(bbox) {
  return { x: bbox[0] + bbox[2] / 2, y: bbox[1] + bbox[3] / 2 };
}

export function bboxArea(bbox) {
  return Math.max(0, bbox[2]) * Math.max(0, bbox[3]);
}

export function pointInBbox(point, bbox, padding = 0) {
  return (
    point.x >= bbox[0] - padding &&
    point.x <= bbox[0] + bbox[2] + padding &&
    point.y >= bbox[1] - padding &&
    point.y <= bbox[1] + bbox[3] + padding
  );
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function rectToPolygon(x, y, width, height) {
  return closeRing([
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ]);
}

export function ellipseToPolygon(cx, cy, rx, ry, segments = 28) {
  const points = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (Math.PI * 2 * i) / segments;
    points.push([cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry]);
  }
  return closeRing(points);
}

export function pathToRoughPoints(d = '') {
  const tokens = String(d).match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  const points = [];
  let cursor = { x: 0, y: 0 };
  let start = null;
  let command = '';
  let i = 0;

  function read() {
    const value = Number.parseFloat(tokens[i]);
    i += 1;
    return Number.isFinite(value) ? value : 0;
  }

  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i])) {
      command = tokens[i];
      i += 1;
    }
    const relative = command === command.toLowerCase();
    const cmd = command.toUpperCase();
    if (cmd === 'M' || cmd === 'L' || cmd === 'T') {
      const x = read();
      const y = read();
      cursor = { x: relative ? cursor.x + x : x, y: relative ? cursor.y + y : y };
      if (!start) start = { ...cursor };
      points.push([cursor.x, cursor.y]);
      if (cmd === 'M') command = relative ? 'l' : 'L';
    } else if (cmd === 'H') {
      const x = read();
      cursor = { ...cursor, x: relative ? cursor.x + x : x };
      points.push([cursor.x, cursor.y]);
    } else if (cmd === 'V') {
      const y = read();
      cursor = { ...cursor, y: relative ? cursor.y + y : y };
      points.push([cursor.x, cursor.y]);
    } else if (cmd === 'C') {
      read();
      read();
      read();
      read();
      const x = read();
      const y = read();
      cursor = { x: relative ? cursor.x + x : x, y: relative ? cursor.y + y : y };
      points.push([cursor.x, cursor.y]);
    } else if (cmd === 'S' || cmd === 'Q') {
      read();
      read();
      const x = read();
      const y = read();
      cursor = { x: relative ? cursor.x + x : x, y: relative ? cursor.y + y : y };
      points.push([cursor.x, cursor.y]);
    } else if (cmd === 'A') {
      read();
      read();
      read();
      read();
      read();
      const x = read();
      const y = read();
      cursor = { x: relative ? cursor.x + x : x, y: relative ? cursor.y + y : y };
      points.push([cursor.x, cursor.y]);
    } else if (cmd === 'Z') {
      if (start) points.push([start.x, start.y]);
      i += 0;
      command = '';
    } else {
      i += 1;
    }
  }
  return points;
}

export function parseTransform(transform = '') {
  const translate = /translate\(([^)]+)\)/.exec(transform);
  const scale = /scale\(([^)]+)\)/.exec(transform);
  const matrix = /matrix\(([^)]+)\)/.exec(transform);
  let tx = 0;
  let ty = 0;
  let sx = 1;
  let sy = 1;
  if (matrix) {
    const values = matrix[1].split(/[,\s]+/).map(Number);
    if (values.length >= 6) {
      sx = values[0] || 1;
      sy = values[3] || 1;
      tx = values[4] || 0;
      ty = values[5] || 0;
    }
  }
  if (translate) {
    const values = translate[1].split(/[,\s]+/).map(Number);
    tx += values[0] || 0;
    ty += values[1] || 0;
  }
  if (scale) {
    const values = scale[1].split(/[,\s]+/).map(Number);
    sx *= values[0] || 1;
    sy *= values[1] || values[0] || 1;
  }
  return { tx, ty, sx, sy };
}

export function applyTransformToPoint(point, transform) {
  return [point[0] * transform.sx + transform.tx, point[1] * transform.sy + transform.ty];
}

export function applyTransformToPoints(points, transformText) {
  const transform = parseTransform(transformText);
  return points.map((point) => applyTransformToPoint(point, transform));
}

export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

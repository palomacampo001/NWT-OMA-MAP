import {
  applyTransformToPoints,
  bboxFromPoints,
  closeRing,
  ellipseToPolygon,
  parseNumber,
  parsePoints,
  pathToRoughPoints,
  rectToPolygon,
} from './geometryHelpers.js';

function inheritedTransform(node) {
  const transforms = [];
  let current = node;
  while (current && current.nodeType === 1 && current.tagName?.toLowerCase() !== 'svg') {
    const transform = current.getAttribute('transform');
    if (transform) transforms.unshift(transform);
    current = current.parentNode;
  }
  return transforms.join(' ');
}

function sourceStyle(node) {
  const style = node.getAttribute('style') || '';
  const styleMap = Object.fromEntries(
    style
      .split(';')
      .map((pair) => pair.split(':').map((part) => part?.trim()))
      .filter((pair) => pair.length === 2),
  );
  return {
    id: node.getAttribute('id') || '',
    class: node.getAttribute('class') || '',
    fill: node.getAttribute('fill') || styleMap.fill || '',
    stroke: node.getAttribute('stroke') || styleMap.stroke || '',
    strokeWidth: node.getAttribute('stroke-width') || styleMap['stroke-width'] || '',
    transform: inheritedTransform(node),
  };
}

function elementGeometry(node) {
  const tag = node.tagName.toLowerCase();
  let points = [];
  let closed = false;
  let geometryType = 'Polygon';

  if (tag === 'rect') {
    const x = parseNumber(node.getAttribute('x'));
    const y = parseNumber(node.getAttribute('y'));
    const width = parseNumber(node.getAttribute('width'));
    const height = parseNumber(node.getAttribute('height'));
    points = rectToPolygon(x, y, width, height);
    closed = width > 0 && height > 0;
  } else if (tag === 'polygon') {
    points = closeRing(parsePoints(node.getAttribute('points')));
    closed = points.length >= 4;
  } else if (tag === 'polyline') {
    points = parsePoints(node.getAttribute('points'));
    closed = points.length > 3 && points[0]?.[0] === points.at(-1)?.[0] && points[0]?.[1] === points.at(-1)?.[1];
  } else if (tag === 'path') {
    const d = node.getAttribute('d') || '';
    points = pathToRoughPoints(d);
    closed = /z\s*$/i.test(d.trim()) || (points.length > 3 && points[0]?.[0] === points.at(-1)?.[0] && points[0]?.[1] === points.at(-1)?.[1]);
    if (closed) points = closeRing(points);
  } else if (tag === 'circle') {
    const cx = parseNumber(node.getAttribute('cx'));
    const cy = parseNumber(node.getAttribute('cy'));
    const r = parseNumber(node.getAttribute('r'));
    points = ellipseToPolygon(cx, cy, r, r);
    closed = r > 0;
  } else if (tag === 'ellipse') {
    const cx = parseNumber(node.getAttribute('cx'));
    const cy = parseNumber(node.getAttribute('cy'));
    const rx = parseNumber(node.getAttribute('rx'));
    const ry = parseNumber(node.getAttribute('ry'));
    points = ellipseToPolygon(cx, cy, rx, ry);
    closed = rx > 0 && ry > 0;
  } else if (tag === 'line') {
    points = [
      [parseNumber(node.getAttribute('x1')), parseNumber(node.getAttribute('y1'))],
      [parseNumber(node.getAttribute('x2')), parseNumber(node.getAttribute('y2'))],
    ];
    geometryType = 'LineString';
  }

  const sourceSvg = sourceStyle(node);
  points = applyTransformToPoints(points, sourceSvg.transform);
  return {
    tag,
    sourceSvg,
    closed,
    geometryType,
    points,
    bbox: bboxFromPoints(points),
  };
}

function textGeometry(node) {
  const x = parseNumber(node.getAttribute('x'));
  const y = parseNumber(node.getAttribute('y'));
  const sourceSvg = sourceStyle(node);
  const [tx, ty] = applyTransformToPoints([[x, y]], sourceSvg.transform)[0] || [x, y];
  const content = (node.textContent || '').replace(/\s+/g, ' ').trim();
  return {
    tag: 'text',
    text: content,
    point: { x: tx, y: ty },
    bbox: [tx, ty - 12, Math.max(content.length * 7, 12), 16],
    sourceSvg,
  };
}

export function extractSvgElements(svgElement) {
  const shapeTags = 'rect,polygon,polyline,path,circle,ellipse,line';
  const shapes = Array.from(svgElement.querySelectorAll(shapeTags))
    .map(elementGeometry)
    .filter((item) => item.points.length > 1);
  const texts = Array.from(svgElement.querySelectorAll('text'))
    .map(textGeometry)
    .filter((item) => item.text);
  const groups = Array.from(svgElement.querySelectorAll('g')).map((node) => ({
    id: node.getAttribute('id') || '',
    class: node.getAttribute('class') || '',
    transform: inheritedTransform(node),
  }));
  return { shapes, texts, groups };
}

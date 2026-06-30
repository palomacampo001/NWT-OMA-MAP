import { parseViewBox } from './coordinateTransforms.js';
import { extractSvgElements } from './extractSvgGeometry.js';

export function parseSvg(svgText, filename = 'uploaded-map.svg') {
  const parser = new DOMParser();
  const document = parser.parseFromString(svgText, 'image/svg+xml');
  const parserError = document.querySelector('parsererror');
  if (parserError) {
    throw new Error('This file is not a valid SVG.');
  }
  const svg = document.querySelector('svg');
  if (!svg) {
    throw new Error('No <svg> element was found.');
  }
  const viewBox = parseViewBox(svg);
  const elements = extractSvgElements(svg);
  return {
    filename,
    viewBox,
    elements,
    rawSvgLength: svgText.length,
  };
}

export function parseViewBox(svgElement) {
  const viewBox = svgElement.getAttribute('viewBox');
  if (viewBox) {
    const values = viewBox.split(/[,\s]+/).map(Number).filter(Number.isFinite);
    if (values.length === 4) return values;
  }
  const width = Number.parseFloat(svgElement.getAttribute('width')) || 1200;
  const height = Number.parseFloat(svgElement.getAttribute('height')) || 800;
  return [0, 0, width, height];
}

export function clientPointToSvgPoint(svg, event, viewBox) {
  const rect = svg.getBoundingClientRect();
  const x = viewBox[0] + ((event.clientX - rect.left) / rect.width) * viewBox[2];
  const y = viewBox[1] + ((event.clientY - rect.top) / rect.height) * viewBox[3];
  return { x, y };
}

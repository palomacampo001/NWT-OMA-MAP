import { bboxCenter, distance, pointInBbox } from './geometryHelpers.js';
import { looksLikeRoomNumber } from './classifyFeatures.js';

export function assignLabelsToShapes(shapes, texts, viewBox) {
  const padding = Math.max(viewBox[2], viewBox[3]) * 0.025;
  const maxDistance = Math.max(viewBox[2], viewBox[3]) * 0.12;
  return shapes.map((shape) => {
    const center = bboxCenter(shape.bbox);
    const labels = texts
      .filter((text) => pointInBbox(text.point, shape.bbox, padding) || distance(text.point, center) <= maxDistance)
      .map((text) => {
        const inside = pointInBbox(text.point, shape.bbox, 0);
        const close = pointInBbox(text.point, shape.bbox, padding);
        const dist = distance(text.point, center);
        return {
          ...text,
          inside,
          close,
          score: inside ? 1 : close ? 0.7 : Math.max(0, 0.45 - dist / Math.max(viewBox[2], viewBox[3])),
          dist,
        };
      })
      .filter((text) => text.inside || text.close || text.score > 0.2)
      .sort((a, b) => b.score - a.score || a.dist - b.dist)
      .slice(0, 3);

    const numberLabel = labels.find((label) => looksLikeRoomNumber(label.text));
    const nameLabel = labels.find((label) => !looksLikeRoomNumber(label.text));
    const roomNumber = numberLabel?.text || '';
    const name = nameLabel?.text || '';
    const displayName = [name, roomNumber].filter(Boolean).join(' ') || shape.sourceSvg.id || '';
    return {
      ...shape,
      labels,
      labelConfidence: labels[0]?.score || 0,
      roomNumber,
      name,
      displayName,
    };
  });
}

export const categories = [
  'office',
  'meeting_room',
  'corridor',
  'restroom',
  'elevator',
  'stairs',
  'reception',
  'cafeteria',
  'kitchen',
  'pantry',
  'copy_print',
  'entrance',
  'exit',
  'lounge',
  'storage',
  'mechanical',
  'landmark',
  'unknown',
  'decorative',
];

const rules = [
  ['restroom', /rest\s*room|bath|toilet|wc|men|women/i],
  ['elevator', /elev|lift/i],
  ['stairs', /stair|steps/i],
  ['cafeteria', /cafe|cafeteria|dining|canteen/i],
  ['kitchen', /kitchen/i],
  ['pantry', /pantry/i],
  ['copy_print', /copy|print|printer|mail/i],
  ['reception', /reception|front desk|lobby/i],
  ['meeting_room', /conference|meeting|huddle|board room|training/i],
  ['entrance', /entrance|entry/i],
  ['exit', /\bexit\b/i],
  ['lounge', /lounge|break/i],
  ['storage', /storage|closet|janitor/i],
  ['mechanical', /mechanical|electrical|server|it room|utility/i],
  ['corridor', /corridor|hall|hallway/i],
  ['office', /office|room/i],
];

export function looksLikeRoomNumber(text = '') {
  return /^[A-Z]?\d{2,5}[A-Z]?$/.test(text.trim()) || /^\d+[.-]\d+$/.test(text.trim());
}

export function classifyFeature({ text = '', bbox, viewBox, sourceSvg = {}, closed = true }) {
  const haystack = `${text} ${sourceSvg.id || ''} ${sourceSvg.class || ''}`;
  let category = 'unknown';
  for (const [candidate, pattern] of rules) {
    if (pattern.test(haystack)) {
      category = candidate;
      break;
    }
  }

  const mapArea = viewBox[2] * viewBox[3];
  const area = bbox[2] * bbox[3];
  const areaRatio = mapArea ? area / mapArea : 0;
  if (closed && category === 'unknown' && areaRatio > 0.18) category = 'corridor';
  if (areaRatio < 0.00025) category = category === 'unknown' ? 'decorative' : category;

  let type = 'room';
  if (category === 'corridor') type = 'corridor';
  if (['elevator', 'stairs', 'restroom', 'reception', 'cafeteria', 'entrance', 'exit', 'landmark'].includes(category)) type = 'poi';
  if (category === 'decorative') type = 'decorative';

  return { category, type };
}

const key = 'svg-indoor-map-converter-state-v3';
const oldKeys = ['svg-indoor-map-converter-state-v2', 'svg-indoor-map-converter-state-v1'];

export function loadMapState() {
  try {
    oldKeys.forEach((oldKey) => localStorage.removeItem(oldKey));
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveMapState(state) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Storage can fail in private windows or when uploaded SVGs produce large data.
  }
}

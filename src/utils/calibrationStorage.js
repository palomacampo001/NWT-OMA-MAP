/**
 * Calibration storage — localStorage CRUD for calibration points and walk recordings.
 *
 * All data is stored locally in the browser.
 * Nothing is sent to a remote server unless explicitly approved.
 *
 * Storage keys:
 *   nwt-cal-points    — array of CalibrationPoint
 *   nwt-cal-walks     — array of WalkRecording
 */

const POINTS_KEY = 'nwt-cal-points';
const WALKS_KEY  = 'nwt-cal-walks';

// ── Calibration Points ────────────────────────────────────────────────────

/** @returns {CalibrationPoint[]} */
export function loadCalibrationPoints() {
  try {
    return JSON.parse(localStorage.getItem(POINTS_KEY) || '[]');
  } catch { return []; }
}

/** @param {CalibrationPoint[]} points */
export function saveCalibrationPoints(points) {
  try { localStorage.setItem(POINTS_KEY, JSON.stringify(points)); } catch { /* storage full */ }
}

/** @param {CalibrationPoint} point */
export function addCalibrationPoint(point) {
  const points = loadCalibrationPoints();
  points.push(point);
  saveCalibrationPoints(points);
  return points;
}

/** @param {string} id  @param {Partial<CalibrationPoint>} updates */
export function updateCalibrationPoint(id, updates) {
  const points = loadCalibrationPoints().map((p) => p.id === id ? { ...p, ...updates } : p);
  saveCalibrationPoints(points);
  return points;
}

/** @param {string} id */
export function deleteCalibrationPoint(id) {
  const points = loadCalibrationPoints().filter((p) => p.id !== id);
  saveCalibrationPoints(points);
  return points;
}

export function clearAllCalibrationPoints() {
  saveCalibrationPoints([]);
}

// ── Walk Recordings ───────────────────────────────────────────────────────

/** @returns {WalkRecording[]} */
export function loadWalkRecordings() {
  try {
    return JSON.parse(localStorage.getItem(WALKS_KEY) || '[]');
  } catch { return []; }
}

/** @param {WalkRecording} recording */
export function saveWalkRecording(recording) {
  const walks = loadWalkRecordings();
  const idx = walks.findIndex((w) => w.id === recording.id);
  if (idx >= 0) walks[idx] = recording; else walks.push(recording);
  try { localStorage.setItem(WALKS_KEY, JSON.stringify(walks)); } catch { /* storage full */ }
}

/** @param {string} id */
export function deleteWalkRecording(id) {
  const walks = loadWalkRecordings().filter((w) => w.id !== id);
  try { localStorage.setItem(WALKS_KEY, JSON.stringify(walks)); } catch { /* storage full */ }
}

// ── Import/Export ─────────────────────────────────────────────────────────

export function exportPointsJSON() {
  const pts = loadCalibrationPoints();
  const blob = new Blob([JSON.stringify(pts, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nwt-calibration-points-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importPointsJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const pts = JSON.parse(e.target.result);
        if (!Array.isArray(pts)) throw new Error('Expected an array');
        saveCalibrationPoints(pts);
        resolve(pts);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export function exportWalkJSON(walkId) {
  const walks = loadWalkRecordings();
  const walk = walks.find((w) => w.id === walkId);
  if (!walk) return;
  const blob = new Blob([JSON.stringify(walk, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nwt-walk-${walk.name || walkId}-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importWalkJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const walk = JSON.parse(e.target.result);
        if (!walk.id || !Array.isArray(walk.samples)) throw new Error('Invalid walk format');
        saveWalkRecording(walk);
        resolve(walk);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

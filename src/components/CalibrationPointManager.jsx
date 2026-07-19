/**
 * CalibrationPointManager — full list view for managing calibration points.
 *
 * Shows all captured points, allows edit/verify/delete, import/export, floor filter.
 */

import { useRef, useState } from 'react';
import {
  deleteCalibrationPoint,
  updateCalibrationPoint,
  clearAllCalibrationPoints,
  exportPointsJSON,
  importPointsJSON,
  loadWalkRecordings,
  deleteWalkRecording,
  exportWalkJSON,
  importWalkJSON,
} from '../utils/calibrationStorage.js';

const POINT_LABELS = [
  'Main entrance', 'Reception', 'Elevator lobby', 'Escalator landing',
  'Conference room', 'Hallway intersection', 'Kitchen', 'Stair landing',
  'Window corner', 'Pillar', 'Restroom entrance', 'Custom…',
];

export default function CalibrationPointManager({
  points,
  walks,
  floors,
  onPointsChange,
  onWalksChange,
  onClose,
  onReplayWalk,
}) {
  const [tab, setTab] = useState('points'); // 'points' | 'walks'
  const [filterFloor, setFilterFloor] = useState('all');
  const [editId, setEditId] = useState(null);
  const [editLabel, setEditLabel] = useState('');
  const [editMapX, setEditMapX] = useState('');
  const [editMapY, setEditMapY] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [clearConfirm, setClearConfirm] = useState(false);
  const importRef = useRef(null);
  const walkImportRef = useRef(null);

  const floorOptions = [{ id: 'all', name: 'All floors' }, ...floors.map((f) => ({ id: f.id, name: f.name || f.id }))];
  const filtered = filterFloor === 'all' ? points : points.filter((p) => p.floorId === filterFloor);

  function startEdit(p) {
    setEditId(p.id);
    setEditLabel(p.label);
    setEditMapX(String(p.mapX));
    setEditMapY(String(p.mapY));
    setEditNotes(p.notes || '');
  }

  function saveEdit() {
    const updated = updateCalibrationPoint(editId, {
      label: editLabel,
      mapX: parseFloat(editMapX) || 0,
      mapY: parseFloat(editMapY) || 0,
      notes: editNotes,
    });
    onPointsChange(updated);
    setEditId(null);
  }

  function toggleVerify(p) {
    const updated = updateCalibrationPoint(p.id, { verified: !p.verified });
    onPointsChange(updated);
  }

  function removePoint(id) {
    const updated = deleteCalibrationPoint(id);
    onPointsChange(updated);
  }

  function handleClearAll() {
    if (!clearConfirm) { setClearConfirm(true); return; }
    clearAllCalibrationPoints();
    onPointsChange([]);
    setClearConfirm(false);
  }

  function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    importPointsJSON(file).then(onPointsChange).catch((err) => alert(`Import failed: ${err.message}`));
    e.target.value = '';
  }

  function handleWalkImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    importWalkJSON(file).then(() => onWalksChange(loadWalkRecordings())).catch((err) => alert(`Import failed: ${err.message}`));
    e.target.value = '';
  }

  return (
    <div className="cal-manager">
      <div className="cal-manager-header">
        <span className="cal-badge">CAL</span>
        <span className="cal-title">Point Manager</span>
        <button className="cal-icon-btn" onClick={onClose}>✕</button>
      </div>

      <div className="cal-tabs">
        <button className={`cal-tab ${tab==='points'?'cal-tab-active':''}`} onClick={() => setTab('points')}>POINTS ({points.length})</button>
        <button className={`cal-tab ${tab==='walks'?'cal-tab-active':''}`} onClick={() => setTab('walks')}>WALKS ({walks.length})</button>
      </div>

      {tab === 'points' && (
        <>
          <div className="cal-toolbar">
            <select className="cal-select" value={filterFloor} onChange={(e) => setFilterFloor(e.target.value)}>
              {floorOptions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <button className="cal-btn" onClick={exportPointsJSON}>↓ Export JSON</button>
            <button className="cal-btn" onClick={() => importRef.current?.click()}>↑ Import JSON</button>
            <input ref={importRef} type="file" accept=".json" style={{display:'none'}} onChange={handleImport} />
          </div>

          {filtered.length === 0 && (
            <div className="cal-empty">No calibration points yet. Open the main panel and tap "Capture Calibration Point".</div>
          )}

          <div className="cal-point-list">
            {filtered.map((p) => (
              <div key={p.id} className={`cal-point-card ${p.verified ? 'cal-verified' : ''}`}>
                {editId === p.id ? (
                  <div className="cal-edit-form">
                    <label className="cal-field-label">Label</label>
                    <select className="cal-select" value={editLabel} onChange={(e) => setEditLabel(e.target.value)}>
                      {POINT_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <label className="cal-field-label">Map X</label>
                    <input className="cal-input" value={editMapX} onChange={(e) => setEditMapX(e.target.value)} type="number" />
                    <label className="cal-field-label">Map Y</label>
                    <input className="cal-input" value={editMapY} onChange={(e) => setEditMapY(e.target.value)} type="number" />
                    <label className="cal-field-label">Notes</label>
                    <input className="cal-input" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Optional notes" />
                    <div className="cal-edit-actions">
                      <button className="cal-btn cal-btn-primary" onClick={saveEdit}>Save</button>
                      <button className="cal-btn" onClick={() => setEditId(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="cal-point-content">
                    <div className="cal-point-header">
                      <strong>{p.label || 'Unnamed'}</strong>
                      <span className={`cal-verify-badge ${p.verified ? 'cal-verified-badge' : 'cal-unverified-badge'}`}>
                        {p.verified ? '✓ verified' : 'unverified'}
                      </span>
                    </div>
                    <div className="cal-point-meta">
                      <span>{p.floorId}</span>
                      <span>lat {Number(p.latitude).toFixed(6)}</span>
                      <span>lng {Number(p.longitude).toFixed(6)}</span>
                    </div>
                    <div className="cal-point-meta">
                      <span>mapX {Math.round(p.mapX)}</span>
                      <span>mapY {Math.round(p.mapY)}</span>
                      <span>±{Math.round(p.accuracy ?? 0)} m</span>
                    </div>
                    {p.notes && <div className="cal-point-notes">{p.notes}</div>}
                    <div className="cal-point-actions">
                      <button className="cal-btn" onClick={() => startEdit(p)}>Edit</button>
                      <button className="cal-btn" onClick={() => toggleVerify(p)}>
                        {p.verified ? 'Unverify' : 'Mark verified'}
                      </button>
                      <button className="cal-btn cal-btn-danger" onClick={() => removePoint(p.id)}>Delete</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {points.length > 0 && (
            <button
              className={`cal-btn cal-btn-danger cal-btn-full ${clearConfirm ? 'cal-btn-confirm' : ''}`}
              onClick={handleClearAll}
            >
              {clearConfirm ? 'Tap again to confirm — this will delete ALL points' : 'Clear all points'}
            </button>
          )}
        </>
      )}

      {tab === 'walks' && (
        <>
          <div className="cal-toolbar">
            <button className="cal-btn" onClick={() => walkImportRef.current?.click()}>↑ Import Walk JSON</button>
            <input ref={walkImportRef} type="file" accept=".json" style={{display:'none'}} onChange={handleWalkImport} />
          </div>

          {walks.length === 0 && (
            <div className="cal-empty">No walk recordings yet. Use the main calibration panel to record a walk.</div>
          )}

          <div className="cal-point-list">
            {walks.map((w) => (
              <div key={w.id} className="cal-point-card">
                <div className="cal-point-header">
                  <strong>{w.name || w.id}</strong>
                  <span className="cal-point-meta">{w.sampleCount ?? w.samples?.length ?? 0} samples</span>
                </div>
                <div className="cal-point-meta">
                  <span>{w.startedAt ? new Date(w.startedAt).toLocaleString() : '—'}</span>
                  {w.durationMs && <span>{Math.round(w.durationMs / 1000)}s</span>}
                </div>
                <div className="cal-point-actions">
                  <button className="cal-btn cal-btn-primary" onClick={() => onReplayWalk?.(w)}>▶ Replay</button>
                  <button className="cal-btn" onClick={() => exportWalkJSON(w.id)}>↓ Export</button>
                  <button className="cal-btn cal-btn-danger" onClick={() => {
                    deleteWalkRecording(w.id);
                    onWalksChange(loadWalkRecordings());
                  }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

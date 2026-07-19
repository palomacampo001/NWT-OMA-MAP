/**
 * CalibrationPanel — live GPS data, map projection status, floor selector.
 *
 * Only rendered when CALIBRATION_MODE_ENABLED = true.
 * Collapsible. Designed for use on a phone while walking.
 */

import { useEffect, useRef, useState } from 'react';
import { calibrationResiduals } from '../utils/locationProjection.js';
import { LIVE_LOCATION_PROJECTION_ENABLED, LIVE_ROUTE_MATCHING_ENABLED, LIVE_STEP_ADVANCEMENT_ENABLED } from '../config/featureFlags.js';

const ACCURACY_THRESHOLDS = { good: 8, moderate: 20, poor: 40 }; // metres

function accuracyLabel(meters) {
  if (meters == null) return 'unknown';
  if (meters <= ACCURACY_THRESHOLDS.good)     return 'good';
  if (meters <= ACCURACY_THRESHOLDS.moderate) return 'moderate';
  if (meters <= ACCURACY_THRESHOLDS.poor)     return 'poor';
  return 'unusable';
}

function fmt(val, decimals = 6) {
  if (val == null) return '—';
  return Number(val).toFixed(decimals);
}

function fmtAge(ts) {
  if (!ts) return '—';
  const s = Math.round((Date.now() - ts) / 1000);
  return s < 60 ? `${s}s ago` : `${Math.round(s/60)}m ago`;
}

export default function CalibrationPanel({
  gpsState,           // { lat, lng, accuracy, heading, speed, altitude, timestamp }
  mapState,           // { floorId, projectedX, projectedY, markerX, markerY, nearestSegment, nearestNode, distToRoute, routeConfidence, activeStep, activeLeg }
  statusState,        // { permissionState, watchActive, offRoute }
  floors,             // mapData.floors array
  activeFloorId,
  activeRoute,
  activeNavigationStepIndex,
  onFloorChange,      // (floorId) => void
  onCapturePoint,     // () => void — triggers point capture mode in parent
  calibrationPoints,  // CalibrationPoint[]
  walkRecorder,       // { isRecording, getSampleCount, start, stop }
  onStartRecording,
  onStopRecording,
  onOpenPointManager,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [section, setSection] = useState('gps'); // 'gps' | 'map' | 'status' | 'points'
  const [recordingName, setRecordingName] = useState('');
  const [showNameInput, setShowNameInput] = useState(false);
  const lastUpdateRef = useRef(null);
  const [lastUpdateAge, setLastUpdateAge] = useState('—');
  const isRecording = walkRecorder?.isRecording?.() ?? false;
  const sampleCount = walkRecorder?.getSampleCount?.() ?? 0;

  useEffect(() => {
    if (gpsState?.timestamp) lastUpdateRef.current = gpsState.timestamp;
  }, [gpsState?.timestamp]);

  useEffect(() => {
    const id = setInterval(() => {
      setLastUpdateAge(fmtAge(lastUpdateRef.current));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const accLabel = accuracyLabel(gpsState?.accuracy);
  const residuals = activeFloorId ? calibrationResiduals(activeFloorId) : null;
  const maxResidual = residuals ? Math.max(...residuals.map((r) => r.errorMapUnits)) : null;

  const floorOptions = floors.map((f) => ({ id: f.id, name: f.name || f.id }));

  function handleStartRecording() {
    if (showNameInput) {
      onStartRecording(recordingName || `Walk ${new Date().toLocaleTimeString()}`);
      setShowNameInput(false);
      setRecordingName('');
    } else {
      setShowNameInput(true);
    }
  }

  if (collapsed) {
    return (
      <div className="cal-panel cal-panel-collapsed" onClick={() => setCollapsed(false)}>
        <span className="cal-badge">CAL</span>
        <span className={`cal-acc-dot cal-acc-${accLabel}`} title={`GPS: ${accLabel}`} />
        {isRecording && <span className="cal-rec-dot" title="Recording" />}
        <span className="cal-expand-hint">▲</span>
      </div>
    );
  }

  return (
    <div className="cal-panel">
      <div className="cal-header">
        <span className="cal-badge">CAL</span>
        <span className="cal-title">Calibration Mode</span>
        <div className="cal-header-actions">
          {isRecording && (
            <span className="cal-rec-indicator">
              <span className="cal-rec-dot" /> REC {sampleCount}
            </span>
          )}
          <button className="cal-icon-btn" onClick={() => setCollapsed(true)} title="Minimise">▼</button>
        </div>
      </div>

      {/* Floor selector */}
      <div className="cal-floor-row">
        <span className="cal-label">Floor</span>
        <select
          className="cal-select"
          value={activeFloorId || ''}
          onChange={(e) => onFloorChange?.(e.target.value)}
        >
          {floorOptions.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>

      {/* Section tabs */}
      <div className="cal-tabs">
        {['gps','map','status','points'].map((s) => (
          <button key={s} className={`cal-tab ${section===s?'cal-tab-active':''}`}
            onClick={() => setSection(s)}>{s.toUpperCase()}</button>
        ))}
      </div>

      {section === 'gps' && (
        <div className="cal-section">
          <div className="cal-row"><span>Latitude</span><strong>{fmt(gpsState?.lat)}</strong></div>
          <div className="cal-row"><span>Longitude</span><strong>{fmt(gpsState?.lng)}</strong></div>
          <div className={`cal-row cal-acc-row cal-acc-bg-${accLabel}`}>
            <span>Accuracy</span>
            <strong>{gpsState?.accuracy != null ? `${Math.round(gpsState.accuracy)} m` : '—'} <span className={`cal-acc-badge cal-acc-${accLabel}`}>{accLabel}</span></strong>
          </div>
          <div className="cal-row"><span>Heading</span><strong>{gpsState?.heading != null ? `${Math.round(gpsState.heading)}°` : '—'}</strong></div>
          <div className="cal-row"><span>Speed</span><strong>{gpsState?.speed != null ? `${gpsState.speed.toFixed(1)} m/s` : '—'}</strong></div>
          <div className="cal-row"><span>Altitude</span><strong>{gpsState?.altitude != null ? `${Math.round(gpsState.altitude)} m` : '—'}</strong></div>
          <div className="cal-row"><span>Last update</span><strong>{lastUpdateAge}</strong></div>
          <div className="cal-row"><span>Timestamp</span><strong>{gpsState?.timestamp ? new Date(gpsState.timestamp).toLocaleTimeString() : '—'}</strong></div>
        </div>
      )}

      {section === 'map' && (
        <div className="cal-section">
          <div className="cal-row"><span>Floor</span><strong>{mapState?.floorId || '—'}</strong></div>
          <div className="cal-row"><span>Projected X</span><strong>{fmt(mapState?.projectedX, 1)}</strong></div>
          <div className="cal-row"><span>Projected Y</span><strong>{fmt(mapState?.projectedY, 1)}</strong></div>
          <div className="cal-row"><span>Marker X</span><strong>{fmt(mapState?.markerX, 1)}</strong></div>
          <div className="cal-row"><span>Marker Y</span><strong>{fmt(mapState?.markerY, 1)}</strong></div>
          <div className="cal-row"><span>Dist to route</span><strong>{mapState?.distToRoute != null ? `${Math.round(mapState.distToRoute)} px` : '—'}</strong></div>
          <div className="cal-row"><span>Route confidence</span><strong>{mapState?.routeConfidence || '—'}</strong></div>
          <div className="cal-row"><span>Active step</span><strong>{activeNavigationStepIndex ?? '—'}</strong></div>
          <div className="cal-row"><span>Active leg</span><strong>{mapState?.activeLeg || '—'}</strong></div>
          {residuals && (
            <div className="cal-row">
              <span>Calibration error</span>
              <strong>{maxResidual != null ? `max ${Math.round(maxResidual)} px` : '—'}</strong>
            </div>
          )}
          {!residuals && (
            <div className="cal-warn">No verified calibration points for this floor.</div>
          )}
        </div>
      )}

      {section === 'status' && (
        <div className="cal-section">
          <div className="cal-row"><span>GPS permission</span><strong>{statusState?.permissionState || '—'}</strong></div>
          <div className="cal-row"><span>GPS watch</span><strong>{statusState?.watchActive ? '✓ active' : '✗ inactive'}</strong></div>
          <div className="cal-row"><span>Projection</span><strong className={LIVE_LOCATION_PROJECTION_ENABLED?'cal-on':'cal-off'}>{LIVE_LOCATION_PROJECTION_ENABLED?'ON':'OFF'}</strong></div>
          <div className="cal-row"><span>Route matching</span><strong className={LIVE_ROUTE_MATCHING_ENABLED?'cal-on':'cal-off'}>{LIVE_ROUTE_MATCHING_ENABLED?'ON':'OFF'}</strong></div>
          <div className="cal-row"><span>Step advancement</span><strong className={LIVE_STEP_ADVANCEMENT_ENABLED?'cal-on':'cal-off'}>{LIVE_STEP_ADVANCEMENT_ENABLED?'ON':'OFF'}</strong></div>
          <div className="cal-row"><span>Off route</span><strong className={statusState?.offRoute?'cal-warn-text':''}>{statusState?.offRoute ? 'YES ⚠' : 'No'}</strong></div>
          <div className="cal-row"><span>Calibration pts</span><strong>{calibrationPoints?.length ?? 0} total, {calibrationPoints?.filter(p=>p.verified).length ?? 0} verified</strong></div>
        </div>
      )}

      {section === 'points' && (
        <div className="cal-section">
          <div className="cal-pts-summary">
            {calibrationPoints?.length ?? 0} point(s), {calibrationPoints?.filter(p=>p.verified).length ?? 0} verified
          </div>
          <button className="cal-btn cal-btn-primary cal-btn-full" onClick={onCapturePoint}>
            + Capture Calibration Point
          </button>
          <button className="cal-btn cal-btn-full" onClick={onOpenPointManager}>
            Manage Points →
          </button>
        </div>
      )}

      {/* Recording controls */}
      <div className="cal-recording-row">
        {!isRecording ? (
          <>
            {showNameInput ? (
              <div className="cal-name-row">
                <input
                  className="cal-name-input"
                  placeholder="Walk name…"
                  value={recordingName}
                  onChange={(e) => setRecordingName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleStartRecording()}
                  autoFocus
                />
                <button className="cal-btn cal-btn-primary" onClick={handleStartRecording}>▶ Start</button>
                <button className="cal-btn" onClick={() => setShowNameInput(false)}>✕</button>
              </div>
            ) : (
              <button className="cal-btn cal-btn-rec" onClick={handleStartRecording}>⏺ Record Walk</button>
            )}
          </>
        ) : (
          <button className="cal-btn cal-btn-stop" onClick={onStopRecording}>■ Stop Recording ({sampleCount} samples)</button>
        )}
      </div>
    </div>
  );
}

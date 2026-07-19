/**
 * SimulatorPanel — developer-only control panel for the route walk simulator.
 *
 * Rendered ONLY when DEV_LOCATION_SIMULATOR_ENABLED = true.
 * Never appears in production (flag is false when import.meta.env.DEV is false).
 *
 * Props:
 *   simulator   — object from createRouteSimulator()
 *   activeRoute — current route or null
 */

import { useEffect, useState } from 'react';

const SPEEDS = [
  { label: '0.5×', value: 0.5 },
  { label: '1×',   value: 1   },
  { label: '2×',   value: 2   },
];

export default function SimulatorPanel({ simulator, activeRoute, activeNavigationStepIndex }) {
  const [simState, setSimState] = useState('idle'); // 'idle' | 'running' | 'paused'
  const [speed, setSpeedState] = useState(1);
  const [lowAccuracy, setLowAccuracyState] = useState(false);
  const [offRoute, setOffRouteState] = useState(false);
  const [debugInfo, setDebugInfo] = useState(null);

  // Poll simulator state and debug info so the UI stays in sync
  useEffect(() => {
    if (!simulator) return;
    const id = setInterval(() => {
      setSimState(simulator.getState());
      if (simulator.getDebugInfo) setDebugInfo(simulator.getDebugInfo());
    }, 120);
    return () => clearInterval(id);
  }, [simulator]);

  if (!simulator) return null;

  function handleStart() {
    const ok = simulator.start();
    if (ok) setSimState('running');
  }

  function handlePause() {
    simulator.pause();
    setSimState('paused');
  }

  function handleResume() {
    simulator.resume();
    setSimState('running');
  }

  function handleReset() {
    simulator.reset();
    setSimState('idle');
    setOffRouteState(false);
  }

  function handleSpeed(val) {
    setSpeedState(val);
    simulator.setSpeed(val);
  }

  function handleLowAccuracy() {
    const next = !lowAccuracy;
    setLowAccuracyState(next);
    simulator.setLowAccuracy(next);
  }

  function handleOffRoute() {
    const next = !offRoute;
    setOffRouteState(next);
    simulator.setOffRoute(next);
  }

  function handleReturn() {
    setOffRouteState(false);
    simulator.returnToRoute();
  }

  const hasRoute = Boolean(activeRoute);

  return (
    <div className="sim-panel" role="region" aria-label="Location simulator">
      <div className="sim-panel-header">
        <span className="sim-badge">DEV</span>
        <span className="sim-title">Location Simulator</span>
        {!hasRoute && <span className="sim-warn">No active route</span>}
      </div>

      <div className="sim-row">
        {simState === 'idle' && (
          <button className="sim-btn sim-btn-primary" onClick={handleStart} disabled={!hasRoute}>
            ▶ Start walk
          </button>
        )}
        {simState === 'running' && (
          <button className="sim-btn" onClick={handlePause}>⏸ Pause</button>
        )}
        {simState === 'paused' && (
          <button className="sim-btn sim-btn-primary" onClick={handleResume} disabled={!hasRoute}>
            ▶ Resume
          </button>
        )}
        <button className="sim-btn sim-btn-ghost" onClick={handleReset}>⟳ Reset</button>
      </div>

      <div className="sim-row sim-row-label">
        <span className="sim-label">Speed</span>
        <div className="sim-speed-group">
          {SPEEDS.map(({ label, value }) => (
            <button
              key={value}
              className={`sim-speed-btn ${speed === value ? 'sim-speed-active' : ''}`}
              onClick={() => handleSpeed(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="sim-row sim-row-label">
        <span className="sim-label">GPS quality</span>
        <button
          className={`sim-toggle ${lowAccuracy ? 'sim-toggle-on' : ''}`}
          onClick={handleLowAccuracy}
        >
          {lowAccuracy ? '⚠ Low accuracy' : 'Normal accuracy'}
        </button>
      </div>

      <div className="sim-row sim-row-label">
        <span className="sim-label">Off-route</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className={`sim-toggle ${offRoute ? 'sim-toggle-warn' : ''}`}
            onClick={handleOffRoute}
          >
            {offRoute ? '↗ Off route' : 'On route'}
          </button>
          {offRoute && (
            <button className="sim-btn sim-btn-ghost" onClick={handleReturn} style={{ fontSize: 11 }}>
              Return
            </button>
          )}
        </div>
      </div>

      <div className="sim-status">
        State: <strong>{simState}</strong>
        {simState === 'running' && <span className="sim-dot-running" />}
        {simState === 'paused' && <span className="sim-dot-paused" />}
      </div>

      {debugInfo && (
        <div className="sim-debug">
          <div>Floor: <strong>{debugInfo.currentFloorId ?? '—'}</strong></div>
          <div>Leg: <strong>{debugInfo.currentLegIndex + 1}/{debugInfo.legCount}</strong> · Seg: <strong>{debugInfo.segmentIndex}</strong>/{debugInfo.pointsInLeg - 1}</div>
          <div>Pos: <strong>{debugInfo.posX},{debugInfo.posY}</strong></div>
          <div>Step: <strong>{activeNavigationStepIndex ?? 0}</strong></div>
        </div>
      )}
    </div>
  );
}

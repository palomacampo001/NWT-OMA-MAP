import { useState } from 'react';
import { MapPin, Navigation, X } from 'lucide-react';
import { getRecentLocations, floorLabelFromId } from '../utils/locationContextService.js';

/**
 * StartLocationSheet
 *
 * Three screens:
 *
 *   'confirm'  — High/medium confidence: "We think you're here" + 1-tap confirm
 *   'choose'   — Low/unknown: "Where are you right now?" list
 *   'floor'    — User chose a floor from 'choose', now pick an anchor on that floor
 *
 * Props:
 *   resolvedOrigin   — from resolveProbableOrigin(), may be null
 *   floors           — mapData.floors
 *   activeFloorId    — currently viewed floor
 *   onConfirm(loc)   — { floorId, point, label, featureId? } — user accepted
 *   onDismiss()      — user closed without confirming (keep destination, no route)
 */
export default function StartLocationSheet({
  resolvedOrigin,
  floors = [],
  activeFloorId,
  onConfirm,
  onDismiss,
}) {
  // Decide initial screen
  const initialScreen = resolvedOrigin && resolvedOrigin.point &&
    (resolvedOrigin.confidence === 'high' || resolvedOrigin.confidence === 'medium')
    ? 'confirm'
    : 'choose';

  const [screen, setScreen] = useState(initialScreen);
  const [chosenFloorId, setChosenFloorId] = useState(null);

  const recentLocations = getRecentLocations(floors);

  // ── Screen: CONFIRM ─────────────────────────────────────────────────────────
  if (screen === 'confirm') {
    const label = resolvedOrigin?.label || floorLabelFromId(resolvedOrigin?.floorId, floors);
    const floorLabel = floorLabelFromId(resolvedOrigin?.floorId, floors);
    const isMedium = resolvedOrigin?.confidence === 'medium';

    return (
      <div className="ssl-backdrop" role="dialog" aria-modal="true" aria-labelledby="ssl-confirm-title">
        <div className="ssl-sheet">
          <div className="ssl-header">
            <h2 id="ssl-confirm-title" className="ssl-title">
              {isMedium ? 'Where are you starting from?' : 'Starting from'}
            </h2>
            <button className="ssl-close" onClick={onDismiss} aria-label="Close">
              <X size={18} />
            </button>
          </div>

          {isMedium && (
            <p className="ssl-hint">We think you're here:</p>
          )}

          <div
            className="ssl-location-card"
            aria-label={`Proposed starting location: ${label}, ${floorLabel}. Use this location or choose another.`}
          >
            <div className="ssl-location-icon" aria-hidden="true"><MapPin size={22} /></div>
            <div className="ssl-location-info">
              <strong>{label}</strong>
              {label !== floorLabel && <span>{floorLabel}</span>}
            </div>
          </div>

          <div className="ssl-actions">
            <button
              className="ssl-btn ssl-btn-primary"
              onClick={() => onConfirm({
                floorId:   resolvedOrigin.floorId,
                point:     resolvedOrigin.point,
                label,
                featureId: resolvedOrigin.featureId,
              })}
              aria-label={`Use this location: ${label}`}
            >
              <Navigation size={18} aria-hidden="true" />
              Use This Location
            </button>
            <button className="ssl-btn ssl-btn-secondary" onClick={() => setScreen('choose')}>
              Choose Another Location
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Screen: FLOOR anchors ────────────────────────────────────────────────────
  if (screen === 'floor' && chosenFloorId) {
    const floor = floors.find((f) => f.id === chosenFloorId);
    if (!floor) { setScreen('choose'); return null; }

    // Collect useful anchors: elevators, escalators, entrances, named POIs, reception, café
    const anchors = _floorAnchors(floor);

    return (
      <div className="ssl-backdrop" role="dialog" aria-modal="true" aria-labelledby="ssl-floor-title">
        <div className="ssl-sheet">
          <div className="ssl-header">
            <button className="ssl-back" onClick={() => setScreen('choose')} aria-label="Back to floor list">
              ←
            </button>
            <h2 id="ssl-floor-title" className="ssl-title">{floorLabelFromId(chosenFloorId, floors)}</h2>
            <button className="ssl-close" onClick={onDismiss} aria-label="Close"><X size={18} /></button>
          </div>
          <p className="ssl-hint">Choose a nearby anchor to start from:</p>
          <ul className="ssl-list" role="list">
            {anchors.map((anchor) => (
              <li key={anchor.id}>
                <button
                  className="ssl-list-btn"
                  onClick={() => onConfirm({
                    floorId:   chosenFloorId,
                    point:     anchor.point,
                    label:     `${floorLabelFromId(chosenFloorId, floors)} – ${anchor.name}`,
                    featureId: anchor.id,
                  })}
                  aria-label={`Start from ${anchor.name} on ${floorLabelFromId(chosenFloorId, floors)}`}
                >
                  <span className="ssl-list-name">{anchor.name}</span>
                  <span className="ssl-list-floor">{floorLabelFromId(chosenFloorId, floors)}</span>
                </button>
              </li>
            ))}
            {anchors.length === 0 && (
              <li className="ssl-list-empty">No anchors found. Use "Choose on map" from the map view.</li>
            )}
          </ul>
        </div>
      </div>
    );
  }

  // ── Screen: CHOOSE (low / unknown confidence) ────────────────────────────────
  return (
    <div className="ssl-backdrop" role="dialog" aria-modal="true" aria-labelledby="ssl-choose-title">
      <div className="ssl-sheet">
        <div className="ssl-header">
          <h2 id="ssl-choose-title" className="ssl-title">Where are you right now?</h2>
          <button className="ssl-close" onClick={onDismiss} aria-label="Close"><X size={18} /></button>
        </div>

        {recentLocations.length > 0 && (
          <section aria-label="Recent locations">
            <p className="ssl-section-label">Recent</p>
            <ul className="ssl-list" role="list">
              {recentLocations.map((loc, i) => (
                <li key={i}>
                  <button
                    className="ssl-list-btn"
                    onClick={() => onConfirm({ floorId: loc.floorId, point: loc.point, label: loc.label, featureId: loc.featureId })}
                    aria-label={`${loc.label}, ${floorLabelFromId(loc.floorId, floors)}`}
                  >
                    <span className="ssl-list-name">{loc.label || floorLabelFromId(loc.floorId, floors)}</span>
                    <span className="ssl-list-floor">{floorLabelFromId(loc.floorId, floors)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-label="All floors">
          <p className="ssl-section-label">Choose a floor</p>
          <ul className="ssl-list" role="list">
            {floors.map((floor) => (
              <li key={floor.id}>
                <button
                  className="ssl-list-btn"
                  onClick={() => { setChosenFloorId(floor.id); setScreen('floor'); }}
                  aria-label={`Choose a location on ${_floorLabel(floor)}`}
                >
                  <span className="ssl-list-name">{_floorLabel(floor)}</span>
                  <span className="ssl-list-arrow" aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _floorLabel(floor) {
  return floor.name || floor.id;
}

const ANCHOR_KEYWORDS = /elevator|escalator|stair|entrance|reception|lobby|café|cafe|cafeteria|pantry|corridor|main|east|west|north|south/i;

/** Extract the most useful routing anchors from a floor's features. */
function _floorAnchors(floor) {
  const features = floor.features || [];
  // Priority order: entrances/reception → elevators/escalators → named POIs
  const scored = features
    .filter((f) => f.visible !== false && f.geometry?.type === 'Point')
    .map((f) => {
      const label = `${f.displayName || ''} ${f.name || ''} ${f.roomNumber || ''}`.trim();
      let score = 0;
      if (['entrance', 'reception', 'lobby'].includes(f.category))  score += 40;
      if (['elevator', 'escalator', 'stairs'].includes(f.category)) score += 30;
      if (['cafeteria', 'pantry'].includes(f.category))             score += 10;
      if (ANCHOR_KEYWORDS.test(label))                              score += 5;
      if (f.isDefaultStart || f.isDefaultStartArea)                 score += 50;
      return { f, score, label };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  return scored.map(({ f, label }) => ({
    id:    f.id,
    name:  f.displayName || f.name || f.roomNumber || label || f.id,
    point: { x: f.geometry.coordinates[0], y: f.geometry.coordinates[1] },
  }));
}

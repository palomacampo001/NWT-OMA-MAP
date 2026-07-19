/**
 * locationContextService
 *
 * Resolves the best probable route origin from available signals.
 * This service only decides WHICH routing node to use as the origin.
 * It never touches the routing engine, map rendering, or destination handling.
 *
 * Feature flag: SMART_START_LOCATION_ENABLED
 * When false, callers fall back to the existing Reception-default flow.
 */

// ─── Feature flag ────────────────────────────────────────────────────────────
// Set to true to enable smart start location. false = legacy Reception default.
export const SMART_START_LOCATION_ENABLED = true;

// ─── Storage keys ────────────────────────────────────────────────────────────
const KEY_LAST_CONFIRMED  = 'noWrongTurns.lastConfirmedLocation';
const KEY_RECENT_LOCATIONS = 'noWrongTurns.recentLocations';
const MAX_RECENT = 5;

// ─── Confidence thresholds (ms) ──────────────────────────────────────────────
const HIGH_CONFIDENCE_TTL   =  10 * 60 * 1000; //  10 minutes
const MEDIUM_CONFIDENCE_TTL =  30 * 60 * 1000; //  30 minutes
// Anything older than MEDIUM_CONFIDENCE_TTL is LOW confidence.
// A routeArrival saved < 10 min ago is treated as HIGH.

/**
 * A resolved origin object passed to planIndoorRoute as-is.
 *
 * @typedef {Object} ResolvedOrigin
 * @property {string}  source       — signal that produced this origin
 * @property {string}  floorId
 * @property {{x:number,y:number}} point
 * @property {string}  label        — human-readable display label
 * @property {'high'|'medium'|'low'|'unknown'} confidence
 * @property {number}  resolvedAt   — Date.now() timestamp
 * @property {string}  [featureId]  — stable POI/feature id when available
 */

// ─── Persistence helpers ──────────────────────────────────────────────────────

/** Read and validate a stored location record, or return null. */
function readStored(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.floorId || !Number.isFinite(parsed?.point?.x) || !Number.isFinite(parsed?.point?.y)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota/private browsing */ }
}

// ─── Age-to-confidence ────────────────────────────────────────────────────────
function ageConfidence(savedAt) {
  if (!savedAt) return 'low';
  const age = Date.now() - savedAt;
  if (age <= HIGH_CONFIDENCE_TTL)   return 'high';
  if (age <= MEDIUM_CONFIDENCE_TTL) return 'medium';
  return 'low';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Return the last confirmed location record, or null.
 * Validates floorId against the live floors list so stale floor ids are rejected.
 */
export function getLastConfirmedLocation(floors = []) {
  const stored = readStored(KEY_LAST_CONFIRMED);
  if (!stored) return null;
  if (floors.length && !floors.some((f) => f.id === stored.floorId)) return null;
  return stored;
}

/**
 * Persist a confirmed location (origin or arrival).
 *
 * @param {{ floorId, point, label, featureId?, source }} loc
 */
export function saveConfirmedLocation(loc) {
  if (!loc?.floorId || !loc?.point) return;
  const record = {
    floorId:     loc.floorId,
    point:       loc.point,
    label:       loc.label || '',
    featureId:   loc.featureId || null,
    source:      loc.source || 'manual',
    confidence:  loc.confidence || 'high',
    savedAt:     Date.now(),
  };
  writeStored(KEY_LAST_CONFIRMED, record);
  _appendRecent(record);
}

/** Called when a route completes — sets destination as likely next origin. */
export function setRouteArrivalLocation({ floorId, point, label, featureId }) {
  saveConfirmedLocation({ floorId, point, label, featureId, source: 'routeArrival', confidence: 'high' });
}

/** Invalidate the saved location (e.g. user left the building). */
export function invalidateLocation() {
  try { localStorage.removeItem(KEY_LAST_CONFIRMED); } catch { /* */ }
}

/** Read the recent-locations list (newest first, max MAX_RECENT). */
export function getRecentLocations(floors = []) {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY_RECENT_LOCATIONS) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (loc) => loc?.floorId && Number.isFinite(loc?.point?.x) &&
        (!floors.length || floors.some((f) => f.id === loc.floorId)),
    );
  } catch { return []; }
}

function _appendRecent(record) {
  try {
    const existing = getRecentLocations();
    const deduped = existing.filter(
      (r) => !(r.floorId === record.floorId && r.featureId && r.featureId === record.featureId),
    );
    const next = [record, ...deduped].slice(0, MAX_RECENT);
    writeStored(KEY_RECENT_LOCATIONS, next);
  } catch { /* */ }
}

/**
 * Core resolver — returns a ResolvedOrigin or null.
 *
 * Signal priority (matches spec):
 *  1. activeRoutePosition  — current position while navigating
 *  2. userLocation         — manually confirmed this session
 *  3. lastConfirmedLocation — recently saved, within TTL
 *  4. activeFloorId        — user has a floor open (medium confidence)
 *  5. lastConfirmedLocation (previous route destination, routeArrival source)
 *  6. [saved/recent handled by UI sheet, not pre-selected here]
 *  7. outside geolocation  → null (handled by caller, outside flow unchanged)
 *  8. unknown              → null (sheet asks user)
 *
 * @param {{
 *   userLocation: object|null,
 *   activeRoutePosition: object|null,
 *   activeFloorId: string,
 *   floors: object[],
 *   locationState: object,
 * }} ctx
 * @returns {ResolvedOrigin|null}
 */
export function resolveProbableOrigin({
  userLocation,
  activeRoutePosition,
  activeFloorId,
  floors = [],
  locationState,
}) {
  // 1. Active navigation position (already navigating)
  if (activeRoutePosition?.floorId && activeRoutePosition?.point) {
    return {
      source:      'activeRoutePosition',
      floorId:     activeRoutePosition.floorId,
      point:       activeRoutePosition.point,
      label:       activeRoutePosition.label || 'Current position',
      confidence:  'high',
      resolvedAt:  Date.now(),
    };
  }

  // 2. Manually confirmed this session
  if (userLocation?.floorId && userLocation?.point) {
    const floor = floors.find((f) => f.id === userLocation.floorId);
    return {
      source:      'userLocation',
      floorId:     userLocation.floorId,
      point:       userLocation.point,
      label:       userLocation.label || (floor ? _floorLabel(floor) : userLocation.floorId),
      confidence:  'high',
      resolvedAt:  Date.now(),
      featureId:   userLocation.featureId || null,
    };
  }

  // 3. Last confirmed location within TTL
  const stored = getLastConfirmedLocation(floors);
  if (stored) {
    const conf = ageConfidence(stored.savedAt);
    if (conf !== 'low') {
      // Special case: if user is outside the building, don't reuse indoor location
      if (['outside', 'denied'].includes(locationState?.mode)) return null;
      return {
        source:      stored.source || 'lastConfirmedLocation',
        floorId:     stored.floorId,
        point:       stored.point,
        label:       stored.label || '',
        confidence:  conf,
        resolvedAt:  Date.now(),
        featureId:   stored.featureId || null,
      };
    }
  }

  // 4. User has a floor open — medium confidence (we know the floor, not the spot)
  if (activeFloorId && floors.some((f) => f.id === activeFloorId)) {
    if (!['outside', 'denied'].includes(locationState?.mode)) {
      const floor = floors.find((f) => f.id === activeFloorId);
      return {
        source:     'activeFloor',
        floorId:    activeFloorId,
        point:      null, // no point yet — sheet must ask for anchor
        label:      floor ? _floorLabel(floor) : activeFloorId,
        confidence: 'medium',
        resolvedAt: Date.now(),
      };
    }
  }

  // 5. Stale last-confirmed (low confidence) — return for sheet to prompt
  if (stored) {
    return {
      source:      stored.source || 'lastConfirmedLocation',
      floorId:     stored.floorId,
      point:       stored.point,
      label:       stored.label || '',
      confidence:  'low',
      resolvedAt:  Date.now(),
      featureId:   stored.featureId || null,
    };
  }

  // Unknown — caller must show the "Where are you?" sheet
  return null;
}

/**
 * Given a resolved origin, compute the final {floorId, point} to pass to
 * planIndoorRoute. Returns null if the origin is not yet routable (e.g. only
 * a floor is known, no point). Caller must handle null by asking for an anchor.
 */
export function originToRoutePoint(resolved) {
  if (!resolved?.floorId || !resolved?.point) return null;
  return { floorId: resolved.floorId, point: resolved.point };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function _floorLabel(floor) {
  return floor.name || floor.id || 'Unknown floor';
}

/**
 * Return a human-readable floor label from a floorId, given the floors list.
 */
export function floorLabelFromId(floorId, floors = []) {
  const floor = floors.find((f) => f.id === floorId);
  return floor ? _floorLabel(floor) : floorId;
}

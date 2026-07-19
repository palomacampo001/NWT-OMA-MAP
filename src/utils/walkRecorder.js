/**
 * Walk recorder — records GPS samples during a real walk for later analysis.
 *
 * Each sample captures the full pipeline state at the moment of a GPS update.
 * Recordings can be replayed through the shared location pipeline.
 *
 * createWalkRecorder(opts) returns { start, stop, isRecording, destroy }
 */

import { saveWalkRecording } from './calibrationStorage.js';

/**
 * @param {{
 *   getActiveRoute:        () => object | null,
 *   getActiveFloorId:      () => string,
 *   getCurrentStepIndex:   () => number,
 *   getActiveLegIndex:     () => number,
 *   isOffRoute:            () => boolean,
 *   onSampleAdded?:        (sample: object) => void,
 * }} opts
 */
export function createWalkRecorder(opts) {
  const {
    getActiveRoute,
    getActiveFloorId,
    getCurrentStepIndex,
    getActiveLegIndex,
    isOffRoute,
    onSampleAdded,
  } = opts;

  let recording = null;
  let startTime = null;

  function isRecording() { return recording !== null; }

  function start(name = 'Walk') {
    if (recording) return;
    startTime = Date.now();
    recording = {
      id: `walk-${startTime}`,
      name,
      startedAt: new Date().toISOString(),
      samples: [],
    };
  }

  /**
   * Call this on every GPS update (raw, before pipeline processing).
   * Also accepts already-processed pipeline output fields.
   */
  function addSample({
    latitude, longitude, accuracy, heading, speed,
    projectedX = null, projectedY = null,
    matchedX = null, matchedY = null,
    nearestSegmentId = null,
  }) {
    if (!recording) return;
    const now = Date.now();
    const floorId = getActiveFloorId();
    const route = getActiveRoute();
    const activeLegIndex = getActiveLegIndex ? getActiveLegIndex() : 0;

    recording.samples.push({
      timestamp: now,
      elapsedTime: now - startTime,
      latitude,
      longitude,
      accuracy,
      heading,
      speed,
      floorId,
      projectedX,
      projectedY,
      matchedX,
      matchedY,
      nearestSegmentId,
      activeStepIndex: getCurrentStepIndex(),
      activeLegIndex,
      offRoute: isOffRoute ? isOffRoute() : false,
    });
    onSampleAdded?.(recording.samples[recording.samples.length - 1]);
  }

  function stop() {
    if (!recording) return null;
    recording.endedAt = new Date().toISOString();
    recording.durationMs = Date.now() - startTime;
    recording.sampleCount = recording.samples.length;
    const finished = { ...recording };
    saveWalkRecording(finished);
    recording = null;
    startTime = null;
    return finished;
  }

  function getSampleCount() {
    return recording?.samples?.length ?? 0;
  }

  function destroy() {
    recording = null;
    startTime = null;
  }

  return { start, stop, addSample, isRecording, getSampleCount, destroy };
}

/**
 * Replay a walk recording through the shared location pipeline.
 * Feeds each sample at the original timing (scaled by speedMultiplier).
 *
 * @param {{
 *   recording:           WalkRecording,
 *   processLocationUpdate: (update: object) => void,
 *   onPipelineReset?:    () => void,
 *   onSample?:           (sample, index, total) => void,
 *   onComplete?:         () => void,
 *   speedMultiplier?:    number,
 * }} opts
 * @returns {{ stop: () => void }}
 */
export function replayWalkRecording(opts) {
  const {
    recording,
    processLocationUpdate,
    onPipelineReset,
    onSample,
    onComplete,
    speedMultiplier = 1,
  } = opts;

  const samples = recording.samples || [];
  let stopped = false;
  let timeoutId = null;
  let currentFloorId = null;

  function scheduleNext(index) {
    if (stopped || index >= samples.length) {
      if (!stopped) onComplete?.();
      return;
    }
    const sample = samples[index];
    const nextSample = samples[index + 1];
    const delay = nextSample
      ? Math.max(0, (nextSample.timestamp - sample.timestamp) / speedMultiplier)
      : 0;

    // Reset smoothing on floor change (same as live simulator)
    if (sample.floorId && sample.floorId !== currentFloorId) {
      currentFloorId = sample.floorId;
      onPipelineReset?.();
    }

    processLocationUpdate({
      latitude:  sample.latitude,
      longitude: sample.longitude,
      mapX:      sample.projectedX,
      mapY:      sample.projectedY,
      accuracy:  sample.accuracy,
      heading:   sample.heading,
      speed:     sample.speed,
      timestamp: sample.timestamp,
      floorId:   sample.floorId,
      source:    'simulation',
    });

    onSample?.(sample, index, samples.length);
    timeoutId = setTimeout(() => scheduleNext(index + 1), delay);
  }

  scheduleNext(0);
  return { stop: () => { stopped = true; clearTimeout(timeoutId); } };
}

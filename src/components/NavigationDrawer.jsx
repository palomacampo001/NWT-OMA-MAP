import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, LocateFixed, Navigation, Share2, Volume2, VolumeX, X } from 'lucide-react';
import RouteOriginRow from './RouteOriginRow.jsx';

export default function NavigationDrawer({
  route,
  activeFloorId,
  userLocation,
  voiceGuidance = false,
  onSelectFloor,
  onClearRoute,
  onToggleLocate,
  onToggleVoiceGuidance,
  onRepeatInstruction,
  onDrainSpeech,
  activeNavigationStepIndex = 0,
  onAdvanceStep,
  smartOriginLabel,
  onChangeOrigin,
}) {
  const [expanded, setExpanded] = useState(false);
  // previewedStepIndex — local only. null = follow live navigation.
  // Setting this NEVER changes voice, routing, or activeNavigationStepIndex.
  const [previewedStepIndex, setPreviewedStepIndex] = useState(null);
  // Notice shown when navigation auto-advances while user is previewing another step
  const [advanceNotice, setAdvanceNotice] = useState('');
  const noticeTimerRef = useRef(null);
  const dragStart = useRef(null);

  const prevNavStepRef = useRef(activeNavigationStepIndex);

  // Detect when navigation auto-advances while previewing, show a notice
  useEffect(() => {
    if (
      previewedStepIndex !== null &&
      activeNavigationStepIndex !== prevNavStepRef.current
    ) {
      const instructions = route?.instructions || [];
      const newStep = instructions[activeNavigationStepIndex];
      const stepNum = activeNavigationStepIndex + 1;
      setAdvanceNotice(
        newStep?.text
          ? `Navigation advanced to Step ${stepNum}`
          : `Navigation advanced`,
      );
      clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = setTimeout(() => setAdvanceNotice(''), 6000);
    }
    prevNavStepRef.current = activeNavigationStepIndex;
  }, [activeNavigationStepIndex]);

  // Clear preview when route changes
  useEffect(() => {
    setPreviewedStepIndex(null);
    setAdvanceNotice('');
  }, [route?.id]);

  if (!route) return null;

  const instructions = route.instructions || [];
  const totalSteps = instructions.length;
  // The step index controlling what the map/drawer displays
  const displayedStepIndex = previewedStepIndex ?? activeNavigationStepIndex;
  const isPreviewing = previewedStepIndex !== null && previewedStepIndex !== activeNavigationStepIndex;

  // Get the floor for a given instruction index by matching to legs
  function floorForStep(index) {
    const legs = route.legs || [];
    // Each leg has 1+ instructions; map instruction index to leg
    let cursor = 0;
    for (const leg of legs) {
      const legInstructionCount = leg.instructions?.length || 1;
      if (index < cursor + legInstructionCount) {
        if (leg.type === 'walk') return leg.floorId;
        if (leg.type === 'transfer') return leg.toFloorId;
        break;
      }
      cursor += legInstructionCount;
    }
    if (index === 0) return route.originFloorId || route.floorId;
    return route.destinationFloorId || route.transfer?.toFloorId;
  }

  function previewStep(index) {
    const floorId = floorForStep(index);
    if (floorId) onSelectFloor(floorId);
    setPreviewedStepIndex(index);
    setExpanded(true);
  }

  function returnToCurrentStep() {
    setPreviewedStepIndex(null);
    const floorId = floorForStep(activeNavigationStepIndex);
    if (floorId) onSelectFloor(floorId);
  }

  async function shareLocation() {
    if (!userLocation) return;
    const floorName =
      route.legs?.find((leg) => leg.floorId === userLocation.floorId)?.floorName ||
      route.originFloorName ||
      'the building';
    const pointText = `${Math.round(userLocation.point.x)}, ${Math.round(userLocation.point.y)}`;
    const shareUrl = new URL(window.location.href);
    shareUrl.searchParams.set('floor', userLocation.floorId);
    shareUrl.searchParams.set('x', Math.round(userLocation.point.x));
    shareUrl.searchParams.set('y', Math.round(userLocation.point.y));
    const shareData = {
      title: 'No Wrong Turns location',
      text: `I am on ${floorName} near map point ${pointText}.`,
      url: shareUrl.toString(),
    };
    if (navigator.share) { await navigator.share(shareData).catch(() => {}); return; }
    await navigator.clipboard?.writeText(`${shareData.text} ${shareData.url}`).catch(() => {});
  }

  const liveInstruction = instructions[activeNavigationStepIndex]?.text ||
    (route.routeAvailable === false
      ? route.instructions?.[0]?.text || route.unavailableReason
      : route.instructions?.[0]?.text || route.notice || `Go to ${route.destinationName}`);

  const displayedInstruction = instructions[displayedStepIndex]?.text || liveInstruction;

  return (
    <section
      className={[
        'navigation-drawer route-panel-enter',
        expanded ? 'expanded' : 'collapsed',
        ['approximateGuidance', 'previewGuidance'].includes(route.quality) ? 'approximate-guidance' : '',
        isPreviewing ? 'is-previewing' : '',
      ].filter(Boolean).join(' ')}
    >
      {/* Drag handle */}
      <button
        className="drawer-handle"
        onClick={() => { setExpanded((v) => !v); onDrainSpeech?.(); }}
        onPointerDown={(e) => { dragStart.current = e.clientY; }}
        onPointerUp={(e) => {
          if (dragStart.current == null) return;
          const delta = e.clientY - dragStart.current;
          if (delta > 24) setExpanded(false);
          if (delta < -24) setExpanded(true);
          dragStart.current = null;
          onDrainSpeech?.();
        }}
        aria-label="Show or hide directions"
      >
        {expanded ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
      </button>

      {/* Collapsed strip — always shows the LIVE instruction */}
      <button className="drawer-collapsed" onClick={() => { setExpanded(true); returnToCurrentStep(); }}>
        <Navigation size={19} />
        <strong aria-live="polite" aria-atomic="true">{liveInstruction}</strong>
      </button>

      <div className="drawer-content">
        <div className="drawer-head">
          <div>
            <span>{route.routeAvailable === false ? 'Route not ready' : 'Walking to'}</span>
            <h2>{route.destinationName}</h2>
          </div>
          <button className="icon-button" onClick={() => setExpanded(false)} title="Close directions" aria-label="Close directions">
            <X size={18} />
          </button>
        </div>

        {/* Navigation-advanced notice */}
        {advanceNotice && (
          <div className="nav-advance-notice" role="status" aria-live="polite">
            {advanceNotice}
            <button className="nav-advance-return" onClick={returnToCurrentStep}>
              Return to current step
            </button>
          </div>
        )}

        {/* Return to current step banner (shown while previewing, no notice timer) */}
        {isPreviewing && !advanceNotice && (
          <div className="nav-preview-banner" role="status">
            <span>Previewing Step {(previewedStepIndex ?? 0) + 1}</span>
            <button
              className="nav-return-btn"
              onClick={returnToCurrentStep}
              aria-label="Return to current navigation step"
            >
              Return to current step
            </button>
          </div>
        )}

        <div className="drawer-summary">
          <div
            className="drawer-compass"
            style={{ transform: `rotate(${route.heading || 0}deg)` }}
            aria-hidden="true"
          >
            <Navigation size={24} />
          </div>
          <div>
            {route.accessible && <span className="accessible-route-badge">Accessible route</span>}
            <strong>{route.routeAvailable === false ? 'No walkable route yet' : `${Math.round(route.distance)} map units`}</strong>
            <span>
              {route.routeAvailable === false
                ? route.unavailableReason
                : ['approximateGuidance', 'previewGuidance'].includes(route.quality)
                  ? 'Preview guidance. Follow visible hallways.'
                  : route.accessible ? 'Accessible hallway route shown.' : 'Hallway route shown.'}
            </span>
          </div>
        </div>

        {route.alternatives?.length > 0 && route.routeAvailable !== false && (
          <div className="route-alternatives">
            <strong>{route.alternatives.length} alternative route{route.alternatives.length === 1 ? '' : 's'} available</strong>
            <span>Lighter dashed paths stay on the hallway network too.</span>
          </div>
        )}

        {/* Step list — visual state for each step */}
        <ol className="direction-list" aria-label="Route steps">
          {instructions.map((step, index) => {
            const isActive  = index === activeNavigationStepIndex;
            const isDone    = index < activeNavigationStepIndex;
            const isPrev    = index === previewedStepIndex;
            const isUpcoming = index > activeNavigationStepIndex;

            const stepClass = [
              isActive  ? 'step-active'   : '',
              isDone    ? 'step-done'     : '',
              isPrev    ? 'step-previewed': '',
              isUpcoming && !isPrev ? 'step-upcoming' : '',
            ].filter(Boolean).join(' ');

            return (
              <li key={step.id} className={stepClass}>
                <button
                  type="button"
                  onClick={() => {
                    if (isActive) {
                      // Tapping the live step closes preview
                      setPreviewedStepIndex(null);
                      const floorId = floorForStep(index);
                      if (floorId) onSelectFloor(floorId);
                    } else {
                      previewStep(index);
                    }
                  }}
                  aria-current={isActive ? 'step' : undefined}
                  aria-label={`Step ${index + 1}${isActive ? ' (current)' : isDone ? ' (completed)' : ''}: ${step.text}`}
                  title={isActive ? 'Current navigation step' : 'Preview this step on the map'}
                >
                  <span className="step-indicator" aria-hidden="true">
                    {isDone ? '✓' : index + 1}
                  </span>
                  <span className="step-text">{step.text}</span>
                  {isActive && <Navigation size={13} className="step-live-icon" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ol>

        {smartOriginLabel && (
          <RouteOriginRow label={smartOriginLabel} onChangeClick={onChangeOrigin} />
        )}

        <div className="route-voice-actions">
          <button
            className={voiceGuidance ? 'secondary-button active' : 'secondary-button'}
            onClick={onToggleVoiceGuidance}
            aria-pressed={voiceGuidance}
          >
            {voiceGuidance ? <Volume2 size={16} /> : <VolumeX size={16} />}
            {voiceGuidance ? 'Voice on' : 'Voice off'}
          </button>
          <button className="secondary-button" onClick={onRepeatInstruction} disabled={!voiceGuidance}>
            <Volume2 size={16} />
            Repeat step
          </button>
        </div>

        <button className="secondary-button" onClick={shareLocation} disabled={!userLocation}>
          <Share2 size={16} />
          Share my location
        </button>
        <button className="secondary-button danger" onClick={onClearRoute}>
          <X size={16} />
          Clear route
        </button>

        {route.legs?.length > 1 && (
          <div className="route-step-buttons">
            <button className="secondary-button" onClick={() => previewStep(0)}>Show current floor leg</button>
            <button className="secondary-button" onClick={() => previewStep(instructions.length - 1)}>Show destination floor</button>
          </div>
        )}

        {route.transfer && activeFloorId !== route.transfer.toFloorId && (
          <button className="primary-button" onClick={() => onSelectFloor(route.transfer.toFloorId)}>
            Show {route.transfer.toFloorName}
          </button>
        )}
        {route.transfer && activeFloorId === route.transfer.toFloorId && (
          <button className="secondary-button" onClick={() => onSelectFloor(route.transfer.fromFloorId)}>
            Back to {route.transfer.fromFloorName}
          </button>
        )}
        <button className="secondary-button" onClick={() => { setExpanded(false); onToggleLocate(); }}>
          <LocateFixed size={16} />
          Update my location
        </button>
      </div>
    </section>
  );
}

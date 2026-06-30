import { useRef, useState } from 'react';
import { ChevronDown, ChevronUp, LocateFixed, Navigation, X } from 'lucide-react';

export default function NavigationDrawer({ route, activeFloorId, onSelectFloor, onClearRoute, onToggleLocate }) {
  const [expanded, setExpanded] = useState(false);
  const dragStart = useRef(null);
  if (!route) return null;

  function floorForStep(index) {
    const leg = route.legs?.[index];
    if (leg?.type === 'walk' && leg.floorId) return leg.floorId;
    if (leg?.type === 'transfer') return leg.toFloorId;
    if (index === 0) return route.originFloorId || route.floorId;
    return route.destinationFloorId || route.transfer?.toFloorId;
  }

  function showStep(index) {
    const floorId = floorForStep(index);
    if (floorId) {
      onSelectFloor(floorId);
      setExpanded(true);
    }
  }

  return (
    <section className={['navigation-drawer route-panel-enter', expanded ? 'expanded' : 'collapsed', route.quality === 'approximateGuidance' ? 'approximate-guidance' : ''].filter(Boolean).join(' ')}>
      <button
        className="drawer-handle"
        onClick={() => setExpanded((value) => !value)}
        onPointerDown={(event) => { dragStart.current = event.clientY; }}
        onPointerUp={(event) => {
          if (dragStart.current == null) return;
          const delta = event.clientY - dragStart.current;
          if (delta > 24) setExpanded(false);
          if (delta < -24) setExpanded(true);
          dragStart.current = null;
        }}
        aria-label="Show or hide directions"
      >
        {expanded ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
      </button>
      <button className="drawer-collapsed" onClick={() => setExpanded(true)}>
        <Navigation size={19} />
        <strong>{route.routeAvailable === false ? 'Walking route unavailable' : route.instructions?.[0]?.text || `Go to ${route.destinationName}`}</strong>
      </button>
      <div className="drawer-content">
        <div className="drawer-head">
          <div>
            <span>{route.routeAvailable === false ? 'Route not ready' : 'Walking to'}</span>
            <h2>{route.destinationName}</h2>
          </div>
          <button className="icon-button" onClick={onClearRoute} title="End route">
            <X size={18} />
          </button>
        </div>
        <div className="drawer-summary">
          <div className="drawer-compass" style={{ transform: `rotate(${route.heading || 0}deg)` }}>
            <Navigation size={24} />
          </div>
          <div>
            <strong>{route.routeAvailable === false ? 'No walkable route yet' : `${Math.round(route.distance)} map units`}</strong>
            <span>{route.routeAvailable === false ? route.unavailableReason : route.quality === 'approximateGuidance' ? 'Approximate guidance. Follow visible hallways.' : 'Using detected corridors'}</span>
          </div>
        </div>
        <ol className="direction-list">
          {route.instructions?.map((step, index) => (
            <li
              key={step.id}
              className={index === 0 ? 'active-step-pulse' : ''}
              onClick={() => showStep(index)}
              title="Show this step on the map"
            >
              {index === 0 && <Navigation size={14} />}
              <span>{step.text}</span>
            </li>
          ))}
        </ol>
        {route.legs?.length > 1 && (
          <div className="route-step-buttons">
            <button className="secondary-button" onClick={() => showStep(0)}>Show current floor leg</button>
            <button className="secondary-button" onClick={() => showStep(route.legs.length - 1)}>Show destination floor</button>
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
        <button className="secondary-button" onClick={onToggleLocate}>
          <LocateFixed size={16} />
          Update my location
        </button>
      </div>
    </section>
  );
}

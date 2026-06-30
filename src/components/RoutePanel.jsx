import { LocateFixed, Navigation, Route, X } from 'lucide-react';

export default function RoutePanel({ userLocation, activeRoute, routeDestinationId, onClearRoute, onToggleLocate }) {
  return (
    <section className="panel-section route-panel">
      <h2><Route size={17} /> Walk</h2>
      <div className="route-actions">
        <button className="secondary-button" onClick={onToggleLocate}>
          <LocateFixed size={16} />
          Set my location
        </button>
        {routeDestinationId && (
          <button className="secondary-button" onClick={onClearRoute}>
            <X size={16} />
            Clear
          </button>
        )}
      </div>
      <div className="navigation-card">
        <div className="compass-mini" style={{ transform: `rotate(${activeRoute?.heading || 0}deg)` }}>
          <Navigation size={22} />
        </div>
        <div>
          <strong>{activeRoute?.destinationName || 'Ready to navigate'}</strong>
          <span>
            {activeRoute
              ? activeRoute.routeAvailable === false
                ? 'Walking route unavailable until a walkable corridor graph exists'
                : activeRoute.quality === 'approximateGuidance'
                  ? 'Approximate guidance · follow visible hallways'
                  : `${Math.round(activeRoute.distance)} map units · corridor guided`
              : userLocation
                ? 'Pick a destination to start guidance'
                : 'Set your indoor position on the map'}
          </span>
        </div>
      </div>
    </section>
  );
}

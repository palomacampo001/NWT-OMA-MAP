import { useEffect, useMemo, useState } from 'react';
import { Navigation, Pencil, Search, X } from 'lucide-react';
import { formatFeatureLabel } from '../utils/navigation.js';

function matchFeature(feature, query) {
  const target = `${feature.displayName} ${feature.name} ${feature.roomNumber} ${feature.category} ${feature.type}`.toLowerCase();
  return target.includes(query.toLowerCase());
}

export default function SearchPanel({ floors, query, onQueryChange, onSelectFeature, onHighlight, onRouteTo, onClearRoute, activeRoute }) {
  const [focused, setFocused] = useState(false);
  const [chosen, setChosen] = useState(null);
  const [editing, setEditing] = useState(true);
  const trimmed = query.trim();
  const results = useMemo(() => {
    if (!trimmed) return [];
    return floors.flatMap((floor) =>
        floor.features
          .filter((feature) => feature.visible !== false && feature.category !== 'decorative' && matchFeature(feature, trimmed))
          .slice(0, 7)
          .map((feature) => ({ feature, floor })),
      );
  }, [floors, trimmed]);
  const routeTarget = chosen || results[0] || null;
  const showSuggestions = focused && trimmed && results.length > 0 && (!chosen || formatFeatureLabel(chosen.feature) !== query);

  useEffect(() => {
    if (activeRoute) setEditing(false);
  }, [activeRoute?.destinationId]);

  function chooseSuggestion(match) {
    setChosen(match);
    onQueryChange(formatFeatureLabel(match.feature));
    onHighlight(match.feature.id);
  }

  function handleGo() {
    if (!routeTarget) return;
    onRouteTo(routeTarget.feature, routeTarget.floor.id);
    setFocused(false);
    setEditing(false);
  }

  if (activeRoute && !editing) {
    return (
      <section className="panel-section search-panel compact-search">
        <div className="route-search-pill">
          <button className="route-pill-main" onClick={() => setEditing(true)}>
            <Navigation size={17} />
            <span>To {activeRoute.destinationName}</span>
            <Pencil size={15} />
          </button>
          <button
            className="route-clear-button"
            onClick={() => {
              onClearRoute();
              onQueryChange('');
              setChosen(null);
              setEditing(true);
            }}
            title="Clear route"
          >
            <X size={18} />
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="panel-section search-panel">
      <h2>Destination</h2>
      <div className="destination-control">
        <label className="search-box">
          <Search size={17} />
          <input
            value={query}
            onFocus={() => setFocused(true)}
            onBlur={() => window.setTimeout(() => setFocused(false), 120)}
            onChange={(event) => {
              setChosen(null);
              onQueryChange(event.target.value);
            }}
            placeholder="Where do you want to go?"
          />
        </label>
        <button className="primary-button go-route-button" onClick={handleGo} disabled={!routeTarget}>
          <Navigation size={17} />
          Go
        </button>
        {showSuggestions && (
          <div className="suggestion-menu">
            {results.map((match) => (
              <button
                key={`${match.floor.id}-${match.feature.id}`}
                className="suggestion-option"
                onMouseEnter={() => onHighlight(match.feature.id)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  chooseSuggestion(match);
                }}
              >
                <strong>{formatFeatureLabel(match.feature)}</strong>
                <span>{match.floor.name} · {match.feature.category.replace('_', ' ')}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

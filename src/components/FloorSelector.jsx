export default function FloorSelector({ floors, activeFloorId, routeFloorIds = [], onSelectFloor, compact = false }) {
  return (
    <section className={compact ? 'floor-selector compact' : 'panel-section floor-selector'}>
      {!compact && <h2>Floors</h2>}
      <div className="floor-list">
        {floors.map((floor) => (
          <button
            key={floor.id}
            className={[
              'floor-button',
              floor.id === activeFloorId ? 'active' : '',
              routeFloorIds.includes(floor.id) ? 'in-route' : '',
            ].filter(Boolean).join(' ')}
            onClick={() => onSelectFloor(floor.id)}
          >
            {floor.name}
            {!compact && <span>{floor.features.length} features</span>}
          </button>
        ))}
      </div>
    </section>
  );
}

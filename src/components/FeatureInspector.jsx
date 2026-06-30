import { Eye, EyeOff, Trash2 } from 'lucide-react';
import { categories } from '../utils/classifyFeatures.js';

const types = ['room', 'corridor', 'poi', 'custom_area', 'decorative'];
const customAreaCategories = [
  'entrance',
  'lobby',
  'reception',
  'workspace',
  'meeting_area',
  'cafeteria',
  'restricted',
  'event_area',
  'department',
  'wayfinding_zone',
  'custom',
];

function formatCategory(value) {
  if (!value) return '';
  return String(value).replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function getFeatureTitle(feature) {
  const p = feature?.properties || feature || {};
  return [p.displayName, p.name, p.roomNumber, p.label, p.title, p.id, feature?.id]
    .map((value) => String(value || '').trim())
    .find(Boolean) || 'Unnamed location';
}

export default function FeatureInspector({ feature, floor, selectedVertexIndex, onUpdateFeature, onDeleteAreaVertex, onDeleteFeature }) {
  if (!feature) {
    return (
      <section className="inspector empty-inspector">
        <h2>Inspector</h2>
        <p className="muted">Select a room, corridor, or POI to correct its converted data.</p>
      </section>
    );
  }

  function patch(update) {
    onUpdateFeature(feature.id, update);
  }

  const title = getFeatureTitle(feature);
  const isCustomArea = feature.type === 'custom_area';
  const subtitle = [
    feature.roomNumber ? `Room ${feature.roomNumber}` : null,
    formatCategory(feature.category),
    formatCategory(feature.type),
    floor?.name,
  ].filter(Boolean).join(' • ');

  return (
    <section className="inspector">
      <div className="inspector-head">
        <div>
          <h2 title={title}>{title}</h2>
          <span>{subtitle}</span>
        </div>
        <span className={feature.confidence < 0.5 ? 'confidence low' : 'confidence'}>
          {Math.round(feature.confidence * 100)}%
        </span>
      </div>

      {feature.confidence < 0.5 && <p className="warning">Low-confidence detection. Review this item before export.</p>}

      <label>
        Name
        <input value={feature.name || ''} onChange={(event) => patch({ name: event.target.value })} />
      </label>
      <label>
        Room number
        <input value={feature.roomNumber || ''} onChange={(event) => patch({ roomNumber: event.target.value })} />
      </label>
      <label>
        Display name
        <input value={feature.displayName || ''} onChange={(event) => patch({ displayName: event.target.value })} />
      </label>
      <label>
        Type
        <select value={feature.type} onChange={(event) => patch({ type: event.target.value })}>
          {types.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </label>
      <label>
        Category
        <select value={feature.category} onChange={(event) => patch({ category: event.target.value })}>
          {(isCustomArea ? customAreaCategories : categories).map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
      </label>
      <label>
        Confidence
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={feature.confidence}
          onChange={(event) => patch({ confidence: Number(event.target.value) })}
        />
      </label>

      <div className="inspector-actions">
        {isCustomArea && (
          <button className="secondary-button" onClick={onDeleteAreaVertex} disabled={selectedVertexIndex == null}>
            Delete point
          </button>
        )}
        <button className="secondary-button" onClick={() => patch({ visible: !feature.visible })}>
          {feature.visible === false ? <Eye size={16} /> : <EyeOff size={16} />}
          {feature.visible === false ? 'Restore' : 'Hide'}
        </button>
        <button className="secondary-button danger" onClick={() => (isCustomArea ? onDeleteFeature?.() : patch({ visible: false, category: 'decorative', type: 'decorative' }))}>
          <Trash2 size={16} />
          {isCustomArea ? 'Delete area' : 'Mark noise'}
        </button>
      </div>
      {isCustomArea && <p className="muted">Drag the numbered points on the map. Click a small + on an edge to add a point.</p>}

      <dl className="metadata">
        <dt>Floor</dt>
        <dd>{floor?.name || 'Unknown floor'}</dd>
        <dt>Type</dt>
        <dd>{formatCategory(feature.type)}</dd>
        <dt>Category</dt>
        <dd>{formatCategory(feature.category)}</dd>
        <dt>Feature ID</dt>
        <dd>{feature.id}</dd>
        <dt>Source SVG id</dt>
        <dd>{feature.sourceSvg?.id || 'None'}</dd>
        <dt>Source class</dt>
        <dd>{feature.sourceSvg?.class || 'None'}</dd>
        <dt>Bounds</dt>
        <dd>{feature.bbox.map((value) => Math.round(value)).join(', ')}</dd>
      </dl>
    </section>
  );
}

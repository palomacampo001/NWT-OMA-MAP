import { MapPin } from 'lucide-react';

/**
 * RouteOriginRow
 *
 * A compact "Starting from" row shown inside the navigation drawer.
 * Gives the user a visible, always-accessible way to see and change the origin.
 *
 * Props:
 *   label        — display label of current origin (e.g. "Floor 8 – Design Studio")
 *   isPreview    — show "Preview mode" badge
 *   onChangeClick() — open the StartLocationSheet to pick a new origin
 */
export default function RouteOriginRow({ label, isPreview = false, onChangeClick }) {
  if (!label) return null;
  return (
    <div className="route-origin-row" aria-label={`Starting from: ${label}`}>
      <MapPin size={14} className="route-origin-icon" aria-hidden="true" />
      <div className="route-origin-text">
        <span className="route-origin-label">Starting from</span>
        <strong className="route-origin-value">
          {label}
          {isPreview && <span className="route-origin-preview-badge"> Preview</span>}
        </strong>
      </div>
      {onChangeClick && (
        <button
          className="route-origin-change"
          onClick={onChangeClick}
          aria-label={`Change starting location (currently: ${label})`}
        >
          Change
        </button>
      )}
    </div>
  );
}

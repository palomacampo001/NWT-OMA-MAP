import { FileUp, Sparkles } from 'lucide-react';

export default function EmptyState({ onUpload, onLoadSample }) {
  return (
    <div className="empty-state">
      <Sparkles size={36} />
      <h2>Convert SVG floorplans into editable indoor map data</h2>
      <p>Upload SVG files and the app will infer rooms, POIs, labels, categories, and confidence scores, then render a clean interactive map.</p>
      <div className="empty-actions">
        <label className="primary-button">
          <FileUp size={18} />
          Upload SVG
          <input type="file" accept=".svg,image/svg+xml" multiple onChange={(event) => onUpload(event.target.files)} />
        </label>
        <button className="secondary-button" onClick={onLoadSample}>Try sample map</button>
      </div>
    </div>
  );
}

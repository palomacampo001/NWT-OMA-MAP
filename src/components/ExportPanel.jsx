import { Clipboard, Download } from 'lucide-react';
import { convertToGeoJson } from '../utils/convertToGeoJson.js';
import { getGeoJson } from '../api/indoorMapApi.js';

function download(filename, object) {
  const blob = new Blob([JSON.stringify(object, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ExportPanel({ mapData, buildingId }) {
  const geoJson = convertToGeoJson(mapData);
  async function downloadBackendGeoJson() {
    const backendGeoJson = buildingId ? await getGeoJson(buildingId).catch(() => geoJson) : geoJson;
    download('indoor-map.geojson', backendGeoJson);
  }

  return (
    <section className="panel-section export-panel" id="exports">
      <h2>Export</h2>
      <button className="secondary-button" onClick={() => navigator.clipboard.writeText(JSON.stringify(mapData, null, 2))}>
        <Clipboard size={16} />
        Copy indoor JSON
      </button>
      <button className="secondary-button" onClick={() => navigator.clipboard.writeText(JSON.stringify(geoJson, null, 2))}>
        <Clipboard size={16} />
        Copy GeoJSON
      </button>
      <button className="primary-button" onClick={() => download('indoor-map.json', mapData)}>
        <Download size={16} />
        Download JSON
      </button>
      <button className="primary-button" onClick={downloadBackendGeoJson}>
        <Download size={16} />
        Download GeoJSON
      </button>
    </section>
  );
}

import { UploadCloud } from 'lucide-react';

export default function SvgUploader({ onUpload, status }) {
  return (
    <section className="panel-section uploader">
      <label className="drop-zone">
        <UploadCloud size={28} />
        <strong>Upload SVG floorplans</strong>
        <span>Drop or choose one or more .svg files. Each file becomes a floor.</span>
        <input type="file" accept=".svg,image/svg+xml" multiple onChange={(event) => onUpload(event.target.files)} />
      </label>
      {status.message && <p className={`status ${status.type}`}>{status.message}</p>}
    </section>
  );
}

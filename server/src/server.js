const express = require('express');
const cors = require('cors');
const buildings = require('./routes/buildings');
const floors = require('./routes/floors');
const features = require('./routes/features');
const search = require('./routes/search');
const geojson = require('./routes/geojson');
const routing = require('./routes/routing');
const qr = require('./routes/qr');
const { prisma } = require('./db/prisma');
const { publishedMap } = require('./services/versionService');

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json({ limit: '25mb' }));

app.get('/', (req, res) => {
  res.type('html').send(`
    <!doctype html>
    <html>
      <head>
        <title>SVG Indoor Map Backend</title>
        <style>
          body { font-family: system-ui, sans-serif; max-width: 720px; margin: 48px auto; line-height: 1.5; color: #1f2933; }
          a { color: #1967d2; }
          code { background: #eef2f5; padding: 2px 6px; border-radius: 6px; }
        </style>
      </head>
      <body>
        <h1>SVG Indoor Map Backend</h1>
        <p>The backend API is running. The map app runs on the Vite client server.</p>
        <p><a href="http://localhost:5173/?admin=1">Open Admin App</a></p>
        <p><a href="http://localhost:5173/">Open Public Map</a></p>
        <p>API health: <a href="/api/health"><code>/api/health</code></a></p>
      </body>
    </html>
  `);
});

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/buildings', buildings);
app.use('/api/floors', floors);
app.use('/api/features', features);
app.use('/api/search', search);
app.use('/api', geojson);
app.use('/api', routing);
app.use('/api', qr);

app.get('/api/public/published-map', async (req, res) => {
  if (req.query.buildingId) {
    const map = await publishedMap(req.query.buildingId);
    if (!map) return res.status(404).json({ error: 'No published map version exists.' });
    res.json(map);
    return;
  }

  const version = await prisma.mapVersion.findFirst({ where: { status: 'published' }, orderBy: { publishedAt: 'desc' } });
  if (!version) return res.status(404).json({ error: 'No published map version exists.' });
  res.json(await publishedMap(version.buildingId));
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: error.message || 'Server error' });
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Indoor map backend running on http://localhost:${port}`);
  });
}

module.exports = app;

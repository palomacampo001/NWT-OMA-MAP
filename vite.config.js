import fs from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const publishedPath = path.resolve('public/published-map.json');

function publishedMapPlugin() {
  return {
    name: 'published-map-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/publish', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const mapData = JSON.parse(body);
            if (!Array.isArray(mapData?.floors) || mapData.floors.length === 0) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'Cannot publish an empty map.' }));
              return;
            }
            fs.mkdirSync(path.dirname(publishedPath), { recursive: true });
            fs.writeFileSync(publishedPath, JSON.stringify(mapData, null, 2));
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), publishedMapPlugin()],
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});

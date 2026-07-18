# Deployment

## Current Production

- Public: https://nwt-oma.vercel.app
- Admin: https://nwt-oma.vercel.app/?admin=1

The Vercel project has also used:

- https://files-mentioned-by-the-user-build-seven.vercel.app

## Build

```bash
npm run build
```

## Deploy To Vercel

```bash
vercel --prod
```

Current `vercel.json`:

- build command: `npm run build`
- output directory: `dist`
- framework: `vite`
- `/api/*` rewrites to `api/index.js`
- all other routes rewrite to `index.html`

## Environment Variables

Required locally:

```bash
DATABASE_URL="file:./dev.db"
```

Use:

```bash
cp server/.env.example server/.env
```

The current server implementation primarily uses `server/data/indoor-map-db.json`.

## Git Snapshot

The stable handoff tag is:

```bash
v1-stable-handoff
```

Use the tagged commit as the frozen baseline for future work.


# Bob Handoff Package

## Repository

Repository URL will be the Git remote URL once pushed.

## Branch

`codex/directory-map-v2`

## Release Tag

`v1-stable-handoff`

## Live URLs

- Public: https://nwt-oma.vercel.app
- Admin: https://nwt-oma.vercel.app/?admin=1

## Folder Structure

- `src/`: React/Vite app.
- `src/components/`: UI components, including map viewer, search, route drawer, and admin panels.
- `src/utils/`: client-side parsing, storage, navigation, routing, geometry, and location helpers.
- `server/`: Express backend and file-backed database.
- `api/`: Vercel serverless adapter.
- `public/`: app icons, manifest, published map payload, directory maps, PDF-derived map data, and exported handoff zip.
- `scripts/`: current map-data build/generation scripts.
- `handoff/`: PDF-derived source package and archived handoff assets.
- `docs/`: previous internal docs retained for context.

## Install

```bash
npm install
```

## Run

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Environment

```bash
cp server/.env.example server/.env
```

Variable:

```bash
DATABASE_URL="file:./dev.db"
```

## Read First

1. `README.md`
2. `HANDOFF.md`
3. `ARCHITECTURE.md`
4. `ROUTING.md`
5. `ADMIN_GUIDE.md`
6. `DATA_FORMATS.md`
7. `DEPLOYMENT.md`
8. `KNOWN_ISSUES.md`


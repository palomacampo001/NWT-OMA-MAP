# v1-stable-handoff Release Notes

This tag preserves the stable No Wrong Turns / NWT OMA application before further development.

## Stable Version

This version includes the current public and admin indoor map application as it exists at handoff time.

## Current Routing Implementation

- Same-floor routing uses prepared route graphs.
- Runtime graph repair reduces missing-link loops without drawing fake wall-crossing routes.
- Cross-floor routing uses the current IBM OMA connector rules.
- Route details appear in the bottom navigation drawer.

## Current Admin Implementation

- Admin view is available at `/?admin=1`.
- Admin can edit features, add POIs, draw areas, hide/restore features, publish data, export data, and draw learned route paths.
- Manual route graph patches are stored in browser local storage and merged with prepared graph data.

## Current Mobile Implementation

- Mobile-first public UI with compact search, right-side floor controls, map controls, collapsible route drawer, share location, and route instructions.
- App shortcut metadata and icons are included in `public/manifest.webmanifest` and `public/icons/`.

## Current PDF-Based Map Implementation

- Current maps come from the PDF-derived directory map package.
- PDF-derived assets are committed under `public/maps/directory-v2/`, `public/directory-map/`, and `handoff/ibm-oma-directory-map-v2/`.
- The app does not regenerate maps on startup.

## Current Accessibility Implementation

- High contrast mode is available.
- Voice guidance toggle and repeat step controls are available.
- Core map control buttons include labels/titles.


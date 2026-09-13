# Vercel deployment — September 9, 2026

- URL: https://continuum-brain.vercel.app
- Project: `osrs-s-projects/continuum-brain`
- Deployment: `dpl_5zbq8dTtfXf4h6WwhPbNitFBboPz`
- Target: production (import preview and ingestion interface)
- Status: READY
- Scope: interface only; **cloud uploads, memory, and research are not operational**.

The Vercel build reuses the existing React interface through a standalone Vite entry point. Local development retains the original Python service and Sites/Vinext build. `npm run build:vercel` produces `dist-vercel`; `vercel.json` configures deployment and API routing.

The API gateway deliberately returns HTTP 503 with `BACKEND_NOT_CONFIGURED`. It does not pretend to save data or create a temporary database. Vercel's ephemeral function filesystem cannot serve as this application's persistent SQLite database: https://vercel.com/kb/guide/is-sqlite-supported-in-vercel

`.vercelignore` excludes local databases, notes, transcript seed files, Python backend files, environment files, and caches. Existing private memory remains local. The CLI project link is in ignored `.vercel/`; generated credentials remain in ignored local environment files.

## Verified

- Standalone Vite production build passes.
- TypeScript check and targeted lint pass.
- Gateway unavailable-state check passes.
- Remote Vercel build is READY.
- Authenticated `vercel curl /` returns the built HTML and asset references.
- Authenticated `vercel curl /api/brains` returns the explicit backend-not-configured response.
- Browser interaction and visual QA were not performed.

The dependency install reported 11 audit advisories, including 8 high severity. Their runtime applicability has not been triaged; do not interpret a successful build as a security audit. No automatic force-upgrade was applied.

## Remaining to make the hosted app functional

1. Provision persistent hosted memory: migrate storage to a supported database, or host the existing Python/SQLite service with a durable volume.
2. Add authenticated user access and per-user authorization before accepting private notes.
3. Run the background worker on a persistent host, or adapt jobs to a durable hosted workflow with retry and isolation semantics.
4. Replace the unavailable gateway with the authenticated API integration.
5. Migrate selected local sources explicitly, then verify upload → persistence → background association → source retrieval across restarts.

For subsequent preview deployments, run `npx vercel@59.14.0 deploy`; use `--prod` only when ready to update production. The current production URL is a staging foundation, not a functioning remote brain.

## Visual update

Reference-inspired UI deployed September 9, 2026. Both local and Vercel production builds, TypeScript, and targeted lint pass. CUA reported no available browser, so visual/browser interaction QA is still unperformed. The hosted backend remains intentionally unavailable pending its storage/authentication integration.

## Command-center rebuild

The overview was structurally replaced with a six-panel command center and generated decorative neural artwork on September 9, 2026. Source labels still reveal only on hover/focus. Actual source selection populates the right context panel. Local and Vercel builds, TypeScript, and targeted lint pass. Vercel reports READY; remote HTML references the new assets, and `/art/neural-field.png` returns HTTP 200 with image/png. No browser was available for visual QA.

## Procedural breathing graph

Production now uses a real-time Canvas renderer; the former PNG is excluded from deployment and no longer referenced by the graph. Geometry tests (4), TypeScript, targeted lint, and the Vercel build pass. The supplied YouTube Short was inaccessible through the available web tool, so exact motion matching is unverified. Browser animation/performance QA is still outstanding. Cloud memory remains unconnected.

## Import pipeline � September 10

Production deployment `dpl_qWoh4YwDFUcJY4nGJwEqH1MBFyyW` is READY and aliased to the main URL. Hosted HTML and PDF worker asset were fetched successfully; the API still returns BACKEND_NOT_CONFIGURED as intended. Browser previews and prepared downloads are implemented, while persistence and processing require the local service. See [INGESTION.md](INGESTION.md).

Verification: 13 Python tests and 11 JavaScript tests pass, including real PDF text extraction and HTTP import-to-worker completion. TypeScript, targeted lint, local Vinext build, and remote Vercel build pass. Local UI returned HTTP 200 and API health reported a live worker. Browser interaction QA remains unperformed. The npm lockfile was repaired with npm 12.0.2 after the deployment resolver identified missing optional dependency entries that npm 11 accepted.


## Three.js 3D scene � September 11

Deployment `dpl_5zbq8dTtfXf4h6WwhPbNitFBboPz` is READY and aliased to the main URL. The user's exact hosted tab was reloaded and visually verified with the plasma sphere, corrected profile, expanded mode, and Cinematic setting. Browser shader/error logs were empty. Actual local source selection, pause/resume, zoom, and Escape were verified. Production build, TypeScript, targeted lint, and four existing graph-data tests passed. Mobile viewport override did not affect the testing tab, so mobile and 4K performance are unverified. The GPU renderer is a deferred 566 kB minified chunk (142 kB gzip); Vite reports the chunk-size advisory. Cloud memory/authentication remain unconnected.

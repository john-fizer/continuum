# Reference-driven interface update

The four supplied images establish the visual direction; HIVEMIND is a lettering reference, not a requested rename. Keep Continuum as the product name.

Palette: void #03090e, panel #07141d, structural blue #244451, signal cyan #70ddff, warm amber #eabc78, text silver #d2e3eb.
Typography: a custom geometric SVG wordmark inspired by the wide, angular reference lettering; Bahnschrift/Segoe UI for readable controls and body text. The exact reference font is not identified.
Layout: full-width wordmark and signal header, narrow navigation rail, a large source constellation beside capture and context, then evidence and research controls. Existing source and experiment actions remain functional.
Graph: a luminous central memory orb with source branches and real source-to-source edges. Ambient particles are decorative, not invented knowledge. Empty/offline states remain explicit. No fabricated people, counts, or discoveries.
Panels: fine double-edge geometry, clipped-corner accents, cyan focus and restrained amber highlights. Mobile stacks the main graph and capture panel and turns navigation into a horizontal strip.
Implementation: new visual identity component, new graph rendering, shared theme stylesheet, existing application wiring retained. Validate with TypeScript, lint, production build, and available browser inspection. Redeploy the existing authorized Vercel project after checks.


## Composition rebuild after reference review

The original overview was replaced, not merely recolored. `CommandCenter` now uses an explicit six-panel grid: graph spanning two columns and two rows, source index and selected-node context in the right column, then recent captures / insights / ask along the bottom. Mobile stacks these areas. No fictional people or project counts were added.

A generated neural-field artwork provides the dense organic atmosphere requested in the reference. It is explicitly decorative, and not a visualization of inferred data. Real source nodes and source edges remain separate interactive SVG elements over it. Labels are hidden until hover or keyboard focus. Selecting a real node updates the context column; the original source can be opened from there.

The source index uses layered cards inspired by the reference rolodex, backed by real sources. Notes can be captured from a modal; retrieval, import, pause/resume, and source navigation remain connected to the existing API. Cloud storage is still unconnected and no preview action claims to save remotely.

## Procedural motion renderer

Supersedes the static artwork approach above. The graph is now drawn each frame using Canvas geometry: seeded fractal branching, moving pulses, a rotating spherical mesh, subtle expansion/contraction, pointer parallax, and real source nodes/edges. Source IDs seed positions so polling/reordering does not scramble the layout. HTML buttons follow the rendered nodes for accessible interaction and hover/focus labels. Reduced-motion, manual pause, visibility suspension, frame cap, pixel-ratio cap, resize handling, and cleanup are implemented. The old PNG remains only as a local reference and is excluded from future Vercel uploads.


## September 10 — profile and core correction

Replaced the faceted sidebar face with a smooth SVG profile, illuminated eye, ear contours, and subtle scan lines. Replaced the repeated spherical vertex mesh with a porous light core, breathing corona, irregular ribbons, and outward filaments. Increased branch visibility. These remain procedural visual effects, not a representation of completed analysis. Verified locally in the browser, including the pause control, plus TypeScript, targeted lint, and the production build.

Continuum remains the product name. Its masthead now uses solid, wide custom SVG capitals with individually spaced letters and a silver gradient, following the Fractasync/Hivemind typography reference. This is custom lettering, not an identified commercial font. Browser preview and TypeScript/lint checks passed.


## Three.js plasma scene — September 10–11

The old Canvas 2D renderer is replaced by a dynamically loaded Three.js/WebGL 2 scene: a noise-displaced plasma sphere, 22,000/52,000 shell particles, inclined magnetic filaments, branched 3D electrical paths with moving sparks, and stars at different depths. Bloom and filmic tone mapping are applied after scene rendering. Camera translation and scene tilt respond to pointer position. No image or video is used for the graph.

Expand fills the viewport; Escape returns to the dashboard. Cinematic allows a larger render budget (up to 8.29 million drawing-buffer pixels, subject to viewport size/device pixel ratio); Auto caps resolution and reduces it after sustained slow frames. This is not a verified guarantee of smooth 4K playback on every device. Reduced-motion preference freezes ambient animation; hidden/offscreen scenes suspend animation. Graphics context loss displays an explicit interrupted state and restoration reinitializes rendering. Resources and listeners are disposed on unmount.

Source hit targets follow their 3D positions, nearby sources are spaced apart, and parallax settles while a source is hovered or keyboard-focused. Labels remain hover/focus-only. The source renderer uses real IDs and stored edges; decorative electrons do not imply newly discovered knowledge.

Verified in browser: actual WebGL scene (no shader errors), expanded view, Escape, pause/resume, zoom, and selecting the intended source updates both source index and context. TypeScript, targeted lint, production build, and existing graph data tests pass. Attempted mobile viewport override did not change the testing tab dimensions, so phone/4K performance remains unverified. The user's open hosted tab was observed running the older renderer; reloading that exact tab loaded the new scene and restored the smooth profile.

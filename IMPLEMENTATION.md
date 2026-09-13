# Brain framework — first executable slice

Goal: independent persistent brains, optional snapshot forks, source capture, evidence links, and coupled background jobs in a usable local application.

Architecture: Python standard-library SQLite service owns all durable state and background work. A Sites-generated React interface calls it through the local development proxy. No cloud publication until an authenticated reachable runtime exists. No fabricated agents, trained models, or discoveries.

Visual direction: deep blue working canvas, cyan exploration and amber analysis, a central figure-eight showing actual queue state, wide readable source/discovery panes. The interface opens on active work, not a marketing page.

## Tasks
- [x] Tests first: isolated instances, snapshot fork, deduplication, job restart recovery, two-loop progression, supported source references, pause, and budget guard.
- [x] Implement SQLite repository, scheduler, and deterministic lexical baseline.
- [ ] Connect a generative model adapter and semantic retrieval (next stage).
- [x] Implement loopback HTTP API, source import, scoped retrieval, snapshot export, and a queued numeric AutoML baseline.
- [x] Implement instance selection/create/fork, capture, source graph, discovery review, research activity, laboratory, and settings.
- [x] Run ten backend tests including real HTTP integration, frontend type checking and build; launch local application and verify HTTP/proxy health. Browser visual QA remains unperformed.

## Contracts
Brain: id, name, direction, parent_id, active, cycle_limit, cycles_used.
Source: id, brain_id, title, body, hash, origin, created.
Link: id, brain_id, source_a, source_b, terms, similarity, status.
Job: id, brain_id, kind, status, payload, result, created.
Each source and job belongs to exactly one brain. Forks copy sources and direction, remap IDs, and queue fresh analysis. Later changes never merge implicitly.

RAG in this slice uses cited local lexical retrieval. Exploration proposes source-pair overlaps, analysis measures shared terms and explicitly treats the result as an association, never causal evidence. Optional model inference is a replaceable adapter; unavailable credentials must be shown honestly. A bounded numeric-regression AutoML baseline is implemented with a held-out test set. Deep learning and RL remain unconnected. The current background engine records follow-up questions but does not autonomously research them.

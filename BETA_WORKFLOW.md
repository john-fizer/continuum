# Continuum beta release workflow

`main` is the production branch behind https://continuum-brain.vercel.app. `beta` is the isolated release branch; each push to it creates or updates Vercel's Preview deployment.

1. Build a capability on `beta` and run the relevant automated checks.
2. Use the Preview URL to try the exact user flow with real private data.
3. Keep a successful capability by promoting its reviewed commit to `main`; Vercel then creates the production deployment.
4. Reject an experiment by reverting it on `beta` or replacing the beta branch. Production remains untouched throughout.

The beta-only JEV evidence-review adapter uses `JEV_API_KEY` only on the server. Add it to Vercel's **Preview** environment to activate the review button. The browser never receives the key. JEV receives a bounded proposed-capability record and returns an advisory; it cannot mutate memories, graph edges, or production state.

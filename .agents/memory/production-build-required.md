---
name: Production build required before deploy
description: Production uses dist/index.cjs (compiled bundle). Code changes to TypeScript source don't go live until npm run build is run and the app is redeployed.
---

## Rule
Any time code changes are made and a production deploy is needed, run `npm run build` BEFORE publishing.

**Why:** Dev mode uses `tsx server/index.ts` (runs TypeScript directly). Production uses `node dist/index.cjs` (pre-compiled bundle). If you change source files and deploy without rebuilding, production runs the old bundle — the changes have zero effect in production even though dev works fine.

**How to apply:**
- After any fix/feature that needs to go to production: run `npm run build` first, verify it completes without errors, then suggest publishing.
- Quick check: `grep -c "SOME_UNIQUE_STRING" dist/index.cjs` — should be > 0 if the fix is in the server.
- The frontend bundle (`dist/public/assets/restaurant-*.js` etc.) is also rebuilt by `npm run build` via Vite.

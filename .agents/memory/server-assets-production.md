---
name: Server assets in production
description: Why server/assets/ images weren't loading in production and how to fix it
---

## The problem
`script/build.ts` deletes `dist/` entirely then never copies `server/assets/`.  
In production the app runs `node dist/index.cjs` — `server/assets/` doesn't exist there.  
`fs.existsSync(path.join(process.cwd(), 'server', 'assets', ...))` silently returns `false` → covers/images are skipped without error.

## The fix (implemented)
1. `script/build.ts` now calls `copyDir('server/assets', 'dist/server/assets')` before esbuild.
2. `server/utils/assetPath.ts` exports `assetPath(filename)`:
   - **production**: `path.join(__dirname, 'server', 'assets', filename)` — `__dirname` = `dist/` in the compiled bundle
   - **dev**: `path.join(process.cwd(), 'server', 'assets', filename)`
3. All route files that load images (`presupuestos.ts`, `folios.ts`, `reservations.ts`) import and use `assetPath()` instead of `path.join(process.cwd(), 'server', 'assets', ...)`.

**Why:** esbuild bundles everything into `dist/index.cjs`; `__dirname` becomes `dist/` at runtime. `process.cwd()` is the workspace root in both dev and prod, but the copied assets live under `dist/server/assets/` not `server/assets/`.

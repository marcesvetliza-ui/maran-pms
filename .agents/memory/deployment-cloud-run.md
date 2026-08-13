---
name: Cloud Run deployment approach
description: Correct build/run config for Replit Cloud Run (autoscale) deployments
---

## The correct deployment config

Replit deploys this project to **Cloud Run autoscale** (provider: `cloud_run`), NOT a VM.

```toml
# .replit [deployment] section
deploymentTarget = "autoscale"
build = ["npm", "run", "build"]
run = ["node", "dist/index.cjs"]
```

Or via deployConfig() callback:
```js
await deployConfig({ deploymentTarget: "autoscale", build: ["npm", "run", "build"], run: ["node", "dist/index.cjs"] });
```

## How Cloud Run deployments work

1. **Build container**: Replit auto-runs `npm install` (includes devDependencies), then runs the build command (`npm run build`). Creates `dist/` inside the workspace.
2. **Repl layer**: The entire workspace (including freshly-built `dist/`) is packaged as a container image layer.
3. **Run container**: Starts from the Repl layer, runs the run command (`node dist/index.cjs`).

**Why:** The build output IS transferred to the run container via the Repl layer. No need to rebuild at startup.

## What NOT to do

- **DO NOT** use a proxy wrapper (prod-start.cjs) that rebuilds inside the run container. `npm install` in the run container takes 7-11 minutes → Cloud Run startup timeout kills it.
- **DO NOT** set `deploymentTarget = "vm"` — the project deploys as autoscale/Cloud Run regardless.
- **DO NOT** use `echo skip` as build command and rely on committed dist/ — it works but misses any source changes made after the last dist/ commit.

## Build timing

- `npm install` in build container: ~7 minutes (Replit caches nix layer, not node_modules)
- `npm run build` (tsx + vite): ~2-3 minutes
- Total build time per deploy: ~10 minutes

## Healthcheck 500s during startup

Cloud Run healthchecks start immediately when the run container launches. The first few seconds show "status 500" — this is the Replit proxy returning 500 for connection refused (port not open yet). This is NORMAL. As long as the port opens within the startup timeout, the deployment succeeds.

**Why:** `server/index.ts` calls `serveStaticFiles(app)` + `httpServer.listen()` BEFORE `await registerRoutes()` in production mode. This ensures the port opens quickly.

## Verifying the deployment

After a successful deploy, compare bundle hashes:
- `curl -s https://maranpms.com.ar/ | grep -o 'index-[^"]*\.js'` → production hash
- `ls dist/public/assets/index-*.js` → local hash

Different hashes = fresh build was deployed. Same hash = old build still serving.

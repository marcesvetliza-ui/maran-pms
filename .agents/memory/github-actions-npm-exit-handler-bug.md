---
name: GitHub Actions npm "Exit handler never called" bug
description: npm ci/install hangs ~70-75s then crashes with "Exit handler never called!" on this repo's GitHub Actions runner, leaving node_modules incomplete (e.g. tsx missing). Read before touching .github/workflows/test.yml install step.
---

`npm ci` (and `npm install`) in `.github/workflows/test.yml`'s "Instalar dependencias" step
reproducibly hangs for ~70-75 seconds and then crashes with:

```
npm error Exit handler never called!
```

This leaves `node_modules` incomplete — e.g. `tsx` binary missing, causing the next step
(`npm run db:migrate:ci`) to fail with `sh: 1: tsx: not found`. Locally (outside GitHub Actions,
same package.json/package-lock.json), a clean `npm ci` succeeds in ~17s with no issue — so it's
specific to the GitHub-hosted runner, not the dependency tree itself.

**Fixes tried, all failed identically (same ~70-75s hang, same error) across 6 separate CI runs:**
- `npm ci --no-audit --no-fund`
- `npm install -g npm@latest` before install (also separately failed with EBADENGINE: npm 12 requires Node ^22.22.2+, incompatible with Node 20)
- Bumping `actions/setup-node` to `node-version: "22"` (ships npm 10.9.8) — same bug
- Retrying the install 3x in a bash loop with `rm -rf node_modules` between attempts — all 3 attempts failed identically
- Switching from `npm ci` to `npm install` — same bug
- `NPM_CONFIG_UPDATE_NOTIFIER=false` (to rule out npm's background update-check network call) — same bug

**Why:** Root cause not identified. The suspiciously consistent ~70-75s timing across every
variant (different npm/Node versions, different install commands, different flags) suggests a
deterministic trigger rather than random network flakiness, but the actual cause inside npm's
install pipeline was not isolated. This matches the long-standing, still-partially-unresolved
npm/cli bug class documented at https://github.com/npm/cli/wiki/%22cb()-never-called%3F-Exit-handler-never-called%3F-I'm-having-the-same-problem!%22.

**How to apply:** Don't re-try the six approaches above blind — they're confirmed dead ends on
this repo's CI runner as of Aug 27, 2026. Untried directions worth exploring next: pin an older
npm version (e.g. `npm@9`) instead of upgrading; try `yarn`/`pnpm` instead of npm for the CI
install step only; or add verbose/debug logging (`npm ci --loglevel silly`) and inspect the full
debug log npm points to, which wasn't captured in past attempts.

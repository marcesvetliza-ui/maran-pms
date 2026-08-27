---
name: GitHub Actions npm install failures — root cause was the package-lock, not npm itself
description: npm ci/install in .github/workflows/test.yml hung ~70-75s then crashed with "Exit handler never called!" — root cause was package-lock.json "resolved" URLs pointing at Replit's internal package-firewall host, unreachable from GitHub's runners. Read before touching the CI install step or before assuming this class of npm crash is unfixable.
---

## Real root cause (confirmed Aug 27, 2026)

Replit's dev environment routes npm through an internal proxy
(`NPM_CONFIG_REGISTRY=http://package-firewall.replit.local/npm/`, npm config
`replace-registry-host=npmjs`). That proxy rewrites `resolved` URLs in
`package-lock.json` to point at `package-firewall.replit.local` instead of
`registry.npmjs.org`. That hostname only resolves *inside* a Replit
workspace — it is not reachable from a GitHub Actions runner. When CI ran
`npm ci`/`npm install`, npm tried to fetch ~146 packages from an
unreachable host, and repeated connection failures across many packages is
what produced the consistent ~70-75s hang before npm's install pipeline hit
the (unrelated, cosmetic) "Exit handler never called!" bug during error
unwind. Locally on Replit the same lockfile installs fine because the proxy
answers those requests — which is exactly why the failure looked
runner-specific and "random" rather than an obvious bad-URL error.

**Fix:** rewrite every `"resolved": "http://package-firewall.replit.local/npm/..."`
entry in `package-lock.json` to `"resolved": "https://registry.npmjs.org/..."`
(the path structure is identical, so a plain string substitution works and
preserves the existing `integrity` hashes — verified with a clean `npm ci`
in a scratch dir with the firewall registry env vars unset). This is safe to
commit: a later plain `npm install` inside the Replit workspace does **not**
re-introduce firewall URLs into an already-resolved lockfile (verified), so
the lockfile stays CI-safe unless someone manually points npm at the
firewall registry while regenerating it from scratch.

**How to apply:** If `package-lock.json` ever re-acquires
`package-firewall.replit.local` resolved URLs (e.g. after deleting and
fully regenerating the lockfile from within a Replit workspace), redo the
same substitution before pushing, or regenerate with
`NPM_CONFIG_REGISTRY` and `npm_config_registry` both explicitly unset via
`env -u` (both the upper- and lower-case env vars are set in this
environment and both must be cleared, or npm's config merge picks the
firewall URL back up).

**Six earlier "fixes" that were dead ends and why:** `--no-audit --no-fund`,
upgrading npm, bumping Node to 22, retrying 3x with `rm -rf node_modules`,
switching `npm ci`→`npm install`, and disabling the update-notifier network
check all failed identically because none of them touched the actual
problem — the lockfile pointing at an unreachable internal host. Don't
re-diagnose this as a flaky-npm-bug issue again; check
`grep package-firewall package-lock.json` first.

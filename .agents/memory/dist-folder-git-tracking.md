---
name: dist/ folder was tracked in git
description: The build output folder dist/ was historically committed to this repo, causing massive rename/rename merge conflicts whenever local and origin/main diverged. Now gitignored.
---

`dist/` (the `npm run build` output — server bundle + hashed Vite client assets) used to be committed to git in this repo. Every rebuild changes the content hashes in filenames (e.g. `shield-check-BKcMH4zI.js` → `shield-check-C7Napd6j.js`), so any two branches/checkouts that each ran a build independently produce hundreds of spurious rename/rename and modify/delete conflicts on merge — even when the real source code has no conflicting changes.

**Why:** Discovered while reconciling a local `main` that had diverged from `origin/main` (each side had commits the other lacked, common ancestor further back). A real merge showed ~200+ conflicting files, but all but 2 were inside `dist/`; the actual source-level conflict surface was trivial.

**How to apply:** `dist/` is now in `.gitignore` and untracked (`git rm -r --cached dist`), so this class of conflict cannot recur going forward. If you ever see a wall of `dist/public/assets/*.js` rename/rename conflicts during a merge, don't hand-resolve them — confirm `dist/` is gitignored/untracked, `git rm -rf dist` to drop it from the merge, then resolve only the remaining real files. Before pushing, always `git fetch` with an authenticated URL first (an unauthenticated `git fetch origin` can silently fail and leave a stale local `origin/main` ref, making `merge-base --is-ancestor` look safe when it isn't) and check `git status -sb` / `merge-base --is-ancestor` against the freshly fetched ref before assuming a plain `git push` will fast-forward.

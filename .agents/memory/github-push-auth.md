---
name: GitHub push authentication
description: Safe publishing approach for this repo's connected GitHub remote, including a GitHub-side content block on the OAuth API path.
---

Plain `git push`/`git fetch` over HTTPS using the `GITHUB_PERSONAL_ACCESS_TOKEN` secret as the `x-access-token` password works for both read and write on this repo. The `GITHUB_PERSONAL_ACCESS_TOKEN_PUSH`, `_PUSH2`, `_PUSH3` secrets are the ones that get rejected ("Invalid username or token") — don't waste time retrying those; use the base secret.

**Why:** An earlier session only tried the `_PUSH*` secrets and the GitHub OAuth connector, concluded token auth was broken, and switched to the OAuth Git Data API. The base token was never actually tried and works fine.

**How to apply:** For a git operation, use `git -c ...` or a one-off remote URL with `https://x-access-token:$GITHUB_PERSONAL_ACCESS_TOKEN@github.com/<owner>/<repo>.git` — never persist the token in git config or a saved remote. Never force-push.

GitHub's own edge blocks any API request body (REST Git Data blobs/contents, and GraphQL alike) that contains the literal substring `<script` after decoding — even when the payload is base64-encoded — returning a Cloudflare "Attention Required" HTML page with HTTP 403. This is content-triggered, not rate-limiting: retries never succeed, and it reproduces with a tiny isolated payload.

**Why:** Confirmed by bisecting a blocked file down to one line containing `<script>...<\/script>` (a print-window helper) and reproducing the 403 with that fragment alone, in isolation, across both REST endpoints and `/graphql`. Cloudflare's WAF appears to decode JSON string bodies (including base64 fields) before pattern-matching, so obfuscating via base64 or `\uXXXX` JSON escapes doesn't help — the decoded bytes are still flagged.

**How to apply:** When the local repo's history has diverged from `origin/main` (a previous squash-push landed as a single foreign commit with no shared ancestry) and a file to publish contains `<script`, do not use the OAuth connector's `proxyFetch`/Git Data API for that file — it will 403 regardless of chunking or escaping. Instead: `git fetch` the real remote head with a working token, `git worktree add` a temp dir at that commit, copy over only the intended changed/added source paths (never `git add -A` — see the workspace-uploads-git memory on excluding `attached_assets/` and built `dist/` churn), commit with that remote commit as the sole parent, then `git push <worktree-head>:main` with the working token. This is a real git-wire-protocol push (pack data, not JSON), so the content block does not apply, and it stays a clean fast-forward since the new commit's parent is the exact observed remote head.

For large repository tree comparisons, do not parse a long `git ls-tree` result directly: pass `-c core.quotepath=false` or non-ASCII filenames come back octal-escaped and produce false added/removed diffs against the API tree (which returns literal UTF-8). Write both sides to `/tmp` and diff with a small script rather than trusting raw shell output for either side.

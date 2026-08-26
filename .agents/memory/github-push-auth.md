---
name: GitHub push authentication
description: Safe publishing approach when local Git credentials do not authenticate to the connected GitHub repository.
---

When command-line pushes to the GitHub HTTPS remote reject the configured personal-token secrets, use the connected GitHub OAuth integration for publishing rather than persisting a token in a remote URL or Git configuration.

**Why:** The GitHub OAuth connection has repository write permission and refreshes its own credentials, while the available personal-token secrets may be expired, revoked, scoped incorrectly, or otherwise rejected by GitHub. Local and remote `main` can also advance independently.

**How to apply:** First compare the remote head with the local history. Never force-push a divergent branch. Build a clean three-way merge of the intended source changes against the remote head, omit generated artifact churn unless explicitly needed, and create a non-force commit/ref update through the OAuth GitHub API. Verify the remote ref and changed files afterward.

For Git Data API writes in this environment, create and verify blobs, tree, commit, and ref update as individual OAuth calls rather than one large chained call.

**Why:** A large chained OAuth Git Data request can fail with an opaque `PatternError` before yielding a reliable outcome; single-step calls make each stage auditable and prevent assuming a branch was updated.

**How to apply:** After any ambiguous error, re-read the remote ref before continuing. Update the ref with `force: false` only after the new commit is known to be parented to the observed remote head.
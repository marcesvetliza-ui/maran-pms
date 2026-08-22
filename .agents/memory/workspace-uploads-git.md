---
name: Workspace uploads and Git commits
description: Prevent uploaded chat attachments from being accidentally published with application source.
---

User-supplied attachments are materialized under `attached_assets/` and must not be included in source-control commits unless the user explicitly asks to add them as a product asset.

**Why:** Broad staging such as `git add -A` includes these temporary conversation files, which can publish private screenshots to the repository.

**How to apply:** Before committing, inspect `git status`; stage the specific source and generated build paths required for deployment. If an attachment is staged accidentally, remove it from the repository before pushing.
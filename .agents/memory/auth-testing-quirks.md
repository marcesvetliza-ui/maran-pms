---
name: Auth testing quirks (system_users / bcryptjs)
description: How to create a working test/admin login for API or e2e testing in this app
---

The real login table is `system_users` (not `users`), and passwords are hashed with the **bcryptjs** npm package (imported as `bcryptjs` in `server/auth.ts`), not the native `bcrypt` package — `bcrypt` is present in node_modules but its ESM import fails in this environment, so hashes must be generated with `bcryptjs` specifically.

Required columns when inserting a test user directly via SQL: `is_active` must be the **text** `'true'` (not boolean), and `created_at` is NOT NULL with no default — must be set explicitly (`now()`).

**Why:** Postgres `pgcrypto`'s `gen_salt('bf')`/`crypt()` are not available in this DB, and the Playwright testing subagent's sandbox does not have `bcryptjs` importable either — so a temp test-user password hash must be computed in the main agent's own code-execution sandbox (where `bcryptjs` is importable via `await import('bcryptjs')`) and written to `system_users.password` directly, rather than asking the DB or the testing subagent to generate the hash.

**How to apply:** to set up an e2e-testable admin login: in code_execution, `const hash = await (await import('bcryptjs')).default.hash(plaintextPassword, 10)`, then INSERT/UPDATE `system_users` with that hash, `role='admin'`, `is_active='true'`, `created_at=now()`. Always delete the temp user (and any other test rows) after the test run.

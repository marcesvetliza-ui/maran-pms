---
name: Production migration gap (Railway skips baseline migrate())
description: Why a table/column can exist in dev but not in the real Railway production DB, and how to fix it safely.
---

## The rule
`server/migrate.ts` only runs Drizzle's baseline `migrate()` (which applies `migrations/*.sql`) when `NODE_ENV !== "production"`. In production (Railway, which uses PgBouncer), that call is skipped entirely because DDL/advisory-lock commands are incompatible with pooled connections. Only the hand-written incremental block (`CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements later in the same file) actually executes against the real production database.

**Why:** A table or column added via the schema (`shared/schema.ts`) and even present in the baseline `migrations/0000_*.sql` file can still be completely missing in production if it was never *also* added as an idempotent statement in the incremental block. This caused `account_movements` / `account_movement_allocations` to not exist on Railway at all, even though the code, the deploy, and the dev DB all looked correct — the API endpoint threw "relation does not exist" (500), and since the frontend query didn't check `res.ok`, it silently rendered as a $0.00 balance instead of an error.

**How to apply:** Whenever you add or change a table/column in `shared/schema.ts`, ALSO add a matching idempotent `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN IF NOT EXISTS` to the incremental block at the bottom of `server/migrate.ts`. Never assume "it's in the migrations folder" is enough — that folder is dev-only in this project. Also: any query that silently swallows a fetch error (`res.json()` without checking `res.ok`) can mask a production-only 500 as a plausible-looking zero/empty value — always surface fetch errors in the UI instead of defaulting silently.

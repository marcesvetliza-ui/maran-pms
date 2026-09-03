---
name: Publish sequence defaults
description: Why sequence-backed text defaults can produce malformed Publish schema diffs and how to preserve concurrency safely.
---

Do not put a sequence expression with PostgreSQL casts in the database `DEFAULT` of a text column when the schema is promoted through Replit Publish. Keep the sequence as a schema object and request `nextval()` explicitly in the application’s insert path.

**Why:** PostgreSQL normalizes the default to an expression containing `::regclass` and `::text`. Publish introspection can truncate that expression at the cast and generate an invalid `ALTER COLUMN SET DEFAULT` statement. Explicit sequence allocation preserves atomic numbering without exposing that expression to the schema diff.

**How to apply:** For new sequence-numbered text fields, declare the sequence in the ORM schema, leave the column without a default, and centralize explicit sequence allocation in every insert path. Recompute the development-to-production diff and confirm it contains a valid sequence creation but no malformed default change.
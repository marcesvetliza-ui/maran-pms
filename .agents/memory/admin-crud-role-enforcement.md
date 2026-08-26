---
name: admin-crud-role-enforcement
description: New admin/ABM write endpoints must enforce roles server-side matching sidebar visibility, not just basic auth.
---

# Admin CRUD endpoints need server-side role checks

Sidebar navigation restricts admin-only screens (chart of accounts, cost centers, POS configs, etc.) to specific roles, but that restriction is **client-side only** — it does not stop another authenticated user from calling the underlying API directly.

**Why:** any authenticated user could otherwise create/edit/deactivate administrative records (accounting accounts, cost centers, etc.) regardless of role, and "include inactive" style reads could leak more than the active/public subset to users who shouldn't see it. At least one existing admin route in this codebase has this gap already and should not be copied as a pattern.

**How to apply:** whenever adding a new admin-only write endpoint (or a read that exposes more than the "active/public" subset), enforce the same role set server-side that the sidebar entry uses to show the link — don't rely on basic authentication alone, and don't assume an existing route is a safe pattern to copy without checking its role enforcement.

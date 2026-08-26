---
name: Shared dialog fed by two entry-point flows
description: A dialog/mutation shared by two independent flows must know which flow triggered it and fully reset that flow's state, or it silently reads/leaves stale data.
---

When one dialog (e.g. an invoice-review dialog) can be opened as a follow-up from two independent flows that each keep their own form state, two separate bugs recur together:

1. **Wrong prefill** — the dialog reads a hardcoded state variable instead of branching on which flow just triggered it, so it shows the other flow's stale/empty data instead of what was actually just submitted.
2. **Incomplete reset** — even after branching correctly, resetting only some of a flow's fields (e.g. clearing the entered values but forgetting a "locked" flag tied to a multi-step selection) leaves that flow's *own* dialog unusable the next time it's opened — it appears disabled/stuck rather than fresh.

**Why:** These bugs only surface in a real end-to-end run — code review and unit tests scoped to a single flow don't exercise "two entry points converging on one shared dialog" or "reopen after a successful multi-step submission." A dialog closed via direct state changes (not through its own onOpenChange/onClose handler) can also skip a reset block that only lives in that handler, leaving the reset duplicated (and easy to leave incomplete) in more than one place.

**How to apply:** When a dialog/mutation success handler can be triggered by more than one entry point, add an explicit flag recording which one fired and branch every field it reads/resets on that flag. Extract the full reset for a multi-field flow into one shared function and call that same function from every place the flow can end (plain success, a follow-up dialog's success, and that follow-up dialog being closed/abandoned) rather than re-listing the fields inline each time — inline duplicates drift out of sync as fields get added.

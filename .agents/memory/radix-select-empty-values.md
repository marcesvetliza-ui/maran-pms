---
name: Radix SelectItem empty values
description: Radix UI Select crashes the entire React tree when any SelectItem receives an empty-string value; dynamic lists from API data (`uniqueX = new Set(rows.map(r => r.field))`) can silently introduce empty values when production data has null/empty fields.
---

# Rule

Radix `<Select.Item value={x}>` throws `"A <Select.Item /> must have a value prop that is not an empty string"` whenever `x === ""`. The throw bubbles up and the entire page (or section) renders as the global error boundary fallback ("Algo salió mal").

The error fires at **mount time** of the SelectItem, not at click time. Combined with two Radix behaviors, this makes the crash appear in surprising places:

1. **Radix Tabs renders ALL TabsContent in the DOM**, even inactive tabs. A bad SelectItem inside an inactive tab still crashes when the page mounts.
2. **Radix Dialog UNMOUNTS its content when closed.** SelectItems inside a closed Dialog are NOT mounted and do NOT crash — they only crash when the Dialog opens.

So: a SelectItem inside a closed Dialog is safe at page-load. A SelectItem inside any TabsContent (active or not) is NOT safe at page-load.

**Why:** The pattern `Array.from(new Set(items.map(i => i.someField)))` will include `""` or `null` in the resulting array if any row in production has an empty/null value for that field. Dev seed data usually doesn't trigger it; production does. Same problem with `apiData.map(x => <SelectItem value={x.id}>)` when some row has an empty id.

# How to apply

When building a Select whose options come from API data or derived sets:

- Always filter out empty/null values BEFORE mapping to SelectItem. Examples:
  - `items.filter(i => i.id).map(i => <SelectItem value={i.id} ...>)`
  - `Array.from(new Set(rows.map(r => r.module).filter((m): m is string => !!m)))`
  - For numeric fields: `.filter((f): f is number => f != null)` then `.toString()` in the SelectItem.
- Static arrays (hardcoded constants) are safe as long as no entry is `""`. Audit them once and move on.
- When debugging "Algo salió mal" / global error boundary in production but not dev: suspect a SelectItem fed by production data containing an empty/null field. Search for `Array.from(new Set(...map...))` patterns and `.map(x => <SelectItem value={x.someField}`.
- The crash location in the React stack often points to the parent route component, NOT the specific Select — because the error bubbles. Don't trust the stack frame; grep for SelectItem sources in the page being loaded.

# Historical incidents

- `/administration` crashed on load because `uniqueModules = Array.from(new Set(auditLogs.map(l => l.module)))` was fed into a SelectItem inside the (always-rendered) `<TabsContent value="audit">`, and production `audit_logs` had at least one row with an empty `module`.
- `planning-filters-panel` crashed because `roomTypes.map(rt => <SelectItem value={rt.id}>)` rendered at page-level and at least one room type row had an empty id in production.

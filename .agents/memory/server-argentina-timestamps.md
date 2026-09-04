---
name: Server timestamps in Argentina
description: Rule for formatting server-generated timestamps without shifting calendar-only dates.
---

Server-generated receipts, PDFs, emails, exports, operational time buckets, and defaults for operational `YYYY-MM-DD` columns must use `America/Argentina/Buenos_Aires`. A plain `YYYY-MM-DD` input is a calendar date and must be rendered by its components, without converting it to an instant.

**Why:** The Node process can run in UTC or another timezone. Local getters and locale formatters without an explicit zone silently shift visible hours and can also move an instant to the previous or next calendar day. Conversely, timezone-converting a date-only business value can corrupt the intended day.

**How to apply:** Use the shared server date/time utility for instants, generated timestamps, filenames, operational date/hour parts, and calendar-day arithmetic. Keep date-only inputs on the calendar-preserving path and test regressions around Argentine midnight with the process timezone set outside Argentina.
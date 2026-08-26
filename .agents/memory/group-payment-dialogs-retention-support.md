---
name: Group Folio Maestro payments go through one dialog
description: group-detail.tsx registers all Folio Maestro payments through a single unified dialog; a legacy duplicate was retired.
---

`client/src/pages/group-detail.tsx` used to have two separate dialogs that could each register a payment against a group's Folio Maestro (master, non-room balance) and both fed the same shared fiscal follow-up dialog via an explicit resolver. The legacy, simpler duplicate (no retención support) was fully retired — every entry point now opens the single unified payment dialog pre-set to its "apply to Folio Maestro" mode, and the fiscal follow-up dialog reads directly from that one flow's state, with no cross-flow resolver needed anymore.

**Why:** Two entry points converging on one shared dialog was a recurring bug source (stale/wrong-flow data reads) and pure duplication once the unified dialog covered the same ground, including retenciones the legacy dialog never had.

**How to apply:** Any future work on Folio Maestro payments/retenciones/invoicing must anchor on the unified payment dialog's master-destino path — there is no other flow to keep in sync with. Also: a receipt type gated by a business rule (e.g. "only valid when the master folio covers accommodation only") must be enforced in a shared, unit-testable helper used by both the UI and the server endpoint, not just hidden in a dropdown — a hidden option's underlying state can still reach the backend.

---
name: CC recovery and current obligations
description: Keep historical CC settlement recovery separate from new folio debt and pending fiscal issuance.
---

Recover a specific persisted settlement, not merely any historical CC-linked invoice on the reservation. A completed historical invoice must not prevent billing newly added services.

**Why:** A reservation can have older settled CC invoices and a new unpaid obligation. Treating the older invoice as a successful recovery skips current issuance and sends checkout into an unpaid-balance failure.

**How to apply:** Prioritize durable pending intents, retain identity and ambiguity checks for genuine historical adoption, and exclude previously linked invoices as recovery candidates when new operational debt remains.

Operational debt and pending fiscal issuance are independent obligations. Tagged NC audit adjustments do not remove operational services.

**Why:** Historical payments can cover the operational balance while some services still need a fiscal document; fiscal negative audit adjustments can otherwise hide unpaid services.

**How to apply:** Use shared operational-charge semantics in recovery and checkout. After recovering a completed settlement, explicitly expose remaining fiscal work even when debt is zero, without automatically issuing a second document. Preserve the operation identity on an unresolved checkout retry.
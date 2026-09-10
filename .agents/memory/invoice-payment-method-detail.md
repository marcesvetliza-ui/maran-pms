---
name: Invoice payment-method detail
description: Durable rule for preserving simple, split, and advance-funded payment methods on fiscal documents.
---

Invoices must persist each payment method together with its amount before fiscal emission. The legacy single-method value remains for compatibility and for condition-of-sale labels, but it is not sufficient for split payments.

**Why:** Payments are recorded after the fiscal document is authorized, while the invoice PDF can be opened immediately. Deriving methods later from payment rows can therefore produce an empty or inaccurate PDF and cannot reliably reconstruct advances or split payments.

**How to apply:** Any invoice entry point that accepts more than one collection source must send the method-and-amount detail with the invoice request. PDF rendering should prefer that detail and only fall back to assigning the full total to the legacy single method for older invoices.
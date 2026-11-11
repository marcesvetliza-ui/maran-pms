# Fiscal correction from closed reservations

Closed/cancelled individual reservations expose **Corregir facturación** in the read-only banner. The action selects an existing invoice, issues a full linked NC with a reason, waits for authorized/reconciled status, then preloads the original recipient and concepts for a replacement. Reservation dates, room, status and charges are not editable through this UI. Original, NC and replacement PDFs remain linked in the same view.

The correction endpoints require the existing `api:billing:nc-reconciliation` permission. They reuse the existing billing handler, fiscal preflight, reservation financial advisory lock and credit reconciliation. The server builds source amounts and items from the original rather than accepting amounts/payment instructions from the browser. Total and concepts must remain identical in cents; original VAT rates are retained. An NC does not refund payments. Available released advances proven to belong to the original are reapplied through the existing credit intent; no new cash collection is requested. Unpaid value stays unpaid and does not trigger a new account transfer.

`credit_reapplication_intent.correctionOriginalInvoiceId` and the operation journal retain the replacement's original invoice identity before fiscal authorization. Serialized repeat submissions return the same authorized replacement. Pending attempts resume their persisted invoice/recipient/payment intent instead of taking a new number. A replaced original remains consumed even if its replacement is later credited; continue from that replacement when another correction is needed.

## Deliberate eligibility limits

This first circuit supports A/B/C invoices with intact source ids/amounts and VAT details, on individual reservations. Historical invoices without a provable source map, missing/currently incompatible folio sources, partial/multiple NCs, group invoices and Tourism/FCE documents remain blocked with an explanation. Their specialized fiscal/account workflows remain necessary. In particular, no account debt recipient is silently changed, no historical allocation is guessed, and no payment is annulled as part of this action.

## Validation

Disposable PostgreSQL tests use real billing routes with fictitious fiscal configuration. They cover full NC/reissue, advance reapplication, unchanged reservation/payment evidence, no new income, simultaneous submissions yielding one replacement, dated nightly sources, wrong reservation ownership, partial-NC rejection and fiscal permissions. Unit tests cover proof validity, pending/full/partial credit states, missing mappings/VAT/amounts, source capacity and correction chains. Frontend tests cover gating, prefilled recipient, exact full-NC request, blocked historical invoices, links and cancellation; existing billing recovery and reservation form regressions are included.

## Cuenta Corriente

A/B/C invoices may be corrected when one positive, unvoided account cargo is proven by the same durable links used by NC reconciliation. Missing or ambiguous links stay blocked before issuing a fiscal NC. The full NC credits the original account through the existing reconciler. The replacement requires an existing destination account, explicit confirmation and a matching recipient document. Mixed cash/CC invoices retain their original CC amount and only reapply proven released cash advances; uncovered cash prevents issuance.

The destination is persisted in the fiscal operation settlement before authorization. Reconciliation creates exactly one replacement account cargo with the operation reference, without creating or annulling reservation payments or cash receipts. Pending fiscal/ledger work resumes the frozen destination; retries verify an existing debit rather than duplicating it. The original account and destination are shown before confirmation. This does not move historical collections between accounts or refund money.

# Reservation invoice: payment method correction

A reservation invoice can point to a receipt through `sales_invoices.payment_id`
or the payment's parsed `invoice_ref.id`. Such receipts use
`cash_movements.source_type = reservation`; the legacy invoice editor only
searched `source_type = comprobante` and incorrectly described the missing
legacy link as possibly CC/credit, even when a reservation receipt existed.

The fallback now requires one explicitly linked, active, full-value payment,
one cash income and one non-voided folio payment, all belonging to the same
reservation. It also supports one full-value reapplication after reconciled NCs:
original invoice fully credited, matching issued/reconciled NC totals, exactly
one application in payment history, and an independently completed invoice intent
for that same payment and amount. Original invoice, NC and invoice_ref remain
unchanged. Explicit release overrides must release the whole payment.

Mismatched amounts/methods, ambiguous links, group payments, partial/shared or
unreconciled credit, funding-managed scopes and closed shifts remain blocked.
No match by guest, room or amount is allowed.

The transaction locks the reservation, shifts, folio, payments and invoices,
using Reception's folio-invoice advisory lock. It corrects classification on
payment, cash, folio movement and invoice together. Receipt id/number, date,
shift, amount, payment identity, invoice identity/CAE, invoice_ref and balances
are retained. The unique receipt-per-payment constraint stays unchanged.
Zero-value folio and reservation-history entries record the original and new
method, operator and cash identity. Repeating the same method is a no-op apart
from synchronizing invoice presentation. Legacy invoice-owned receipts continue
through their previous path.

Validation: 26 real PostgreSQL tests on the explicitly disposable local database,
including credit→debit for both link types, same-method and concurrent retries,
rollback, closed shift, missing cash, mismatched amount, credit/shared settlement,
CC, voided folio payment and absent linkage. Reapplication tests additionally
verify both legacy ratio-based and explicit full releases, retained original/NC
records, idempotence, rollback, missing or pending NC, mismatched applications,
wrong payment intent, partially credited origin and invalid/restored release. No operational invoice or receipt was
read or changed by these tests.

Reported case: room 1101, FA 0005-00000080 → NC → FA 0005-00000084, 163500 ARS. Its exact operational
payment linkage / shift state remains unverified: available credentials provide
Railway deployment/log access, not an authenticated hotel database session.

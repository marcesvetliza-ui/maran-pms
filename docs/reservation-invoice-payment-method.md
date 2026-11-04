# Reservation invoice: payment method correction

A reservation invoice can point to a receipt through `sales_invoices.payment_id`
or the payment's parsed `invoice_ref.id`. Such receipts use
`cash_movements.source_type = reservation`; the legacy invoice editor only
searched `source_type = comprobante` and incorrectly described the missing
legacy link as possibly CC/credit, even when a reservation receipt existed.

The fallback now requires one explicitly linked, active, full-value payment,
one cash income and one non-voided folio payment, all belonging to the same
reservation. It refuses mismatched amounts/methods, ambiguous links, group
payments, credit releases/reapplications, pending reconciliation, funding-managed
scopes, and closed shifts. No match by guest, room or amount is allowed.

The transaction locks the reservation, shifts, folio, payments and invoices,
using Reception's folio-invoice advisory lock. It corrects classification on
payment, cash, folio movement and invoice together. Receipt id/number, date,
shift, amount, payment identity, invoice identity/CAE, invoice_ref and balances
are retained. The unique receipt-per-payment constraint stays unchanged.
Zero-value folio and reservation-history entries record the original and new
method, operator and cash identity. Repeating the same method is a no-op apart
from synchronizing invoice presentation. Legacy invoice-owned receipts continue
through their previous path.

Validation: 12 real PostgreSQL tests on the explicitly disposable local database,
including credit→debit for both link types, same-method and concurrent retries,
rollback, closed shift, missing cash, mismatched amount, credit/shared settlement,
CC, voided folio payment and absent linkage. No operational invoice or receipt was
read or changed by these tests.

Reported case: room 1101, FA 0005-00000080, 163500 ARS. Its exact operational
payment linkage / shift state remains unverified: available credentials provide
Railway deployment/log access, not an authenticated hotel database session.

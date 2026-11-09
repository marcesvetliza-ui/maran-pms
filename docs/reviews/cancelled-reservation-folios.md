# Cancelled reservation folios

Cancellation closes an existing open reservation folio in the cancellation transaction. Manual cancellation, Channex status updates and group cancellation use the same archival helper. An ensure/PDF request cannot create a new open folio for a cancelled reservation. Invoiced folios retain their invoiced status.

Closing only records status, closing time and actor. It does not reverse lodging, remove payments, issue credits, change fiscal documents or zero a historical balance. The reservation list labels the original lodging plus extras minus payments as a historical reference for cancelled reservations.

## Existing records: read-only review

No startup migration or bulk production update is included. Review the affected folios before any historical cleanup. This query reads identifiers and amounts without guest details:

```sql
SELECT f.id AS folio_id, f.entity_id AS reservation_id,
       f.status, f.total_charges, f.total_payments, f.balance
FROM folios f
JOIN reservations r ON r.id = f.entity_id
WHERE f.entity_type = 'reservation'
  AND r.status = 'cancelled' AND f.status = 'open'
ORDER BY f.id;
```

Historical financial reconciliation remains separate from operational archival. A cancelled reservation with money collected may require a refund or credit review; cancellation alone does not authorize either.

## Local verification

- Six PostgreSQL lifecycle tests cover preservation of financial movements and totals, manual and generic cancellation, lazy creation, rollback, concurrency and invoiced folios.
- Twelve existing reservation history tests and 28 Channex inbound tests passed against the disposable local test database.
- TypeScript verification passed.

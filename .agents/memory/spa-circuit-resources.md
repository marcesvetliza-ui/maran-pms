---
name: SPA circuit resources
description: Durable financial and availability rules for SPA circuits that use Sauna or Hidromasaje
---

Circuit resources are child reservations of one principal SPA appointment. They must share the principal guest and never create separate treatments, accounts, or charges; the circuit price remains the only financial source.

**Why:** Circuit descriptions are not reliable operational data, and treating each resource as a separate turn would duplicate charges and fragment the guest's folio. Explicit templates provide defaults while allowing staff to adjust the actual resource and start time when booking.

**How to apply:** Any create, edit, reactivation, cancellation, or deletion flow must keep child reservations synchronized with the parent. Availability checks must include both principal cabin occupations and child resource occupations, and must lock all date/cabin pairs transactionally before writing.
# Applying a package to an existing nightly reservation

The general editor disabled its package selector for every nightly_v1 reservation. Applying a package now uses the existing nightly preview/apply endpoints with `edit.kind=package`, the saved pricing revision, a reason and a reviewed package total.

The server selects the stored category price (or package base price), validates active status, stay dates and duration, and distributes the total in exact cents across the existing nights. A changed catalog total requires another review. Dates, payments, cash movements, invoices and ancillary charges are preserved; existing fiscal/closed-reservation/permission checks still apply. Vouchers require review through their own workflow before conversion. A duration mismatch directs the operator to Modify Stay first.

The conversion clears the previous rate plan/discount and records the package marker in notes, consistent with existing package bookings. It does not generate service redemptions or additional charges. Audit history includes package id/name/total, previous and new nightly values, actor, reason and revision. The editor shows the current package and preserves unsaved notes when applying it independently of the general Save Changes action.

Validation: 27 PostgreSQL pricing-route tests (including conversion, unchanged financial records, stale revision, fiscal block and catalog-change rejection), 8 package calculation tests, 10 frontend tests including the parent form's subsequent general save. Type checking and production build are required before publication.

# Catalog archival with stock and recipe references

The explicit item deactivation action now permits an authorized catalog operator (including `resp_deposito`) to archive an item despite balances, recipes, SPA supplies, open counts or pending operations. A reason remains mandatory. The item becomes inactive and leaves the default Active list; the database row, quantities, warehouse balances, recipes, pending jobs and movement history are retained.

The dedicated route holds the item lock and uses a trusted storage option inside the same audited transaction. Audit details capture dependencies, warehouse quantities, before/after metadata and preservation flags. Public metadata updates still cannot deactivate an item, and other internal callers retain the strict dependency guard. Warehouse deactivation rules are unchanged.

Inactive items remain prohibited for new movements/consumptions. Existing recipe/supply links and queued work must be corrected deliberately before retrying; archival does not silently unlink recipes, cancel jobs, move stock to another item or zero balances.

Validation: 17 PostgreSQL lifecycle tests, including the exact combination of recipe + global/warehouse balance + pending consumption under the warehouse manager role, permission/reason checks, unchanged quantities/references/jobs, audited dependencies and rejection of new movements. Three frontend tests include the deactivation dialog, mandatory reason, successful request and removal from the Active list. Type checking and production build passed.

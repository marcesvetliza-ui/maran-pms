import { AsyncLocalStorage } from "node:async_hooks";
import { pool } from "./db";
import { withInvoiceAdvisoryLock } from "./billing/invoiceAdvisoryLock";
const held = new AsyncLocalStorage<boolean>();
/** Same existing inventory mutex, reentrant only within its owning async task.
 * Multi-room channel operations keep it until their whole transaction commits. */
export function withLodgingInventoryMutationLock<T>(run: () => Promise<T>): Promise<T> {
  return held.getStore() ? run() : withInvoiceAdvisoryLock(pool, "lodging-inventory-mutations", () => held.run(true, run));
}

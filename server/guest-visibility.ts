import { ilike, isNull, not, or } from "drizzle-orm";
import { guests } from "@shared/schema";

/** Group placeholders are reservation owners, not directory guests. */
export function visibleGuestCondition() {
  return or(isNull(guests.codigo), not(ilike(guests.codigo, "GROUP-%")));
}
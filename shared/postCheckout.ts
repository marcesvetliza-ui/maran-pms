import { unitParent } from "./chargeUnits";

/** A stable source identity distinguishes new consumption from historical lodging. */
export const POST_CHECKOUT_CHARGE_PREFIX = "post-checkout:";
export const isPostCheckoutCharge = (id: unknown): id is string =>
  typeof id === "string" && (unitParent(id) || id).startsWith(POST_CHECKOUT_CHARGE_PREFIX);

import { z } from "zod";
import {
  inclusionRulesSchema,
  type InclusionRule,
} from "./hospitalityInclusions";

export const chargeInclusionRulesSchema = inclusionRulesSchema.refine(
  (rules) => rules.every((rule) => rule.basis === "stay"),
  "Los cargos habilitan servicios por unidad vendida.",
);
export function roomChargeInclusions(
  rules: InclusionRule[] | null | undefined,
  units: number,
) {
  if (!Number.isInteger(units) || units < 1 || units > 10000)
    throw new Error("Revisá la cantidad del cargo.");
  return chargeInclusionRulesSchema.parse(rules || []).map((rule) => {
    const quantity = rule.quantity * units;
    if (quantity > 10000)
      throw new Error("La cantidad de servicios supera el máximo permitido.");
    return { ...rule, quantity };
  });
}
export const roomChargeSaleSchema = z
  .object({
    reservationId: z.string().min(1).max(100),
    chargeTypeId: z.string().min(1).max(100),
    description: z.string().trim().min(1).max(500),
    amount: z.string().regex(/^\d{1,8}(?:\.\d{1,2})?$/),
    category: z.enum(["restaurant","spa","minibar","otros","room"]),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    quantity: z.number().int().min(1).max(10000),
    isRecurring: z.boolean().optional(),
    unitAmount: z
      .string()
      .regex(/^\d{1,8}(?:\.\d{1,2})?$/)
      .optional(),
    hospitalityRequestId: z.string().uuid(),
    hospitalityExpectedRules: chargeInclusionRulesSchema,
  })
  .strict();

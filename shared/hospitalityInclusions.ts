import { z } from "zod";

export const inclusionAreas = ["restaurant", "spa", "reception"] as const;
export const inclusionAreaLabels = {
  restaurant: "Restaurant",
  spa: "SPA",
  reception: "Recepción",
};
export const inclusionRuleSchema = z
  .object({
    id: z.string().uuid(),
    area: z.enum(inclusionAreas),
    service: z.string().trim().min(2).max(160),
    quantity: z.number().int().min(1).max(100),
    basis: z.enum(["stay", "person", "night", "person_night"]),
    conditions: z.string().trim().max(600).default(""),
    readyWhen: z.enum(["arrival", "spa_completed", "coordinate"]),
  })
  .strict();
export const inclusionRulesSchema = z
  .array(inclusionRuleSchema)
  .max(20)
  .superRefine((rules, ctx) => {
    if (new Set(rules.map((r) => r.id)).size !== rules.length)
      ctx.addIssue({ code: "custom", message: "Hay servicios repetidos." });
  });
export type InclusionRule = z.infer<typeof inclusionRuleSchema>;
export const inclusionBasisLabels = {
  stay: "Por estadía / turno",
  person: "Por persona",
  night: "Por noche",
  person_night: "Por persona y noche",
};
export const inclusionReadyLabels = {
  arrival: "Al ingresar",
  spa_completed: "Al completar SPA",
  coordinate: "A coordinar",
};
export const inclusionActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("acknowledge"),
      version: z.number().int().positive(),
      requestId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal("schedule"),
      version: z.number().int().positive(),
      requestId: z.string().uuid(),
      date: z.string().datetime({ offset: true }),
      note: z.string().trim().min(3).max(600),
    })
    .strict(),
  z
    .object({
      action: z.literal("fulfill"),
      version: z.number().int().positive(),
      requestId: z.string().uuid(),
      quantity: z.number().int().positive().max(10000),
      note: z.string().trim().min(3).max(600),
    })
    .strict(),
]);
export type IncludedService = {
  id: string;
  sourceId: string;
  area: (typeof inclusionAreas)[number];
  service: string;
  conditions: string;
  readyWhen: InclusionRule["readyWhen"];
  serviceDate: string;
  validUntil: string;
  quantity: number;
  used: number;
  remaining: number;
  version: number;
  cancelled: boolean;
  needsReview: boolean;
  scheduledAt: string | null;
  acknowledgedAt: string | null;
  note: string;
  sourceKind: "reservation" | "spa_appointment" | "spa_sale" | "supplement";
  sourceTitle: string;
  person: string;
  room: string | null;
  reservationId: string | null;
  present: boolean;
  ready: boolean;
  sourceStatus: string;
  upcoming: boolean;
};
export function allowedInclusionAreas(role: string) {
  if (
    [
      "admin",
      "manager",
      "reception",
      "jefe_recepcion",
      "comercial",
      "responsable_area",
    ].includes(role)
  )
    return [...inclusionAreas];
  return role === "spa"
    ? (["spa"] as const)
    : role === "restaurant"
      ? (["restaurant"] as const)
      : [];
}

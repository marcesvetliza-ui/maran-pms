import { z } from "zod";

export const kitchenPrintingSchema = z.object({
  restaurant: z.boolean(),
  spaJusto: z.boolean(),
}).strict();
export type KitchenPrintingSettings = z.infer<typeof kitchenPrintingSchema>;
export const kitchenPrintingKey = "kitchen_printing_controls_v1";
export function readKitchenPrinting(value?: string | null): KitchenPrintingSettings {
  try {
    const result = kitchenPrintingSchema.safeParse(JSON.parse(value || "null"));
    if (result.success) return result.data;
  } catch { /* Missing or corrupt configuration always disables printing. */ }
  return { restaurant: false, spaJusto: false };
}

import { z } from "zod";

export const groupOccupantReplacementSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, "Ingresá un motivo de al menos 5 caracteres.")
    .max(1000, "El motivo admite hasta 1000 caracteres."),
  confirmPreserveStay: z.literal(true, {
    errorMap: () => ({
      message:
        "Confirmá que la estadía y sus pagos se conservan para el nuevo huésped.",
    }),
  }),
});

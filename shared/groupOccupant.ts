import { z } from "zod";

export const groupOccupantReplacementSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Ingresá un motivo de al menos 10 caracteres.")
    .max(1000, "El motivo admite hasta 1000 caracteres."),
  confirmPreserveStay: z.literal(true, {
    errorMap: () => ({
      message:
        "Confirmá que la estadía y sus pagos se conservan para el nuevo huésped.",
    }),
  }),
});

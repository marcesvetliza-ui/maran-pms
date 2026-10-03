import { z } from "zod";

const requiredText = (max: number) => z.string().trim().min(1, "Campo obligatorio").max(max);

export const lostFoundShippingSchema = z.object({
  fullName: requiredText(200),
  address: requiredText(300),
  province: requiredText(150),
  postalCode: requiredText(30),
  city: requiredText(150),
  country: requiredText(150),
  paymentStatus: z.enum(["pagado", "no_pagado"]),
});

export type LostFoundShippingDetails = z.infer<typeof lostFoundShippingSchema>;

export const lostFoundStatusUpdateSchema = z.object({
  status: z.enum(["en_custodia", "contactado", "entregado", "descartado"]),
  claimedBy: z.string().trim().max(200).optional(),
  claimedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  deliveryType: z.enum(["retiro_hotel", "envio"]).optional(),
  deliveredBy: z.string().trim().max(200).optional(),
  notes: z.string().max(5000).optional(),
  shippingDetails: lostFoundShippingSchema.nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.status === "entregado" && data.deliveryType === "envio" && !data.shippingDetails) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["shippingDetails"], message: "Completá los datos del envío" });
  }
});

export type LostFoundStatusUpdate = z.infer<typeof lostFoundStatusUpdateSchema>;
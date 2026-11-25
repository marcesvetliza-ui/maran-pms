import { z } from "zod";
const validCalendarDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number),
    date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
};

export const eventMoney = z
  .string()
  .regex(/^\d{1,8}(\.\d{1,2})?$/, "Ingresá un importe válido");
export function cents(value: string | number): number {
  const text = String(value);
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(text)) throw new Error("Importe inválido");
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
export const money = (value: number) => (value / 100).toFixed(2);
export const restaurantEventInput = z
  .object({
    operationId: z.string().uuid(),
    name: z.string().trim().min(2, "Ingresá el nombre del evento").max(120),
    description: z
      .string()
      .trim()
      .min(2, "Describí qué incluye el evento")
      .max(3000),
    areaId: z.string().min(1, "Elegí un salón"),
    date: z.string().refine(validCalendarDate, "Fecha inválida"),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    capacity: z.number().int().min(1).max(2000),
    adultPrice: eventMoney,
    childPrice: eventMoney,
    menu: z
      .array(
        z
          .object({
            menuItemId: z.string().min(1),
            audience: z.enum(["adult", "child", "all"]),
            quantity: z.number().int().min(1).max(20),
          })
          .strict(),
      )
      .min(1, "Agregá al menos un producto al menú")
      .max(100),
  })
  .strict()
  .refine(
    (x) => x.endTime !== x.time,
    "Indicá horarios diferentes de inicio y cierre",
  );
export const eventBookingInput = z
  .object({
    operationId: z.string().uuid(),
    guestName: z
      .string()
      .trim()
      .min(2, "Ingresá el nombre del titular")
      .max(150),
    guestPhone: z
      .string()
      .trim()
      .min(3, "Ingresá un teléfono de contacto")
      .max(50),
    guestEmail: z.string().email().or(z.literal("")).default(""),
    adults: z.number().int().min(0).max(2000),
    children: z.number().int().min(0).max(2000),
    notes: z.string().trim().max(2000).default(""),
  })
  .strict()
  .refine((x) => x.adults + x.children > 0, "Indicá los comensales");
export const eventAdvanceInput = z
  .object({
    operationId: z.string().uuid(),
    amount: eventMoney.refine((x) => cents(x) > 0),
    method: z.enum([
      "efectivo",
      "transferencia",
      "tarjeta_debito",
      "tarjeta_credito",
      "mercadopago",
    ]),
    receiptType: z.enum(["ticket", "FB"]),
    dni: z
      .string()
      .regex(/^\d{6,10}$/)
      .or(z.literal(""))
      .default(""),
    notes: z.string().trim().max(500).default(""),
  })
  .strict()
  .refine(
    (x) => x.receiptType === "FB" || x.method === "efectivo",
    "Para cobrar por otro medio elegí Factura B",
  );
export const eventAssignmentInput = z
  .object({
    operationId: z.string().uuid(),
    tableIds: z
      .array(z.string().min(1))
      .max(100)
      .refine((x) => new Set(x).size === x.length, "No repitas mesas"),
  })
  .strict();
export type RestaurantEventInput = z.infer<typeof restaurantEventInput>;
export type EventBookingInput = z.infer<typeof eventBookingInput>;
export type EventAdvanceInput = z.infer<typeof eventAdvanceInput>;
export type EventAssignmentInput = z.infer<typeof eventAssignmentInput>;

import { z } from "zod";
export const availabilityLabels: Record<string, string> = {
  working: "Trabaja",
  day_off: "Franco",
  absent: "Ausente",
};
export const shiftLabels: Record<string, string> = {
  morning: "Mañana",
  afternoon: "Tarde",
  night: "Noche",
  split: "Cortado",
  custom: "Otro horario",
};
const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .nullable();
export const availabilitySchema = z
  .object({
    status: z.enum(["working", "day_off", "absent"]),
    shift: z
      .enum(["morning", "afternoon", "night", "split", "custom"])
      .nullable(),
    startTime: time,
    endTime: time,
    notes: z.string().trim().max(500),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.status === "working" &&
      (!!v.startTime !== !!v.endTime ||
        (v.startTime && v.startTime === v.endTime))
    )
      ctx.addIssue({
        code: "custom",
        message: "Completá ambos horarios; deben ser distintos.",
      });
  });
export type StaffAvailability = z.infer<typeof availabilitySchema> & {
  userId: string;
  fullName: string;
  updatedAt?: string;
  taskCount?: number;
};
export function availabilityDescription(v?: StaffAvailability) {
  if (!v) return "Sin completar";
  return [
    availabilityLabels[v.status],
    v.status === "working" && v.shift ? shiftLabels[v.shift] : "",
    v.status === "working" && v.startTime
      ? `${v.startTime}–${v.endTime}${v.endTime! < v.startTime ? " (día siguiente)" : ""}`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

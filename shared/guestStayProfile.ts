import { z } from "zod";

const text = z.string().trim().max(150);
const id = z.string().min(1).max(100);
const birthDate = z.string().refine(value => {
  if (!value) return true;
  const date = new Date(`${value}T12:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value && value <= new Date().toISOString().slice(0,10);
}, "Fecha de nacimiento inválida");
export const vehicleSchema = z.object({ id, plate: text.min(1), brand: text.default(""), model: text.default(""), color: text.default("") }).strict();
export const familyMemberSchema = z.object({ id, firstName: text.min(1).max(100), lastName: text.min(1).max(100), relationship: text.default(""), documentType: text.max(20).default("DNI"), documentNumber: text.max(50).default(""), dateOfBirth: birthDate.default(""), nationality: text.max(100).default("") }).strict();
export const petSchema = z.object({ id, name: text.min(1), species: text.min(1), notes: z.string().trim().max(500).default("") }).strict();
export const guestStayProfileSchema = z.object({ vehicles: z.array(vehicleSchema).max(10), family: z.array(familyMemberSchema).max(30), pets: z.array(petSchema).max(10) }).strict().superRefine((profile, context) => {
  for (const key of ["vehicles", "family", "pets"] as const) {
    if (new Set(profile[key].map(row => row.id)).size !== profile[key].length) context.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: "Hay registros duplicados" });
  }
  const documents = profile.family.filter(row => row.documentNumber).map(row => `${row.documentType.toLowerCase()}:${row.documentNumber.replace(/\s/g, "").toLowerCase()}`);
  if (new Set(documents).size !== documents.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["family"], message: "Hay familiares con el mismo documento" });
});
export type GuestStayProfile = z.infer<typeof guestStayProfileSchema>;
export type FamilyMember = GuestStayProfile["family"][number];
export const emptyStayProfile = (): GuestStayProfile => ({ vehicles: [], family: [], pets: [] });
export type StaySelection = GuestStayProfile & { version: number; guestId: string };
export type StayDetailsView = StaySelection & { numberOfGuests: number; companionCount: number };
export function getGuestStayProfile(guest?: { stayProfile?: GuestStayProfile | null; vehiculoPatente?: string | null; vehiculoMarca?: string | null; vehiculoModelo?: string | null; vehiculoColor?: string | null } | null): GuestStayProfile {
  if (guest?.stayProfile) return guest.stayProfile;
  return { ...emptyStayProfile(), vehicles: guest?.vehiculoPatente ? [{ id: "legacy-vehicle", plate: guest.vehiculoPatente, brand: guest.vehiculoMarca || "", model: guest.vehiculoModelo || "", color: guest.vehiculoColor || "" }] : [] };
}
export function mergeStayProfiles(saved: GuestStayProfile, additions: GuestStayProfile): GuestStayProfile {
  return guestStayProfileSchema.parse(Object.fromEntries((["vehicles", "family", "pets"] as const).map(key => [key, [...saved[key], ...additions[key].filter(row => !saved[key].some(existing => existing.id === row.id))]])));
}

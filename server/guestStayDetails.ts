import type { Express } from "express";
import { z } from "zod";
import { sql, eq } from "drizzle-orm";
import { db, withDatabaseTransaction } from "./db";
import { guests, reservations, reservationCompanions } from "@shared/schema";
import { emptyStayProfile, getGuestStayProfile, guestStayProfileSchema, mergeStayProfiles, type StaySelection } from "@shared/guestStayProfile";
import { requireAuth, requirePermission } from "./auth";

export const staySelectionRequestSchema = z.object({ guestId: z.string().min(1), version: z.number().int().nonnegative(), selection: guestStayProfileSchema, remember: guestStayProfileSchema.optional() }).strict();
function conflict(message: string, statusCode = 409) { return Object.assign(new Error(message), { statusCode }); }

export async function readStayDetails(reservationId: string): Promise<StaySelection> {
  const [reservation] = await db.select().from(reservations).where(eq(reservations.id, reservationId));
  if (!reservation) throw conflict("Reserva no encontrada", 404);
  const companions = await db.select().from(reservationCompanions).where(eq(reservationCompanions.reservationId, reservationId));
  const saved = reservation.stayDetails;
  return { ...emptyStayProfile(), ...saved, guestId: reservation.guestId, version: saved?.version || 0,
    family: companions.filter(row => row.profileMemberId).map(row => ({ id: row.profileMemberId!, firstName: row.firstName, lastName: row.lastName, documentType: row.documentType, documentNumber: row.documentNumber || "", dateOfBirth: row.dateOfBirth || "", nationality: row.nationality || "", relationship: saved?.family.find(member => member.id === row.profileMemberId)?.relationship || "" })) };
}

export async function saveStayDetails(reservationId: string, input: unknown): Promise<StaySelection> {
  const request = staySelectionRequestSchema.parse(input);
  return withDatabaseTransaction(async () => {
    await db.execute(sql`SELECT id FROM reservations WHERE id = ${reservationId} FOR UPDATE`);
    const current = await readStayDetails(reservationId);
    if (current.guestId !== request.guestId) throw conflict("El titular cambió. Actualizá la reserva antes de seleccionar sus datos.");
    if (current.version !== request.version) throw conflict("Otra persona actualizó estos datos. Actualizá la reserva antes de guardar.");
    const existing = await db.select().from(reservationCompanions).where(eq(reservationCompanions.reservationId, reservationId));
    const selectedIds = new Set(request.selection.family.map(member => member.id));
    for (const row of existing) {
      if (row.profileMemberId && !selectedIds.has(row.profileMemberId)) await db.delete(reservationCompanions).where(eq(reservationCompanions.id, row.id));
    }
    for (const member of request.selection.family) {
      if (existing.some(row => row.profileMemberId === member.id)) continue; // Preserve this stay's edited snapshot.
      const duplicate = existing.find(row => !row.profileMemberId && member.documentNumber && row.documentNumber?.trim().toLowerCase() === member.documentNumber.trim().toLowerCase() && row.documentType.toLowerCase() === member.documentType.toLowerCase());
      if (duplicate) await db.update(reservationCompanions).set({ profileMemberId: member.id }).where(eq(reservationCompanions.id, duplicate.id));
      else await db.insert(reservationCompanions).values({ reservationId, profileMemberId: member.id, firstName: member.firstName, lastName: member.lastName, documentType: member.documentType, documentNumber: member.documentNumber || null, dateOfBirth: member.dateOfBirth || null, nationality: member.nationality || null });
    }
    const details = { ...request.selection, guestId: current.guestId, version: current.version + 1 };
    await db.update(reservations).set({ stayDetails: details }).where(eq(reservations.id, reservationId));
    if (request.remember && Object.values(request.remember).some(rows => rows.length > 0)) {
      await db.execute(sql`SELECT id FROM guests WHERE id = ${current.guestId} FOR UPDATE`);
      const [guest] = await db.select().from(guests).where(eq(guests.id, current.guestId));
      if (!guest) throw conflict("Huésped no encontrado", 404);
      const stayProfile = mergeStayProfiles(getGuestStayProfile(guest), request.remember);
      const vehicle = stayProfile.vehicles[0];
      await db.update(guests).set({ stayProfile, vehiculoPatente: vehicle?.plate || null, vehiculoMarca: vehicle?.brand || null, vehiculoModelo: vehicle?.model || null, vehiculoColor: vehicle?.color || null }).where(eq(guests.id, current.guestId));
    }
    return readStayDetails(reservationId);
  });
}

export function registerGuestStayRoutes(app: Express) {
  app.get("/api/reservations/:id/stay-details", requireAuth, requirePermission("sidebar:/reservations"), async (req, res) => {
    try { res.json(await readStayDetails(req.params.id)); }
    catch (error: any) { res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : "No se pudieron cargar los datos de la estadía." }); }
  });
  app.put("/api/reservations/:id/stay-details", requireAuth, requirePermission("sidebar:/reservations"), async (req, res) => {
    try { res.json(await saveStayDetails(req.params.id, req.body)); }
    catch (error: any) { res.status(error instanceof z.ZodError ? 400 : error.statusCode || 500).json({ error: error instanceof z.ZodError ? "Revisá los datos: nombres, patente y tipo de mascota son obligatorios; las fechas deben ser válidas." : error.statusCode ? error.message : "No se pudieron guardar los datos de la estadía." }); }
  });
}

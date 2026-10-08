import type { Express } from "express";
import { eq, and, sql } from "drizzle-orm";
import { storage } from "../db-storage";
import { db, withDatabaseTransaction } from "../db";
import { requireAuth, requirePermission } from "../auth";
import {
  guests,
  reservations,
  groupReservationLinks,
  insertGuestSchema,
  reservationChangelog,
} from "@shared/schema";

export function registerGroupOccupantRoutes(app: Express) {
  app.patch(
    "/api/groups/:groupId/reservations/:reservationId/occupant",
    requireAuth,
    requirePermission("sidebar:/groups"),
    async (req, res) => {
      try {
        const { guestId, newGuest } = req.body;
        if ((typeof guestId === "string" && !!guestId.trim()) === !!newGuest)
          return res
            .status(400)
            .json({
              error: "Elegí un huésped existente o registrá uno nuevo.",
            });
        const parsed = newGuest ? insertGuestSchema.safeParse(newGuest) : null;
        if (
          parsed &&
          (!parsed.success ||
            !parsed.data.firstName.trim() ||
            !parsed.data.lastName.trim())
        )
          return res
            .status(400)
            .json({
              error:
                "Revisá los datos del nuevo huésped: nombre y apellido son obligatorios.",
            });
        const result = await withDatabaseTransaction(async () => {
          // Guest-only assignment: no room, tariff, folio or inventory fields are updated.
          const [reservation] = await db
            .select()
            .from(reservations)
            .where(eq(reservations.id, req.params.reservationId))
            .for("update");
          const [link] = await db
            .select()
            .from(groupReservationLinks)
            .where(
              and(
                eq(groupReservationLinks.groupId, req.params.groupId),
                eq(
                  groupReservationLinks.reservationId,
                  req.params.reservationId,
                ),
              ),
            )
            .for("update");
          if (!reservation || !link)
            throw Object.assign(
              new Error("La reserva no pertenece a este grupo."),
              { statusCode: 404 },
            );
          let guest;
          if (parsed?.success) {
            const data = parsed.data;
            const documentNumber = data.documentNumber?.trim();
            if (documentNumber) {
              await db.execute(
                sql`SELECT pg_advisory_xact_lock(hashtext(${"guest-document:" + documentNumber}))`,
              );
              const [existing] = await db
                .select()
                .from(guests)
                .where(sql`BTRIM(${guests.documentNumber}) = ${documentNumber}`)
                .limit(1);
              if (existing)
                throw Object.assign(
                  new Error(
                    `El documento ${documentNumber} ya está asociado a ${existing.lastName}, ${existing.firstName}. Usá Buscar existente.`,
                  ),
                  { statusCode: 409 },
                );
            }
            guest = await storage.createGuest({
              ...data,
              firstName: data.firstName.trim(),
              lastName: data.lastName.trim(),
              documentNumber: documentNumber || null,
              active: true,
            });
          } else {
            [guest] = await db
              .select()
              .from(guests)
              .where(eq(guests.id, guestId))
              .for("share");
            if (
              !guest ||
              !guest.active ||
              guest.codigo?.toUpperCase().startsWith("GROUP-")
            )
              throw Object.assign(
                new Error("Seleccioná un huésped activo del catálogo."),
                { statusCode: 400 },
              );
          }
          const [updated] = await db
            .update(reservations)
            .set({ guestId: guest.id })
            .where(eq(reservations.id, reservation.id))
            .returning();
          if (reservation.guestId !== guest.id)
            await db
              .insert(reservationChangelog)
              .values({
                reservationId: reservation.id,
                operador: req.user?.username || req.user?.id,
                tipo: "guest_assignment",
                descripcion: `Huésped asignado: ${guest.lastName} ${guest.firstName} (${guest.id}). Anterior: ${reservation.guestId}.`,
              });
          return { reservation: updated, guest };
        });
        res.json(result);
      } catch (error: any) {
        if (error.code === "23505")
          return res
            .status(409)
            .json({
              error:
                "El documento ya está asociado a otro huésped. Usá Buscar existente.",
            });
        if (!error.statusCode)
          console.error("Error assigning group occupant", error);
        res
          .status(error.statusCode || 500)
          .json({
            error: error.statusCode
              ? error.message
              : "No se pudo asignar el huésped. No se guardaron cambios.",
          });
      }
    },
  );
}

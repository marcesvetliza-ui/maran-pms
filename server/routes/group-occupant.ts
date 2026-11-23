import type { Express } from "express";
import { eq, sql } from "drizzle-orm";
import { storage } from "../db-storage";
import { db, withDatabaseTransaction } from "../db";
import { requireAuth, requirePermission } from "../auth";
import { inspectGroupAssignment, assignmentError } from '../groupAssignmentRelease';
import { withReservationFinancialLock } from '../nightlyPricingGuard';
import { withLodgingInventoryMutationLock } from '../inventoryMutationLock';
import { withReviewedGroupGuestReplacement } from '../groupGuestReplacement';
import {
  guests,
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
        const result = await withReservationFinancialLock(req.params.reservationId, () => withLodgingInventoryMutationLock(() => withDatabaseTransaction(async () => {
          const state = await inspectGroupAssignment(req.params.groupId, req.params.reservationId, true);
          const reservation = state.reservation;
          if (state.replacementBlockers.length) throw assignmentError(state.replacementBlockers[0]);
          if (req.body.expectedGuestId !== reservation.guestId) throw assignmentError('El ocupante cambió o la pantalla está desactualizada. Recargá la pantalla y volvé a abrir la asignación.');
          if (req.body.fingerprint && req.body.fingerprint !== state.fingerprint) throw assignmentError('La reserva o sus anticipos cambiaron. Actualizá la vista previa.');
          if (state.personal.length && req.body.confirmPersonalAdvances !== true) throw assignmentError('Confirmá expresamente que los anticipos personales se conservan para el reemplazo en esta reserva.');
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
          const updated = await withReviewedGroupGuestReplacement(reservation.id, () => storage.updateReservation(reservation.id, { guestId: guest.id }));
          if (reservation.guestId !== guest.id)
            await db
              .insert(reservationChangelog)
              .values({
                reservationId: reservation.id,
                operador: req.user?.username || req.user?.id,
                tipo: "guest_assignment",
                descripcion: `Huésped asignado: ${guest.lastName} ${guest.firstName} (${guest.id}). Anterior: ${state.guest?.lastName || ''} ${state.guest?.firstName || ''} (${reservation.guestId}). Se conservan habitación, fechas, tarifa y cupo.${state.personal.length ? ' Traspaso al reemplazo de anticipos personales expresamente confirmado.' : ''}`,
              });
          return { reservation: updated, guest };
        })));
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

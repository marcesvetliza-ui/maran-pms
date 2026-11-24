import type { Express } from "express";
import { and, eq, sql } from "drizzle-orm";
import { requireAuth, requirePermission } from "../auth";
import {
  db,
  withDatabaseTransaction,
  withReadOnlyDatabaseTransaction,
} from "../db";
import { withReservationFinancialLock } from "../nightlyPricingGuard";
import {
  guests,
  reservations,
  reservationCompanions,
  reservationChangelog,
  auditLogs,
} from "@shared/schema";
import {
  holderCorrectionSchema,
  type HolderCorrectionPreview,
} from "@shared/reservationHolderCorrection";

const fail = (message: string, statusCode = 409) =>
  Object.assign(new Error(message), { statusCode });
const documentKey = (type?: string | null, number?: string | null) =>
  number?.trim()
    ? `${(type || "DNI").toLowerCase()}:${number.replace(/\s/g, "").toLowerCase()}`
    : null;

async function inspect(id: string) {
  const [reservation] = await db
    .select()
    .from(reservations)
    .where(eq(reservations.id, id));
  if (!reservation) throw fail("Reserva no encontrada.", 404);
  const [guest] = await db
    .select()
    .from(guests)
    .where(eq(guests.id, reservation.guestId));
  const companions = await db
    .select()
    .from(reservationCompanions)
    .where(eq(reservationCompanions.reservationId, id));
  const facts = (
    await db.execute(sql`SELECT
    EXISTS(SELECT 1 FROM group_reservation_links WHERE reservation_id=${id}) AS grouped,
    (EXISTS(SELECT 1 FROM billing_operations WHERE owner_type='reservation' AND owner_id=${id} AND stage IN ('submitting','uncertain'))
     OR EXISTS(SELECT 1 FROM sales_invoices WHERE reserva_id=${id} AND estado='autorizacion_pendiente')) AS billing_pending`)
  ).rows[0] as any;
  const blockers: string[] = [];
  if (reservation.status !== "checked_in")
    blockers.push(
      "Esta corrección requiere una estadía con check-in activo. No se modifican estadías cerradas ni se reemplaza el circuito previo al ingreso.",
    );
  if (!guest)
    blockers.push(
      "No se encontró la ficha del titular actual. Revisá la reserva antes de continuar.",
    );
  if (facts.billing_pending)
    blockers.push(
      "Hay una operación fiscal en curso o sin confirmar en esta estadía. Completala antes de corregir el titular.",
    );
  const preview: HolderCorrectionPreview = {
    reservationId: id,
    status: reservation.status,
    guest: {
      id: reservation.guestId,
      firstName: guest?.firstName || "",
      lastName: guest?.lastName || "",
    },
    groupLinked: facts.grouped,
    companionCount: companions.length,
    canCorrect: !blockers.length,
    blockers,
  };
  return { reservation, guest, companions, preview };
}

export function registerReservationHolderRoutes(app: Express) {
  const path = "/api/reservations/:id/holder-correction";
  app.get(
    path,
    requireAuth,
    requirePermission("sidebar:/reservations"),
    async (req, res) => {
      try {
        res.json(
          await withReadOnlyDatabaseTransaction(
            async () => (await inspect(req.params.id)).preview,
          ),
        );
      } catch (error: any) {
        res.status(error.statusCode || 500).json({
          error: error.statusCode
            ? error.message
            : "No se pudo consultar el titular de la estadía.",
        });
      }
    },
  );
  app.post(
    path,
    requireAuth,
    requirePermission("sidebar:/reservations"),
    async (req, res) => {
      const parsed = holderCorrectionSchema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({
          error:
            "Elegí al huésped correcto, ingresá un motivo de al menos 5 caracteres y confirmá el aviso.",
        });
      try {
        const body = parsed.data;
        const result = await withReservationFinancialLock(req.params.id, () =>
          withDatabaseTransaction(async () => {
            await db
              .select({ id: reservations.id })
              .from(reservations)
              .where(eq(reservations.id, req.params.id))
              .for("update");
            const state = await inspect(req.params.id);
            if (state.preview.blockers.length)
              throw fail(state.preview.blockers[0]);
            if (body.expectedGuestId !== state.reservation.guestId)
              throw fail(
                "El titular cambió mientras tenías abierta la ventana. Actualizá la reserva y revisá el cambio.",
              );
            if (body.guestId === state.reservation.guestId)
              throw fail("Elegí una persona distinta del titular actual.", 400);
            const [next] = await db
              .select()
              .from(guests)
              .where(eq(guests.id, body.guestId))
              .for("share");
            if (
              !next ||
              !next.active ||
              next.tipoPersona === "juridica" ||
              next.codigo?.toUpperCase().startsWith("GROUP-") ||
              !next.firstName.trim() ||
              !next.lastName.trim()
            )
              throw fail(
                "Seleccioná una ficha activa de persona física, con nombre y apellido de quien se alojó.",
                400,
              );
            const nextDocument = documentKey(
              next.documentType,
              next.documentNumber,
            );
            if (
              state.companions.some(
                (companion) =>
                  companion.guestId === next.id ||
                  (nextDocument &&
                    documentKey(
                      companion.documentType,
                      companion.documentNumber,
                    ) === nextDocument),
              )
            ) {
              throw fail(
                "La persona elegida ya figura como acompañante. Revisá ese registro antes de corregir el titular para no duplicar huéspedes.",
              );
            }
            // This explicit correction preserves the stay snapshot and every financial
            // record. Generic guest replacement still uses its original safeguards.
            const stayDetails = state.reservation.stayDetails
              ? {
                  ...state.reservation.stayDetails,
                  guestId: next.id,
                  version: (state.reservation.stayDetails.version || 0) + 1,
                }
              : null;
            await db
              .update(reservations)
              .set({
                guestId: next.id,
                stayDetails,
                lastModifiedBy: req.user!.id,
              })
              .where(
                and(
                  eq(reservations.id, req.params.id),
                  eq(reservations.guestId, body.expectedGuestId),
                ),
              );
            const beforeName =
              `${state.guest!.lastName} ${state.guest!.firstName}`.trim();
            const afterName = `${next.lastName} ${next.firstName}`.trim();
            const actor = req.user!.username || req.user!.id;
            await db.insert(reservationChangelog).values({
              reservationId: req.params.id,
              operador: actor,
              tipo: "huesped",
              descripcion: `Corrección del titular de la estadía: ${beforeName} → ${afterName}. Motivo: ${body.reason}. Se conservan habitación, fechas, tarifa, acompañantes, consumos, pagos y comprobantes. No se transfieren deudas de Cuenta Corriente.`,
            });
            await db.insert(auditLogs).values({
              userId: req.user!.id,
              userName: actor,
              action: "update",
              module: "reservations",
              entityType: "reservation",
              entityId: req.params.id,
              description: "Corrección del titular de estadía",
              details: JSON.stringify({
                previousGuestId: state.reservation.guestId,
                guestId: next.id,
                previousGuestName: beforeName,
                guestName: afterName,
                reason: body.reason,
                companionCount: state.companions.length,
              }),
              timestamp: new Date(),
            });
            return { reservationId: req.params.id, guestId: next.id };
          }),
        );
        res.json(result);
      } catch (error: any) {
        if (!error.statusCode)
          console.error("[holder-correction] No se pudo guardar la corrección");
        res.status(error.statusCode || 500).json({
          error: error.statusCode
            ? error.message
            : "No se pudo corregir el titular. No se guardaron cambios.",
        });
      }
    },
  );
}

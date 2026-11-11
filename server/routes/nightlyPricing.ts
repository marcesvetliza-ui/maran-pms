import { packageNightlyProposal, packageNotes } from "../reservationPackagePricing";
import { accommodationNights } from '@shared/accommodationNights';
import type { Express, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { storage } from "../db-storage";
import { db, withDatabaseTransaction } from "../db";
import { requireAuth, requirePermission } from "../auth";
import { canEditAccommodation } from "../accommodationPermissions";
import { accommodationFiscalStatus, withNightlyWriter, withReservationFinancialLock } from "../nightlyPricingGuard";
import { amountString, calendarNights, editNights, nightlyTotal, pricingError, type PricedNight } from "@shared/nightlyPricing";

const ratesSchema = z.object({
  kind: z.literal("rates"), dates: z.array(z.string()).min(1).max(730),
  rate: z.string().optional(), discount: z.string().optional(),
  discountMode: z.enum(["percent", "amount"]),
  discountScope: z.enum(["night", "selection"]),
});
const staySchema = z.object({
  kind: z.literal("stay"), checkIn: z.string(), checkOut: z.string(),
  addedRates: z.record(z.string()),
});
const packageSchema = z.object({kind:z.literal("package"),packageId:z.string().min(1).max(160),expectedTotalCents:z.number().int().nonnegative().optional()}).strict();
const requestSchema = z.object({
  revision: z.number().int().nonnegative(),
  reason: z.string().max(1000).optional(),
  edit: z.discriminatedUnion("kind", [ratesSchema, staySchema, packageSchema]),
  overrideTentativeGroupWarning: z.boolean().optional(),
});
function sendError(res: Response, error: any) {
  res.status(error?.statusCode || (error instanceof z.ZodError ? 400 : 500))
    .json(error?.response || { error: error instanceof z.ZodError ? "Revisá los campos de la modificación." : error?.message || "No se pudo procesar el alojamiento." });
}
async function getState(id: string) {
  const reservation = await storage.getReservation(id);
  if (!reservation) pricingError("Reserva no encontrada.", 404);
  const fiscal = await accommodationFiscalStatus(id, Math.round(Number(reservation.totalRoomAmount || 0) * 100));
  return { reservation, blocked: fiscal.blocked, fiscal };
}
async function buildProposal(id: string, input: z.infer<typeof requestSchema>) {
  const { reservation, blocked } = await getState(id);
  if (reservation.pricingScheme !== "nightly_v1" || !reservation.nightlyPricing) pricingError("Reserva anterior: conservá su circuito de precios original.", 409);
  if (blocked) pricingError(blocked, 409);
  if (["checked_out", "cancelled", "no_show"].includes(reservation.status)) pricingError("La reserva está cerrada.", 409);
  if (input.revision !== reservation.pricingRevision) pricingError("Los precios cambiaron. Actualizá el folio antes de continuar.", 409);
  const before = reservation.nightlyPricing;
  if (nightlyTotal(before) !== Math.round(Number(reservation.totalRoomAmount) * 100) ||
      calendarNights(reservation.checkInDate, reservation.checkOutDate).join(",") !== before.map(n => n.date).join(",")) pricingError("El detalle y el total no coinciden. Requiere revisión antes de editar.", 409);
  const packageProposal = input.edit.kind === "package" ? packageNightlyProposal(reservation, await storage.getPackage(input.edit.packageId), before) : null;
  if (input.edit.kind === "package" && input.edit.expectedTotalCents !== undefined && input.edit.expectedTotalCents !== packageProposal!.packageTotalCents) pricingError("El precio del paquete cambió. Volvé a revisar la propuesta.",409);
  const after = input.edit.kind === "package" ? packageProposal!.after : editNights(before, input.edit);
  const checkIn = input.edit.kind === "stay" ? input.edit.checkIn : reservation.checkInDate;
  const checkOut = input.edit.kind === "stay" ? input.edit.checkOut : reservation.checkOutDate;
  if (input.edit.kind === "stay") {
    if (reservation.status === "checked_in" && checkIn !== reservation.checkInDate) pricingError("No cambies el ingreso de una estadía ya iniciada.", 409);
    if (await storage.checkOverbooking(reservation.roomId, checkIn, checkOut, id)) pricingError("La habitación no está disponible en las fechas propuestas.", 409);
    const conflict = await storage.evaluateReservationInventory({
      roomTypeId: reservation.roomTypeId, checkInDate: checkIn, checkOutDate: checkOut,
      excludeReservationId: id, contextGroupId: (reservation as any).groupId,
    });
    if (conflict && !(conflict.code === "GROUP_BLOCK_WARNING" && input.overrideTentativeGroupWarning)) {
      throw Object.assign(new Error("Las fechas afectan el inventario de grupos. Revisá disponibilidad."), {
        statusCode: 409, response: { error: "Las fechas afectan el inventario de grupos. Revisá disponibilidad.", code: conflict.code, warning: conflict, canOverride: conflict.code === "GROUP_BLOCK_WARNING" },
      });
    }
  }
  return { before, after, checkIn, checkOut, packageProposal, revision: reservation.pricingRevision,
    previousTotalCents: nightlyTotal(before), newTotalCents: nightlyTotal(after),
    differenceCents: nightlyTotal(after) - nightlyTotal(before),
    removed: before.filter(n => !after.some(a => a.date === n.date)),
    added: after.filter(n => !before.some(a => a.date === n.date)),
    reservation,
  };
}
export function registerNightlyPricingRoutes(app: Express) {
  app.get("/api/reservations/:id/nightly-pricing", requireAuth, async (req, res) => {
    try { res.json(await getState(req.params.id)); } catch (error) { sendError(res, error); }
  });
  const writeMiddleware = [requireAuth, requirePermission("sidebar:/reservations"), async (req: Request, res: Response, next: import("express").NextFunction) => {
    try {
      if (!await canEditAccommodation(req.user!)) return res.status(403).json({ error: "No tenés permiso para editar tarifas y noches de alojamiento." });
      next();
    } catch { res.status(503).json({ error: "No se pudo verificar tu permiso. Reintentá antes de modificar." }); }
  }];
  app.post('/api/reservations/:id/accommodation-night', ...writeMiddleware, async (req,res)=>{
    try {
      const input=z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),amount:z.string().regex(/^\d{1,8}(\.\d{1,2})?$/),expectedAmount:z.number().nonnegative(),expectedTotal:z.number().nonnegative(),revision:z.number().int().nonnegative(),reason:z.string().trim().min(3).max(1000)}).strict().parse(req.body);
      const saved=await withReservationFinancialLock(req.params.id,()=>withDatabaseTransaction(async()=>{
        const reservation=await storage.getReservation(req.params.id);if(!reservation)pricingError('Reserva no encontrada.',404);
        if(['checked_out','cancelled','no_show'].includes(reservation.status))pricingError('La reserva está cerrada.',409);
        if((reservation.pricingRevision||0)!==input.revision || Math.round(Number(reservation.totalRoomAmount)*100)!==Math.round(input.expectedTotal*100))pricingError('Los importes cambiaron. Actualizá la prefactura.',409);
        const lines=accommodationNights(reservation),night=lines.find(n=>n.date===input.date);
        if(!night || Math.round(night.amount*100)!==Math.round(input.expectedAmount*100))pricingError('La noche cambió o el detalle no coincide con el total. Actualizá la prefactura.',409);
        const fiscal=await accommodationFiscalStatus(req.params.id,0,[input.date]);if(fiscal.blocked)pricingError(fiscal.blocked,409);
        const cents=Math.round(Number(input.amount)*100);if(cents===Math.round(night.amount*100))pricingError('El importe no cambió.');
        const after=lines.map(n=>({date:n.date,rateCents:n.date===input.date?cents:n.rateCents,discountCents:n.date===input.date?0:n.discountCents}));
        const total=nightlyTotal(after);
        const updated=await withNightlyWriter(reservation.pricingRevision||0,()=>storage.updateReservation(req.params.id,{pricingScheme:'nightly_v1',nightlyPricing:after,pricingRevision:(reservation.pricingRevision||0)+1,totalRoomAmount:amountString(total),finalRatePerNight:amountString(Math.round(total/after.length)),baseRatePerNight:amountString(Math.round(after.reduce((sum,n)=>sum+n.rateCents,0)/after.length)),discountType:'none',discountValue:'0',lastModifiedBy:req.user?.id}),[input.date]);
        await db.execute(sql`INSERT INTO reservation_changelog(reservation_id,operador,tipo,descripcion) VALUES (${req.params.id},${req.user?.username||'Sistema'},'tarifa',${`Prefactura: noche ${input.date}, $${night.amount.toFixed(2)} → $${input.amount}. Motivo: ${input.reason}${night.derived?' · Detalle inicial distribuido desde el total contratado.':''}`})`);
        return updated;
      }));res.json(saved);
    }catch(error){sendError(res,error);}
  });
  app.post("/api/reservations/:id/nightly-pricing/preview", ...writeMiddleware, async (req, res) => {
    try {
      const { reservation: _, ...preview } = await buildProposal(req.params.id, requestSchema.parse(req.body));
      res.json(preview);
    } catch (error) { sendError(res, error); }
  });
  app.post("/api/reservations/:id/nightly-pricing/apply", ...writeMiddleware, async (req: Request, res: Response) => {
    try {
      const input = requestSchema.parse(req.body);
      if (!input.reason?.trim() || input.reason.trim().length < 3) pricingError("Ingresá un motivo de al menos tres caracteres.");
      const updated = await withReservationFinancialLock(req.params.id, () => withDatabaseTransaction(async () => {
        const proposal = await buildProposal(req.params.id, input);
        if (input.edit.kind === "package" && input.edit.expectedTotalCents === undefined) pricingError("Revisá primero el importe del paquete antes de confirmar.");
        if (input.edit.kind !== "package" && JSON.stringify(proposal.before) === JSON.stringify(proposal.after)) pricingError("La propuesta no cambia los importes ni las noches.");
        const patch: Record<string, any> = {
          nightlyPricing: proposal.after, totalRoomAmount: amountString(proposal.newTotalCents),
          finalRatePerNight: amountString(Math.round(proposal.newTotalCents / proposal.after.length)),
          baseRatePerNight: amountString(Math.round(proposal.after.reduce((s, n) => s + n.rateCents, 0) / proposal.after.length)),
          discountType: "none", discountValue: "0",
          pricingRevision: input.revision + 1, lastModifiedBy: req.user?.id,
        };
        if (proposal.packageProposal) Object.assign(patch, {
          ratePlanId:null, specialRateReason:proposal.packageProposal.packageTotalCents === 0 ? input.reason!.trim() : null,
          notes:packageNotes(proposal.reservation.notes,proposal.packageProposal.packageName),
        });
        if (input.edit.kind === "stay") Object.assign(patch, {
          checkInDate: proposal.checkIn, checkOutDate: proposal.checkOut, nights: proposal.after.length,
          _inventoryContextGroupId: (proposal.reservation as any).groupId,
          _inventoryOverrideTentativeGroupWarning: input.overrideTentativeGroupWarning,
        });
        const saved = await withNightlyWriter(input.revision, () => storage.updateReservation(req.params.id, patch));
        const details = { before: proposal.before, after: proposal.after, reason: input.reason!.trim(),
          previousTotal: amountString(proposal.previousTotalCents), newTotal: amountString(proposal.newTotalCents),
          package: proposal.packageProposal ? {id:proposal.packageProposal.packageId,name:proposal.packageProposal.packageName,totalCents:proposal.packageProposal.packageTotalCents} : null,
          checkIn: proposal.checkIn, checkOut: proposal.checkOut, actorId: req.user?.id, revision: input.revision + 1 };
        await db.execute(sql`INSERT INTO reservation_changelog(reservation_id,operador,tipo,descripcion)
          VALUES (${req.params.id},${req.user?.username || "Sistema"},${input.edit.kind === "stay" ? "fecha" : "tarifa"},
          ${`Alojamiento por noche: $${details.previousTotal} → $${details.newTotal}. Motivo: ${details.reason}. Detalle: ${JSON.stringify(details)}`})`);
        return saved;
      }));
      res.json(updated);
    } catch (error) { sendError(res, error); }
  });
}

import { z } from "zod";
import type { Request } from "express";
import type pg from "pg";
import { XENIA_QA_OPERATE_STAY } from "../../shared/xeniaPms";
import { hasPermission } from "../permissions";
import type {} from "./request-context";

export const qaOperationReadPath = (path: string) =>
  /^\/api\/(?:charge-types|staff\/users|folios\/reservation\/[^/]+|cash\/(?:configs|shifts(?:\/(?:current|autocreados|[^/]+))?|movements|summary))$/.test(path);
export const qaOperationWritePath = (method: string, path: string) =>
  method === "POST" && /^\/api\/(?:charges|payments|reservations\/[^/]+\/(?:check-in|check-out)|cash\/shifts\/(?:open|[^/]+\/close))$/.test(path) ||
  method === "PATCH" && /^\/api\/cash\/shifts\/[^/]+\/tomar$/.test(path);

const money = z.string().regex(/^\d{1,8}(?:\.\d{1,2})?$/).refine(value => Number(value) > 0);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const qaChargeInput = z.object({
  operationId: z.string().uuid(), reservationId: z.string().min(1).max(100),
  description: z.string().trim().min(1).max(500), amount: money,
  category: z.enum(["restaurant", "spa", "minibar", "otros"]),
  date: day, isRecurring: z.boolean().optional(), unitAmount: money.optional(),
}).strict();
const payment = z.object({
  paymentRequestId: z.string().uuid(), reservationId: z.string().min(1).max(100),
  amount: money, method: z.enum(["efectivo", "transferencia", "tarjeta_debito", "tarjeta_credito", "mercadopago"]),
  date: day, billingTarget: z.literal("guest"),
  reference: z.string().max(500).optional(), notes: z.string().max(1000).optional(),
}).strict();
const fail = (message: string, status = 403) => Object.assign(new Error(message), { status });

/** This runs after central introspection and before the common PMS handlers. */
export async function validateQaOperation(req: Request, pool: pg.Pool) {
  if (!hasPermission(req.user?.role || "", XENIA_QA_OPERATE_STAY))
    throw fail("Tu perfil no permite operar estadías y Caja en esta prueba.");
  let value: unknown = req.body;
  if (req.path === "/api/charges") value = qaChargeInput.parse(req.body);
  else if (req.path === "/api/payments") value = payment.parse(req.body);
  else if (/\/check-in$/.test(req.path))
    value = z.object({ motivo: z.string().trim().min(1).max(1000).optional() }).strict().parse(req.body);
  else if (/\/check-out$/.test(req.path)) {
    z.object({ requireSettled: z.literal(true).optional() }).strict().parse(req.body);
    const reservation = (await pool.query("SELECT status FROM reservations WHERE id=$1", [req.path.split("/")[3]])).rows[0];
    if (!reservation || reservation.status !== "checked_in")
      throw fail("La salida de prueba requiere una estadía con ingreso registrado.", 409);
    value = { requireSettled: true };
  } else if (req.path === "/api/cash/shifts/open") {
    const input = z.object({ area: z.literal("reception"), openedBy: z.string().optional(),
      turnoTipo: z.string().max(100).nullable().optional(), notes: z.string().max(1000).optional() }).strict().parse(req.body);
    value = { ...input, openedBy: req.user!.username };
  } else {
    const id = req.path.split("/")[4];
    const shift = (await pool.query("SELECT area FROM cash_shifts WHERE id=$1", [id])).rows[0];
    if (!shift) throw fail("Turno no encontrado.", 404);
    if (!["reception", "recepcion"].includes(shift.area))
      throw fail("Esta prueba sólo habilita Caja de recepción.");
    if (req.path.endsWith("/close")) {
      const input = z.object({ closedBy: z.string().optional(), efectivoContado: z.number().finite().min(0).max(99999999.99),
        operadorSiguiente: z.string().max(200).nullable().optional(), enviarAAdministracion: z.literal(false).optional(),
        notes: z.string().max(1000).optional(), turnoTipo: z.string().max(100).nullable().optional() }).strict().parse(req.body);
      value = { ...input, closedBy: req.user!.username, enviarAAdministracion: false };
    } else {
      const input = z.object({ operador: z.string().optional(), turnoTipo: z.string().max(100).nullable().optional() }).strict().parse(req.body);
      value = { ...input, operador: req.user!.username };
    }
  }
  if (req.path === "/api/payments") {
    const open = await pool.query("SELECT 1 FROM cash_shifts WHERE area IN ('reception','recepcion') AND status='open' LIMIT 1");
    if (!open.rows.length) throw fail("Abrí primero la Caja de recepción para registrar el cobro de prueba.", 409);
  }
  req.body = value;
}

import { reservationGroupSources } from "@shared/reservationGroupSources";
import { randomUUID } from "node:crypto";
import { sql, eq } from "drizzle-orm";
import {
  db,
  withDatabaseTransaction,
  withReadOnlyDatabaseTransaction,
} from "./db";
import { storage } from "./db-storage";
import {
  groupReservationLinks,
  reservations,
  reservationChangelog,
} from "@shared/schema";
import {
  compatibleGroupBlocks,
  summarizeGroupBlocks,
  hasGroupPassenger,
} from "@shared/groupBlockAssignments";
import { withLodgingInventoryMutationLock } from "./inventoryMutationLock";
import {
  withFinancialScopeLock,
  withReservationFinancialLocks,
} from "./nightlyPricingGuard";
import { payloadHash } from "./billing/operationJournal";
import { hasProvableGroupCoverage } from "./billing/groupCoverageEvidence";

type ImportChoice = {
  blockId?: string;
  replaceReservationId?: string;
  addBlock?: boolean;
};
const fail = (message: string, statusCode = 409) =>
  Object.assign(new Error(message), { statusCode });
const eligible = new Set([
  "tentative",
  "pending",
  "confirmed",
  "web_checkin",
  "checked_in",
]);
const normalizedChoice = (body: ImportChoice): ImportChoice => ({
  ...(body.blockId ? { blockId: body.blockId } : {}),
  ...(body.replaceReservationId
    ? { replaceReservationId: body.replaceReservationId }
    : {}),
  ...(body.addBlock ? { addBlock: true } : {}),
});

async function financialEvidence(reservationId: string) {
  const [payments, invoices, pending, accounts, charges] = await Promise.all([
    db.execute(
      sql`SELECT * FROM payments WHERE reservation_id=${reservationId} ORDER BY id`,
    ),
    db.execute(
      sql`SELECT id,tipo_comprobante,estado,reconciliation_status,monto_total,monto_acreditado,payment_id,source_charge_amounts,credit_reapplication_intent FROM sales_invoices WHERE reserva_id=${reservationId} ORDER BY id`,
    ),
    db.execute(
      sql`SELECT operation_id,stage,invoice_id FROM billing_operations WHERE owner_type='reservation' AND owner_id=${reservationId} AND stage IN ('prepared','numbered','submitting','blocked','rejected','uncertain') ORDER BY operation_id`,
    ),
    db.execute(
      sql`SELECT * FROM account_movements WHERE reservation_id=${reservationId} ORDER BY id`,
    ),
    db.execute(
      sql`SELECT * FROM charges WHERE reservation_id=${reservationId} ORDER BY id`,
    ),
  ]);
  return {
    payments: payments.rows as any[],
    invoices: invoices.rows as any[],
    pending: pending.rows,
    accounts: accounts.rows,
    charges: charges.rows,
  };
}

async function inspect(
  groupId: string,
  reservationId: string,
  choice: ImportChoice,
) {
  const [group, reservation] = await Promise.all([
    storage.getGroup(groupId),
    storage.getReservation(reservationId),
  ]);
  if (!group || !reservation)
    throw fail("Grupo o reserva no encontrados.", 404);
  const links = (
    await db.execute(
      sql`SELECT * FROM group_reservation_links WHERE reservation_id=${reservationId} ORDER BY id`,
    )
  ).rows as any[];
  const evidence = await financialEvidence(reservationId);
  const blockers: string[] = [];
  const ownSources = new Set([
    `reservation:${reservationId}:accommodation`,
    ...evidence.charges
      .filter(
        (charge) =>
          charge.status !== "anulado" &&
          !["transfer_in", "transfer_out", "adjustment"].includes(
            String(charge.category || ""),
          ),
      )
      .map((charge) => `reservation:${reservationId}:charge:${charge.id}`),
  ]);
  if (
    evidence.invoices.some((invoice) => {
      if (
        !["FA", "FB", "FC", "FT", "FM", "FMB"].includes(
          invoice.tipo_comprobante,
        ) ||
        !["emitida", "parcial"].includes(invoice.estado) ||
        Number(invoice.monto_total) <=
          Number(invoice.monto_acreditado || 0) + 0.009
      )
        return false;
      let amounts = invoice.source_charge_amounts;
      try {
        if (typeof amounts === "string") amounts = JSON.parse(amounts);
      } catch {
        return true;
      }
      if (
        !amounts ||
        typeof amounts !== "object" ||
        Array.isArray(amounts) ||
        Object.values(amounts).some(
          (value) => !Number.isFinite(Number(value)) || Number(value) <= 0,
        ) ||
        Object.values(amounts).reduce(
          (total: number, value: any) =>
            total + Math.round(Number(value) * 100),
          0,
        ) !== Math.round(Number(invoice.monto_total) * 100)
      )
        return true;
      return Object.keys(reservationGroupSources(reservationId, amounts)).some(
        (id) => !ownSources.has(id),
      );
    })
  )
    blockers.push(
      "La reserva tiene facturación cuyo alcance requiere conciliación antes de incorporar su cuenta al grupo.",
    );
  if (!["tentative", "blocked", "confirmed", "inhouse"].includes(group.status))
    blockers.push("El grupo no está abierto para incorporar reservas.");
  if (!eligible.has(reservation.status))
    blockers.push(
      "Solo se pueden incorporar reservas vigentes, antes de su salida.",
    );
  if (links.length)
    blockers.push(
      "La reserva ya pertenece a un grupo. No se cambiará de grupo desde esta opción.",
    );
  if (reservation.otaChannelId || reservation.externalReservationId)
    blockers.push(
      "La reserva está vinculada a un canal externo. Revisá su incorporación por el circuito del canal.",
    );
  if (
    evidence.pending.length ||
    evidence.invoices.some(
      (i) =>
        i.estado === "autorizacion_pendiente" ||
        i.reconciliation_status === "pendiente" ||
        i.reconciliation_status === "error" ||
        i.credit_reapplication_intent?.status === "pending" ||
        i.credit_reapplication_intent?.settlement?.status === "pending",
    )
  )
    blockers.push(
      "Esta reserva tiene una operación o conciliación pendiente. Resolvé su estado antes de incorporarla.",
    );
  if (evidence.payments.some((p) => p.group_payment_id))
    blockers.push(
      "Hay aplicaciones de otro recibo grupal. Administración debe revisar su pertenencia.",
    );
  const groupInvoices = (
    await db.execute(
      sql`SELECT id,source_charge_amounts,source_charge_ids,items,monto_total,estado,reconciliation_status FROM sales_invoices WHERE group_id=${groupId} AND estado IN ('emitida','parcial','autorizacion_pendiente') ORDER BY id`,
    )
  ).rows as any[];
  if (groupInvoices.some((i) => !hasProvableGroupCoverage(i)))
    blockers.push(
      "El grupo tiene comprobantes cuyo alcance requiere revisión antes de incorporar otra cuenta.",
    );
  const groupPending = (
    await db.execute(
      sql`SELECT operation_id,stage FROM billing_operations WHERE owner_type='group' AND owner_id=${groupId} AND stage IN ('prepared','numbered','submitting','blocked','rejected','uncertain') ORDER BY operation_id`,
    )
  ).rows;
  if (
    groupPending.length ||
    groupInvoices.some(
      (i) =>
        i.estado === "autorizacion_pendiente" ||
        ["pendiente", "error", "requiere_revision"].includes(
          i.reconciliation_status,
        ),
    )
  )
    blockers.push(
      "El grupo tiene una operación financiera pendiente. Resolvé su estado antes de incorporar otra reserva.",
    );
  const summary = summarizeGroupBlocks(group);
  const compatible = compatibleGroupBlocks(group, reservation, false);
  let replacement: (typeof group.reservations)[number] | undefined,
    replacementEvidence:
      | Awaited<ReturnType<typeof financialEvidence>>
      | undefined;
  if (choice.addBlock) {
    if (choice.blockId || choice.replaceReservationId)
      blockers.push("Elegí ampliar el grupo o utilizar un cupo existente.");
  } else {
    const block = compatible.find((b) => b.id === choice.blockId);
    if (!block)
      blockers.push(
        "Seleccioná un bloque compatible con la categoría y las fechas de la reserva.",
      );
    else {
      const item = summary.byBlock[block.id];
      if (item.reviewReservationIds.length)
        blockers.push(
          "Identificá las asignaciones pendientes de este bloque antes de incorporar otra reserva.",
        );
      if (choice.replaceReservationId) {
        replacement = group.reservations.find(
          (r) =>
            r.id === choice.replaceReservationId &&
            item.reservations.some((v) => v.id === r.id),
        );
        if (
          !replacement ||
          hasGroupPassenger(groupId, replacement) ||
          !["tentative", "pending", "confirmed"].includes(replacement.status)
        )
          blockers.push(
            "El cupo a reemplazar debe estar sin pasajero y sin check-in.",
          );
        else {
          replacementEvidence = await financialEvidence(replacement.id);
          const folioExtra = await (
            await import("./groupReservationExtraCharges")
          ).countReservationExtraFolioCharges(replacement.id);
          const groupExtras = (
            await db.execute(
              sql`SELECT id FROM group_charges WHERE group_id=${groupId} AND reservation_id=${replacement.id}`,
            )
          ).rows;
          const covered = groupInvoices.some((invoice) => {
            let map = invoice.source_charge_amounts;
            try {
              if (typeof map === "string") map = JSON.parse(map);
            } catch {
              return true;
            }
            return Object.keys(map || {}).some((id) =>
              id.startsWith(`reservation:${replacement!.id}:`),
            );
          });
          if (covered || groupExtras.length)
            blockers.push(
              "El cupo sin pasajero tiene cargos o cobertura fiscal del grupo. No se reemplazará su cuenta.",
            );
          if (
            replacementEvidence.payments.length ||
            replacementEvidence.invoices.length ||
            replacementEvidence.pending.length ||
            replacementEvidence.charges.length ||
            replacementEvidence.accounts.length ||
            folioExtra ||
            Number(replacement.earlyCheckInCharge || 0) ||
            Number(replacement.lateCheckOutCharge || 0) ||
            replacement.voucherId ||
            replacement.voucherCode
          )
            blockers.push(
              "El cupo sin pasajero tiene movimientos o servicios. Revisá su cuenta; no se cancelará automáticamente.",
            );
        }
      } else if (item.reservations.length >= block.quantity)
        blockers.push(
          "El bloque no tiene un cupo vacío. Elegí un cupo sin pasajero o ampliá el grupo.",
        );
    }
  }
  const fingerprint = payloadHash({
    groupId,
    choice,
    reservation,
    links,
    evidence,
    blocks: group.blocks,
    assignments: group.reservationBlockIds,
    reservations: group.reservations.map((r) => ({
      id: r.id,
      status: r.status,
      roomId: r.roomId,
      roomTypeId: r.roomTypeId,
      checkInDate: r.checkInDate,
      checkOutDate: r.checkOutDate,
    })),
    groupInvoices,
    groupPending,
    replacement,
    replacementEvidence,
  });
  return {
    group,
    reservation,
    evidence,
    compatible,
    replacement,
    fingerprint,
    blockers: [...new Set(blockers)],
  };
}
const publicPreview = (s: Awaited<ReturnType<typeof inspect>>) => ({
  fingerprint: s.fingerprint,
  blockers: s.blockers,
  canImport: s.blockers.length === 0,
  reservation: {
    id: s.reservation.id,
    code: s.reservation.reservationCode,
    guestName: [s.reservation.guest?.lastName, s.reservation.guest?.firstName]
      .filter(Boolean)
      .join(" "),
    roomNumber: s.reservation.room?.roomNumber,
    checkInDate: s.reservation.checkInDate,
    checkOutDate: s.reservation.checkOutDate,
    totalRoomAmount: s.reservation.totalRoomAmount,
    status: s.reservation.status,
  },
  historicalPayments: s.evidence.payments
    .filter((p) => p.status !== "anulado")
    .reduce((n, p) => n + Number(p.amount), 0),
  invoiceCount: s.evidence.invoices.length,
  replacement: s.replacement
    ? { id: s.replacement.id, roomNumber: s.replacement.room?.roomNumber }
    : null,
});
export const previewReservationImport = (
  groupId: string,
  reservationId: string,
  choice: ImportChoice,
) =>
  withReadOnlyDatabaseTransaction(async () =>
    publicPreview(
      await inspect(groupId, reservationId, normalizedChoice(choice)),
    ),
  );

export async function importExistingReservation(
  groupId: string,
  reservationId: string,
  body: ImportChoice & {
    operationId: string;
    fingerprint: string;
    reason: string;
  },
  actor: { id?: string; username?: string },
) {
  if (
    (body.addBlock !== undefined && typeof body.addBlock !== "boolean") ||
    (body.blockId !== undefined && typeof body.blockId !== "string") ||
    (body.replaceReservationId !== undefined &&
      typeof body.replaceReservationId !== "string")
  )
    throw fail("La selección de cupo no es válida.", 400);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      body.operationId || "",
    ) ||
    typeof body.reason !== "string" ||
    body.reason.trim().length < 5 ||
    body.reason.length > 500 ||
    typeof body.fingerprint !== "string"
  )
    throw fail(
      "Revisá la vista previa e ingresá un motivo de 5 a 500 caracteres.",
      400,
    );
  const choice = normalizedChoice(body);
  const identity = payloadHash({
    groupId,
    reservationId,
    choice,
    fingerprint: body.fingerprint,
    reason: body.reason.trim(),
    actor: actor.id || actor.username,
  });
  return withFinancialScopeLock(`group-invoice:${groupId}`, () =>
    withReservationFinancialLocks(
      [
        reservationId,
        ...(choice.replaceReservationId ? [choice.replaceReservationId] : []),
      ],
      () =>
        withLodgingInventoryMutationLock(() =>
          withDatabaseTransaction(async () => {
            await db.execute(sql`SET LOCAL lock_timeout='3s'`);
            await db.execute(
              sql`SELECT id FROM groups WHERE id=${groupId} FOR UPDATE`,
            );
            for (const id of [
              reservationId,
              ...(choice.replaceReservationId
                ? [choice.replaceReservationId]
                : []),
            ].sort()) {
              await db.execute(
                sql`SELECT pg_advisory_xact_lock(hashtextextended(${"funding-scope:reservation:" + id},0))`,
              );
              await db.execute(
                sql`SELECT id FROM reservations WHERE id=${id} FOR UPDATE`,
              );
            }
            const prior = (
              await db.execute(
                sql`SELECT * FROM group_reservation_imports WHERE operation_id=${body.operationId}`,
              )
            ).rows[0] as any;
            if (prior) {
              if (prior.fingerprint !== identity)
                throw fail("La operación original conserva otros datos.");
              return { ...prior.result, replayed: true };
            }
            const s = await inspect(groupId, reservationId, choice);
            if (s.fingerprint !== body.fingerprint)
              throw fail(
                "La reserva o el grupo cambiaron. Actualizá la vista previa.",
              );
            if (s.blockers.length) throw fail(s.blockers[0]);
            let blockId = choice.blockId || null;
            const [link] = await db
              .insert(groupReservationLinks)
              .values({ groupId, reservationId, blockId })
              .returning();
            if (choice.addBlock) {
              const r = s.reservation;
              const block = await storage.createGroupBlock({
                groupId,
                roomTypeId: r.roomTypeId,
                quantity: 1,
                ratePlanId: r.ratePlanId || null,
                agreedRate: r.finalRatePerNight || null,
                blockCheckInDate: r.checkInDate,
                blockCheckOutDate: r.checkOutDate,
              });
              blockId = block.id;
              await db.execute(
                sql`UPDATE group_reservation_links SET block_id=${blockId} WHERE id=${link.id}`,
              );
            }
            if (s.replacement)
              await db
                .update(reservations)
                .set({ status: "cancelled", lastModifiedBy: actor.id || null })
                .where(eq(reservations.id, s.replacement.id));
            // No reservation rewrite, payment transfer, new collection or invoice.
            const result = {
              groupId,
              reservationId,
              blockId,
              replacedReservationId: s.replacement?.id || null,
            };
            await db.insert(reservationChangelog).values({
              reservationId,
              operador: actor.username || "Sistema",
              tipo: "group_import",
              descripcion: `Reserva incorporada al grupo ${s.group.groupCode}. Motivo: ${body.reason.trim()}. Fechas, tarifa, pagos y comprobantes conservados.`,
            });
            if (s.replacement)
              await db.insert(reservationChangelog).values({
                reservationId: s.replacement.id,
                operador: actor.username || "Sistema",
                tipo: "group_import_placeholder",
                descripcion: `Cupo sin pasajero reemplazado por la reserva existente ${s.reservation.reservationCode}. ${body.reason.trim()}`,
              });
            await db.execute(
              sql`INSERT INTO group_reservation_imports(operation_id,fingerprint,group_id,reservation_id,result) VALUES(${body.operationId},${identity},${groupId},${reservationId},${JSON.stringify(result)}::jsonb)`,
            );
            await db.execute(sql`INSERT INTO audit_logs(user_id,user_name,action,module,entity_type,entity_id,description,details,timestamp)
      VALUES(${actor.id || null},${actor.username || "Sistema"},'update','groups','group',${groupId},'Reserva existente incorporada; cuenta original conservada',${JSON.stringify({ ...result, reason: body.reason.trim(), operationId: body.operationId })},now())`);
            return { ...result, replayed: false };
          }),
        ),
    ),
  );
}

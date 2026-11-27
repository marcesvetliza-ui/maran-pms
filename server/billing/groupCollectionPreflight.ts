import { sql } from 'drizzle-orm';
import { db } from '../db';
import { groupAccountSnapshot } from './groupAccount';

export const GROUP_ADVANCE_CHOICE_REQUIRED = 'GROUP_ADVANCE_CHOICE_REQUIRED';

/** Read-only: distinguish a separate room collection from existing group money
 * before freezing a fiscal request. Never assign the group's advances here. */
export async function groupCollectionPreflightIssue(body: any) {
  const payments = body.prefacturaRecovery?.payments;
  if (!body.reservaId || body.reservationBillingAction !== 'collect_and_invoice' ||
      body.groupDocumentationOnly === true || body.acknowledgeUnassignedAdvance === true ||
      body.prefacturaRecovery?.version !== 2 || !Array.isArray(payments) || !payments.length ||
      payments.some((p: any) => String(p.reservationId) !== String(body.reservaId) ||
        !Number.isFinite(Number(p.amount)) || Number(p.amount) <= 0)) return null;
  const links = (await db.execute(sql`SELECT group_id FROM group_reservation_links WHERE reservation_id=${String(body.reservaId)}`)).rows;
  if (links.length !== 1) return null;
  const account = await groupAccountSnapshot(String(body.reservaId));
  if (!(account.unassigned > 0.009 || account.reviewReceipts.length)) return null;
  return {
    code: GROUP_ADVANCE_CHOICE_REQUIRED,
    message: 'El grupo tiene anticipos sin asignar. Para registrar este pago individual, confirmá que es dinero recibido por separado del grupo. Se conservan el importe y el medio de pago; no se utilizará el anticipo grupal.',
  };
}

/** Caller holds the reservation/group financial locks through journal creation.
 * An existing operation must retain its immutable request and recovery guards. */
export async function assertNewGroupCollectionPreflight(body: any) {
  if (!body.reservaId || body.reservationBillingAction !== 'collect_and_invoice' ||
      typeof body.creditOperationId !== 'string') return;
  const claimed = await db.execute(sql`
    SELECT 1 FROM billing_operations WHERE operation_id=${body.creditOperationId}
    UNION ALL SELECT 1 FROM sales_invoices WHERE fiscal_identity->>'operationId'=${body.creditOperationId}
      OR credit_reapplication_intent->>'operationId'=${body.creditOperationId} LIMIT 1`);
  if (claimed.rows.length) return;
  const issue = await groupCollectionPreflightIssue(body);
  if (!issue) return;
  const ids = body.prefacturaRecovery.payments.map((p: any) => p.paymentRequestId);
  if (ids.some((id: any) => typeof id !== 'string' || !id)) return;
  const existing = await db.execute(sql`SELECT 1 FROM payments WHERE payment_request_id IN (${sql.join(ids.map((id: string) => sql`${id}`), sql`,`)}) LIMIT 1`);
  if (existing.rows.length) return;
  throw Object.assign(new Error(issue.message), { statusCode: 409, code: issue.code, safeToReset: true });
}

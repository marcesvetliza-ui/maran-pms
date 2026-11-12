import { eq,sql } from 'drizzle-orm';
import { db } from './db';
import { groupPayments, payments } from '@shared/schema';
import { assertPaymentRequestMatches, type ReservationPaymentRequest } from './reservationPaymentRequest';
// Kept separately from receipts: reversing/deleting a receipt must not let a
// delayed retry record the same original collection a second time.
export const GROUP_PAYMENT_REQUEST_SCHEMA_SQL = `
 CREATE TABLE IF NOT EXISTS group_account_operations (
   id varchar PRIMARY KEY,
   fingerprint text NOT NULL,
   group_id varchar NOT NULL,
   group_payment_id varchar NOT NULL,
   created_at timestamp NOT NULL DEFAULT now()
 );
`;
export async function getGroupPaymentRequest(request: ReservationPaymentRequest, groupId: string, executor: any = db) {
    const row=(await executor.execute(sql`SELECT fingerprint,group_id,group_payment_id FROM group_account_operations WHERE id=${request.id}`)).rows[0] as any;
    if(!row)return null;
    assertPaymentRequestMatches({paymentRequestFingerprint:row.fingerprint},request);
    if(row.group_id!==groupId)throw Object.assign(new Error('El recibo pertenece a otro grupo.'),{statusCode:409});
    const [groupPayment]=await executor.select().from(groupPayments).where(eq(groupPayments.id,row.group_payment_id)).limit(1);
    if(!groupPayment)throw Object.assign(new Error('El recibo de esta operación fue anulado. No se registró otro cobro.'),{statusCode:409});
    const reservationPayments = await executor.select().from(payments).where(eq(payments.groupPaymentId, groupPayment.id));
    return { groupPayment, reservationPayments };
}
export function replayGroupPayment(result: Awaited<ReturnType<typeof getGroupPaymentRequest>>) {
    if (!result)
        return null;
    return { success: true, groupPayment: result.groupPayment, groupPaymentId: result.groupPayment.id, paymentIds: result.reservationPayments.map((p: any) => p.id), paymentId: result.reservationPayments[0]?.id ?? null, checkoutCount: 0, replayed: true };
}

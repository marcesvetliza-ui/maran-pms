import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { activeSalesRecord } from '../salesArchive';
import { normalizeToSpanishPaymentMethod } from '../payment-method';

export const CASH_CARD_RECTIFICATIONS_SQL = `CREATE TABLE IF NOT EXISTS cash_card_rectifications (
 operation_id uuid PRIMARY KEY, invoice_id integer NOT NULL, payment_id varchar NOT NULL,
 cash_movement_id varchar NOT NULL, shift_id varchar NOT NULL, revision integer NOT NULL,
 fingerprint text NOT NULL, original_summary jsonb NOT NULL, original_movement jsonb NOT NULL,
 card_before jsonb NOT NULL, card_after jsonb NOT NULL, old_method text NOT NULL, new_method text NOT NULL,
 amount numeric(10,2) NOT NULL CHECK(amount>0), reason text NOT NULL, evidence_ref text NOT NULL,
 actor_id text NOT NULL, operator text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(shift_id,revision), CHECK(old_method IN ('tarjeta_credito','tarjeta_debito')),
 CHECK(new_method IN ('tarjeta_credito','tarjeta_debito') AND new_method<>old_method)
)`;
export type CardCorrection = { mode:'preview'|'apply'; actorId:string; reason:string; evidenceRef:string; operationId?:string; previewHash?:string };
const fail = (message:string) => Object.assign(new Error(message),{statusCode:409});
const cents = (v:any) => Math.round(Number(v)*100);
function stable(v:any):any { return v instanceof Date?v.toISOString():Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v; }
export const cardCorrectionHash = (v:any) => createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
export function cardRequestFingerprint(invoiceId:number,method:string,action:CardCorrection) {
 return cardCorrectionHash({invoiceId,method,actorId:action.actorId,reason:action.reason.trim(),evidenceRef:action.evidenceRef.trim()});
}
/** The shift is already locked by the caller. Original closing summary and
 * physical cash count are NEVER updated. Only card classification may change.
 */
export async function prepareCardRectification(tx:any,context:any,action:CardCorrection) {
 const {invoice,payment,cash,shift,method,invoices}=context;
 const oldMethod=normalizeToSpanishPaymentMethod(cash.payment_method);
 if(!shift||shift.status!=='closed'||!['tarjeta_credito','tarjeta_debito'].includes(oldMethod)||
    !['tarjeta_credito','tarjeta_debito'].includes(method)||method===oldMethod)throw fail('La rectificación de cierre sólo admite cambiar Crédito ↔ Débito de un cobro existente.');
 if(action.reason.trim().length<10||action.reason.length>1000||action.evidenceRef.trim().length<3||action.evidenceRef.length>500)throw fail('Indicá un motivo y una referencia de comprobación para rectificar el cierre.');
 const summaries=(await tx.execute(sql`SELECT * FROM cash_closing_summaries WHERE shift_id=${shift.id} FOR UPDATE`)).rows;
 if(summaries.length!==1)throw fail('El cierre original no es unívoco. Requiere conciliación de Administración.');
 const summary=summaries[0];
 const previous=(await tx.execute(sql`SELECT * FROM cash_card_rectifications WHERE shift_id=${shift.id} ORDER BY revision DESC LIMIT 1 FOR UPDATE`)).rows[0];
 if(previous&&cardCorrectionHash(previous.original_summary)!==cardCorrectionHash(summary))throw fail('El cierre original cambió desde su última rectificación. Requiere revisión.');
 const movements=(await tx.execute(sql`SELECT * FROM cash_movements WHERE shift_id=${shift.id} AND anulado=false
   AND ${activeSalesRecord('cash_movement',sql`id`)} ORDER BY id FOR UPDATE`)).rows;
 if(!movements.some((row:any)=>row.id===cash.id))throw fail('El cobro no está activo en el cierre original.');
 const current:any={tarjeta_credito:0,tarjeta_debito:0};
 for(const row of movements){const key=normalizeToSpanishPaymentMethod(row.payment_method);if(key in current&&row.movement_type!=='informational')current[key]+=cents(row.amount)*(row.movement_type==='expense'?-1:1);}
 const before=previous?.card_after??{tarjeta_credito:cents(summary.total_credit_card),tarjeta_debito:cents(summary.total_debit_card)};
 if(cardCorrectionHash(current)!==cardCorrectionHash(before))throw fail('Los movimientos de tarjetas no coinciden con el cierre verificable. Requiere conciliación antes de corregir.');
 const after={...before,[oldMethod]:before[oldMethod]-cents(cash.amount),[method]:before[method]+cents(cash.amount)};
 if(Object.values(after).some(v=>!Number.isSafeInteger(v)||Number(v)<0)||after.tarjeta_credito+after.tarjeta_debito!==before.tarjeta_credito+before.tarjeta_debito)throw fail('La rectificación no conserva los totales verificables de tarjetas.');
 const fingerprint=cardRequestFingerprint(Number(invoice.id),method,action);
 const previewHash=cardCorrectionHash({fingerprint,summary,previous,movements,payment,invoices,method});
 const preview={previewHash,shiftId:shift.id,shiftNumber:shift.shift_number,closedAt:shift.closed_at,amount:Number(cash.amount),oldMethod,newMethod:method,before,after,revision:Number(previous?.revision??0)+1,reason:action.reason.trim(),evidenceRef:action.evidenceRef.trim()};
 if(action.mode==='preview')return preview;
 if(!action.operationId||action.previewHash!==previewHash)throw Object.assign(fail('Cambió el cobro o el cierre. Volvé a revisar la rectificación antes de confirmar.'),{code:'CARD_RECTIFICATION_STALE'});
 await tx.execute(sql`INSERT INTO cash_card_rectifications(operation_id,invoice_id,payment_id,cash_movement_id,shift_id,revision,fingerprint,
   original_summary,original_movement,card_before,card_after,old_method,new_method,amount,reason,evidence_ref,actor_id,operator)
 VALUES(${action.operationId},${invoice.id},${payment.id},${cash.id},${shift.id},${preview.revision},${fingerprint},
   ${JSON.stringify(summary)}::jsonb,${JSON.stringify(cash)}::jsonb,${JSON.stringify(before)}::jsonb,${JSON.stringify(after)}::jsonb,
   ${oldMethod},${method},${cash.amount},${preview.reason},${preview.evidenceRef},${action.actorId},${context.operator})`);
 return preview;
}

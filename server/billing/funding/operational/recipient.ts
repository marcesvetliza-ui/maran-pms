import { z } from "zod";
import type { PoolClient } from "pg";
import type { PaymentFundingService } from "../service";
import { FundingError, hash, identifier, requirePermission, stableId, type Actor } from "../contracts";

export const spaRecipientInput = z.object({
  guestId: z.string().min(1).optional(), kind: z.enum(["guest", "spa_client"]).default("guest"),
  firstName: z.string().trim().min(1).max(200), lastName: z.string().trim().max(200),
  documentType: z.enum(["DNI", "CUIT"]), documentNumber: z.string().trim().regex(/^\d{7,11}$/),
  vatCondition: z.enum(["consumidor_final", "responsable_inscripto", "monotributo", "exento", "no_responsable", "no_categorizado"]),
  cuit: z.string().trim().max(11).default(""), address: z.string().trim().max(500).default(""),
}).strict().superRefine((v, ctx) => {
  if ((v.documentType === "DNI" && !/^\d{7,8}$/.test(v.documentNumber)) ||
    (v.documentType === "CUIT" && !/^\d{11}$/.test(v.documentNumber)) ||
    (v.cuit && !/^\d{11}$/.test(v.cuit))) ctx.addIssue({ code: "custom", message: "Revisá DNI/CUIT." });
  if (["responsable_inscripto", "exento"].includes(v.vatCondition) && !(v.documentType === "CUIT" || /^\d{11}$/.test(v.cuit)))
    ctx.addIssue({ code: "custom", message: "La condición IVA requiere CUIT." });
});

function present(g: any, kind: "guest" | "spa_client" | null, editable: boolean) {
  return { guestId: g?.id ?? null, kind, firstName: g?.first_name ?? "", lastName: g?.last_name ?? "",
    documentType: g?.document_type ?? "DNI", documentNumber: g?.document_number ?? "",
    vatCondition: g?.vat_condition ?? "", cuit: g?.cuil_cuit ?? "", address: g?.direccion ?? "", editable };
}
export async function spaRecipientProfiles(c:PoolClient,accountId:string,guestId:string,schema="public") {
  const s=identifier(schema);
  const chosen=(await c.query(`SELECT payload->>'kind' AS kind FROM payment_funding.events
    WHERE kind='spa_recipient_saved' AND payload->>'scopeKey'=$1 AND payload->>'guestId'=$2 ORDER BY seq DESC LIMIT 1`,[`spa:${accountId}`,guestId])).rows[0]?.kind;
  return (await c.query(`SELECT to_jsonb(g) AS data,'guest' AS kind FROM ${s}.guests g WHERE id=$1 AND $2<>'spa_client'
    UNION ALL SELECT to_jsonb(g),'spa_client' FROM ${s}.spa_clients g WHERE id=$1 AND $2<>'guest'`,[guestId,chosen??""])).rows;
}
async function context(c: PoolClient, accountId: string, s: string) {
  const account = (await c.query(`SELECT * FROM ${s}.spa_accounts WHERE id=$1 FOR UPDATE`, [accountId])).rows[0];
  const appointment = account && (await c.query(`SELECT * FROM ${s}.spa_appointments WHERE id=$1 FOR UPDATE`, [account.appointment_id])).rows[0];
  if (!appointment) throw new FundingError("FISCAL_PREPARATION_REQUIRED", "No se encontró el turno de esta cuenta.");
  const locked = (await c.query(`SELECT 1 FROM payment_funding.documents WHERE scope_kind='spa' AND scope_id=$1
    UNION ALL SELECT 1 FROM payment_funding.operations WHERE scope_kind='spa' AND scope_id=$1 AND status<>'aborted'
    UNION ALL SELECT 1 FROM payment_funding.events WHERE kind='spa_rollout_history' AND payload->>'scopeKey'=$2 LIMIT 1`, [accountId, `spa:${accountId}`])).rowCount;
  return { account, appointment, editable: !locked };
}
export async function getSpaRecipient(service: PaymentFundingService, accountId: string, actor: Actor, schema = "public") {
  requirePermission(actor, "funding:read"); const s = identifier(schema);
  return service.store.transaction({kind:"spa",id:accountId},null,async c => {
    await service.store.assertAdopted(c,{kind:"spa",id:accountId});
    const { appointment: a, editable } = await context(c,accountId,s);
    const rows = a.guest_id ? await spaRecipientProfiles(c,accountId,a.guest_id,schema) : [];
    return rows.length===1 ? present(rows[0].data,rows[0].kind,editable) :
      present({first_name:a.guest_name??"",last_name:a.guest_last_name??""},null,editable);
  });
}
export async function saveSpaRecipient(service: PaymentFundingService, accountId: string, input: unknown, actor: Actor, schema = "public") {
  requirePermission(actor); const data=spaRecipientInput.parse(input),s=identifier(schema),scope={kind:"spa" as const,id:accountId};
  return service.store.transaction(scope,null,async c => {
    await service.store.assertAdopted(c,scope);
    await service.adapter(scope).assertScope(c,scope);
    const {appointment,editable}=await context(c,accountId,s);
    if(!editable) throw new FundingError("FISCAL_OPERATION_PENDING","El comprobante ya está preparado o la cuenta es histórica; no se cambia su receptor.");
    const table=data.kind==="spa_client"?"spa_clients":"guests";
    let id=data.guestId;
    const cuit=data.documentType==="CUIT"?data.documentNumber:data.cuit;
    for(const key of [...new Set([`${data.documentType}:${data.documentNumber}`,...(cuit?[`CUIT:${cuit}`]:[])])].sort())
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`spa-recipient-document:${key}`]);
    if(!id) {
      if(data.kind!=="guest") throw new FundingError("INVALID_REQUEST","Elegí una ficha existente o creá un cliente.",422);
      id=stableId(`spa-fiscal-recipient:${accountId}`);
      const duplicate=(await c.query(`SELECT id FROM ${s}.guests WHERE id<>$2 AND
        (regexp_replace(COALESCE(document_number,''),'[^0-9]','','g')=$1
        OR ($3<>'' AND regexp_replace(COALESCE(cuil_cuit,''),'[^0-9]','','g')=$3)) LIMIT 1`,[data.documentNumber,id,cuit])).rows[0];
      if(duplicate) throw new FundingError("CLIENT_ALREADY_EXISTS","Ya existe una ficha con ese documento. Buscala y seleccionala para vincularla.");
      await c.query(`INSERT INTO ${s}.guests(id,first_name,last_name) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING`,[id,data.firstName,data.lastName]);
    }
    const result=(await c.query(`UPDATE ${s}.${table} SET first_name=$2,last_name=$3,document_type=$4,
      document_number=$5,vat_condition=$6,cuil_cuit=$7,direccion=$8 WHERE id=$1 RETURNING *`,
      [id,data.firstName,data.lastName,data.documentType,data.documentNumber,data.vatCondition,cuit||null,data.address||null])).rows[0];
    if(!result) throw new FundingError("NOT_FOUND","Cliente inexistente; no se vinculó la cuenta.",404);
    // Shared with preparation's read lock. No financial writes or invented DNI.
    await c.query(`UPDATE ${s}.spa_appointments SET guest_id=$2 WHERE id=$1`,[appointment.id,id]);
    const eventKey=`recipient:${accountId}:${hash({...data,guestId:id})}`;
    if(!(await c.query("SELECT 1 FROM payment_funding.events WHERE event_key=$1",[eventKey])).rowCount)
      await service.store.event(c,null,eventKey,"spa_recipient_saved",{scopeKey:`spa:${accountId}`,guestId:id,kind:data.kind,previousGuestId:appointment.guest_id??null},actor.id);
    return present(result,data.kind,true);
  });
}

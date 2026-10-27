import type { PaymentFundingService } from "../service";
import { FundingError, hash, identifier, number, requirePermission, stableId, type Actor } from "../contracts";
import { calcularMontos, type InvoiceItem } from "../../invoiceService";
import { resolveCondicionIvaReceptorId, resolveFiscalRecipientDocument } from "../../fiscalDocument";
import { spaRecipientProfiles } from "./recipient";
import { spaPreferences } from "./preferences";
import type { PoolClient } from "pg";

/** Trusted server command, NOT a fiscal snapshot endpoint. All economic and
 * recipient data is reconstructed from persisted operational identities.
 * The first integration deliberately supports direct SPA / FA / FB / ARS only.
 */
export async function prepareSpaDocument(service: PaymentFundingService, accountId: string, actor: Actor, schema = "public", client?:PoolClient) {
 requirePermission(actor);
 const s=identifier(schema),scope={kind:"spa" as const,id:accountId};
 const run=async(c:PoolClient)=>{
   await service.store.assertAdopted(c,scope);
   await service.adapter(scope).assertScope(c,scope);
   const account=(await c.query(`SELECT * FROM ${s}.spa_accounts WHERE id=$1 FOR UPDATE`,[accountId])).rows[0];
   const appointment=(await c.query(`SELECT * FROM ${s}.spa_appointments WHERE id=$1 FOR SHARE`,[account.appointment_id])).rows[0];
   if(!appointment) throw new FundingError("FISCAL_PREPARATION_REQUIRED","No se encontró el turno de esta cuenta.");
   const preferences=await spaPreferences(c,accountId);
   if(!appointment?.guest_id && (!preferences||preferences.recipientKind==="client")) throw new FundingError("FISCAL_PREPARATION_REQUIRED","El turno no tiene un receptor fiscal identificado.");
   // Historical UI used either guests or spa_clients. An ID collision is NOT
   // permission to choose whichever happens to have an equal name/amount.
   const recipients=preferences?.recipientKind==="company"?
    (await c.query(`SELECT jsonb_build_object('id',id,'first_name',razon_social,'last_name','','vat_condition',condicion_iva,
      'cuil_cuit',cuil_cuit,'document_number',cuil_cuit,'document_type','CUIT','direccion',direccion) AS data
      FROM ${s}.companies WHERE id=$1 FOR SHARE`,[preferences.recipientId])).rows:
    preferences?.recipientKind==="guest"?(await c.query(`SELECT to_jsonb(g) AS data FROM ${s}.guests g WHERE id=$1 FOR SHARE`,[preferences.recipientId])).rows:
    await spaRecipientProfiles(c,accountId,appointment.guest_id,schema);
   if(recipients.length!==1) throw new FundingError("FISCAL_PREPARATION_REQUIRED","Receptor inexistente o ambiguo; revisar la ficha.");
   const g=recipients[0].data;
   const condition=String(g.vat_condition??"").trim().toLowerCase().replace(/[\s-]+/g,"_");
   if(!["responsable_inscripto","exento","consumidor_final","no_responsable","monotributo","monotributista","no_categorizado"].includes(condition))
     throw new FundingError("FISCAL_PREPARATION_REQUIRED","Falta una condición IVA válida en la ficha.");
   const inferredTipo=[1,4].includes(resolveCondicionIvaReceptorId(condition))?"FA":"FB";
   const tipo=preferences?.receiptType??inferredTipo;
   if(!["FA","FB"].includes(tipo)) throw new FundingError("INVALID_RECEIPT_TYPE","El voucher se registra por su operación no fiscal.",422);
   if(tipo!==inferredTipo) throw new FundingError("INVALID_RECEIPT_TYPE","El comprobante elegido no corresponde a la condición IVA del receptor. Revisá el tipo o la ficha fiscal.",422);
   const recipient={id:g.id,razonSocial:[g.first_name,g.last_name].filter(Boolean).join(" "),
     cuit:g.cuil_cuit||undefined,dni:g.document_number||undefined,documentType:g.document_type||undefined,
     condicionIva:condition,domicilio:g.direccion||g.address||undefined};
   const document=resolveFiscalRecipientDocument(recipient);
   if(!recipient.razonSocial || (tipo==="FA" && (document.tipo!==80 || document.numero.length!==11)) ||
     (document.tipo===96 && !/^\d{7,8}$/.test(document.numero)) || document.tipo===94)
     throw new FundingError("FISCAL_PREPARATION_REQUIRED","La ficha no contiene identificación fiscal válida para FA/FB.");
   const config=(await c.query(`SELECT arca_ambiente,COALESCE(arca_cuit,cuit) AS issuer,punto_venta_homolog
     FROM ${s}.billing_config ORDER BY id LIMIT 1`)).rows[0];
   // Developing a binding is not authorization to emit in production.
   if(config?.arca_ambiente!=="homologacion" || !/^\d{11}$/.test(String(config.issuer).replace(/\D/g,"")))
     throw new FundingError("FISCAL_ENVIRONMENT_BLOCKED","Este binding requiere homologación configurada y revisión posterior.",503);
   const points=(await c.query(`SELECT numero FROM ${s}.pos_configs WHERE area='spa' AND activo=true AND tipo='electronico' ORDER BY id`)).rows;
   // Homologation uses the configured homologation PV, never a production PV.
   if(points.length!==1 || !Number.isSafeInteger(config.punto_venta_homolog) || config.punto_venta_homolog<=0)
     throw new FundingError("FISCAL_PREPARATION_REQUIRED","Revisar el punto de venta SPA y el PV de homologación.");
   const rows=(await c.query(`SELECT * FROM ${s}.spa_account_items WHERE account_id=$1 ORDER BY id FOR SHARE`,[accountId])).rows;
   if(!rows.length) throw new FundingError("FISCAL_PREPARATION_REQUIRED","La cuenta no tiene cargos.");
   const items:InvoiceItem[]=rows.map(row=>{
     const subtotal=number(Math.round(Number(row.subtotal)*100)),unit=number(Math.round(Number(row.unit_price)*100));
     const isDiscount=row.item_type==="discount";
     if(!row.description || !Number.isSafeInteger(row.quantity) || row.quantity<=0 ||
       (isDiscount?(unit>=0||subtotal>=0||row.quantity!==1):(unit<0||subtotal<=0)) || unit*row.quantity!==subtotal)
       throw new FundingError("FISCAL_PREPARATION_REQUIRED","El cargo requiere conciliación de cantidad, precio y subtotal.");
     // Direct SPA supplies/services are taxable at the existing standard 21%.
     // Unsupported tax categories require a reviewed catalog mapping, not browser VAT.
     return {descripcion:row.description,cantidad:row.quantity,precioUnitario:unit/100,alicuotaIva:"21",subtotal:subtotal/100,subtotalNeto:Math.round(subtotal/1.21)/100};
   });
   const amounts=calcularMontos(items,tipo),totalCents=number(Math.round(amounts.montoTotal*100));
   const totals=await service.adapter(scope).totals(c,scope);
   if(totals.totalCents!==totalCents) throw new FundingError("SOURCE_CHANGED","El total fiscal no coincide con la cuenta.");
   const folio=(await c.query(`SELECT id FROM ${s}.folios WHERE entity_type='spa_account' AND entity_id=$1`,[accountId])).rows;
   if(folio.length!==1) throw new FundingError("FOLIO_LINK_AMBIGUOUS","Folio inexistente o ambiguo.");
   const date=(await c.query("SELECT to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYY-MM-DD') AS date")).rows[0].date;
   const snapshot={validatedPreparation:true,recipient,tipo,currency:"ARS",environment:config.arca_ambiente,
     issuer:String(config.issuer).replace(/\D/g,""),puntoVenta:config.punto_venta_homolog,fecha:date,
     folioId:folio[0].id,items,amounts,...(preferences?{prefactura:preferences}:{}),sourceItems:rows.map(r=>({id:r.id,quantity:r.quantity,unitPrice:r.unit_price,subtotal:r.subtotal}))};
   const id=stableId(`spa-preparation:${accountId}:${hash(snapshot)}`);
   const active=(await c.query(`SELECT id FROM payment_funding.operations WHERE scope_kind='spa' AND scope_id=$1
     AND kind='invoice' AND status<>'aborted'`,[accountId])).rows;
   if(active.length) throw new FundingError("FISCAL_OPERATION_PENDING","Recupere la operación ya reservada.");
   const prior=(await c.query("SELECT id FROM payment_funding.documents WHERE scope_kind='spa' AND scope_id=$1",[accountId])).rows;
   if(prior.some(r=>r.id!==id)) throw new FundingError("FISCAL_PREPARATION_REQUIRED","Existe otro documento preparado; revisar sin sustituir su identidad.");
   await c.query(`INSERT INTO payment_funding.documents(id,scope_kind,scope_id,original_cents,total_cents,snapshot,status)
     VALUES($1,'spa',$2,$3,$3,$4,'draft') ON CONFLICT(id) DO NOTHING`,[id,accountId,totalCents,JSON.stringify(snapshot)]);
   if(!prior.length && !(await c.query("SELECT 1 FROM payment_funding.events WHERE event_key=$1",[`prepared:${id}`])).rowCount)
     await service.store.event(c,null,`prepared:${id}`,"fiscal_document_prepared",{scopeKey:`spa:${accountId}`,documentId:id,sourceHash:hash(snapshot)},actor.id);
   return {documentId:id,totalCents};
 };
 return client?run(client):service.store.transaction(scope,null,run);
}

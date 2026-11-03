import {sql,type SQL} from 'drizzle-orm';

type Identity={excludeInvoiceId?:number;supplierId:number;proveedorCuit?:string|null;tipoComprobante:string;puntoVenta?:string|number|null;numeroComprobante:string|number};
type Transaction={execute:(query:SQL)=>Promise<any>};
export function canonicalPurchaseNumber(value:unknown,empty='') {
 const text=String(value??'').replace(/\s+/g,'').toUpperCase();
 return !text?empty:/^\d+$/.test(text)?text.replace(/^0+(?=\d)/,''):text;
}
function canonicalColumn(column:SQL,empty='') {
 const text=sql`upper(regexp_replace(coalesce(${column},''),'[[:space:]]','','g'))`;
 return sql`CASE WHEN ${text}='' THEN ${empty} WHEN ${text} ~ '^[0-9]+$' THEN coalesce(nullif(ltrim(${text},'0'),''),'0') ELSE ${text} END`;
}
/** Call as the first step inside the INSERT transaction, before any accounting or stock write. */
export async function assertPurchaseInvoiceNotDuplicate(tx:Transaction,input:Identity) {
 const type=String(input.tipoComprobante??'').trim().toUpperCase();
 const number=canonicalPurchaseNumber(input.numeroComprobante);
 const pv=canonicalPurchaseNumber(input.puntoVenta,'0');
 if(!type || !number)throw Object.assign(new Error('Ingresá el tipo y número de comprobante.'),{statusCode:400});
 const cuit=String(input.proveedorCuit??'').replace(/\D/g,'');
 const validCuit=cuit.length===11;
 const document=JSON.stringify([type,pv,number]);
 const identities=[`supplier:${input.supplierId}`,...(validCuit?[`cuit:${cuit}`]:[])];
 for(const identity of identities.sort())await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`purchase-invoice:${identity}:${document}`},0))`);
 const duplicate=await tx.execute(sql`
  SELECT id,numero_comprobante,numero_comprobante_ext FROM purchase_invoices
  WHERE id <> ${input.excludeInvoiceId ?? 0} AND (
    (upper(btrim(tipo_comprobante))=${type}
      AND ${canonicalColumn(sql`numero_comprobante`)}=${number}
      AND ${canonicalColumn(sql`punto_venta`,'0')}=${pv})
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(special_details->'remitoHistory')='array' THEN special_details->'remitoHistory' ELSE '[]'::jsonb END) h
      WHERE upper(btrim(h->'previous'->>'tipo_comprobante'))=${type}
        AND ${canonicalColumn(sql`h->'previous'->>'numero_comprobante'`)}=${number}
        AND ${canonicalColumn(sql`h->'previous'->>'punto_venta'`,'0')}=${pv}
    )
  ) AND (supplier_id=${input.supplierId} OR (${validCuit} AND regexp_replace(coalesce(proveedor_cuit,''),'[^0-9]','','g')=${cuit}))
  ORDER BY id LIMIT 1
 `);
 const existing=duplicate.rows[0];
 if(existing)throw Object.assign(new Error(`El comprobante ${existing.numero_comprobante_ext || existing.numero_comprobante} ya fue registrado para este proveedor (ID #${existing.id}). No se permiten duplicados.`),{statusCode:409,existingId:existing.id,code:'PURCHASE_INVOICE_DUPLICATE'});
}

import { readLastAuthorizedNumber } from "./lastAuthorizedNumber";
import { parseConsultationResult } from "./consultationResult";

type Reader = {query:(sql:string, values?:any[])=>Promise<{rows:any[]}>};
const types:Record<string,number>={FA:1,FB:6,FC:11,FT:195,FM:201,FMB:206,NCA:3,NCB:8,NCM:203,NCMB:208};
export function diagnosticTargets(rooms:string[],date:string) {
  if (!rooms.length || rooms.length>2 || new Set(rooms).size!==rooms.length || rooms.some(r=>!/^\d{1,5}$/.test(r))) throw Error("Indicá una o dos habitaciones numéricas sin repetir.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date) throw Error("Fecha inválida.");
}
export async function diagnosticRead(c:Reader,sql:string,values?:any[]) {
  await c.query("BEGIN READ ONLY");
  try {
    await c.query("SET LOCAL statement_timeout='5s'");
    await c.query("SET LOCAL lock_timeout='1s'");
    return (await c.query(sql,values)).rows;
  } finally { await c.query("ROLLBACK"); }
}
export async function billingIncidentSnapshot(c:Reader,rooms:string[],date:string) {
  diagnosticTargets(rooms,date);
  const reservations=await diagnosticRead(c,`SELECT r.id, rm.room_number, r.status,
    r.check_in_date, r.check_out_date, r.total_room_amount,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',si.id,'type',si.tipo_comprobante,'pv',si.punto_venta,
      'number',si.numero,'status',si.estado,'hasCae',NULLIF(si.cae,'') IS NOT NULL,'fictitious',si.modo_ficticio,
      'amount',si.monto_total,'reconciliation',si.reconciliation_status,
      'operationId',si.credit_reapplication_intent->>'operationId')) FROM sales_invoices si WHERE si.reserva_id=r.id),'[]'::jsonb) AS invoices,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'amount',p.amount,'method',p.method,'status',p.status,
      'hasInvoiceRef',NULLIF(p.invoice_ref,'') IS NOT NULL,'hasRequestId',p.payment_request_id IS NOT NULL,
      'cashMovementCount',(SELECT count(*) FROM cash_movements cm WHERE cm.payment_id=p.id AND NOT cm.anulado)))
      FROM payments p WHERE p.reservation_id=r.id),'[]'::jsonb) AS payments
    FROM reservations r JOIN rooms rm ON rm.id=r.room_id WHERE rm.room_number=ANY($1::text[])
      AND r.check_in_date::date<=$2::date AND r.check_out_date::date>=$2::date
    ORDER BY rm.room_number,r.check_in_date DESC LIMIT 20`,[rooms,date]);
  return reservations;
}
function publicFault(xml:string,secrets:string[]) {
  const match=xml.match(/<(?:[\w.-]+:)?(?:faultstring|Msg)\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?(?:faultstring|Msg)>/i);
  if (!match) return undefined;
  let text=match[1].replace(/<[^>]*>/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  for (const secret of secrets.filter(Boolean)) text=text.split(secret).join('[hidden]');
  return text.replace(/\b\d{11,}\b/g,'[number hidden]').slice(0,350);
}
/** Only FECompUltimoAutorizado / FECompConsultar. Never FECAESolicitar or counter writes. */
export async function probeBillingIncident(c:Reader,rooms:string[],date:string,transport:typeof fetch=fetch) {
  const snapshot=await billingIncidentSnapshot(c,rooms,date);
  const config=(await diagnosticRead(c,`SELECT arca_ambiente,arca_cuit,cuit,punto_venta,punto_venta_homolog,
    arca_ta_token,arca_ta_sign,arca_ta_expiry,arca_ta_ambiente FROM billing_config LIMIT 1`))[0];
  const result:any={kind:'billing_incident_readonly',rooms,date,snapshot,provider:[]};
  if (!config || config.arca_ambiente!=='homologacion') return {...result,providerSkipped:'This incident probe only supports the existing homologacion environment'};
  result.environment='homologacion';
  const pv=Number(config.punto_venta_homolog??99);result.pointOfSale=pv;
  if (!config.arca_ta_token || !config.arca_ta_sign || config.arca_ta_ambiente!=='homologacion' || !Number.isFinite(new Date(config.arca_ta_expiry).getTime()) || new Date(config.arca_ta_expiry).getTime()<Date.now()+60_000) {
    return {...result,providerSkipped:'No current cached WSAA ticket; diagnostic never creates or modifies credentials'};
  }
  const token=String(config.arca_ta_token),sign=String(config.arca_ta_sign),issuer=String(config.arca_cuit||config.cuit||'').replace(/\D/g,'');
  const secrets=[token,sign,issuer];
  const auth=`<ar:Auth><ar:Token>${token}</ar:Token><ar:Sign>${sign}</ar:Sign><ar:Cuit>${issuer}</ar:Cuit></ar:Auth>`;
  const request=async(action:string,contents:string)=>{
    const body=`<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/"><soap:Body><ar:${action}>${auth}${contents}</ar:${action}></soap:Body></soap:Envelope>`;
    return transport('https://wswhomo.afip.gov.ar/wsfev1/service.asmx',{method:'POST',headers:{'Content-Type':'text/xml; charset=utf-8',SOAPAction:`"http://ar.gov.afip.dif.FEV1/${action}"`},body,signal:AbortSignal.timeout(10_000)});
  };
  for (const type of ['FA','FB']) {
    let response:Response|undefined;
    try {
      response=await request('FECompUltimoAutorizado',`<ar:PtoVta>${pv}</ar:PtoVta><ar:CbteTipo>${types[type]}</ar:CbteTipo>`);
      const last=await readLastAuthorizedNumber(response.clone(),{pointOfSale:pv,documentType:types[type]});
      const collision=await diagnosticRead(c,`SELECT id,estado,modo_ficticio,reserva_id,
        NULLIF(cae,'') IS NOT NULL AS has_cae FROM sales_invoices WHERE tipo_comprobante=$1 AND punto_venta=$2 AND numero=$3`,[type,pv,last+1]);
      result.provider.push({action:'last_authorized',type,pointOfSale:pv,ok:true,last,localNextNumberOccupants:collision});
    } catch(error:any) {
      const fault=response ? publicFault(await response.text(),secrets) : undefined;
      result.provider.push({action:'last_authorized',type,pointOfSale:pv,ok:false,httpStatus:response?.status,fault,errorCode:error?.code||error?.name||'UNKNOWN'});
    }
  }
  const invoices=snapshot.flatMap(r=>(r.invoices||[])).filter(i=>!i.fictitious && types[i.type] && ['autorizacion_pendiente','emitida','parcial'].includes(i.status)).slice(0,4);
  for(const invoice of invoices) {
    let response:Response|undefined;
    try {
      response=await request('FECompConsultar',`<ar:FeCompConsReq><ar:CbteTipo>${types[invoice.type]}</ar:CbteTipo><ar:PtoVta>${invoice.pv}</ar:PtoVta><ar:CbteNro>${invoice.number}</ar:CbteNro></ar:FeCompConsReq>`);
      const xml=await response.text();
      if(!response.ok) {result.provider.push({action:'consult',invoiceId:invoice.id,ok:false,httpStatus:response.status,fault:publicFault(xml,secrets)});continue;}
      const found=parseConsultationResult(xml,{tipo:invoice.type,puntoVenta:invoice.pv,numero:invoice.number,cuitEmisor:issuer,token,sign},types[invoice.type]);
      result.provider.push({action:'consult',invoiceId:invoice.id,ok:true,authorized:!!found});
    } catch(error:any) {result.provider.push({action:'consult',invoiceId:invoice.id,ok:false,errorCode:error?.code||error?.name||'UNKNOWN'});}
  }
  return result;
}

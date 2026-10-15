import { feCAESolicitar, feCompConsultar } from "../../wsfevClient";
import { FundingError } from "../contracts";
import type { FiscalIdentity, FiscalTransport } from "./fiscalGateway";
import { resolveFiscalRecipientDocument } from "../../fiscalDocument";
import type { PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

type Auth = {token:string;sign:string};
/** Config credentials are obtained server-side only, via the existing persisted
 * WSAA cache. This module does not read any credential/environment on import.
 */
export function createArcaTransport(auth: (identity: Omit<FiscalIdentity,"numero">, client?: PoolClient) => Promise<Auth>): FiscalTransport {
 const credentials=async(i:Omit<FiscalIdentity,"numero">,client?:PoolClient)=>{
   if(i.environment!=="homologacion") throw new FundingError("FISCAL_ENVIRONMENT_BLOCKED","Emisión productiva no autorizada.",503);
   return auth(i,client);
 };
 return {
   async prepareNumbering(i,client) {
     // This is a dedicated authentication transaction on the already owned
     // loan, BEFORE FundingStore opens its financial transaction. A rollback
     // of number/draft allocation must not erase an externally issued ticket.
     await client.query("BEGIN");
     let a:Auth;
     try {
       const lock=await client.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked",
         [`funding-wsaa:${i.environment}:${i.issuer}`]);
       if(lock.rows[0]?.locked!==true)
         throw new FundingError("CONCURRENT_CHANGE","Hay otra autenticación fiscal en curso. Reintentá la misma operación.",409,true);
       a=await credentials(i,client);
       await client.query("COMMIT");
     } catch(error) {
       await client.query("ROLLBACK").catch(()=>{});
       throw error;
     }
     return async()=>{
     const response=await fetch("https://wswhomo.afip.gov.ar/wsfev1/service.asmx",{
       method:"POST",headers:{"Content-Type":"text/xml; charset=utf-8",SOAPAction:'"http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado"'},
       signal:AbortSignal.timeout(10000),
       body:`<?xml version="1.0"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/"><soapenv:Body><ar:FECompUltimoAutorizado><ar:Auth><ar:Token>${a.token}</ar:Token><ar:Sign>${a.sign}</ar:Sign><ar:Cuit>${i.issuer}</ar:Cuit></ar:Auth><ar:PtoVta>${i.puntoVenta}</ar:PtoVta><ar:CbteTipo>${i.tipo==="FA"?1:6}</ar:CbteTipo></ar:FECompUltimoAutorizado></soapenv:Body></soapenv:Envelope>`,
     });
     const text=await response.text(),match=text.match(/<CbteNro>(\d+)<\/CbteNro>/);
     if(!response.ok || !match || /<(?:Errors|faultstring)>/.test(text)) throw new Error("ARCA no confirmó el último número fiscal.");
     return Number(match[1]);
     };
   },
   async authorize(i) {
     const a=await credentials(i),r=i.snapshot.recipient;
     return feCAESolicitar({...a,...i.snapshot.amounts,tipo:i.tipo,puntoVenta:i.puntoVenta,numero:i.numero,
       cuitEmisor:i.issuer,fecha:i.fecha.replace(/-/g,""),clienteCuit:r.cuit,clienteDni:r.dni,
       clienteDocumentType:r.documentType,clienteCondicionIva:r.condicionIva},i.environment);
   },
   async lookup(i) {
     const a=await credentials(i);
     const document=resolveFiscalRecipientDocument(i.snapshot.recipient);
     return feCompConsultar({...a,tipo:i.tipo,puntoVenta:i.puntoVenta,numero:i.numero,cuitEmisor:i.issuer},i.environment,
       {total:i.snapshot.amounts.montoTotal,fecha:i.fecha.replace(/-/g,""),docTipo:document.tipo,docNro:document.numero});
   },
 };
}

/** Actual application binding, not used by synthetic tests. No credential is
 * accessed until an explicitly mounted gateway is invoked. WSAA preserves its
 * normal application cache instead of performing a throw-away diagnostic login.
 */
export function configuredArcaTransport(): FiscalTransport {
 return createArcaTransport(async (identity,client)=>{
   const {getBillingConfig}=await import("../../billingConfig");
   const {getTokenAuth}=await import("../../wsaaClient");
   const database=client?drizzle(client,{schema}):undefined;
   const config=await getBillingConfig(database);
   const issuer=String(config.arcaCuit??config.cuit).replace(/\D/g,"");
   if(config.arcaAmbiente!==identity.environment || issuer!==identity.issuer ||
     config.puntoVentaHomolog!==identity.puntoVenta || !config.arcaCert || !config.arcaKey)
     throw new FundingError("FISCAL_ENVIRONMENT_BLOCKED","La configuración fiscal cambió o no está completa.",503);
   return getTokenAuth(config.arcaCert,config.arcaKey,identity.environment,database,true);
 });
}

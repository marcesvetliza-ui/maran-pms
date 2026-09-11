import { resolveFiscalRecipientDocument } from "./fiscalDocument";
import { assertExternalCommAllowed } from "../external-comms-policy";

const WSFE_HOMOLOG = "https://wswhomo.afip.gov.ar/wsfev1/service.asmx";
const WSFE_PROD    = "https://servicios1.afip.gov.ar/wsfev1/service.asmx";

const TIPOS_CBT: Record<string, number> = {
  FA: 1, FB: 6, FC: 11, FT: 195, FM: 201,
  NCA: 3, NCB: 8, NCC: 13, NCT: 197, NCM: 203,
  NDA: 2, NDB: 7, NDC: 12, NDT: 196, NDM: 202,
};

export interface FECAERequest {
  tipo: string;
  puntoVenta: number;
  numero: number;
  cuitEmisor: string;
  token: string;
  sign: string;
  montoTotal: number;
  montoNeto: number;
  montoNeto21: number;
  montoNeto105: number;
  montoIva21: number;
  montoIva105: number;
  montoExento: number;
  montoNoGravado: number;
  clienteCuit?: string;
  clienteDni?: string;
  clienteCondicionIva: string;
  fecha: string;
}

export interface FECAEResult {
  cae: string;
  caeFechaVto: Date;
}

export interface FECompConsulta {
  tipo: string;
  puntoVenta: number;
  numero: number;
  cuitEmisor: string;
  token: string;
  sign: string;
}

async function soapPost(url: string, action: string, body: string): Promise<string> {
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: `"http://ar.gov.afip.dif.FEV1/${action}"`,
    },
    body,
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`WSFEV1 HTTP ${resp.status}: ${text.slice(0, 400)}`);
  return text;
}

export function buildIvaBlock(neto21: number, iva21: number, neto105: number, iva105: number): string {
  const parts: string[] = [];
  if (neto21 > 0) {
    parts.push(
      `<ar:AlicIva><ar:Id>5</ar:Id>` +
      `<ar:BaseImp>${neto21.toFixed(2)}</ar:BaseImp>` +
      `<ar:Importe>${iva21.toFixed(2)}</ar:Importe></ar:AlicIva>`
    );
  }
  if (neto105 > 0) {
    parts.push(
      `<ar:AlicIva><ar:Id>4</ar:Id>` +
      `<ar:BaseImp>${neto105.toFixed(2)}</ar:BaseImp>` +
      `<ar:Importe>${iva105.toFixed(2)}</ar:Importe></ar:AlicIva>`
    );
  }
  if (!parts.length) return "";
  return `<ar:Iva>${parts.join("")}</ar:Iva>`;
}

function parseCaeResult(response: string): FECAEResult | null {
  const caeM = response.match(/<CAE>([^<]+)<\/CAE>/);
  if (!caeM) return null;
  const vtoM = response.match(/<CAEFchVto>([^<]+)<\/CAEFchVto>/);
  const vtoStr = vtoM ? vtoM[1] : "";
  return {
    cae: caeM[1],
    caeFechaVto: vtoStr
      ? new Date(`${vtoStr.slice(0, 4)}-${vtoStr.slice(4, 6)}-${vtoStr.slice(6, 8)}T12:00:00-03:00`)
      : new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
  };
}

/**
 * Consults the exact voucher number before retrying an interrupted
 * authorization. Returning null means ARCA explicitly reported no authorized
 * voucher; any ambiguous response throws so the system never risks a duplicate.
 */
export async function feCompConsultar(
  req: FECompConsulta,
  ambiente: "homologacion" | "produccion"
): Promise<FECAEResult | null> {
  assertExternalCommAllowed({ integration: "arca", action: `fecomp-consultar-${ambiente}` });

  const url = ambiente === "homologacion" ? WSFE_HOMOLOG : WSFE_PROD;
  const cbteTipo = TIPOS_CBT[req.tipo] ?? 6;
  const cuitLimpio = req.cuitEmisor.replace(/-/g, "");
  const envelope =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">` +
    `<soapenv:Body><ar:FECompConsultar>` +
    `<ar:Auth><ar:Token>${req.token}</ar:Token><ar:Sign>${req.sign}</ar:Sign><ar:Cuit>${cuitLimpio}</ar:Cuit></ar:Auth>` +
    `<ar:FeCompConsReq><ar:CbteTipo>${cbteTipo}</ar:CbteTipo><ar:PtoVta>${req.puntoVenta}</ar:PtoVta><ar:CbteNro>${req.numero}</ar:CbteNro></ar:FeCompConsReq>` +
    `</ar:FECompConsultar></soapenv:Body></soapenv:Envelope>`;
  const response = await soapPost(url, "FECompConsultar", envelope);
  const faultM = response.match(/<faultstring>([^<]+)<\/faultstring>/);
  if (faultM) throw new Error(`WSFEV1 Fault al consultar comprobante: ${faultM[1]}`);

  const existing = parseCaeResult(response);
  if (existing) return existing;

  // ARCA reports R / code 602 when the requested voucher does not exist.
  // Do not treat an unrecognized answer as "not found": it is safer to leave
  // the local NC pending for review than to risk authorizing it twice.
  const errorCodeM = response.match(/<Code>([^<]+)<\/Code>/);
  if (errorCodeM?.[1] === "602") return null;

  const errorM = response.match(/<Msg>([^<]+)<\/Msg>/);
  throw new Error(`ARCA no devolvió un estado verificable para la NC pendiente${errorM ? `: ${errorM[1]}` : ""}`);
}

export async function feCAESolicitar(
  req: FECAERequest,
  ambiente: "homologacion" | "produccion"
): Promise<FECAEResult> {
  assertExternalCommAllowed({ integration: "arca", action: `fecae-solicitar-${ambiente}` });

  const url = ambiente === "homologacion" ? WSFE_HOMOLOG : WSFE_PROD;
  const cbteTipo = TIPOS_CBT[req.tipo] ?? 6;
  const recipientDocument = resolveFiscalRecipientDocument({
    cuit: req.clienteCuit,
    dni: req.clienteDni,
  });
  const docTipo = recipientDocument.tipo;
  const docNro = recipientDocument.numero;
  const ivaBlock = buildIvaBlock(req.montoNeto21, req.montoIva21, req.montoNeto105, req.montoIva105);
  const impIva   = (req.montoIva21 + req.montoIva105).toFixed(2);
  const cuitLimpio = req.cuitEmisor.replace(/-/g, "");

  const envelope =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">` +
    `<soapenv:Body><ar:FECAESolicitar>` +
    `<ar:Auth>` +
    `<ar:Token>${req.token}</ar:Token>` +
    `<ar:Sign>${req.sign}</ar:Sign>` +
    `<ar:Cuit>${cuitLimpio}</ar:Cuit>` +
    `</ar:Auth>` +
    `<ar:FeCAEReq>` +
    `<ar:FeCabReq>` +
    `<ar:CantReg>1</ar:CantReg>` +
    `<ar:PtoVta>${req.puntoVenta}</ar:PtoVta>` +
    `<ar:CbteTipo>${cbteTipo}</ar:CbteTipo>` +
    `</ar:FeCabReq>` +
    `<ar:FeDetReq><ar:FECAEDetRequest>` +
    `<ar:Concepto>2</ar:Concepto>` +
    `<ar:DocTipo>${docTipo}</ar:DocTipo>` +
    `<ar:DocNro>${docNro}</ar:DocNro>` +
    `<ar:CbteDesde>${req.numero}</ar:CbteDesde>` +
    `<ar:CbteHasta>${req.numero}</ar:CbteHasta>` +
    `<ar:CbteFch>${req.fecha}</ar:CbteFch>` +
    `<ar:ImpTotal>${req.montoTotal.toFixed(2)}</ar:ImpTotal>` +
    `<ar:ImpTotConc>${req.montoNoGravado.toFixed(2)}</ar:ImpTotConc>` +
    `<ar:ImpNeto>${req.montoNeto.toFixed(2)}</ar:ImpNeto>` +
    `<ar:ImpOpEx>${req.montoExento.toFixed(2)}</ar:ImpOpEx>` +
    `<ar:ImpIVA>${impIva}</ar:ImpIVA>` +
    `<ar:ImpTrib>0.00</ar:ImpTrib>` +
    `<ar:MonId>PES</ar:MonId>` +
    `<ar:MonCotiz>1</ar:MonCotiz>` +
    `${ivaBlock}` +
    `</ar:FECAEDetRequest></ar:FeDetReq>` +
    `</ar:FeCAEReq>` +
    `</ar:FECAESolicitar></soapenv:Body></soapenv:Envelope>`;

  const resp = await soapPost(url, "FECAESolicitar", envelope);

  const faultM = resp.match(/<faultstring>([^<]+)<\/faultstring>/);
  if (faultM) throw new Error(`WSFEV1 Fault: ${faultM[1]}`);

  const resultM = resp.match(/<Resultado>([^<]+)<\/Resultado>/);
  if (resultM && resultM[1] === "R") {
    const errM = resp.match(/<Msg>([^<]+)<\/Msg>/);
    throw new Error(`ARCA rechazó el comprobante: ${errM ? errM[1] : "error desconocido"}`);
  }

  const result = parseCaeResult(resp);
  if (!result) {
    const errM = resp.match(/<Msg>([^<]+)<\/Msg>/);
    throw new Error(`CAE no recibido de ARCA${errM ? ": " + errM[1] : ""}`);
  }
  return result;
}

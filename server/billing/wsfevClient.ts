const WSFE_HOMOLOG = "https://wswhomo.afip.gov.ar/wsfev1/service.asmx";
const WSFE_PROD    = "https://servicios1.afip.gov.ar/wsfev1/service.asmx";

const TIPOS_CBT: Record<string, number> = { FA: 1, FB: 6, FC: 11, NCA: 3, NCB: 8, NCC: 13, NDA: 2, NDB: 7, NDC: 12 };

export interface FECAERequest {
  tipo: string;
  puntoVenta: number;
  numero: number;
  cuitEmisor: string;
  token: string;
  sign: string;
  montoTotal: number;
  montoNeto: number;
  montoIva21: number;
  montoIva105: number;
  montoExento: number;
  montoNoGravado: number;
  clienteCuit?: string;
  clienteCondicionIva: string;
  fecha: string;
}

export interface FECAEResult {
  cae: string;
  caeFechaVto: Date;
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

function buildIvaBlock(neto21: number, iva21: number, neto105: number, iva105: number): string {
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

export async function feCAESolicitar(
  req: FECAERequest,
  ambiente: "homologacion" | "produccion"
): Promise<FECAEResult> {
  const url = ambiente === "homologacion" ? WSFE_HOMOLOG : WSFE_PROD;
  const cbteTipo = TIPOS_CBT[req.tipo] ?? 6;
  const docTipo  = req.clienteCuit ? 80 : 96;
  const docNro   = req.clienteCuit ? req.clienteCuit.replace(/-/g, "") : "0";
  const ivaBlock = buildIvaBlock(req.montoNeto, req.montoIva21, 0, req.montoIva105);
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

  const caeM = resp.match(/<CAE>([^<]+)<\/CAE>/);
  const vtoM = resp.match(/<CAEFchVto>([^<]+)<\/CAEFchVto>/);
  if (!caeM) {
    const errM = resp.match(/<Msg>([^<]+)<\/Msg>/);
    throw new Error(`CAE no recibido de ARCA${errM ? ": " + errM[1] : ""}`);
  }

  const vtoStr = vtoM ? vtoM[1] : "";
  const caeFechaVto = vtoStr
    ? new Date(`${vtoStr.slice(0, 4)}-${vtoStr.slice(4, 6)}-${vtoStr.slice(6, 8)}T12:00:00-03:00`)
    : new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

  return { cae: caeM[1], caeFechaVto };
}

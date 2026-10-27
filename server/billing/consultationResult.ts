import { SaxesParser } from "saxes";
import type { FECAEResult, FECompConsulta, FECAERequest } from "./wsfevClient";

const WSFE = "http://ar.gov.afip.dif.FEV1/";
const SOAP = "http://schemas.xmlsoap.org/soap/envelope/";
type Node = { name: string; uri: string; text: string; children: Node[] };
type Expected = { total: number; fecha: string; docTipo: number; docNro: string };

function one(parent: Node, name: string, uri = WSFE): Node | undefined {
  const matches = parent.children.filter(n => n.name === name && n.uri === uri);
  if (matches.length > 1) throw new Error("ARCA: respuesta fiscal ambigua.");
  return matches[0];
}
function field(parent: Node, name: string): string {
  const node = one(parent, name);
  if (!node || node.children.length || !node.text.trim())
    throw new Error(`ARCA: falta evidencia fiscal ${name}.`);
  return node.text.trim();
}

function soapResult(xml: string, method: string): Node {
  const root: Node = { name: "", uri: "", text: "", children: [] };
  const stack = [root];
  const parser = new SaxesParser({ xmlns: true });
  parser.on("doctype", () => { throw new Error("ARCA: DTD no permitido."); });
  parser.on("opentag", tag => {
    const node = { name: tag.local, uri: tag.uri, text: "", children: [] };
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  });
  parser.on("text", text => { stack[stack.length - 1].text += text; });
  parser.on("cdata", text => { stack[stack.length - 1].text += text; });
  parser.on("closetag", () => { stack.pop(); });
  parser.write(xml).close();
  const envelope = one(root, "Envelope", SOAP);
  const body = envelope && one(envelope, "Body", SOAP);
  if (!body || one(body, "Fault", SOAP)) throw new Error("ARCA no devolvió un estado verificable (SOAP).");
  const response = one(body, `${method}Response`);
  const result = response && one(response, `${method}Result`);
  if (!result) throw new Error("ARCA no devolvió un estado verificable.");
  return result;
}

function authorization(cae: string, expiry: string): FECAEResult {
  const date = new Date(`${expiry.slice(0, 4)}-${expiry.slice(4, 6)}-${expiry.slice(6, 8)}T15:00:00Z`);
  if (!/^\d{14}$/.test(cae) || !/^\d{8}$/.test(expiry) || !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10).replace(/-/g, "") !== expiry)
    throw new Error("ARCA: CAE o vencimiento inválido.");
  return { cae, caeFechaVto: date };
}

/** FECompConsultar is NOT a FECAESolicitar response. Only the exact ResultGet
 * in the SOAP/WSFE path is evidence; unrelated tags cannot authorize a claim. */
export function parseConsultationResult(xml: string, req: FECompConsulta, tipo: number, expected?: Expected): FECAEResult | null {
  const result = soapResult(xml, "FECompConsultar");
  const errors = one(result, "Errors");
  const entries = errors?.children ?? [];
  const found = one(result, "ResultGet");
  if (!found) {
    // Only an unambiguous missing-voucher error is negative evidence.
    if (entries.length === 1 && entries[0].name === "Err" && entries[0].uri === WSFE &&
        field(entries[0], "Code") === "602") return null;
    throw new Error("ARCA no devolvió un estado verificable.");
  }
  if (entries.length) throw new Error("ARCA: respuesta fiscal contradictoria.");
  // The WSFE query schema does not require Resultado, but if supplied it
  // cannot contradict the CAE authorization.
  const outcome = one(found, "Resultado");
  if ((outcome && outcome.text.trim() !== "A") || field(found, "EmisionTipo") !== "CAE")
    throw new Error("ARCA no devolvió una autorización CAE verificable.");
  if (Number(field(found, "CbteTipo")) !== tipo || Number(field(found, "PtoVta")) !== req.puntoVenta ||
      Number(field(found, "CbteDesde")) !== req.numero || Number(field(found, "CbteHasta")) !== req.numero)
    throw new Error("ARCA: el comprobante consultado no coincide con la identidad fiscal persistida.");
  if (expected && (
      !/^\d+(?:\.\d{1,2})?$/.test(field(found, "ImpTotal")) ||
      Math.round(Number(field(found, "ImpTotal")) * 100) !== Math.round(expected.total * 100) ||
      field(found, "CbteFch") !== expected.fecha || Number(field(found, "DocTipo")) !== expected.docTipo ||
      field(found, "DocNro") !== expected.docNro || field(found, "MonId") !== "PES" ||
      Number(field(found, "MonCotiz")) !== 1))
    throw new Error("ARCA: el comprobante consultado no coincide con la identidad fiscal persistida.");
  return authorization(field(found, "CodAutorizacion"), field(found, "FchVto"));
}

/** Authorization has its own structure and field names, never ResultGet. */
export function parseAuthorizationResult(xml: string, req: FECAERequest, tipo: number): FECAEResult {
  const result = soapResult(xml, "FECAESolicitar");
  const header = one(result, "FeCabResp"), details = one(result, "FeDetResp");
  const detail = details && one(details, "FECAEDetResponse");
  if (!header || !detail || one(result, "Errors")?.children.length ||
      field(header, "Resultado") !== "A" || field(detail, "Resultado") !== "A")
    {
      const errors=one(result,"Errors")?.children || [];
      const observations=detail ? one(detail,"Observaciones")?.children || [] : [];
      const reasons=[...errors,...observations].filter(n=>n.uri===WSFE && ["Err","Obs"].includes(n.name)).slice(0,5).map(n=>{
        const code=one(n,"Code")?.text.trim(),message=one(n,"Msg")?.text.trim();
        return message ? `${code ? code+": " : ""}${message.slice(0,500)}` : "";
      }).filter(Boolean);
      throw new Error(`ARCA rechazó el comprobante o no confirmó su autorización.${reasons.length ? " " + reasons.join("; ") : ""}`);
    }
  if (Number(field(header, "PtoVta")) !== req.puntoVenta || Number(field(header, "CbteTipo")) !== tipo ||
      Number(field(detail, "CbteDesde")) !== req.numero || Number(field(detail, "CbteHasta")) !== req.numero)
    throw new Error("ARCA: autorización no coincide con la identidad fiscal enviada.");
  return authorization(field(detail, "CAE"), field(detail, "CAEFchVto"));
}

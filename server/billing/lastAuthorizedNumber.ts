/** Never turn an unavailable/invalid ARCA response into an unused fiscal series. */
export class FiscalNumberLookupError extends Error {
  readonly code = "FISCAL_NUMBER_LOOKUP_FAILED";
  constructor(readonly statusCode = 502, reason = "respuesta inválida") {
    super(`No se pudo consultar el último comprobante autorizado en ARCA (${reason}). No se asignó un nuevo número. Reintentá la misma operación.`);
    this.name = "FiscalNumberLookupError";
  }
}

const prefix = "(?:[A-Za-z_][\\w.-]*:)?";
function elements(xml: string, tag: string) {
  return [...xml.matchAll(new RegExp(`<${prefix}${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${prefix}${tag}\\s*>`, "g"))].map(match => match[1]);
}
export async function readLastAuthorizedNumber(response: Response, expected: {pointOfSale:number; documentType:number}) {
  if (!response.ok) throw new FiscalNumberLookupError(502, `HTTP ${response.status}`);
  const xml = await response.text();
  if (new RegExp(`<${prefix}(?:Fault|Errors|Err)(?:[\\s>/])`).test(xml)) {
    throw new FiscalNumberLookupError(502, "ARCA informó un error");
  }
  const results = elements(xml, "FECompUltimoAutorizadoResult");
  if (results.length !== 1) throw new FiscalNumberLookupError();
  const result = results[0];
  const readInteger = (tag: string) => {
    const values = elements(result,tag);
    if (values.length !== 1 || !/^\d+$/.test(values[0].trim())) throw new FiscalNumberLookupError();
    const value=Number(values[0].trim());
    if (!Number.isSafeInteger(value)) throw new FiscalNumberLookupError();
    return value;
  };
  if (readInteger("PtoVta") !== expected.pointOfSale || readInteger("CbteTipo") !== expected.documentType) {
    throw new FiscalNumberLookupError(502, "la respuesta corresponde a otra serie");
  }
  const last = readInteger("CbteNro");
  if (last >= 99_999_999) throw new FiscalNumberLookupError(502, "numeración fuera de rango");
  return last;
}

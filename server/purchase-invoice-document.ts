import { validCalendarDate } from "./stayEligibility";

type Document = {
  punto_venta: string | null;
  numero_comprobante: string;
  numero_comprobante_ext: string | null;
  fecha_emision: string;
  periodo: string | null;
  estado: string;
};
const invalid = (message: string, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });

/** Resolve only the document fields offered by the regular purchase editor.
 * Omitted fields stay intact; settled documents use the audited correction flow.
 */
export function purchaseDocumentAfterEdit(
  before: Document,
  input: Record<string, unknown>,
) {
  const text = (key: string, fallback: string | null) => {
    if (input[key] === undefined) return fallback;
    if (input[key] === null) return null;
    if (typeof input[key] !== "string" && typeof input[key] !== "number")
      throw invalid(
        "Revisá el punto de venta, el número y el período del comprobante.",
      );
    return String(input[key]).trim() || null;
  };
  const point = text("puntoVenta", before.punto_venta);
  const number = text("numeroComprobante", before.numero_comprobante);
  const date =
    input.fechaEmision === undefined
      ? before.fecha_emision
      : input.fechaEmision;
  if (!number || (number !== before.numero_comprobante && number.length > 100))
    throw invalid("Ingresá un número de comprobante válido.");
  if (
    point !== before.punto_venta &&
    point !== null &&
    !/^\d{1,5}$/.test(point)
  )
    throw invalid("El punto de venta debe tener hasta 5 dígitos.");
  if (typeof date !== "string" || !validCalendarDate(date))
    throw invalid("Ingresá una fecha de emisión válida.");
  const period = text("periodo", before.periodo);
  if (
    period !== before.periodo &&
    period !== null &&
    !/^(0[1-9]|1[0-2])\/\d{4}$/.test(period)
  )
    throw invalid("El período debe tener formato MM/AAAA.");
  const identityChanged =
    point !== before.punto_venta || number !== before.numero_comprobante;
  const changed =
    identityChanged ||
    date !== before.fecha_emision ||
    period !== before.periodo;
  if (changed && ["pagado", "parcial"].includes(before.estado))
    throw invalid(
      "Para modificar la fecha o el número de un comprobante pagado o parcialmente pagado, usá «Corregir datos». El período contable se conserva.",
      409,
    );
  return {
    point,
    number,
    date,
    period,
    identityChanged,
    changed,
    external: identityChanged
      ? point
        ? `${point.padStart(5, "0")}-${number.padStart(8, "0")}`
        : number
      : before.numero_comprobante_ext,
  };
}

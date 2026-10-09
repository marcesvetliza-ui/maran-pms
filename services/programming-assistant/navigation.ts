import { CodeSource } from "./source";
import type { SupportTicket } from "../../shared/programming-support";
/** Orientation is code, not a presumed conclusion. Only existing, authorized paths are used. */
export async function orientInvestigation(
  ticket: SupportTicket,
  source: CodeSource,
) {
  const files = await source.files();
  const text =
    `${ticket.title} ${ticket.actual} ${ticket.expected} ${ticket.steps} ${ticket.messages?.map((m) => m.text).join(" ") || ""}`.toLowerCase();
  const purchases = /compra|proveedor|purchase/.test(text);
  const discount = /descuento|discount/.test(text);
  const terms = purchases
    ? ["purchase", "compras"]
    : ticket.module === "inventario"
      ? ["inventory", "stock"]
      : ticket.module === "grupos"
        ? ["group"]
        : ticket.module === "spa"
          ? ["spa"]
          : ticket.module === "restaurant"
            ? ["restaurant"]
            : ["billing", "reservation", "night-audit"];
  const candidates = files
    .filter((p) => terms.some((term) => p.toLowerCase().includes(term)))
    .slice(0, 60);
  const seedPaths = purchases
    ? [
        ...(discount
          ? ["shared/purchaseInvoiceDiscount.ts"]
          : ["shared/purchaseInvoiceTotals.ts"]),
        "server/purchase-invoice-stock.ts",
        discount
          ? "server/tests/purchase-invoice-discount.test.ts"
          : "server/tests/purchase-invoice-stock.pg.test.ts",
      ]
    : [];
  const initialReads = [];
  for (const file of seedPaths.filter((p) => files.includes(p)))
    initialReads.push(await source.read(file, 1, 140));
  return {
    entryPoints: ["server/routes.ts", "server/storage.ts", "shared/schema.ts"].filter((p) => files.includes(p)),
    candidateFiles: candidates,
    initialReads,
    workflow:
      "Seguir formulario → endpoint y funciones importadas → persistencia/costos → pruebas existentes. El mapa no cubre todo: usar find_files y search_code por prefijo para continuar. El contenido de pruebas es evidencia de lo que prueban, nunca de que se hayan ejecutado.",
  };
}

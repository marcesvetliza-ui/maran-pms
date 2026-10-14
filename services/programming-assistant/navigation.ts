import { CodeSource } from "./source";
import type { SupportTicket } from "../../shared/programming-support";
/** Orientation is code, not a presumed conclusion. Only existing, authorized paths are used. */
export async function orientInvestigation(
  ticket: SupportTicket,
  source: CodeSource,
) {
  const files = await source.files();
  const text =
    `${ticket.module} ${ticket.title} ${ticket.actual} ${ticket.expected} ${ticket.steps} ${ticket.messages?.map((m) => m.text).join(" ") || ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const discount = /descuento|discount/.test(text);
  // Users describe invoice amounts and item costs without saying "compra".
  // This is a navigation hint, not a conclusion about the invoice or its behavior.
  const purchases = /compra|proveedor|purchase/.test(text) ||
    (discount && /factura|fact-[abc]|invoice/.test(text) && /stock|articul|unitari/.test(text));
  const production = /produccion|production/.test(text);
  const inventoryPreview = /vista previa|preview|consumo interno|internal consumption/.test(text) && /consumo|receta|recipe|ingredient|porcion|stock|inventario/.test(text);
  const errorFlow = inventoryPreview && /error|mensaje|pantalla|interfaz/.test(text);
  const terms = purchases
    ? ["purchase", "compras"]
    : production
      ? ["production", "inventoryStockEngine", "inventorySafety"]
    : ticket.module === "inventario" || inventoryPreview
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
    : production
      ? ["server/productionPending.ts", "server/production.ts", "server/tests/production-workflow.pg.test.ts", "server/tests/inventory-stage2-workflows.pg.test.ts", "server/db.ts"]
      : [];
  const initialReads = [];
  for (const file of seedPaths.filter((p) => files.includes(p)))
    initialReads.push(await source.read(file, 1, 140));
  // Read actual definitions/call sites beyond imports in long files.
  const anchors = purchases && discount
    ? [{path:"client/src/pages/purchase-invoices.tsx",term:"restorePurchaseDiscount(editingInvoice)"},
       {path:"server/routes.ts",term:"const body = applyPurchaseDiscount"}]
    : production
      ? [{path:"server/production.ts",term:"export async function registerProductionRun"}]
      : [];
  const workflowReads=[];
  for (const anchor of anchors.filter(a=>files.includes(a.path))) {
    const matches=await source.search(anchor.term,anchor.path);
    for (const match of matches.matches.filter(m=>m.path===anchor.path).slice(0,2)) {
      const start=Math.max(1,match.line-5);
      workflowReads.push(await source.read(anchor.path,start,start+139));
    }
  }
  const endpointContext = inventoryPreview
    ? [await source.traceEndpoint("/api/inventory/recipe-stock-preview", { includeTests: !errorFlow })]
    : [];
  if (errorFlow && endpointContext.some(context => context.callers.some(read => /\bapiRequest\s*\(/.test(read.content))) && files.includes("client/src/lib/queryClient.ts")) {
    workflowReads.push(await source.read("client/src/lib/queryClient.ts", 1, 40));
  }
  return {
    investigationFocus: errorFlow ? "Seguir el mensaje: error del endpoint → apiRequest → catch de la pantalla. No releer cálculos o persistencia ajenos a ese requisito. Las pruebas operativas no se precargaron en este recorrido; no inferir que no existen." : undefined,
    endpointContext,
    entryPoints: ["server/routes.ts", "server/storage.ts", "shared/schema.ts"].filter((p) => files.includes(p)),
    candidateFiles: candidates,
    initialReads,
    workflowReads,
    workflow:
      "Inspeccionar initialReads y workflowReads. Seguir formulario → endpoint y funciones importadas → persistencia/costos → pruebas existentes. Leer las implementaciones de funciones llamadas: un comentario no demuestra atomicidad o rollback. Buscar pruebas en todo server/tests, no solo archivos del módulo: inventory-stage2-workflows.pg.test.ts contiene circuitos integrados. Antes de recomendar agregar una prueba, verificar si ya existe la aserción. Continuar con read_code si el cuerpo o endpoint no termina en el fragmento recibido. Las pruebas leídas no fueron ejecutadas.",
  };
}

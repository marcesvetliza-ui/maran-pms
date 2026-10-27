import {creditNoteRecoveryChecklist,orientCreditNoteRecovery} from "./credit-note-recovery";
import {orientInvoiceConflict,invoiceConflictChecklist} from "./invoice-conflict";
import { CodeSource } from "./source";
import type { SupportTicket } from "../../shared/programming-support";
import {buildDecisionBrief} from "./decision-brief";
/** Orientation is code, not a presumed conclusion. Only existing, authorized paths are used. */
export async function orientInvestigation(
  ticket: SupportTicket,
  source: CodeSource,
) {
  const files = await source.files();
  const text =
    `${ticket.module} ${ticket.title} ${ticket.actual} ${ticket.expected} ${ticket.steps} ${ticket.messages?.map((m) => m.text).join(" ") || ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const roomMove = /cambi|modific|asigna|move|change/.test(text) && /habitacion|room/.test(text) && /reserva|reservation|disponib|superpuest|overlap/.test(text);
  const creditNoteRecovery=!["spa","restaurant","inventario","compras"].includes(ticket.module) && !/\bspa\b|restaurant/.test(text) && /\bgrupos?\b|\breservas?\b/.test(text) && /nota[s]? de credito|\bnc\b|credit.note/.test(text) && /pendiente|concili|reconcil/.test(text);
  const invoiceConflict=!creditNoteRecovery && !["grupos","spa","restaurant","inventario"].includes(ticket.module) && /factur|comprobante/.test(text) && /saldo (?:in)?suficiente|dos personas|dos operadores|dos sesiones|al mismo tiempo|concurrent|simultane/.test(text);
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
      : roomMove ? ["shared/room-availability.ts", "server/tests/room-availability.test.ts"] : [];
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
    : roomMove ? [await source.traceEndpoint("/api/reservations/:id", { method: "PATCH", includeTests: false })] : [];
  if (roomMove) {
    for (const symbol of ["checkOverbooking", "updateReservation", "updateReservationPricingLocked"]) {
      const code = await source.inspectSymbol(symbol, {maxDefinitions:1,maxTests:0,lines:140});
      workflowReads.push(...code.definitions);
    }
  }
  if (errorFlow && endpointContext.some(context => context.callers.some(read => /\bapiRequest\s*\(/.test(read.content))) && files.includes("client/src/lib/queryClient.ts")) {
    workflowReads.push(await source.read("client/src/lib/queryClient.ts", 1, 40));
    // Read the existing presentation helper, not just transport, plus one real use.
    const parser = await source.inspectSymbol("parseApiError", { maxDefinitions: 1, maxTests: 0, lines: 100 });
    workflowReads.push(...parser.definitions);
    if (parser.definitions.length) {
      const examples = await source.search("parseApiError(", "client/src/pages/");
      const example = examples.matches.find(match => !match.path.includes(".test."));
      if (example) workflowReads.push(await source.read(example.path, Math.max(1, example.line - 3), example.line + 3));
    }
  }
  if(errorFlow) {
    // Inspect the real throw site and the configuration component, rather than
    // assuming that a function named "convert" looks up missing conversions.
    for(const symbol of ["unitFactor","inventoryUnitFactor","convertInventoryQuantity","InventoryUnitConversions"]) {
      const code=await source.inspectSymbol(symbol,{maxDefinitions:1,maxTests:0,lines:30});
      workflowReads.push(...code.definitions);
    }
    const uses=await source.search("<InventoryUnitConversions", "client/src/pages/");
    const use=uses.matches.find(match=>!match.path.includes(".test."));
    if(use)workflowReads.push(await source.read(use.path,Math.max(1,use.line-4),use.line+4));
  }
  if(creditNoteRecovery)workflowReads.push(...await orientCreditNoteRecovery(source));
  const coverageChecklist=creditNoteRecovery ? creditNoteRecoveryChecklist : invoiceConflict && !purchases ? invoiceConflictChecklist : [];
  if(invoiceConflict && !purchases)workflowReads.push(...await orientInvoiceConflict(source));
  return {
    decisionBrief:await buildDecisionBrief(source,coverageChecklist,workflowReads),
    coverageChecklist,
    investigationFocus: creditNoteRecovery ? creditNoteRecoveryChecklist.join(" ") : errorFlow ? "Seguir el mensaje: error del endpoint → apiRequest → catch de la pantalla → utilidad existente para presentar errores. Leer el parser y su ejemplo antes de proponer una solución o preguntar por convenciones de la aplicación. No releer cálculos o persistencia ajenos a ese requisito. Las pruebas operativas no se precargaron en este recorrido; no inferir que no existen." : roomMove ? "Seguir el PATCH de la reserva, checkOverbooking y updateReservation. Distinguir pruebas de función pura de integración: nombrar exactamente la función probada y citar su aserción, sin atribuirla a checkOverbooking ni al PATCH por semejanza. Leer el catch de la pantalla: diferenciar un texto fijo del detalle enviado por el servidor y verificar qué cierra la edición en éxito o error. Explicar las comparaciones de fechas que permiten egreso/ingreso el mismo día. Si faltan pruebas del cambio de habitación, buscarlas sin inferir que no existen. No expandir automáticamente otras operaciones cercanas." : invoiceConflict && !purchases ? invoiceConflictChecklist.join(" ") : undefined,
    endpointContext,
    entryPoints: ["server/routes.ts", "server/storage.ts", "shared/schema.ts"].filter((p) => files.includes(p)),
    candidateFiles: candidates,
    initialReads,
    workflowReads,
    workflow:
      "Inspeccionar initialReads y workflowReads. Seguir formulario → endpoint y funciones importadas → persistencia/costos → pruebas existentes. Leer las implementaciones de funciones llamadas: un comentario no demuestra atomicidad o rollback. Buscar pruebas en todo server/tests, no solo archivos del módulo: inventory-stage2-workflows.pg.test.ts contiene circuitos integrados. Antes de recomendar agregar una prueba, verificar si ya existe la aserción. Continuar con read_code si el cuerpo o endpoint no termina en el fragmento recibido. Las pruebas leídas no fueron ejecutadas.",
  };
}

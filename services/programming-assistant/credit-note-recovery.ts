import type {CodeSource} from "./source";

export const creditNoteRecoveryChecklist = [
  "NC pendiente: distinguir la operación fallida de eliminar pagos, reemplazar facturas y crear otra NC; leer la recuperación existente y su pantalla antes de concluir.",
  "Separar autorización fiscal y conciliación local. El estado pendiente informado no demuestra cuál falló ni que exista un CAE; identificar qué dato operativo falta sin inventar el error.",
  "Contrastar el identificador usado al recuperar, los estados admitidos, la rama de grupo/reserva, los permisos y el error persistido; no atribuir al incidente un guard de otra operación.",
  "La recomendación operativa debe corresponder a las acciones verificadas en pantalla; no dar por inexistente una funcionalidad que no se inspeccionó. Tests leídos, nunca ejecutados.",
] as const;
export const isCreditNoteRecoveryCoverage = (coverage:readonly string[]) => coverage.includes(creditNoteRecoveryChecklist[0]);

// Questions and source anchors, not a diagnosis or permission to retry.
export const creditNoteRecoveryDecisions = [
  {id:"recovery_route",question:"¿Qué operación recupera la NC existente y cómo distingue grupo/reserva y estados?",path:"server/billing/routes.ts",anchor:'app.post("/api/billing/credit-notes/:id/reconcile"',windows:[{before:0,after:58}]},
  {id:"group_identity",question:"¿Cuándo consulta/autorizan la identidad existente y cuándo se aplica la conciliación local del grupo?",path:"server/billing/groupCreditRecovery.ts",anchor:'if (nc.estado === "autorizacion_pendiente")',windows:[{before:2,after:30}]},
  {id:"error_detail",question:"¿Qué error se conserva y presenta si falla la recuperación?",path:"server/billing/routes.ts",anchor:'const message = String(error?.message || "No se pudo conciliar la Nota de Crédito")',windows:[{before:0,after:20}]},
  {id:"recovery_screen",question:"¿Qué acción ofrece Facturación sobre la NC pendiente y qué mensaje muestra?",path:"client/src/pages/billing.tsx",anchor:'Reintentar y conciliar',windows:[{before:18,after:3}]},
] as const;

export async function orientCreditNoteRecovery(source:CodeSource) {
  const reads:Awaited<ReturnType<CodeSource['read']>>[]=[];
  const files=await source.files();
  for(const decision of creditNoteRecoveryDecisions){
    if(!files.includes(decision.path))continue;
    const match=(await source.search(decision.anchor,decision.path)).matches.find(item=>item.path===decision.path);
    if(!match)continue;
    for(const window of decision.windows)reads.push(await source.read(match.path,Math.max(1,match.line-window.before),match.line+window.after));
  }
  // Read the real browser request/catch and a test's scope + actual recovery
  // assertions. Merely having a test filename is never operational evidence.
  for(const anchor of [
    {path:"client/src/pages/billing.tsx",term:"const reconcileCreditNoteMutation = useMutation",before:0,after:28},
    {path:"server/tests/group-credit-recovery.pg.test.ts",term:"lists the group pending NC outside date filters",before:0,after:42},
  ]){
    if(!files.includes(anchor.path))continue;
    const match=(await source.search(anchor.term,anchor.path)).matches.find(item=>item.path===anchor.path);
    if(match)reads.push(await source.read(match.path,Math.max(1,match.line-anchor.before),match.line+anchor.after));
  }
  const test="server/tests/group-credit-recovery.pg.test.ts";
  if(files.includes(test))reads.push(await source.read(test,1,56));
  return reads;
}

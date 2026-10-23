import type {CodeSource} from './source';

/** Navigation for a concurrent invoice question. All findings still need review. */
export async function orientInvoiceConflict(source:CodeSource) {
 const files=await source.files();
 const reads:Awaited<ReturnType<CodeSource['read']>>[]=[];
 const anchors=[
  {path:'server/billing/routes.ts',term:'app.post("/api/billing/invoices"',before:0,after:20},
  {path:'server/billing/routes.ts',term:'El cargo seleccionado ya no tiene saldo suficiente',before:65,after:10},
  {path:'client/src/components/PrefacturaDialog.tsx',term:'const completed = await submission.current!.run',before:5,after:20},
  {path:'client/src/components/PrefacturaDialog.tsx',term:'setSubmitError(err.message',before:20,after:5},
 ];
 for(const anchor of anchors){
  if(!files.includes(anchor.path))continue;
  const match=(await source.search(anchor.term,anchor.path)).matches.find(match=>match.path===anchor.path);
  if(match)reads.push(await source.read(match.path,Math.max(1,match.line-anchor.before),match.line+anchor.after));
 }
 if(files.includes('client/src/lib/prefactura-submission.ts'))reads.push(await source.read('client/src/lib/prefactura-submission.ts',1,80));
 for(const symbol of ['withReservationInvoiceLock','withInvoiceAdvisoryLock']) {
  const lock=await source.inspectSymbol(symbol,{maxDefinitions:1,maxTests:0,lines:70});
  reads.push(...lock.definitions);
 }
 const testFiles=(await source.findFiles('invoiceconcurrency','server/tests/')).files.filter(path=>!path.includes('programming-')).slice(0,2);
 for(const path of testFiles){
  // Mocks are part of test scope: an HTTP test is not necessarily a real DB test.
  reads.push(await source.read(path,1,80));
  const matches=await source.search('Promise.all',path);
  for(const match of matches.matches.slice(0,2))reads.push(await source.read(path,Math.max(1,match.line-5),match.line+25));
  const pending=await source.search('reserves source capacity while an authorization-pending',path);
  for(const match of pending.matches.slice(0,1))reads.push(await source.read(path,match.line,match.line+31));
 }
 return reads;
}
export const invoiceConflictChecklist=[
 'Capacidad por importe y estados fiscales: contrastar decisionBrief; citar el lock si se afirma serialización.',
 'Separar factura de cobro: contrastar orden emisión/pagos; sin registros operativos, consultar comprobantes y Caja sin repetir operaciones.',
 'Catch de Prefactura: explicar mensaje, descarte condicionado e identidad según las ramas leídas.',
 'Tests: identificar mocks y aserciones ya existentes, leídos pero no ejecutados; proponer sólo comprobaciones adicionales útiles.',
 'Alcance: reserva e interfaz identificadas; responder la consulta sin extender a otros circuitos ni pedir datos técnicos investigables.',
];

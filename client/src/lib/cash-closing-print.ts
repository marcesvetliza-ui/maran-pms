import { cleanCashMovementLabel } from './account-movement-display';

export type ClosingPrintMovement = {
  time: string; description: string; room: string; method: string; amount: number;
  kind: string; document: string; documentClass: string; cancelled?: boolean; cancelReason?: string;
};
export type ClosingPrintReport = {
  area: string; shift: string; date: string; openedBy: string; openedTime: string;
  closedBy: string; closedTime: string; closedDate?: string; generatedAt: string;
  total: number; count: number;
  methods: {label: string; total: number; count: number}[];
  movements: ClosingPrintMovement[];
  documents: {label: string; total: number}[];
  systemCash: number | null; countedCash: number | null;
  snapshot?: {label: string; total: number}[];
};
const money = (value: number) => new Intl.NumberFormat('es-AR', {style:'currency',currency:'ARS',minimumFractionDigits:2,maximumFractionDigits:2}).format(value);
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/_/g,' ').trim();
/** Only shorten recognized system labels. Keep free-text concepts and company
 * names intact; a name without a comma does not reliably identify a surname. */
export function compactClosingIdentity(movement: {description?: string | null; sourceLabel?: string | null}, method: string) {
  const raw = (movement.description || movement.sourceLabel || '').replace(/\s+/g,' ').trim();
  const room = raw.match(/\bHab(?:itaci[oó]n)?\.?\s*([\p{L}\d-]+)\b/iu)?.[1] || '';
  const guest = raw.match(/\bHab(?:itaci[oó]n)?\.?\s*[\p{L}\d-]+\s*—\s*(.+?)(?:\s*—\s*Pago\s+.+)?$/iu)?.[1];
  if (guest && /^(?:(?:Reserva|Anulaci[oó]n)\s+(?:RES-|RS-|CHX-)|Hab(?:\.|itaci[oó]n)?\s|Check-out sin cargos\s*—)/iu.test(raw)) {
    return {room,description:guest.split(',')[0].trim() || guest};
  }
  let description = cleanCashMovementLabel(raw)
    .replace(/\b(?:RES-\d{6,}(?:-\d+)?|RS-\d+|CHX-[a-f\d-]{36})\b/g,'')
    .replace(/\s*—\s*Pago\s+(?:efectivo|cash|tarjeta_credito|tarjeta_debito|credit_card|debit_card|transferencia|transfer|mercadopago)\s*$/iu,'')
    .replace(/\s*—\s*Hab(?:itaci[oó]n)?\.?\s*[\p{L}\d-]+(?=\s*\(|\s*$)/iu,'')
    .replace(/\s{2,}/g,' ').trim();
  if (/^Recibo CC\s*—/iu.test(description)) {
    const suffix = description.match(/\s*\(([^()]*)\)$/u);
    if (suffix && normalize(suffix[1]) === normalize(method)) description = description.slice(0, suffix.index).trim();
    description = description.replace(/^Recibo CC\s*—\s*/iu,'Recibo CC · ');
  }
  return {room,description:description || 'Reserva'};
}
function conciseDocument(reference: string, classification: string) {
  const short = reference
    .replace(/\bFactura ([ABCTM])\b/giu,'F$1')
    .replace(/\bNota de cr[eé]dito ([ABC])\b/giu,'NC$1')
    .replace(/\bNota de d[eé]bito ([ABC])\b/giu,'ND$1')
    .replace(/^Sin comprobante vinculado$/iu,'Sin vincular');
  // The invoice prefix already conveys its class; pending, mixed and unfiscal
  // provenance must remain explicit even when a document number is present.
  const label = classification.replace(/^Comprobante fiscal$/u,'Fiscal').replace(/^Comprobante no fiscal$/u,'No fiscal').replace(/^Anticipo \/ pendiente de facturar$/u,'Anticipo / pendiente');
  return {reference:short,label:label==='Fiscal'&&/\bF[ABCTM]\s+\d/iu.test(short)?'':label};
}
export function buildCashClosingHtml(report: ClosingPrintReport) {
  const active = report.movements.filter(m => !m.cancelled);
  const monetary = active.filter(m => m.kind !== 'informational');
  const informational = active.filter(m => m.kind === 'informational');
  const cancelled = report.movements.filter(m => m.cancelled);
  const row = (m: ClosingPrintMovement, isCancelled = false) => {
    const doc = conciseDocument(m.document,m.documentClass);
    const amount = isCancelled ? Math.abs(m.amount) : m.kind==='expense' ? -m.amount : m.amount;
    return `<tr${isCancelled?' class="cancelled"':''}><td class="time">${escape(m.time)}</td><td>${m.kind==='expense'?'<strong>Egreso · </strong>':''}${escape(m.description)}${isCancelled?`<div class="note">Motivo: ${escape(m.cancelReason || 'Sin motivo informado')}</div>`:''}</td><td class="room">${escape(m.room || '—')}</td><td>${escape(m.method)}</td><td>${escape(doc.reference)}${doc.label?`<span class="doc-class">${escape(doc.label)}</span>`:''}</td><td class="amount">${escape(money(amount))}</td></tr>`;
  };
  const table = (rows: ClosingPrintMovement[], isCancelled=false) => `<table class="movements"><colgroup><col style="width:7%"><col style="width:25%"><col style="width:6%"><col style="width:17%"><col style="width:27%"><col style="width:18%"></colgroup><thead><tr><th>Hora</th><th>Apellido / concepto</th><th>Hab.</th><th>Forma de pago</th><th>Comprobante / origen</th><th class="amount">Importe</th></tr></thead><tbody>${rows.map(m=>row(m,isCancelled)).join('')}</tbody></table>`;
  const difference = report.countedCash!=null&&report.systemCash!=null ? report.countedCash-report.systemCash : null;
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Cierre de Turno - ${escape(report.area)}</title><style>
    @page{size:A4 portrait;margin:12mm 10mm}
    *{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;font-size:9pt;line-height:1.3;margin:0;color:#202a34;background:#fff}
    main{max-width:190mm;margin:0 auto}header{border-bottom:2px solid #253c52;padding-bottom:8px;margin-bottom:10px;display:flex;justify-content:space-between;gap:14px;break-inside:avoid}
    .brand{font-size:8pt;letter-spacing:.7px;text-transform:uppercase;color:#586574}h1{font-size:18pt;line-height:1.15;margin:3px 0 4px}h2{font-size:10pt;margin:12px 0 4px;break-after:avoid}.subtitle{font-weight:bold}.meta,.note{color:#536170;font-size:8pt;margin-top:3px}.total{text-align:right;white-space:nowrap;align-self:center}.total strong{display:block;font-size:17pt}.total span{font-size:8pt}
    .overview{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}.panel{min-width:0;border:1px solid #d5dce2;padding:7px 9px;break-inside:avoid}.panel h2{margin:0 0 4px}.mini{width:100%;border-collapse:collapse;font-size:8.5pt}.mini td{overflow-wrap:anywhere;padding:2px 0;border-bottom:1px solid #edf0f2}.mini tr:last-child td{border:0}.count{text-align:center;color:#536170;width:34px}.amount{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
    .cash-control{display:flex;flex-wrap:wrap;gap:3px 14px;border-bottom:1px solid #e3e8ed;padding-bottom:5px;margin-bottom:5px;font-size:8pt}.cash-control strong{white-space:nowrap}.difference{font-weight:bold}.documents{font-size:7.8pt;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 7px}.documents .amount{font-size:7.8pt}.snapshot{font-size:8pt;margin:8px 0 0;padding:5px 7px;background:#f4f6f8;border:1px solid #d5dce2;break-inside:avoid}
    table.movements{border-collapse:collapse;width:100%;table-layout:fixed;font-size:8.5pt}thead{display:table-header-group}th{font-size:7.8pt;background:#eef2f5;color:#334657;text-align:left;padding:5px;border-bottom:1px solid #c6d0d9}td{vertical-align:top}table.movements td{padding:4px 5px;border-bottom:1px solid #e3e8ed;overflow-wrap:anywhere}table.movements tr{break-inside:avoid;page-break-inside:avoid}.time,.room{white-space:nowrap}.time{color:#536170}.doc-class{display:block;font-size:7.5pt;color:#647181;margin-top:1px}.section-note{font-size:8pt;color:#536170;margin:2px 0 5px}.cancelled .amount{text-decoration:line-through;color:#647181}.cancelled .note{color:#536170}.empty{padding:8px;border:1px solid #d5dce2;font-size:8.5pt}
    footer{font-size:7.5pt;color:#647181;border-top:1px solid #d5dce2;margin-top:8px;padding-top:5px;break-inside:avoid}
    @media screen{body{padding:22px;background:#edf0f3}main{padding:10mm;background:#fff;max-width:210mm}}
    @media print{body{padding:0}main{max-width:none}.panel,.snapshot,th{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  </style></head><body><main>
    <header><div><div class="brand">Maran Suites &amp; Towers</div><h1>Cierre de Turno</h1><div class="subtitle">${escape(report.area)} · ${escape(report.shift)}</div><div class="meta">Apertura: ${escape(report.date)}${report.closedDate?` · Cierre: ${escape(report.closedDate)}`:''}</div><div class="meta">Abrió ${escape(report.openedBy)} · ${escape(report.openedTime)} &nbsp; | &nbsp; Cerró ${escape(report.closedBy)} · ${escape(report.closedTime)}</div></div><div class="total"><span>TOTAL COBRADO NETO${report.snapshot?' · AL CIERRE':''}</span><strong>${escape(money(report.total))}</strong><span>${report.count} transacciones</span></div></header>
    <div class="overview"><section class="panel"><h2>Resumen por forma de pago</h2><table class="mini"><thead><tr><th>Medio</th><th class="count">Mov.</th><th class="amount">Neto</th></tr></thead><tbody>${report.methods.map(m=>`<tr><td>${escape(m.label)}</td><td class="count">${m.count}</td><td class="amount">${escape(money(m.total))}</td></tr>`).join('')||'<tr><td>Sin movimientos de dinero</td></tr>'}</tbody></table><p class="note">Ingresos menos egresos. Informativos y anulados se detallan aparte.</p></section>
    <section class="panel"><h2>Control de efectivo</h2><div class="cash-control"><span>Sistema <strong>${report.systemCash==null?'No informado':escape(money(report.systemCash))}</strong></span><span>Contado <strong>${report.countedCash==null?'No informado':escape(money(report.countedCash))}</strong></span><span class="difference">Diferencia ${difference==null?'No informada':escape(`${difference>0?'+':''}${money(difference)}`)}</span></div><strong class="note">Efectivo por comprobante</strong><div class="documents">${report.documents.map(d=>`<span>${escape(d.label)}</span><span class="amount">${escape(money(d.total))}</span>`).join('')}</div><div class="note">Ingresos en efectivo; el neto descuenta egresos.</div></section></div>
    ${report.snapshot?`<div class="snapshot"><strong>Totales registrados en el cierre:</strong> ${report.snapshot.map(m=>`${escape(m.label)} ${escape(money(m.total))}`).join(' · ')}<div class="note">Total y cantidad conservados al cerrar. El desglose muestra los movimientos y comprobantes vinculados actualmente.</div></div>`:''}
    <h2>Movimientos de dinero (${monetary.length})</h2>${monetary.length?table(monetary):'<div class="empty">Sin movimientos de dinero.</div>'}
    ${informational.length?`<h2>Comprobantes y liquidaciones informativas (${informational.length})</h2><p class="section-note">Sin ingreso ni egreso de dinero. Estos importes no se suman al total cobrado.</p>${table(informational)}`:''}
    ${cancelled.length?`<h2>Movimientos anulados (${cancelled.length})</h2><p class="section-note">Excluidos de los totales. Se conserva el motivo de anulación.</p>${table(cancelled,true)}`:''}
    <footer>Generado el ${escape(report.generatedAt)} · Maran Suites &amp; Towers</footer>
  </main><script>window.onload=function(){window.print();};<\/script></body></html>`;
}

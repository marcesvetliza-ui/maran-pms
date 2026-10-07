export type StockReportRow={name:string;sku?:string|null;unit:string;quantity:number|null;category?:string;cost?:number|null};
export type StockReport={date:string;warehouse:string;filters:string;historical:boolean;rows:StockReportRow[]};
const qty=(n:number|null)=>n===null?'Sin información histórica':n.toLocaleString('es-AR',{maximumFractionDigits:3});
export function stockReportHtml(report:StockReport){
 const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
 const cost=report.rows.some(r=>r.cost!==undefined)&&!report.historical;
 return `<!doctype html><html lang="es"><head><title>Listado de stock</title><style>body{font:12px Arial;padding:20px;color:#111}table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}thead{display:table-header-group}tr{break-inside:avoid}@page{size:A4 landscape;margin:12mm}</style></head><body><h1>Listado de stock</h1><p>${report.historical?'Al cierre del día':'Stock actual · día en curso'}: ${esc(report.date.split('-').reverse().join('/'))} · ${esc(report.warehouse)}</p><p>${esc(report.filters)} · ${report.rows.length} artículos</p><p>Clasificación${cost?' y costos':''} actuales. Los saldos sin historial suficiente se indican expresamente.</p><table><thead><tr><th>SKU</th><th>Artículo</th><th>Subagrupamiento</th><th>Stock</th><th>Unidad</th>${cost?'<th>Costo unitario actual</th>':''}</tr></thead><tbody>${report.rows.map(r=>`<tr><td>${esc(r.sku)}</td><td>${esc(r.name)}</td><td>${esc(r.category)}</td><td>${esc(qty(r.quantity))}</td><td>${esc(r.unit)}</td>${cost?`<td>${esc(r.cost==null?'—':r.cost.toLocaleString('es-AR',{style:'currency',currency:'ARS'}))}</td>`:''}</tr>`).join('')}</tbody></table></body></html>`;
}
export function stockReportCsv(report:StockReport){
 const cell=(s:unknown)=>{let v=String(s??'');if(/^[\s\u0000-\u001f]*[=+\-@]/.test(v))v="'"+v;return '"'+v.replaceAll('"','""')+'"';};
 const cost=report.rows.some(r=>r.cost!==undefined)&&!report.historical;
 return '\uFEFF'+[['Fecha','Momento','Depósito','Filtros','SKU','Artículo','Subagrupamiento','Stock','Unidad',...(cost?['Costo unitario actual']:[])],...report.rows.map(r=>[report.date,report.historical?'Cierre del día':'Actual',report.warehouse,report.filters,r.sku,r.name,r.category,qty(r.quantity),r.unit,...(cost?[r.cost==null?'':r.cost.toLocaleString('es-AR')]:[])])].map(r=>r.map(cell).join(';')).join('\r\n');
}

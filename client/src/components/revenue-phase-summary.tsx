import {revenuePhaseSummary,type SplitRevenueDay} from '@shared/revenueReportSummary';
const pesos=(n:number)=>n.toLocaleString('es-AR',{style:'currency',currency:'ARS'});
export function RevenuePhaseSummary({days}:{days:SplitRevenueDay[]}){
 return <div className="space-y-3">{(['actual','forecast'] as const).map(phase=>{
 const summary=revenuePhaseSummary(days,phase);
 return <section key={phase} className="rounded border p-4 space-y-2" aria-label={phase==='actual'?'Alojamiento realizado':'Reservas por venir'}>
  <h3 className="font-semibold">{phase==='actual'?'Alojamiento realizado hasta hoy':'Reservas por venir — proyección'}</h3>
  <p>{summary.sold} habitaciones-noche · Ingreso {phase==='actual'?'realizado':'previsto'}: <strong>{pesos(summary.revenue)}</strong></p>
  <p>Ocupación: {summary.occupancy.toFixed(1)}% · ADR: {pesos(summary.adr)} · RevPAR: {pesos(summary.revpar)}</p>
  {!!summary.missing&&<p role="alert" className="text-destructive">{summary.missing} noches sin precio válido: ingresos parciales. El ADR usa solo noches con precio conocido.</p>}
 </section>;
 })}
 <p className="text-sm text-muted-foreground">Las tarifas de reservas antiguas se distribuyen desde su total guardado; las tarifas pactadas de grupo usadas como alternativa son estimaciones del pronóstico. La capacidad usa el inventario operativo actual y bloqueos fechados; no reconstruye altas y bajas históricas. Los porcentajes de ambas secciones no se suman.</p>
 {!!days.reduce((s,d)=>s+d.estimatedRoomNights,0)&&<p className="text-sm text-muted-foreground">Este rango incluye {days.reduce((s,d)=>s+d.estimatedRoomNights,0)} noches con importes estimados. Consultá la fuente en el detalle del día.</p>}
 </div>;
}

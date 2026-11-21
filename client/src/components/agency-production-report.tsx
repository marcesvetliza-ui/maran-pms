import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Loader2 } from 'lucide-react';
import type { AgencyProductionRow } from '@shared/agencyProduction';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const money = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
export function AgencyProductionReport() {
  const [from, setFrom] = useState(''), [to, setTo] = useState('');
  const [showEmpty, setShowEmpty] = useState(false), [showCommissions, setShowCommissions] = useState(false);
  const invalidRange = !!from && !!to && from > to;
  const { data: rows = [], isLoading, isError, refetch } = useQuery<AgencyProductionRow[]>({
    queryKey: ['/api/agencies/report', from, to], enabled: !invalidRange,
    queryFn: async () => { const params = new URLSearchParams(); if (from) params.set('from', from); if (to) params.set('to', to); return (await apiRequest('GET', `/api/agencies/report?${params}`)).json(); },
  });
  const totals = { reservations: rows.reduce((s, r) => s + r.totalReservations, 0), nights: rows.reduce((s, r) => s + r.totalNights, 0), revenue: rows.reduce((s, r) => s + Math.round(r.totalRevenue * 100), 0) / 100, commission: rows.reduce((s, r) => s + Math.round(r.totalCommission * 100), 0) / 100 };
  const visible = showEmpty ? rows : rows.filter(r => r.totalReservations > 0);
  const unknown = rows.reduce((s, r) => s + (r.unpricedNights || 0), 0), invalid = rows.reduce((s, r) => s + (r.invalidReservations || 0), 0), estimated = rows.reduce((s, r) => s + (r.estimatedNights || 0), 0);
  const nightLabel = 'Noches realizadas';
  return <Card>
    <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><BarChart3 className="h-5 w-5" />Comparativa de agencias</CardTitle>
      <p className="text-sm text-muted-foreground">Compará estadías realizadas y noches por agencia, también con tarifas netas y comisión cero.</p>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1"><Label htmlFor="agency-production-from">Desde</Label><Input id="agency-production-from" type="date" value={from} onChange={e => setFrom(e.target.value)} data-testid="input-report-from" /></div>
        <div className="space-y-1"><Label htmlFor="agency-production-to">Hasta</Label><Input id="agency-production-to" type="date" value={to} onChange={e => setTo(e.target.value)} data-testid="input-report-to" /></div>
      </div>
      <p className="text-xs text-muted-foreground">Fechas de estadía, incluyendo ambos límites del período. Se cuentan noches por habitación anteriores a hoy, de reservas alojadas o finalizadas con agencia vinculada. La salida no cuenta como noche. Se excluyen reservas futuras, canceladas, no show y tentativas.</p>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={showEmpty} onChange={e => setShowEmpty(e.target.checked)} />Mostrar agencias sin movimiento</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={showCommissions} onChange={e => setShowCommissions(e.target.checked)} />Ver comisiones estimadas</label>
      </div>
      {invalidRange ? <p role="alert" className="text-sm text-destructive">La fecha Desde no puede ser posterior a Hasta.</p> : isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div> : isError ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>No se pudo consultar la producción por agencia.</p><Button variant="outline" onClick={() => refetch()}>Reintentar</Button></div> : <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[["Agencias con reservas", rows.filter(r => r.totalReservations > 0).length], ['Reservas', totals.reservations], [nightLabel, totals.nights], ['Importe de alojamiento', money(totals.revenue)]].map(([label, value], i) => <div key={label} className="rounded-lg border bg-muted/20 p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-bold" data-testid={`agency-production-total-${i}`}>{value}</p></div>)}
        </div>
        <p className="text-xs text-muted-foreground">Ordenado de mayor a menor cantidad de noches. Los importes corresponden al alojamiento del período; no representan facturas emitidas ni cobros.</p>
        {unknown > 0 && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">{unknown} noche(s) sin importe verificable: el importe de alojamiento es parcial. Las noches sí se cuentan.</p>}
        {invalid > 0 && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">{invalid} reserva(s) con fechas inválidas quedan fuera del cálculo y requieren revisión.</p>}
        {estimated > 0 && <p className="text-xs text-muted-foreground">Para reservas antiguas, el importe del período se obtiene distribuyendo el total guardado de la estadía.</p>}
        <Table><TableHeader><TableRow><TableHead>#</TableHead><TableHead>Agencia</TableHead><TableHead className="text-right">Reservas</TableHead><TableHead className="text-right">{nightLabel}</TableHead><TableHead className="text-right">Participación en noches</TableHead><TableHead className="text-right">Alojamiento</TableHead>{showCommissions && <><TableHead className="text-right">Comisión %</TableHead><TableHead className="text-right">Comisión estimada</TableHead></>}</TableRow></TableHeader>
          <TableBody>{!visible.length ? <TableRow><TableCell colSpan={showCommissions ? 8 : 6} className="py-8 text-center text-muted-foreground">No hay reservas para el período y alcance seleccionados.</TableCell></TableRow> : <>{visible.map((row, i) => <TableRow key={row.agency.id} data-testid={`row-report-${row.agency.id}`}>
            <TableCell>{i + 1}</TableCell><TableCell className="font-medium">{row.agency.nombreFantasia || row.agency.razonSocial}</TableCell><TableCell className="text-right">{row.totalReservations}</TableCell><TableCell className="text-right font-semibold">{row.totalNights}</TableCell>
            <TableCell className="text-right"><span>{(row.nightShare || 0).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%</span><div className="ml-auto mt-1 h-1.5 w-24 rounded bg-muted" aria-hidden="true"><div className="h-full rounded bg-primary" style={{ width: `${row.nightShare || 0}%` }} /></div></TableCell>
            <TableCell className="text-right">{money(row.totalRevenue)}{row.unpricedNights > 0 && <span className="ml-1 text-xs text-muted-foreground">parcial</span>}</TableCell>{showCommissions && <><TableCell className="text-right">{row.commissionRate}%</TableCell><TableCell className="text-right">{money(row.totalCommission)}</TableCell></>}
          </TableRow>)}<TableRow className="bg-muted/30 font-bold" data-testid="agency-production-totals-row"><TableCell /><TableCell>TOTAL</TableCell><TableCell className="text-right">{totals.reservations}</TableCell><TableCell className="text-right">{totals.nights}</TableCell><TableCell className="text-right">{totals.nights ? '100%' : '0%'}</TableCell><TableCell className="text-right">{money(totals.revenue)}</TableCell>{showCommissions && <><TableCell /><TableCell className="text-right">{money(totals.commission)}</TableCell></>}</TableRow></>}</TableBody>
        </Table>
        {showCommissions && <p className="text-xs text-muted-foreground">Estimación según el porcentaje configurado de cada agencia. Mostrarla no registra comisiones ni modifica tarifas o saldos.</p>}
      </>}
    </CardContent>
  </Card>;
}

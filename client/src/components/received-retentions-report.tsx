import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileDown, Printer, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { formatDisplayDate } from '@shared/date-display';
import {
  defaultRetentionFilters, retentionTaxes, retentionReportUrl, retentionMoney, validateRetentionFilters,
  type RetentionFilters, type RetentionReportResult,
} from '@shared/received-retention-report';

export function ReceivedRetentionsReport() {
  const [draft, setDraft] = useState<RetentionFilters>({ ...defaultRetentionFilters });
  const [applied, setApplied] = useState<RetentionFilters>({ ...defaultRetentionFilters });
  const [page, setPage] = useState(1);
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();
  const url = retentionReportUrl(applied, 'json', page);
  const query = useQuery<RetentionReportResult>({
    queryKey: [url],
    queryFn: async () => {
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error('No se pudieron consultar las retenciones. Intentá nuevamente.');
      return response.json();
    },
  });
  let error = '';
  try { validateRetentionFilters(draft); } catch (e) { error = (e as Error).message; }
  const dirty = JSON.stringify(draft) !== JSON.stringify(applied);
  const canExport = !!query.data && !query.isFetching && !query.isError && !dirty && !error && !downloading;
  const set = (key: keyof RetentionFilters, value: string) => setDraft(previous => ({ ...previous, [key]: value }));
  const download = async (format: 'xlsx' | 'pdf') => {
    if (!canExport) return;
    setDownloading(true);
    try {
      const response = await fetch(retentionReportUrl(applied, format), { credentials: 'include' });
      if (!response.ok) throw new Error('No se pudo descargar el informe. Intentá nuevamente.');
      const blob = await response.blob(), objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl; link.download = `retenciones-recibidas-${applied.desde || 'inicio'}-${applied.hasta || 'actual'}.${format}`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (e) { toast({ title: 'No se pudo descargar', description: (e as Error).message, variant: 'destructive' }); }
    finally { setDownloading(false); }
  };
  const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
  const totals = query.data?.totals;
  return <Card className="min-w-0" data-testid="received-retentions-report">
    <CardHeader>
      <CardTitle>Retenciones recibidas</CardTitle>
      <CardDescription>Consultá los certificados cargados en Compras. Buscá por proveedor o agente de retención, incluidas empresas y agencias.</CardDescription>
    </CardHeader>
    <CardContent className="min-w-0 space-y-5">
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (!error) { setApplied({ ...draft }); setPage(1); } }}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1 text-sm">Fecha a filtrar
            <select className={selectClass} value={draft.dateType} onChange={e => set('dateType', e.target.value)}>
              <option value="emision">Emisión del certificado</option><option value="carga">Carga en el PMS</option>
            </select>
          </label>
          <label className="min-w-0 space-y-1 text-sm">Desde<Input type="date" value={draft.desde || ''} onChange={e => set('desde', e.target.value)} /></label>
          <label className="min-w-0 space-y-1 text-sm">Hasta<Input type="date" value={draft.hasta || ''} onChange={e => set('hasta', e.target.value)} /></label>
          <label className="space-y-1 text-sm">Proveedor / agente<Input value={draft.agente || ''} onChange={e => set('agente', e.target.value)} placeholder="Nombre o razón social" maxLength={200} /></label>
          <label className="space-y-1 text-sm">CUIT<Input value={draft.cuit || ''} onChange={e => set('cuit', e.target.value)} placeholder="Con o sin guiones" inputMode="numeric" maxLength={20} /></label>
          <label className="space-y-1 text-sm">Impuesto
            <select className={selectClass} value={draft.impuesto || ''} onChange={e => set('impuesto', e.target.value)}>
              <option value="">Todos los impuestos</option>{Object.entries(retentionTaxes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm">Estado
            <select className={selectClass} value={draft.estado} onChange={e => set('estado', e.target.value)}>
              <option value="vigentes">Vigentes</option><option value="anuladas">Anuladas</option><option value="todas">Todas</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">Número de certificado<Input value={draft.certificado || ''} onChange={e => set('certificado', e.target.value)} placeholder="Número completo o parcial" maxLength={200} /></label>
        </div>
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">Más filtros</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="min-w-0 space-y-1 text-sm">Período informado<Input type="month" value={draft.periodo || ''} onChange={e => set('periodo', e.target.value)} /></label>
            <label className="space-y-1 text-sm">Jurisdicción<Input value={draft.jurisdiccion || ''} onChange={e => set('jurisdiccion', e.target.value)} placeholder="Ej.: Entre Ríos" maxLength={200} /></label>
          </div>
        </details>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!!error}>Aplicar filtros</Button>
          <Button type="button" variant="outline" onClick={() => { setDraft({ ...defaultRetentionFilters }); setApplied({ ...defaultRetentionFilters }); setPage(1); }}>Limpiar filtros</Button>
          <Button type="button" variant="ghost" disabled={query.isFetching} onClick={() => query.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Actualizar</Button>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {dirty && !error && <p className="text-sm text-muted-foreground">Aplicá los filtros para actualizar el resultado y habilitar las descargas.</p>}
      </form>
      {query.isError ? <div role="alert" className="space-y-2 rounded-md border p-4 text-sm">
        <p className="text-destructive">No se pudieron consultar las retenciones. Intentá nuevamente.</p>
        <Button variant="outline" onClick={() => query.refetch()}>Reintentar consulta</Button>
      </div> : query.isPending ? <p role="status" className="text-sm text-muted-foreground">Cargando retenciones…</p> : query.data && <>
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-md bg-muted/50 p-4" aria-live="polite">
          <div className="min-w-0">
            <p className="text-sm">{query.data.count} retenciones en el resultado · {totals!.vigentes} vigentes</p>
            <p className="break-words text-xl font-semibold">Total vigente: $ {retentionMoney(totals!.totalVigente)}</p>
            {totals!.anuladas > 0 && <p className="text-sm text-muted-foreground">{totals!.anuladas} anuladas · $ {retentionMoney(totals!.totalAnulado)} excluidos del total vigente</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!canExport} onClick={() => download('xlsx')}><FileDown className="mr-2 h-4 w-4" />Descargar Excel</Button>
            <Button variant="outline" disabled={!canExport} onClick={() => download('pdf')}><FileDown className="mr-2 h-4 w-4" />Descargar PDF</Button>
            <Button variant="outline" disabled={!canExport} onClick={() => window.open(retentionReportUrl(applied, 'pdf', 1, true), '_blank', 'noopener,noreferrer')}><Printer className="mr-2 h-4 w-4" />Imprimir</Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Importes en ARS. Los archivos incluyen todo el resultado filtrado, en todas sus páginas. Imprimir abre el PDF para usar la opción de impresión del navegador.</p>
        {query.isFetching && <p role="status" className="text-sm text-muted-foreground">Actualizando resultado…</p>}
        <div className="max-w-full overflow-x-auto rounded-md border">
          <table className="w-full min-w-[1060px] text-sm" aria-label="Retenciones recibidas">
            <thead className="bg-muted/50 text-left"><tr>{['Emisión / carga', 'Proveedor / agente', 'CUIT', 'Impuesto', 'Certificado', 'Jurisdicción / período', 'Estado', 'Importe ARS'].map(label => <th key={label} className="p-3 font-medium last:text-right">{label}</th>)}</tr></thead>
            <tbody>{query.data.rows.map(row => <tr key={row.id} className="border-t align-top">
              <td className="whitespace-nowrap p-3">{formatDisplayDate(row.fecha)}<div className="text-xs text-muted-foreground">Carga: {formatDisplayDate(row.carga)}</div></td>
              <td className="max-w-[260px] break-words p-3 font-medium">{row.agente}</td><td className="whitespace-nowrap p-3">{row.cuit || '—'}</td>
              <td className="p-3">{row.impuestoLabel}</td><td className="max-w-[200px] break-all p-3">{row.certificado || '—'}</td>
              <td className="max-w-[220px] break-words p-3">{row.jurisdiccion || '—'}<div className="text-xs text-muted-foreground">{row.periodo || 'Sin período'}</div></td>
              <td className={`p-3 ${row.estado === 'anulado' ? 'text-destructive' : ''}`}>{row.estado === 'anulado' ? 'Anulada' : 'Vigente'}</td>
              <td className="whitespace-nowrap p-3 text-right tabular-nums">{retentionMoney(row.importe)}</td>
            </tr>)}</tbody>
          </table>
          {query.data.count === 0 && <p className="p-6 text-sm text-muted-foreground">No hay retenciones para los filtros elegidos.</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p>Página {query.data.page} de {Math.max(1, Math.ceil(query.data.count / query.data.pageSize))} · Hasta {query.data.pageSize} por página</p>
          <div className="flex gap-2">
            <Button variant="outline" disabled={query.isFetching || query.data.page <= 1} onClick={() => setPage(query.data!.page - 1)}>Anterior</Button>
            <Button variant="outline" disabled={query.isFetching || query.data.page * query.data.pageSize >= query.data.count} onClick={() => setPage(query.data!.page + 1)}>Siguiente</Button>
          </div>
        </div>
      </>}
    </CardContent>
  </Card>;
}

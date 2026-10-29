import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

type Settings = { floor: number; currency: string; enabled: boolean; updated_at?: string };
type AriStatus = { settings: Settings; dispatchEnabled: boolean; rooms: { id: string; roomNumber: string; roomTypeName: string; channexRoomTypeId: string | null }[]; summary: { status: string; count: number }[]; events: { id: string; kind: string; status: string; date_from: string; date_to: string; last_error: string | null; task_ids: string[] | null }[] };
export function ChannexAriSettings({ connectionId }: { connectionId: string }) {
  const { data, error, isLoading, refetch } = useQuery<AriStatus>({ queryKey: ['/api/channex/connections', connectionId, 'ari'], queryFn: async () => (await apiRequest('GET', `/api/channex/connections/${connectionId}/ari`)).json() });
  return <Card><CardHeader><CardTitle className="text-base">Inventario y envíos a Channex</CardTitle></CardHeader><CardContent className="space-y-4">
    {isLoading ? <p>Cargando alcance…</p> : error ? <p role="alert">No se pudo consultar la integración. <Button variant="outline" onClick={() => refetch()}>Volver a consultar</Button></p> : data ? <>
      <p className="text-sm">Etapa de preparación para Channex staging. Las habitaciones de otros pisos quedan fuera del inventario publicado. Se usa la tarifa base de cada plan, sin conversión de moneda.</p>
      <p className="text-sm font-medium">{data.dispatchEnabled ? 'Envíos al entorno de prueba habilitados en el servidor.' : 'Envíos externos deshabilitados. Podés configurar el alcance y registrar cambios sin enviarlos.'}</p>
      <InventoryEditor key={`${connectionId}:${data.settings.updated_at ?? 'new'}`} connectionId={connectionId} initial={data.settings} />
      <div className="text-sm flex flex-wrap gap-4">{data.summary.map(s => <span key={s.status}>{({ pending: 'Pendientes', delivered: 'Procesados', blocked: 'Requieren revisión' } as Record<string, string>)[s.status]}: {s.count}</span>)}</div>
      <QueueActions connectionId={connectionId} enabled={data.settings.enabled} />
      <Button variant="outline" size="sm" onClick={() => refetch()}>Actualizar estado</Button>
      <details><summary className="cursor-pointer text-sm">Últimos cambios y tareas de Channex</summary>
        <div className="space-y-2 mt-2">{data.events.map(e => <div key={e.id} className="rounded border p-2 text-sm">
          <p>{e.kind === 'availability' ? 'Disponibilidad' : 'Tarifas'} · {e.date_from} → {e.date_to} · {({ pending: 'Pendiente', delivered: 'Procesado', blocked: 'Requiere revisión' } as Record<string, string>)[e.status]}</p>
          {e.last_error && <p role="alert" className="text-destructive">{e.last_error}</p>}
          {!!e.task_ids?.length && <p className="break-all text-muted-foreground">Tareas de Channex: {e.task_ids.join(', ')}</p>}
        </div>)}</div>
      </details>
    </> : null}
  </CardContent></Card>;
}
function useAriAction(connectionId: string) {
  const { toast } = useToast();
  return useMutation({ mutationFn: async ({ method, path = '', body }: { method: string; path?: string; body?: unknown }) => (await apiRequest(method, `/api/channex/connections/${connectionId}/ari${path}`, body)).json(), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/channex/connections', connectionId, 'ari'] }); toast({ title: 'Configuración de Channex actualizada' }); }, onError: (e: Error) => toast({ title: 'No se pudo completar la acción', description: e.message, variant: 'destructive' }) });
}
function InventoryEditor({ connectionId, initial }: { connectionId: string; initial: Settings }) {
  const [floor, setFloor] = useState(String(initial.floor)), [currency, setCurrency] = useState(initial.currency), [enabled, setEnabled] = useState(initial.enabled), [previewFloor, setPreviewFloor] = useState(initial.floor);
  const action = useAriAction(connectionId);
  const { data, isFetching } = useQuery<AriStatus>({ queryKey: ['/api/channex/connections', connectionId, 'ari', 'preview', previewFloor], queryFn: async () => (await apiRequest('GET', `/api/channex/connections/${connectionId}/ari?floor=${previewFloor}`)).json() });
  const validFloor = /^-?\d+$/.test(floor) && Number(floor) >= -5 && Number(floor) <= 100;
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-3 items-end"><div><Label htmlFor="channex-floor">Piso incluido</Label><Input id="channex-floor" type="number" min={-5} max={100} value={floor} onChange={e => setFloor(e.target.value)} disabled={initial.enabled} /></div>
      <div><Label htmlFor="channex-currency">Moneda de la propiedad</Label><Input id="channex-currency" maxLength={3} value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} disabled={initial.enabled} /></div>
      <Button variant="outline" disabled={!validFloor || isFetching} onClick={() => setPreviewFloor(Number(floor))}>Ver habitaciones</Button>
    </div>
    <p className="text-sm">Piso {previewFloor}: {data?.rooms.length ?? '…'} habitaciones físicas activas.</p>
    <div className="flex flex-wrap gap-2">{data?.rooms.map(r => <span key={r.id} className="rounded border px-2 py-1 text-sm">{r.roomNumber} · {r.roomTypeName}{!r.channexRoomTypeId ? ' · Falta mapear' : ''}</span>)}</div>
    <Label className="flex gap-2 items-center"><Checkbox checked={enabled} onCheckedChange={value => setEnabled(value === true)} />Integración de prueba activa</Label>
    <p className="text-sm text-muted-foreground">Al activarlo se prepara una sincronización inicial de 500 días. Para cambiar el piso o la moneda, primero pausá la integración. Durante la pausa los cambios siguen guardándose sin enviarse. Los grupos pendientes de asignación descuentan disponibilidad de forma conservadora.</p>
    <Button disabled={action.isPending || !validFloor || !/^[A-Z]{3}$/.test(currency)} onClick={() => action.mutate({ method: 'PATCH', body: { floor: Number(floor), currency, enabled } })}>Guardar alcance</Button>
  </div>;
}
function QueueActions({ connectionId, enabled }: { connectionId: string; enabled: boolean }) {
  const action = useAriAction(connectionId);
  return <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!enabled || action.isPending} onClick={() => action.mutate({ method: 'POST', path: '/full-sync' })}>Sincronización completa de recuperación</Button><Button variant="outline" disabled={!enabled || action.isPending} onClick={() => action.mutate({ method: 'POST', path: '/retry' })}>Reintentar cambios con error</Button></div>;
}

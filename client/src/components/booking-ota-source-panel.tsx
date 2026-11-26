import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { BookingOtaSourceSummary } from '@shared/booking-engine';
import { apiRequest, parseApiError } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export function BookingOtaSourcePanel({ source, onSaved }: { source: BookingOtaSourceSummary; onSaved: () => Promise<unknown> }) {
  const [connectionId, setConnectionId] = useState(source.configuredConnectionId || 'automatic');
  const { toast } = useToast();
  const save = useMutation({
    mutationFn: () => apiRequest('PATCH', '/api/admin/booking-engine/ota-source', { connectionId: connectionId === 'automatic' ? null : connectionId }),
    onSuccess: async () => { await onSaved(); toast({ title: 'Referencia de OTAs guardada' }); },
    onError: error => toast({ title: 'No se pudo guardar la referencia', description: parseApiError(error), variant: 'destructive' }),
  });
  return <Card><CardHeader className="pb-3"><CardTitle className="text-base">Habitaciones y restricciones compartidas con OTAs</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <p className="text-sm text-muted-foreground">El motor usa las mismas habitaciones físicas y restricciones de esta conexión. La tarifa propia del motor se configura por categoría.</p>
      <div className="flex flex-wrap items-end gap-3"><div className="min-w-64 space-y-1">
        <Label htmlFor="booking-ota-source">Conexión de referencia</Label>
        <select id="booking-ota-source" className="flex h-9 w-full rounded-md border bg-background px-3 text-sm" value={connectionId} disabled={save.isPending} onChange={event => setConnectionId(event.target.value)}>
          <option value="automatic">Automática · única conexión real</option>
          {source.connections.map(connection => <option key={connection.id} value={connection.id}>{connection.label}</option>)}
        </select>
      </div><Button type="button" variant="outline" disabled={save.isPending || connectionId === (source.configuredConnectionId || 'automatic')} onClick={() => save.mutate()}>Guardar referencia</Button></div>
      {source.error ? <p role="alert" className="text-sm text-amber-700">{source.error}. Las categorías requieren una selección verificable antes de ofrecerse en el motor.</p>
        : <p className="text-sm"><strong>{source.label}</strong> · {source.roomCount} habitaciones incluidas{source.paused ? ' · sincronización pausada' : ''}.</p>}
      <p className="text-xs text-muted-foreground">Una pausa de sincronización conserva esta selección. Para modificar las habitaciones, usá la configuración de OTAs. Guardar esta referencia no activa las ventas del motor.</p>
    </CardContent></Card>;
}

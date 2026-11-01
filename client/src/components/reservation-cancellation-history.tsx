import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
const formatDateTime = (date: string) => new Date(date).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });

type Entry = { id: string; reservation_code: string; room_number: string; guest_name: string; reason: string; cancelled_by: string; cancellation_date: string };

export function ReservationCancellationHistory({ shiftId, today = false }: { shiftId?: string; today?: boolean }) {
  const { data = [], isLoading, isError } = useQuery<Entry[]>({
    queryKey: ['/api/reservations/cancellations/in-shift', shiftId || '', today],
    queryFn: async () => {
      const query = today ? 'today=true' : `shiftId=${encodeURIComponent(shiftId || '')}`;
      const response = await fetch(`/api/reservations/cancellations/in-shift?${query}`, { credentials: 'include' });
      if (!response.ok) throw new Error('No se pudo consultar las reservas anuladas');
      return response.json();
    },
    refetchInterval: 30000,
  });
  return <Card className="mt-4">
    <CardHeader><CardTitle className="text-base">{today ? 'Reservas anuladas hoy' : 'Reservas anuladas durante este turno'}</CardTitle></CardHeader>
    <CardContent>
      <p className="mb-3 text-sm text-muted-foreground">Registro informativo. Los cobros y comprobantes conservan su estado y los totales de caja no se modifican por esta anulación.</p>
      {isLoading ? <p>Cargando anulaciones…</p> : isError ? <p role="alert" className="text-sm text-destructive">No se pudieron consultar las reservas anuladas.</p> : data.length ? data.map(entry => <div key={entry.id} className="border-b py-2 text-sm">
        <p className="font-medium">{entry.reservation_code} · Hab. {entry.room_number} · {entry.guest_name}</p>
        <p>Motivo: {entry.reason}</p>
        <p className="text-muted-foreground">{entry.cancelled_by || 'Sistema'} · {formatDateTime(entry.cancellation_date)}</p>
      </div>) : <p className="text-sm text-muted-foreground">No hay reservas anuladas en este período.</p>}
    </CardContent>
  </Card>;
}

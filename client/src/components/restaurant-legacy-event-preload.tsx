import { CalendarDays, UtensilsCrossed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { LegacyEventTable } from '@shared/restaurant-event-legacy';

type Table = LegacyEventTable & { id: string; tableNumber: string; capacity: number };
export function RestaurantLegacyEventPreload({ table, open, onClose, onOpenEvents, onStart, starting }: {
  table: Table | null; open: boolean; onClose: () => void; onOpenEvents: () => void;
  onStart: (table: Table) => void; starting: boolean;
}) {
  const amount = Number(table?.eventAdvanceAmount || 0);
  const date = table?.eventAdvanceDate;
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
    <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden rounded-2xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-blue-600" />Precarga anterior · Mesa {table?.tableNumber}</DialogTitle>
        <DialogDescription>Los datos anteriores se conservan. Las reservas nuevas se gestionan desde Evento restaurant.</DialogDescription>
      </DialogHeader>
      {table && <div className="min-h-0 space-y-4 overflow-y-auto py-2">
        <dl className="grid grid-cols-2 gap-3 rounded-xl border bg-muted/30 p-4 text-sm">
          <div className="col-span-2"><dt className="text-muted-foreground">Cliente / anfitrión</dt><dd className="break-words font-medium">{table.eventClientName || 'Sin nombre registrado'}</dd></div>
          <div><dt className="text-muted-foreground">Teléfono</dt><dd>{table.eventClientPhone || '—'}</dd></div>
          <div><dt className="text-muted-foreground">Comensales</dt><dd>{table.eventSeats || table.capacity}</dd></div>
          <div className="col-span-2"><dt className="text-muted-foreground">Email</dt><dd className="break-words">{table.eventClientEmail || '—'}</dd></div>
          <div className="col-span-2"><dt className="text-muted-foreground">Notas anteriores</dt><dd className="whitespace-pre-wrap break-words">{table.eventNotes || 'Sin notas'}</dd></div>
        </dl>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm dark:border-blue-900 dark:bg-blue-950/30">
          <p className="text-muted-foreground">Seña guardada</p>
          <p className="text-xl font-semibold">{amount.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</p>
          <p>{table.eventAdvanceMethod || 'Sin medio registrado'} · {date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split('-').reverse().join('/') : date || 'Sin fecha de seña'}</p>
          <p className="mt-2">Iniciar el servicio no registra otra seña. Este importe se conserva para el cierre habitual.</p>
        </div>
        <p className="text-sm text-muted-foreground">La precarga no guarda una fecha propia del evento. Antes de trasladarla, revisá la reserva y sus anticipos.</p>
      </div>}
      <DialogFooter className="flex-wrap gap-2 border-t pt-3">
        <Button variant="outline" onClick={onClose}>Cerrar</Button>
        <Button variant="outline" onClick={onOpenEvents}>Ir a Evento restaurant</Button>
        {table?.status === 'preloaded' && <Button disabled={starting} onClick={() => onStart(table)} data-testid="button-legacy-event-start"><UtensilsCrossed className="mr-2 h-4 w-4" />Iniciar servicio pendiente</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

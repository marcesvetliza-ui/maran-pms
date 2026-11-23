import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, parseApiError, queryClient } from '@/lib/queryClient';
import { fmtMoney } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import type { ReservationWithDetails } from '@shared/schema';

export type GroupAssignmentPreview = {
  fingerprint: string; blockers: string[]; replacementBlockers: string[]; canRelease: boolean; canReplace: boolean;
  groupAdvance: number; personalAdvance: number; availableAdvance: number; guestId: string; reservationId: string; status: string;
};
export function useGroupAssignmentPreview(groupId: string, reservationId: string) {
  const url = `/api/groups/${groupId}/reservations/${reservationId}/assignment-preview`;
  return useQuery<GroupAssignmentPreview>({ queryKey: [url], staleTime: 0, queryFn: async () => (await apiRequest('GET', url)).json() });
}
export function GroupAssignmentReleaseDialog({ groupId, reservation, onClose, onReleased }: {
  groupId: string; reservation: ReservationWithDetails; onClose: () => void; onReleased: () => void;
}) {
  const preview = useGroupAssignmentPreview(groupId, reservation.id);
  const [reason, setReason] = useState('');
  const [transferPersonal, setTransferPersonal] = useState(false);
  const attempt = useRef<Record<string, unknown> | null>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      if (!preview.data) throw new Error('Revisá la vista previa antes de liberar.');
      attempt.current ||= { operationId: crypto.randomUUID(), fingerprint: preview.data.fingerprint, reason: reason.trim(), transferPersonalAdvances: transferPersonal };
      return (await apiRequest('POST', `/api/groups/${groupId}/reservations/${reservation.id}/release-assignment`, attempt.current)).json();
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/groups'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/reservations'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/rooms'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/planning'] }),
        queryClient.invalidateQueries({ queryKey: ['group-advance-availability', groupId] }),
      ]);
      onReleased();
    },
    onError: (e: Error) => {
      if (/^(400|403|404|409):/.test(e.message)) { attempt.current = null; void preview.refetch(); }
    },
  });
  const facts = preview.data, busy = mutation.isPending, frozen = !!attempt.current;
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Liberar asignación</DialogTitle>
        <DialogDescription>Hab. {reservation.room?.roomNumber} · {reservation.reservationCode}. La asignación actual queda cancelada en el historial. La habitación, las fechas, la tarifa y el cupo se conservan para el grupo, sin pasajero.</DialogDescription>
      </DialogHeader>
      {preview.isFetching && <p role="status">Verificando reserva y anticipos…</p>}
      {preview.isError && <div role="alert"><p>{parseApiError(preview.error)}</p><Button variant="outline" onClick={() => preview.refetch()}>Reintentar verificación</Button></div>}
      {facts && <>
        <div className="rounded-md border p-3 space-y-2 text-sm">
          <p className="font-medium">Anticipos que quedarán disponibles para el grupo</p>
          <div className="flex justify-between gap-2"><span>Del grupo, asignados a esta reserva</span><strong>${fmtMoney(facts.groupAdvance)}</strong></div>
          {facts.personalAdvance > 0 && <div className="flex justify-between gap-2"><span>Personales, sujetos a tu confirmación</span><strong>${fmtMoney(facts.personalAdvance)}</strong></div>}
          <p>Se podrán aplicar a otra habitación desde el Folio Grupal, en «Anticipos disponibles». El importe ya está cobrado; este cambio conserva ese dinero y su origen.</p>
        </div>
        {facts.blockers.length > 0 && <div role="alert" className="rounded-md border border-amber-400 p-3 text-sm space-y-2">{facts.blockers.map(message => <p key={message}>{message}</p>)}</div>}
        {facts.canRelease && <>
          <label className="space-y-1 text-sm">Motivo de liberación<Textarea aria-label="Motivo de liberación" maxLength={1000} value={reason} disabled={busy || frozen} onChange={e => setReason(e.target.value)} placeholder="Por ejemplo: el pasajero no viene; se asignará un reemplazo" /></label>
          {facts.personalAdvance > 0 && <label className="flex gap-2 text-sm"><Checkbox checked={transferPersonal} disabled={busy || frozen} onCheckedChange={v => setTransferPersonal(v === true)} /><span>Confirmo que el anticipo personal de ${fmtMoney(facts.personalAdvance)} queda a disposición del grupo y puede aplicarse a otro pasajero.</span></label>}
        </>}
      </>}
      {mutation.isError && <p role="alert" className="text-sm text-destructive">{parseApiError(mutation.error)}{frozen ? ' Reintentá la misma operación para verificar su resultado.' : ''}</p>}
      <DialogFooter>
        <Button variant="outline" disabled={busy} onClick={onClose}>Volver</Button>
        <Button disabled={busy || preview.isFetching || !facts?.canRelease || !reason.trim() || (facts.personalAdvance > 0 && !transferPersonal)} onClick={() => mutation.mutate()} data-testid="button-confirm-release-assignment">{busy ? 'Liberando…' : frozen ? 'Reintentar misma operación' : 'Liberar y conservar cupo'}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

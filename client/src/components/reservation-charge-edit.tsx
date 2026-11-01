import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

type Action = { id: string; eligible: boolean; reason?: string; description: string; amount: string };
export function ReservationChargeEdit({ reservationId, chargeId, onSaved }: { reservationId: string; chargeId: string; onSaved?: () => void }) {
  const [open, setOpen] = useState(false), [description, setDescription] = useState(''), [amount, setAmount] = useState(''), [reason, setReason] = useState('');
  const [snapshot, setSnapshot] = useState<Action | null>(null);
  const { toast } = useToast();
  const { data, isError } = useQuery<{ charges: Action[] }>({
    queryKey: ['/api/reservations', reservationId, 'manual-charge-actions'],
    queryFn: async () => (await apiRequest('GET', `/api/reservations/${reservationId}/manual-charge-actions`)).json(),
    staleTime: 0,
  });
  const action = data?.charges?.find(c => c.id === chargeId);
  const save = useMutation({
    mutationFn: async () => {
      if (!snapshot) throw Error('Actualizá el cargo antes de editarlo.');
      return (await apiRequest('PATCH', `/api/reservations/${reservationId}/manual-charges/${chargeId}`, {
        description: description.trim(), amount: amount.replace(',', '.'), motivo: reason.trim(),
        expectedDescription: snapshot.description, expectedAmount: snapshot.amount,
      })).json();
    },
    onSuccess: async () => {
      setOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/reservations', reservationId] }),
        queryClient.invalidateQueries({ queryKey: ['/api/reservations'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/planning'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/folios'] }),
      ]);
      onSaved?.();
      toast({ title: 'Cargo actualizado' });
    },
    onError: (error: Error) => {
      let message = error.message;
      try { const body = JSON.parse(message.slice(message.indexOf('{'))); message = typeof body.error === 'string' ? body.error : body.error?.message || message; } catch {}
      toast({ title: 'No se pudo editar el cargo', description: message, variant: 'destructive' });
    },
  });
  const valid = description.trim().length > 0 && description.trim().length <= 500 && /^\d{1,8}([.,]\d{1,2})?$/.test(amount) && Number(amount.replace(',', '.')) > 0 && reason.trim().length > 0 && reason.length <= 500;
  return <>
    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" data-testid={`button-edit-charge-${chargeId}`} aria-label="Editar cargo" disabled={!action?.eligible || isError} title={isError ? 'No se pudo verificar si el cargo se puede editar' : action?.reason || 'Editar descripción e importe'} onClick={() => {
      if (!action?.eligible) return;
      setSnapshot({ ...action }); setDescription(action.description); setAmount(action.amount); setReason(''); setOpen(true);
    }}><Pencil className="h-3.5 w-3.5" /></Button>
    <Dialog open={open} onOpenChange={value => { if (!save.isPending) setOpen(value); }}>
      <DialogContent className="max-w-md" onClick={e => e.stopPropagation()}>
        <DialogHeader><DialogTitle>Editar cargo</DialogTitle><DialogDescription>El cambio se guarda en el folio y queda registrado en el historial.</DialogDescription></DialogHeader>
        <Label htmlFor={`charge-description-${chargeId}`}>Descripción</Label><Input id={`charge-description-${chargeId}`} value={description} maxLength={500} onChange={e => setDescription(e.target.value)} disabled={save.isPending} />
        <Label htmlFor={`charge-amount-${chargeId}`}>Importe total</Label><Input id={`charge-amount-${chargeId}`} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} disabled={save.isPending} />
        <Label htmlFor={`charge-reason-${chargeId}`}>Motivo del cambio</Label><Input id={`charge-reason-${chargeId}`} value={reason} maxLength={500} onChange={e => setReason(e.target.value)} disabled={save.isPending} />
        <DialogFooter><Button type="button" variant="outline" disabled={save.isPending} onClick={() => setOpen(false)}>Cancelar</Button><Button type="button" disabled={!valid || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Guardando…' : 'Guardar cargo'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

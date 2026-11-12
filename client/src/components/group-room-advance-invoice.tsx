import type { ComponentProps } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmitirFacturaDialog } from '@/pages/billing';
import { apiRequest, parseApiError, queryClient } from '@/lib/queryClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function GroupRoomAdvanceInvoice(props: ComponentProps<typeof EmitirFacturaDialog>) {
  const preview = useQuery({
    queryKey: ['group-room-advance-invoice', props.reservationId, props.paymentId],
    enabled: props.open,
    retry: false,
    queryFn: async () => (await apiRequest('GET', `/api/reservations/${props.reservationId}/payments/${props.paymentId}/invoice-preview`)).json(),
    staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: false,
  });
  // Mount the invoice form only after checking the original receipt. Background
  // refreshes must not replace a form or a fiscal attempt already in progress.
  if (!preview.data) return <Dialog open={props.open} onOpenChange={open => { if (!open) props.onClose(); }}>
    <DialogContent><DialogHeader><DialogTitle>Facturar anticipo registrado</DialogTitle><DialogDescription>Se conserva el cobro original de esta habitación.</DialogDescription></DialogHeader>
      {preview.isError ? <p role="alert">{parseApiError(preview.error)}</p> : <p role="status">Verificando anticipo y conceptos pendientes…</p>}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={props.onClose}>Cerrar</Button>{preview.isError && <Button onClick={() => preview.refetch()}>Actualizar</Button>}</div>
    </DialogContent>
  </Dialog>;
  const data = preview.data;
  return <EmitirFacturaDialog {...props}
    allowedTipos={['FA','FB','FC','FM','FMB']}
    initialValues={{ ...props.initialValues, paymentMethod: data.method,
      items: [{ descripcion: props.initialValues?.items?.[0]?.descripcion || 'Anticipo registrado', precioUnitario: data.amount }] }}
    reservationAdvancePreview={data}
    onSuccess={invoice => {
      void queryClient.invalidateQueries({ queryKey: ['group-room-account', props.reservationId] });
      void queryClient.invalidateQueries({ queryKey: ['/api/billing/invoices'] });
      void queryClient.invalidateQueries({ queryKey: ['/api/groups', data.groupId] });
      void queryClient.invalidateQueries({ queryKey: ['group-room-advance-invoice', props.reservationId, props.paymentId] });
      props.onSuccess?.(invoice);
    }}
  />;
}

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { fmtMoney } from "@/lib/utils";

export function XeniaQaCheckout({ open, reservationId, onClose, onComplete }: {
  open: boolean; reservationId: string; onClose: () => void; onComplete: () => void;
}) {
  const [error, setError] = useState("");
  const folio = useQuery<any>({ queryKey: ["xenia-qa-checkout", reservationId], enabled: open,
    staleTime: 0, queryFn: async () => (await apiRequest("GET", `/api/reservations/${reservationId}/folio`)).json() });
  const balance = Number(folio.data?.financialSummary?.operationalFolioBalance ?? folio.data?.balance);
  const checkout = useMutation({ mutationFn: async () => {
    setError("");
    try { await (await apiRequest("POST", `/api/reservations/${reservationId}/check-out`, { requireSettled: true })).json(); }
    catch (cause) {
      // A lost response is resolved from server state, without replaying a payment.
      const current = await (await apiRequest("GET", `/api/reservations/${reservationId}`)).json();
      if (current.status !== "checked_out") throw cause;
    }
  }, onSuccess: async () => {
    await Promise.all(["/api/reservations", "/api/rooms", "/api/planning", "/api/dashboard/departures",
      "/api/dashboard/stats"].map(key => queryClient.invalidateQueries({ queryKey: [key] })));
    onComplete();
  }, onError: () => { setError("No se confirmó la salida. Actualizá el saldo y revisá el folio antes de reintentar."); void folio.refetch(); } });
  return <Dialog open={open} onOpenChange={value => { if (!value && !checkout.isPending) onClose(); }}>
    <DialogContent><DialogHeader><DialogTitle>Salida de prueba</DialogTitle>
      <DialogDescription>Se cerrará la estadía y se liberará la habitación. Esta prueba no emite comprobantes fiscales.</DialogDescription>
    </DialogHeader>
      {folio.isPending ? <p role="status">Consultando saldo…</p> : folio.isError ? <p role="alert">No se pudo consultar el saldo.</p> :
        <p>Saldo pendiente de cobro: <strong data-testid="xenia-qa-checkout-balance">${fmtMoney(Number.isFinite(balance) ? balance : 0)}</strong></p>}
      {balance > 0 && <p>Registrá el pago desde el folio antes de cerrar la estadía.</p>}
      {error && <p role="alert">{error}</p>}
      <DialogFooter><Button variant="outline" onClick={onClose} disabled={checkout.isPending}>Volver al folio</Button>
        <Button variant="outline" onClick={() => void folio.refetch()} disabled={folio.isFetching || checkout.isPending}>Actualizar saldo</Button>
        <Button data-testid="button-confirm-xenia-qa-checkout" disabled={folio.isFetching || folio.isError || !Number.isFinite(balance) || balance > 0 || checkout.isPending}
          onClick={() => checkout.mutate()}>{checkout.isPending ? "Registrando…" : "Confirmar salida"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

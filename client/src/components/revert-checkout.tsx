import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/App";
import { apiRequest, apiRequestWithGroupInventoryWarning, parseApiError, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export function RevertCheckout({ reservationId, onComplete }: { reservationId: string; onComplete: () => void }) {
  const { hasPermission } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const allowed = hasPermission("sidebar:/check-in");
  const eligibility = useQuery<{ allowed: boolean; reason: string | null }>({ queryKey: ["checkout-reversal", reservationId], enabled: allowed, staleTime: 0,
    queryFn: async () => (await apiRequest("GET", `/api/reservations/${reservationId}/checkout-reversal`)).json() });
  const action = useMutation({ mutationFn: async () => (await apiRequestWithGroupInventoryWarning("POST", `/api/reservations/${reservationId}/undo-checkout`, {})).json(),
    onSuccess: async () => {
      for (const key of ["/api/reservations", "/api/rooms", "/api/dashboard/stats", "/api/dashboard/arrivals", "/api/dashboard/departures", "/api/reservations/check-out", "checkout-reversal"]) queryClient.invalidateQueries({ queryKey: [key] });
      queryClient.invalidateQueries({ predicate: query => query.queryKey[0] === "/api/planning" });
      toast({ title: "Check-out revertido", description: "El huésped vuelve a estar alojado y la habitación queda ocupada." });
      setOpen(false); onComplete();
    }, onError: e => setError(parseApiError(e)) });
  if (!allowed || !eligibility.data?.allowed) return null;
  return <>
    <Button type="button" size="sm" variant="outline" data-testid="button-undo-checkout" onClick={() => { setError(""); setOpen(true); }}>Revertir check-out</Button>
    <AlertDialog open={open} onOpenChange={value => { if (!action.isPending) setOpen(value); }}><AlertDialogContent><AlertDialogHeader>
      <AlertDialogTitle>¿Revertir el check-out?</AlertDialogTitle>
      <AlertDialogDescription>El huésped volverá a estar alojado y la habitación quedará ocupada. Se comprobará que esté disponible. Para cargar o facturar consumos sin retomar el alojamiento, usá Cuenta y facturación.</AlertDialogDescription>
    </AlertDialogHeader>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<AlertDialogFooter>
      <AlertDialogCancel disabled={action.isPending}>Cancelar</AlertDialogCancel>
      <AlertDialogAction disabled={action.isPending} onClick={event => { event.preventDefault(); action.mutate(); }}>{action.isPending ? "Revirtiendo…" : "Confirmar reversión"}</AlertDialogAction>
    </AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}

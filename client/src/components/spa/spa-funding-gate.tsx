import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { fundingApi } from "@/lib/paymentFunding";
import { Button } from "@/components/ui/button";
import { SpaFundingConnectedPanel } from "./spa-funding-connected-panel";

/** Unmanaged accounts keep the existing workflow until explicitly enrolled.
 * Unknown ownership never enables legacy writes in this view. */
export function SpaFundingGate({ enabled, accountId, userId, canWrite, canAdopt, onCompleted, children }: {
  enabled: boolean; accountId: string; userId: string; canWrite: boolean; canAdopt: boolean;
  onCompleted?: () => void; children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const enrollment = useQuery({
    queryKey: ["/api/payment-funding/enrollment", accountId, userId],
    queryFn: () => fundingApi.enrollment(accountId), enabled: enabled && !!userId,
    retry: false, staleTime: 0,
  });
  if (!enabled) return <>{children}</>;
  if (!userId || enrollment.isPending || enrollment.isFetching)
    return <p role="status">Verificando el circuito de esta cuenta…</p>;
  if (enrollment.isError) return <div className="space-y-3">
    <p role="alert">No se pudo verificar el circuito de la cuenta. {enrollment.error.message}</p>
    <Button onClick={() => void enrollment.refetch()}>Volver a consultar</Button>
  </div>;
  if (enrollment.data.adopted) return <SpaFundingConnectedPanel accountId={accountId} userId={userId}
    canWrite={canWrite} canAdopt={canAdopt} onCompleted={onCompleted} />;
  return <div className="space-y-4">
    {canWrite && canAdopt && <div className="space-y-2 rounded-md border p-3">
      <p className="text-sm">Prueba en homologación: podés vincular esta cuenta completa al nuevo circuito. Sus cobros se verifican sin cobrar ni facturar. Después de vincularla, se opera únicamente desde el nuevo circuito.</p>
      <p className="text-sm text-muted-foreground">Las cuentas con historia fiscal requieren conciliación. Los cobros y el stock que se confirmen después usan esta base.</p>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <Button disabled={busy} variant="outline" onClick={async () => {
        setBusy(true); setError("");
        try { await fundingApi.adoptUnbilled(accountId); await enrollment.refetch(); }
        catch (e) { setError(e instanceof Error ? e.message : "No se pudo vincular la cuenta."); }
        finally { setBusy(false); }
      }}>Vincular cuenta al nuevo circuito</Button>
    </div>}
    <fieldset disabled={busy} className="min-w-0">{children}</fieldset>
  </div>;
}

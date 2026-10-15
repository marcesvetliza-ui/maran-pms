import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fundingApi, FundingApiError } from "@/lib/paymentFunding";
import { Button } from "@/components/ui/button";
import { SpaFundingPanel } from "./spa-funding-panel";

/** No client-provided fiscal snapshot or shift identity: both come from the API. */
export function SpaFundingConnectedPanel({ accountId, userId, canWrite, canAdopt = false, onCompleted }: {
  accountId: string; userId: string; canWrite: boolean; canAdopt?: boolean; onCompleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const [adopting, setAdopting] = useState(false);
  const [adoptionError, setAdoptionError] = useState("");
  const shifts = useQuery({
    queryKey: ["/api/payment-funding/spa", accountId, "collection-shifts", userId],
    queryFn: () => fundingApi.collectionShifts(accountId),
    enabled: !!userId, retry: false,
  });
  if (shifts.error instanceof FundingApiError && shifts.error.code === "SCOPE_NOT_ADOPTED") {
    return <div className="space-y-3">
      <p>Esta cuenta todavía utiliza el circuito anterior. Para probar el nuevo, vinculá sus cobros verificados. No se factura ni se cobra al vincular.</p>
      <p className="text-sm text-muted-foreground">Sólo se admiten cuentas directas sin historia fiscal. Si ya hay comprobantes o vínculos incompletos, se requiere conciliación.</p>
      {adoptionError && <p role="alert" className="text-destructive">{adoptionError}</p>}
      {canAdopt && canWrite ? <Button disabled={adopting} onClick={async () => {
        setAdopting(true); setAdoptionError("");
        try {
          await fundingApi.adoptUnbilled(accountId);
          await queryClient.invalidateQueries({ queryKey: ["/api/payment-funding"] });
          await shifts.refetch();
        } catch (error) { setAdoptionError(error instanceof Error ? error.message : "No se pudo vincular la cuenta."); }
        finally { setAdopting(false); }
      }}>Vincular cuenta al nuevo circuito</Button> : <p>Un operador con permisos de operación y conciliación debe vincular esta cuenta.</p>}
    </div>;
  }
  return <div className="space-y-3">
    {shifts.isError && <p role="alert" className="text-sm text-destructive">No se pudieron consultar las cajas autorizadas. El cobro de dinero nuevo queda deshabilitado. {shifts.error.message}</p>}
    <Button variant="outline" disabled={shifts.isFetching || !userId} onClick={() => void shifts.refetch()}>Actualizar cajas autorizadas</Button>
    <SpaFundingPanel key={`${userId}:${accountId}`} accountId={accountId} userId={userId}
      canWrite={!!userId && canWrite} collectionShifts={shifts.isError || shifts.isFetching ? [] : shifts.data ?? []}
      onPrepareDocument={async () => (await fundingApi.prepareDocument(accountId)).documentId}
      onCompleted={onCompleted} />
  </div>;
}

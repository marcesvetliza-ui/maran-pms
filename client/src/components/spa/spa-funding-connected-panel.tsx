import { useQuery } from "@tanstack/react-query";
import { fundingApi } from "@/lib/paymentFunding";
import { Button } from "@/components/ui/button";
import { SpaFundingPanel } from "./spa-funding-panel";

/** No client-provided fiscal snapshot or shift identity: both come from the API. */
export function SpaFundingConnectedPanel({ accountId, userId, canWrite, onCompleted }: {
  accountId: string; userId: string; canWrite: boolean; onCompleted?: () => void;
}) {
  const shifts = useQuery({
    queryKey: ["/api/payment-funding/spa", accountId, "collection-shifts", userId],
    queryFn: () => fundingApi.collectionShifts(accountId),
    enabled: !!userId, retry: false,
  });
  return <div className="space-y-3">
    {shifts.isError && <p role="alert" className="text-sm text-destructive">No se pudieron consultar las cajas autorizadas. El cobro de dinero nuevo queda deshabilitado. {shifts.error.message}</p>}
    <Button variant="outline" disabled={shifts.isFetching || !userId} onClick={() => void shifts.refetch()}>Actualizar cajas autorizadas</Button>
    <SpaFundingPanel key={`${userId}:${accountId}`} accountId={accountId} userId={userId}
      canWrite={!!userId && canWrite} collectionShifts={shifts.isError || shifts.isFetching ? [] : shifts.data ?? []}
      onPrepareDocument={async () => (await fundingApi.prepareDocument(accountId)).documentId}
      onCompleted={onCompleted} />
  </div>;
}

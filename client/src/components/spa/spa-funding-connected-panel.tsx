import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fundingApi } from "@/lib/paymentFunding";
import { SpaFundingPanel } from "./spa-funding-panel";
import { SpaFundingRecipientEditor } from "./spa-funding-recipient";

export function SpaFundingConnectedPanel({ accountId, userId, canWrite, onCompleted }: {
  accountId: string; userId: string; canWrite: boolean; canAdopt?: boolean; onCompleted?: () => void;
}) {
  const [revision,setRevision]=useState(0);
  const shifts = useQuery({
    queryKey: ["/api/payment-funding/spa", accountId, "collection-shifts", userId],
    queryFn: () => fundingApi.collectionShifts(accountId), enabled: !!userId, retry: false,
  });
  return <div className="space-y-3">
    {shifts.isError && <p role="alert" className="text-sm text-destructive">No se pudieron consultar las cajas autorizadas. El cobro de dinero nuevo queda deshabilitado. {shifts.error.message}</p>}
    <SpaFundingPanel key={`${userId}:${accountId}:${revision}`} accountId={accountId} userId={userId}
      operational
      canWrite={!!userId && canWrite} collectionShifts={shifts.isError || shifts.isFetching ? [] : shifts.data ?? []}
      recipientEditor={<SpaFundingRecipientEditor accountId={accountId} userId={userId} canWrite={canWrite} onSaved={()=>setRevision(v=>v+1)}/>}
      onPrepareDocument={async () => (await fundingApi.prepareDocument(accountId)).documentId}
      onCompleted={onCompleted} />
  </div>;
}

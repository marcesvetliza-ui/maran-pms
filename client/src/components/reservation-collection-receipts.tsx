import {useQuery} from '@tanstack/react-query';
import {Printer} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {apiRequest} from '@/lib/queryClient';
import {fmtMoney} from '@/lib/utils';
import {reservationCollectionReceiptPath,type CollectionReceiptSummary} from '@shared/prefacturaCollection';

export function ReservationCollectionReceipts({reservationId}:{reservationId:string}){
  const {data}=useQuery<CollectionReceiptSummary[]>({queryKey:['/api/reservations',reservationId,'collection-receipts'],
    queryFn:async()=>(await apiRequest('GET',`/api/reservations/${encodeURIComponent(reservationId)}/collection-receipts`)).json()});
  const receipts=Array.isArray(data)?data:[];
  if(!receipts.length)return null;
  return <div className="mt-2 flex flex-wrap gap-2">{receipts.map(receipt=><Button key={receipt.operationId} asChild variant="outline" size="sm">
    <a href={reservationCollectionReceiptPath(reservationId,receipt.operationId)} target="_blank" rel="noopener noreferrer"><Printer className="h-4 w-4 mr-1"/>Recibo del cobro ${fmtMoney(receipt.total)}</a>
  </Button>)}</div>;
}

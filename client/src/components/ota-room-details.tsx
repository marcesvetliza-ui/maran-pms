import type { OtaRoomDetails } from '@shared/otaRoomDetails';
import { displayOtaBedRequest } from '@shared/otaRoomDetails';
/** Ordinary operational data only. Private channel notes remain in its audited detail. */
export function OtaRoomDetailsSummary({details,bedsOnly=false}:{details?:OtaRoomDetails|null;bedsOnly?:boolean}){
 if(!details||bedsOnly&&!details.bedRequest)return null;
 return <section aria-label="Datos recibidos del canal" className="rounded-md border bg-muted/20 p-3 space-y-2 text-sm min-w-0">
  {!bedsOnly&&<>
   <p><span className="font-medium">Titular en el canal:</span> {details.bookerName||'No informado'}</p>
   <p><span className="font-medium">Huéspedes informados para esta habitación:</span> {details.guestNames.length?details.guestNames.join(', '):'Sin informar; se conserva el titular como referencia'}</p>
   {details.guestStatus==='preserved_local'&&<p role="status" className="text-amber-800 dark:text-amber-300">Se conservaron los datos locales del huésped. Revisá las diferencias con el canal.</p>}
  </>}
  {details.bedRequest&&<div className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-950 dark:bg-amber-950/30 dark:text-amber-200 space-y-1">
   <p className="font-medium">Pedido de camas del canal</p>
   <p className="whitespace-pre-wrap break-words">{displayOtaBedRequest(details.bedRequest.text)}</p>
   <p className="text-xs">{details.bedRequest.scope==='booking'?'El canal envió un pedido compartido entre habitaciones. Confirmá con recepción a quién corresponde cada preparación.':'Preferencia del huésped: requiere confirmar la preparación de esta habitación.'}</p>
  </div>}
 </section>;
}

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fundingApi, FundingApiError, fundingMoney, fundingMethodLabels, fundingMethods, pesosToCents, centsToInput } from "@/lib/paymentFunding";
import { readSpaVoucherJournal } from "./spa-voucher-confirmation";
import { SpaChargeEditor } from "./spa-charge-editor";
import { SpaFundingConnectedPanel } from "./spa-funding-connected-panel";

const paymentLabels:Record<string,string>={cash:"Efectivo",debit_card:"Débito",credit_card:"Crédito",transfer:"Transferencia",mercadopago:"Mercado Pago"};
const movementLabels:Record<string,string>={charge:"Cargo",payment:"Pago",void:"Anulación",transfer_in:"Transferencia recibida",transfer_out:"Transferencia a habitación"};
const actionLabels:Record<string,string>={"add-charge":"Cargo agregado","void-charge":"Cargo anulado",payment:"Pago registrado","room-transfer":"Cuenta transferida a habitación","room-charge-void":"Cargo anulado desde Recepción"};
function date(value:string|null){return value?new Date(value).toLocaleString("es-AR"):"";}
function readAccountCommand(key:string) {
 try {
  const raw=sessionStorage.getItem(key);
  if(!raw)return {pending:null,damaged:false};
  const parsed=JSON.parse(raw);
  if(!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(parsed?.commandId)||!parsed.request||!actionLabels[parsed.request.action])
   throw new Error("Invalid command journal");
  return {pending:parsed as {commandId:string;request:unknown},damaged:false};
 }catch{return {pending:null,damaged:true};}
}

export function SpaAccountFolio({accountId,userId,canWrite,onCompleted,onBilling,initialTab="account"}:{accountId:string;userId:string;canWrite:boolean;onCompleted?:()=>void;onBilling?:()=>void;initialTab?:"account"|"billing"}) {
 const [tab,setTab]=useState<string>(initialTab),[form,setForm]=useState<"charge"|"payment"|"transfer"|"void"|null>(null);
 const [catalogRevision,setCatalogRevision]=useState(0);
 const [amount,setAmount]=useState(""),[method,setMethod]=useState<typeof fundingMethods[number]>("efectivo"),[shift,setShift]=useState("");
 const [target,setTarget]=useState(""),[reason,setReason]=useState(""),[itemId,setItemId]=useState("");
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const inFlight=useRef(false);
 const journalKey=`spa-account-command:${encodeURIComponent(userId)}:${encodeURIComponent(accountId)}`;
 const [journal]=useState(()=>readAccountCommand(journalKey));
 const [pending,setPending]=useState<{commandId:string;request:unknown}|null>(journal.pending);
 const account=useQuery({queryKey:["spa-account-folio",accountId,userId],queryFn:()=>fundingApi.account(accountId),retry:false});
 const shifts=useQuery({queryKey:["/api/payment-funding/spa",accountId,"collection-shifts",userId],queryFn:()=>fundingApi.collectionShifts(accountId),enabled:form==="payment",retry:false});
 const rooms=useQuery({queryKey:["spa-account-room-targets",accountId],queryFn:()=>fundingApi.roomTargets(accountId),enabled:form==="transfer",retry:false});
 const catalog=useQuery({queryKey:["spa-account-products",accountId],queryFn:()=>fundingApi.productCatalog(accountId),enabled:form==="charge",retry:false});
 const voucherPending=readSpaVoucherJournal(userId,accountId)!==null;
 const data=account.data,locked=voucherPending||busy||!canWrite||!!data?.readOnly||!!pending||journal.damaged;
 async function send(request:unknown,retry=false) {
  if(inFlight.current||!canWrite||journal.damaged||voucherPending)return;
  inFlight.current=true;
  setBusy(true);setError("");
  try {
   const command=retry?pending:{commandId:crypto.randomUUID(),request};
   if(!command)throw new Error("No hay una acción pendiente.");
   // Persist identity before sending: a lost HTTP response never creates a
   // second deposit, stock consumption or room charge on retry/reopen.
   sessionStorage.setItem(journalKey,JSON.stringify(command));setPending(command);
   await fundingApi.accountCommand(accountId,command);
   sessionStorage.removeItem(journalKey);setPending(null);setForm(null);
   await account.refetch();onCompleted?.();
  } catch(e) {
   if(e instanceof FundingApiError && e.status>=400 && e.status<500) {
    sessionStorage.removeItem(journalKey);setPending(null);
   }
   if(e instanceof FundingApiError&&["CATALOG_PRICE_CHANGED","INVALID_PRODUCT"].includes(e.code)){await catalog.refetch();setCatalogRevision(v=>v+1);}
   setError(e instanceof Error?e.message:"No se pudo completar la acción.");
  } finally {inFlight.current=false;setBusy(false);}
 }
 function open(next:typeof form){setForm(next);setError("");setReason("");setAmount(data?centsToInput(data.balanceCents):"");setTarget("");}
 function submit(build:()=>unknown){try{void send(build());}catch(e){setError((e as Error).message);}}
 if(account.isPending)return <p>Cargando cuenta SPA…</p>;
 if(account.isError||!data)return <div role="alert"><p>{account.error?.message||"No se pudo cargar la cuenta."}</p><Button variant="outline" onClick={()=>void account.refetch()}>Volver a cargar</Button></div>;
 return <div className="space-y-4">
  <div className="flex flex-wrap gap-2 border-b pb-3" role="tablist" aria-label="Folio SPA">
   {[["account","Cuenta"],["billing","Facturación"],["history","Historial"]].map(([value,label])=><Button key={value} role="tab" aria-selected={tab===value} variant={tab===value?"default":"outline"} onClick={()=>{if(value==="billing"&&onBilling){onBilling();return;}setTab(value);setForm(null);}}>{label}</Button>)}
  </div>
  {voucherPending&&<p role="alert">Hay un voucher pendiente. Abrí Facturación para consultar el mismo intento antes de registrar nuevos movimientos.</p>}
  {error&&<p role="alert" className="text-destructive">{error}</p>}
  {journal.damaged&&<p role="alert" className="text-destructive">No se pudo leer una acción pendiente. Solicitá revisión antes de registrar nuevos movimientos.</p>}
  {pending&&<div className="rounded border p-3"><p>Hay una acción pendiente de confirmar.</p><Button disabled={busy||!canWrite||voucherPending} onClick={()=>void send(null,true)}>Reintentar la misma acción</Button></div>}
  {tab==="account"&&<>
   <div className="rounded border bg-muted/30 p-3"><p className="font-medium">{data.guestName}</p><p className="text-sm">{data.transferred?.cancelled?"Cargo anulado desde Recepción · el turno se mantiene":data.transferred?`Cuenta trasladada a Hab. ${data.transferred.roomNumber}`:data.status==="open"?"Cuenta abierta":"Cuenta cerrada"}</p></div>
   <section className="rounded-lg border"><div className="flex items-center justify-between gap-2 bg-muted/40 p-3"><h3 className="font-semibold">Tratamientos / Productos / Cargos adicionales</h3><Button size="sm" variant="outline" disabled={locked} onClick={()=>open("charge")}>Agregar cargo</Button></div>
    {data.items.map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-t p-3"><div><p>{item.description}</p><p className="text-xs text-muted-foreground">{item.quantity} × {fundingMoney(Math.round(item.unitPrice*100))} · {item.itemType==="treatment"?"Tratamiento":item.itemType==="product"?"Producto":item.itemType==="discount"?"Descuento":"Extra"}</p></div><div className="flex items-center gap-2"><strong>{fundingMoney(Math.round(item.subtotal*100))}</strong>{!["treatment","discount"].includes(item.itemType)&&<Button size="sm" variant="ghost" disabled={locked} onClick={()=>{open("void");setItemId(item.id);}}>Anular</Button>}</div></div>)}
    {!data.items.length&&<p className="p-4 text-sm text-muted-foreground">Sin cargos registrados</p>}
   </section>
   <section className="rounded-lg border"><div className="flex items-center justify-between bg-muted/40 p-3"><h3 className="font-semibold">Pagos / Anticipos</h3><Button size="sm" variant="outline" disabled={locked||data.balanceCents===0} onClick={()=>open("payment")}>Registrar pago</Button></div>
    {data.payments.map(p=><div key={p.id} className="flex flex-wrap justify-between gap-2 border-t p-3"><div><p>{paymentLabels[p.method]||fundingMethodLabels[p.method as keyof typeof fundingMethodLabels]||p.method}{p.status!=="active"&&" · Anulado"}</p><p className="text-xs text-muted-foreground">{date(p.createdAt)}{p.notes&&` · ${p.notes}`}</p></div><strong>{fundingMoney(Math.round(p.amount*100))}</strong></div>)}
    {!data.payments.length&&<p className="p-4 text-sm text-muted-foreground">Sin pagos registrados</p>}
   </section>
   <div className="space-y-2 rounded-lg border bg-muted/30 p-4"><p className="flex justify-between"><span>Total de cargos</span><strong>{fundingMoney(data.totalCents)}</strong></p><p className="flex justify-between text-green-700"><span>Pagado</span><strong>{fundingMoney(data.paidCents)}</strong></p>{data.transferred&&<p className="flex justify-between"><span>Transferido a habitación</span><strong>{fundingMoney(data.transferred.amountCents)}</strong></p>}<p className="flex justify-between border-t pt-2 text-lg"><span>Saldo pendiente</span><strong>{fundingMoney(data.balanceCents)}</strong></p></div>
   {form&&<div className="space-y-3 rounded border p-4" role="region" aria-label="Acción sobre la cuenta">
    {form==="charge"&&<SpaChargeEditor key={catalogRevision} entries={catalog.data??[]} loading={catalog.isPending} error={catalog.isError} locked={locked} onSave={request=>void send(request)}/>}
    {form==="payment"&&<><h4 className="font-semibold">Registrar pago / anticipo</h4>{shifts.data?.length?<><label className="block">Importe del pago<Input inputMode="decimal" value={amount} disabled={locked} onChange={e=>setAmount(e.target.value)}/></label><label className="block">Forma de pago<select aria-label="Forma de pago de la cuenta" className="block w-full rounded border bg-background p-2" value={method} disabled={locked} onChange={e=>setMethod(e.target.value as typeof method)}>{fundingMethods.map(m=><option key={m} value={m}>{fundingMethodLabels[m]}</option>)}</select></label>{shifts.data.length>1&&<label className="block">Caja<select aria-label="Caja del pago" className="block w-full rounded border bg-background p-2" value={shift} onChange={e=>setShift(e.target.value)}><option value="">Seleccionar caja</option>{shifts.data.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></label>}<label className="block">Observaciones<Input value={reason} disabled={locked} onChange={e=>setReason(e.target.value)}/></label><Button disabled={locked} onClick={()=>submit(()=>({action:"payment",amountCents:pesosToCents(amount),method,shiftId:shift||(shifts.data?.length===1?shifts.data[0].id:""),notes:reason}))}>Confirmar pago</Button></>:<p>{shifts.isPending?"Consultando cajas…":shifts.isError?"No se pudieron consultar las cajas. Cerrá y volvé a abrir esta sección.":"Abrí tu caja SPA desde Caja para registrar el pago."}</p>}</>}
    {form==="transfer"&&<><h4 className="font-semibold">Transferir cuenta a habitación</h4><p>Se trasladarán {fundingMoney(data.totalCents)} al folio de la reserva elegida. Se cobrará y facturará desde Recepción.</p><label className="block">Habitación de destino<select aria-label="Habitación de destino" className="block w-full rounded border bg-background p-2" value={target} disabled={locked} onChange={e=>setTarget(e.target.value)}><option value="">Seleccionar huésped y habitación</option>{rooms.data?.map(r=><option key={r.id} value={r.id}>Hab. {r.roomNumber} · {r.firstName} {r.lastName}</option>)}</select></label>{rooms.isError&&<p role="alert">No se pudieron consultar las habitaciones.</p>}<label className="block">Motivo de transferencia<Input value={reason} disabled={locked} onChange={e=>setReason(e.target.value)}/></label><Button disabled={locked||!target||reason.trim().length<3} onClick={()=>submit(()=>({action:"room-transfer",reservationId:target,expectedCents:data.totalCents,reason}))}>Confirmar transferencia a habitación</Button></>}
    {form==="void"&&<><h4 className="font-semibold">Anular cargo: {data.items.find(i=>i.id===itemId)?.description}</h4><label className="block">Motivo de anulación<Input value={reason} disabled={locked} onChange={e=>setReason(e.target.value)}/></label><Button variant="destructive" disabled={locked||reason.trim().length<3} onClick={()=>void send({action:"void-charge",itemId,reason})}>Confirmar anulación del cargo</Button></>}
    <Button variant="ghost" disabled={busy||!!pending} onClick={()=>setForm(null)}>Cancelar</Button>
   </div>}
   <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={locked||data.paidCents>0||data.totalCents===0} onClick={()=>open("transfer")}>Transferir a habitación</Button><Button disabled={(!data.canInvoice&&!voucherPending)||busy||!!pending||journal.damaged} onClick={()=>onBilling?onBilling():setTab("billing")}>Ir a facturación</Button></div>
   {data.paidCents>0&&!data.readOnly&&<p className="text-xs text-muted-foreground">La transferencia completa a habitación está disponible para cuentas sin pagos.</p>}
  </>}
  {tab==="billing"&&((data.canInvoice||voucherPending)?<><Button variant="ghost" onClick={()=>setTab("account")}>Volver a la cuenta</Button><SpaFundingConnectedPanel accountId={accountId} userId={userId} canWrite={canWrite&&!pending&&!journal.damaged} onRoomTransfer={()=>{void account.refetch().then(()=>{setTab("account");open("transfer");});}} onCompleted={()=>{void account.refetch();onCompleted?.();setTab("account");}}/></>:<p>{data.transferred?.cancelled?"El cargo fue anulado desde Recepción; no vuelve a generar saldo en SPA.":data.transferred?`La cuenta se factura desde Recepción, Hab. ${data.transferred.roomNumber}.`:"Los comprobantes de esta cuenta se conservan en el historial."}</p>)}
  {tab==="history"&&<div className="space-y-3"><h3 className="font-semibold">Movimientos de la cuenta</h3>{data.movements.map(m=><div key={m.id} className="flex flex-wrap justify-between gap-2 rounded border p-3"><div><p>{movementLabels[m.type]||m.type} · {m.description}</p><p className="text-xs text-muted-foreground">{date(m.createdAt)}</p></div><strong>{fundingMoney(Math.round(m.amount*100))}</strong></div>)}{data.events.map((e,i)=><p key={i} className="text-sm">{date(e.createdAt)} · {actionLabels[e.action]||e.action}{e.reason&&` · ${e.reason}`}</p>)}{data.invoices.map(i=><div key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3"><span>{i.type} {i.point}-{i.number} · {fundingMoney(i.amountCents)} · {i.status}</span><a className="text-primary underline" href={`/api/billing/invoices/${encodeURIComponent(i.id)}/pdf`} target="_blank" rel="noreferrer">Ver comprobante</a></div>)}{data.operations.map(o=><p key={o.id} className="text-sm">Facturación · {o.status==="applied"?"Finalizada":o.status==="aborted"?"Cancelada":"Pendiente"}</p>)}{!data.movements.length&&!data.events.length&&!data.invoices.length&&<p>Sin movimientos adicionales.</p>}</div>}
 </div>;
}

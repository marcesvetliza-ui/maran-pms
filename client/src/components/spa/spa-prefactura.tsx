import { useAuth } from "@/App";
import { useEffect,useRef,useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { calculateCheckoutDiscount } from "@shared/checkoutDiscount";
import { spaPrefacturaSettingsSchema,type SpaPrefacturaSettings } from "@shared/spaPrefactura";
import { fundingApi,fundingMoney,fundingMethods,fundingMethodLabels,pesosToCents,centsToInput,type SpaAccountView,type FundingRequest } from "@/lib/paymentFunding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GuestSearchCombobox } from "@/components/guest-search-combobox";
import { SpaFundingRecipientEditor } from "./spa-funding-recipient";
import { SpaVoucherConfirmation, readSpaVoucherJournal } from "./spa-voucher-confirmation";
import { SpaFundingPanel } from "./spa-funding-panel";

const ivaLabels:Record<string,string>={consumidor_final:"Consumidor final",responsable_inscripto:"Responsable inscripto",exento:"Exento",monotributo:"Monotributo",monotributista:"Monotributo",no_responsable:"No responsable",no_categorizado:"No categorizado"};
type Row={id:string;method:typeof fundingMethods[number];value:string};
export function SpaPrefactura(props:{accountId:string;userId:string;canWrite:boolean;onCompleted?:()=>void;onRoomTransfer?:()=>void}) {
 const account=useQuery({queryKey:["spa-prefactura-account",props.accountId,props.userId],queryFn:()=>fundingApi.account(props.accountId),retry:false});
 if(account.isPending)return <p>Cargando prefactura SPA…</p>;
 if(account.isError||!account.data)return <p role="alert">{account.error?.message||"No se pudo consultar la cuenta."}</p>;
 return <PrefacturaForm {...props} account={account.data} refreshAccount={()=>account.refetch()}/>;
}
function PrefacturaForm({accountId,userId,canWrite,account,refreshAccount,onCompleted,onRoomTransfer}:{
 accountId:string;userId:string;canWrite:boolean;account:SpaAccountView;refreshAccount:()=>Promise<unknown>;onCompleted?:()=>void;onRoomTransfer?:()=>void;
}) {
 const { hasPermission } = useAuth();
 const journal=readSpaVoucherJournal(userId,accountId);
 const initial=spaPrefacturaSettingsSchema.safeParse(journal&&journal!=="damaged"?journal.settings:account.preferences);
 const [kind,setKind]=useState<SpaPrefacturaSettings["recipientKind"]>(initial.success?initial.data.recipientKind:"client");
 const [recipientId,setRecipientId]=useState(initial.success?initial.data.recipientId??"":""),[guestName,setGuestName]=useState("");
 const [discount,setDiscount]=useState(initial.success?initial.data.discount:null);
 const [discountValue,setDiscountValue]=useState(initial.success&&initial.data.discount?String(initial.data.discount.value):"");
 const [receiptType,setReceiptType]=useState<SpaPrefacturaSettings["receiptType"]>(initial.success&&(account.status==="open"||!!journal)?initial.data.receiptType:undefined);
 const [notes,setNotes]=useState(initial.success?initial.data.notes:"");
 const [revision,setRevision]=useState(0),[shift,setShift]=useState("");
 const [savingTransfer,setSavingTransfer]=useState(false),[transferError,setTransferError]=useState("");
 const transferring=useRef(false);
 const touched=useRef(false);
 const context=useQuery({queryKey:["spa-prefactura-context",accountId],queryFn:()=>fundingApi.prefacturaContext(accountId),retry:false});
 const profile=useQuery({queryKey:["/api/payment-funding/recipient",accountId,userId],queryFn:()=>fundingApi.recipient(accountId),retry:false,staleTime:0,refetchOnMount:"always"});
 const candidate=useQuery({queryKey:["spa-prefactura-guest",recipientId],queryFn:()=>fundingApi.recipientCandidate(recipientId),enabled:kind==="guest"&&!!recipientId,retry:false});
 const projection=useQuery({queryKey:["spa-prefactura-funding",accountId,userId,revision],queryFn:()=>fundingApi.scope(accountId),retry:false});
 const shifts=useQuery({queryKey:["/api/payment-funding/spa",accountId,"collection-shifts",userId],queryFn:()=>fundingApi.collectionShifts(accountId),retry:false});
 const ordinary=account.items.filter(i=>i.itemType!=="discount"),gross=ordinary.reduce((n,i)=>n+Math.round(i.subtotal*100),0);
 let discountCents=0,problem="";
 const selectedDiscount=discount?{...discount,value:Number(discountValue.replace(",","."))}:null;
 try {if(selectedDiscount)discountCents=Math.round(calculateCheckoutDiscount(Object.fromEntries(ordinary.map(i=>[i.id,i.subtotal])),selectedDiscount).amount*100);}
 catch(e){problem=(e as Error).message;}
 const total=gross-discountCents;
 if(total<account.paidCents)problem="El descuento supera el saldo después de los pagos registrados.";
 const discountValid=!problem;
 let toApply=total;
 const applications:FundingRequest["applications"]=[];
 for(const receipt of projection.data?.receipts??[]) {
  const amountCents=Math.min(Math.max(0,toApply),receipt.freeCents);
  if(amountCents){applications.push({receiptId:receipt.id,amountCents});toApply-=amountCents;}
 }
 const required=Math.max(0,toApply),applied=total-required;
 const [rows,setRows]=useState<Row[]>([]);
 useEffect(()=>{
  if(!touched.current&&projection.data)setRows(required?[{id:"new-collection",method:"efectivo",value:centsToInput(required)}]:[]);
 },[required,projection.data]);
 const effectiveShift=shift||(shifts.data?.length===1?shifts.data[0].id:"");
 let collections:FundingRequest["newCollections"]=[],preparedCents=0;
 try {
  collections=rows.map(r=>({rowId:r.id,method:r.method,amountCents:pesosToCents(r.value),shiftId:effectiveShift}));
  preparedCents=collections.reduce((n,r)=>n+r.amountCents,0);
 }catch{if(required)problem=problem||"Completá los importes de las formas de pago.";}
 const cashProblem = !required ? "" : shifts.isPending ? "Consultando tu caja SPA…" : shifts.isError ? "No se pudo verificar tu caja SPA. Reintentá la consulta antes de cobrar." : !shifts.data?.length ? "Abrí tu caja SPA desde Caja para registrar el cobro." : !effectiveShift ? "Seleccioná una de tus cajas SPA abiertas para registrar el cobro." : "";
 if(cashProblem)problem=problem||cashProblem;
 if(preparedCents!==required)problem=problem||"Los importes de cobro deben sumar el nuevo cobro requerido.";
 const settings:SpaPrefacturaSettings={...(receiptType?{receiptType}:{}),recipientKind:kind,...(kind!=="client"?{recipientId}:{}),discount:selectedDiscount,notes};
 const selectedCompany=context.data?.companies.find(c=>c.id===recipientId);
 const person=kind==="guest"?candidate.data:profile.data;
 const recipient=kind==="company"?{name:selectedCompany?.name??"",document:selectedCompany?.cuit??"",condition:selectedCompany?.vatCondition??"",address:selectedCompany?.address??""}:
  {name:[person?.firstName,person?.lastName].filter(Boolean).join(" "),document:person?.cuit||person?.documentNumber||"",condition:person?.vatCondition??"",address:person?.address??""};
 const condition=recipient.condition.trim().toLowerCase().replace(/[\s-]+/g,"_");
 const inferredTipo=["responsable_inscripto","exento"].includes(condition)?"FA":"FB";
 const effectiveType=receiptType??inferredTipo;
 const tipo=effectiveType==="cierre_spa"?"Voucher SPA — no fiscal":effectiveType==="FA"?"Factura A":"Factura B";
 const typeProblem=effectiveType!=="cierre_spa"&&!ivaLabels[condition]?"Falta una condición IVA válida en la ficha seleccionada. Revisá los datos fiscales antes de emitir.":effectiveType!=="cierre_spa"&&effectiveType!==inferredTipo?"El tipo elegido no corresponde a la condición IVA. Revisá el comprobante o los datos fiscales.":effectiveType==="cierre_spa"&&context.data&&context.data.voucherPoint==null?"Revisá la configuración del punto de venta SPA antes de emitir el voucher.":"";
 const [voucherPending,setVoucherPending]=useState(()=>readSpaVoucherJournal(userId,accountId)!==null);
 const [voucherBusy,setVoucherBusy]=useState(false);
 const active=projection.data?.operations.some(o=>!["applied","aborted"].includes(o.status));
 const locked=!canWrite||!!active||account.operations.some(o=>!["applied","aborted"].includes(o.status))||savingTransfer||voucherPending||voucherBusy;
 const selectionKey=JSON.stringify({settings,applications,collections});
 const prepareAttempt=useRef<{selectionKey:string;body:unknown}|null>(null);
 function printSummary() {
  const win=window.open("","_blank");if(!win)return;
  win.document.title="Prefactura SPA";
  const title=win.document.createElement("h1");title.textContent="Prefactura SPA";
  const text=win.document.createElement("pre");text.style.whiteSpace="pre-wrap";text.style.fontFamily="sans-serif";
  text.textContent=[`Cliente: ${account.guestName}`,`Facturar a: ${recipient.name}`,`Documento: ${recipient.document}`,`Condición IVA: ${ivaLabels[recipient.condition]||recipient.condition}`,tipo,
   "",...ordinary.map(i=>`${i.description} · ${i.quantity} × ${fundingMoney(Math.round(i.unitPrice*100))} = ${fundingMoney(Math.round(i.subtotal*100))}`),
   `Descuento: ${fundingMoney(discountCents)}${selectedDiscount?` · ${selectedDiscount.reason}`:""}`,`Total: ${fundingMoney(total)}`,`Pagos anteriores aplicados: ${fundingMoney(applied)}`,`Nuevo cobro: ${fundingMoney(required)}`,
   ...rows.map(r=>`${fundingMethodLabels[r.method]}: ${r.value}`),`Observaciones: ${notes}`,"","Prefactura — no es un comprobante fiscal."].join("\n");
  win.document.body.append(title,text);win.focus();win.print();
 }
 const reviewContent=<section aria-label="Revisión del comprobante SPA" className="space-y-3 rounded-lg border bg-muted/20 p-4">
  <h4 className="font-semibold">Revisión · {tipo}</h4><p>{recipient.name||account.guestName}{recipient.document&&` · ${recipient.document}`}</p>
  {ordinary.map(i=><p key={i.id} className="flex justify-between gap-3"><span>{i.description} × {i.quantity}</span><strong>{fundingMoney(Math.round(i.subtotal*100))}</strong></p>)}
  <p className="flex justify-between"><span>Descuento</span><strong>−{fundingMoney(discountCents)}</strong></p>
  <p className="flex justify-between border-t pt-2 text-lg"><span>Total del comprobante</span><strong>{fundingMoney(total)}</strong></p>
  <p>Pagos anteriores: {fundingMoney(applied)} · Nuevo cobro: {fundingMoney(required)}</p>
  {notes&&<p>Observaciones: {notes}</p>}
  {typeProblem&&<p role="alert" className="text-destructive">{typeProblem}</p>}
  {problem&&<p className="text-destructive">{problem} Podés revisar el comprobante; para confirmar el cobro debés resolver este punto.</p>}
  <p className="text-sm text-muted-foreground">Esta revisión no cobra ni emite. {effectiveType==="cierre_spa"?"El voucher no tiene validez fiscal.":"La factura se autoriza únicamente al confirmar."}</p>
 </section>;
 const formContent=<>
    {cashProblem && <section role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100" data-testid="spa-cash-notice"><h4 className="font-semibold">{shifts.isPending ? "Verificando Caja SPA" : "Caja SPA · acción necesaria"}</h4><p className="mt-1 text-sm">{cashProblem} Podés revisar el comprobante; la confirmación del cobro requiere una caja válida.</p><div className="mt-3 flex flex-wrap gap-2">{!shifts.isPending && <Button variant="outline" onClick={()=>void shifts.refetch()}>Volver a consultar caja</Button>}{hasPermission?.("sidebar:/cash-register") && <Button variant="outline" asChild><a href="/cash-register" target="_blank" rel="noopener noreferrer">Ir a Caja</a></Button>}</div></section>}
    {profile.isError && kind==="client" && <p role="alert" className="rounded border border-destructive p-3">No se pudieron recuperar los datos fiscales del cliente. <Button variant="outline" onClick={()=>void profile.refetch()}>Reintentar datos fiscales</Button></p>}
    {typeProblem && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">{typeProblem}</p>}

    <fieldset disabled={locked} className="space-y-3 rounded-lg border bg-muted/20 p-4"><legend className="px-1 text-sm font-semibold">IDENTIDAD Y COMPROBANTE</legend>
     <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <label>Facturar a<select aria-label="Facturar a" className="block w-full rounded border bg-background p-2" value={kind} onChange={e=>{setKind(e.target.value as typeof kind);setRecipientId("");}}><option value="client">Cliente SPA</option><option value="guest">Huésped</option><option value="company">Empresa</option></select></label>
      <label>Razón social / Nombre<Input readOnly value={recipient.name}/></label><label>DNI / CUIT<Input readOnly value={recipient.document}/></label><label>Condición IVA<Input readOnly value={ivaLabels[condition]||recipient.condition||"No registrada"}/></label>
      <label className="sm:col-span-2">Domicilio<Input readOnly value={recipient.address}/></label><label>Tipo de comprobante<select aria-label="Tipo de comprobante" className="block min-h-10 w-full rounded border bg-background p-2" value={effectiveType} onChange={e=>setReceiptType(e.target.value as SpaPrefacturaSettings["receiptType"])}><option value="FA">Factura A</option><option value="FB">Factura B</option><option value="cierre_spa" disabled={account.status!=="open"}>Voucher SPA — no fiscal</option></select></label>
      <label>Punto de venta<Input readOnly value={context.data&&(effectiveType!=="cierre_spa"||context.data.voucherPoint!=null)?`PV ${String(effectiveType==="cierre_spa"?context.data.voucherPoint:context.data.point).padStart(4,"0")} — ${effectiveType==="cierre_spa"?"No fiscal":context.data.environment==="homologacion"?"Homologación":"Electrónico"}`:context.data?"Revisar punto de venta SPA":"Cargando…"}/></label>
      <label>Condición de venta<Input readOnly value="Contado"/></label>
     </div>
     {context.isError&&<p role="alert">No se pudieron consultar las empresas y el punto de venta.</p>}
     {kind==="company"&&<label className="block">Empresa<select aria-label="Empresa a facturar" className="block w-full rounded border bg-background p-2" value={recipientId} onChange={e=>setRecipientId(e.target.value)}><option value="">Seleccionar empresa</option>{context.data?.companies.map(c=><option key={c.id} value={c.id}>{c.name} · {c.cuit}</option>)}</select></label>}
     {kind==="guest"&&<GuestSearchCombobox label="Buscar huésped a facturar" selectedGuestId={recipientId||null} selectedGuestName={guestName||recipient.name} onGuestSelect={g=>{setRecipientId(g.id);setGuestName(`${g.firstName} ${g.lastName}`);}} onClear={()=>{setRecipientId("");setGuestName("");}}/>}
     {candidate.isError&&kind==="guest"&&<p role="alert">No se pudieron cargar los datos del huésped.</p>}
     {kind==="client"&&<SpaFundingRecipientEditor accountId={accountId} userId={userId} canWrite={!locked} onSaved={()=>{void profile.refetch();void refreshAccount();setRevision(v=>v+1);}}/>}
    </fieldset>
    <div className="space-y-3 rounded-lg border p-4"><Button variant="outline" disabled={locked||account.status!=="open"} onClick={()=>{setDiscount(discount?null:{type:"percent",value:10,reason:""});setDiscountValue("10");}}>{discount?"Quitar descuento":"Agregar descuento"}</Button>
     {discount&&<div className="grid gap-3 sm:grid-cols-3"><label>Tipo de descuento<select aria-label="Tipo de descuento" className="block w-full rounded border bg-background p-2" disabled={locked} value={discount.type} onChange={e=>setDiscount({...discount,type:e.target.value as "percent"|"fixed"})}><option value="percent">Porcentaje</option><option value="fixed">Importe fijo</option></select></label><label>{discount.type==="percent"?"Porcentaje (%)":"Importe del descuento"}<Input inputMode="decimal" disabled={locked} value={discountValue} onChange={e=>setDiscountValue(e.target.value)}/></label><label>Motivo del descuento<Input disabled={locked} value={discount.reason} onChange={e=>setDiscount({...discount,reason:e.target.value})}/></label></div>}
    </div>
    <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-3"><div>Total de cargos<strong className="block">{fundingMoney(gross)}</strong></div><div>Descuento<strong className="block">−{fundingMoney(discountCents)}</strong></div><div>Importe a facturar<strong className="block">{fundingMoney(total)}</strong></div><div>Pagos anteriores aplicados<strong className="block">{fundingMoney(applied)}</strong></div><div>Nuevo cobro requerido<strong className="block text-lg text-primary">{fundingMoney(required)}</strong></div><div>Cobro preparado / resta<strong className="block">{fundingMoney(preparedCents)} / {fundingMoney(Math.max(0,required-preparedCents))}</strong></div></div>
    <details className="rounded-lg border p-4"><summary className="cursor-pointer font-semibold">Revisar cargos SPA ({ordinary.length})</summary>{ordinary.map(i=><div key={i.id} className="flex justify-between gap-3 border-t py-2"><span>{i.description} · {i.quantity}</span><strong>{fundingMoney(Math.round(i.subtotal*100))}</strong></div>)}</details>
    <fieldset disabled={locked} className="space-y-3 rounded-lg border p-4"><legend className="px-1 font-semibold">Formas de cobro</legend>
     {required===0&&<p>Cubierto por pagos registrados. No requiere un nuevo cobro.</p>}
     {rows.map((row,index)=><div key={row.id} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"><label>Monto<Input aria-label={`Monto del cobro ${index+1}`} inputMode="decimal" value={row.value} onChange={e=>{touched.current=true;setRows(values=>values.map(r=>r.id===row.id?{...r,value:e.target.value}:r));}}/></label><label>Método<select aria-label={`Método del cobro ${index+1}`} className="block w-full rounded border bg-background p-2" value={row.method} onChange={e=>{touched.current=true;setRows(values=>values.map(r=>r.id===row.id?{...r,method:e.target.value as typeof r.method}:r));}}>{fundingMethods.map(m=><option key={m} value={m}>{fundingMethodLabels[m]}</option>)}</select></label><Button variant="ghost" aria-label={`Quitar cobro ${index+1}`} onClick={()=>{touched.current=true;setRows(values=>values.filter(r=>r.id!==row.id));}}>Quitar</Button></div>)}
     {required>0&&<Button variant="outline" onClick={()=>{touched.current=true;setRows(values=>[...values,{id:crypto.randomUUID(),method:"efectivo",value:""}]);}}>Agregar forma de pago</Button>}
     {!!required&&shifts.data&&shifts.data.length>1&&<label className="block">Caja SPA<select aria-label="Caja SPA del cobro" className="block w-full rounded border bg-background p-2" value={shift} onChange={e=>setShift(e.target.value)}><option value="">Seleccionar caja</option>{shifts.data.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></label>}
    </fieldset>
    <label className="block">Referencia / Observaciones del comprobante<Input value={notes} disabled={locked} onChange={e=>setNotes(e.target.value)}/></label>
    {typeProblem&&<p role="alert" className="text-destructive">{typeProblem}</p>}
    {problem&&<p role="alert" className="text-destructive">{problem}</p>}
    {transferError&&<p role="alert" className="text-destructive">{transferError}</p>}
    <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={printSummary}>Imprimir resumen</Button>{onRoomTransfer&&<Button variant="outline" disabled={locked||account.paidCents>0||!discountValid} onClick={async()=>{
     if(transferring.current)return;transferring.current=true;setSavingTransfer(true);setTransferError("");
     try {
      await fundingApi.savePrefacturaOptions(accountId,{requestId:crypto.randomUUID(),expectedVersion:account.chargeVersion,settings:{recipientKind:"client",discount:selectedDiscount,notes}});
      await refreshAccount();onRoomTransfer();
     }catch(e){await refreshAccount();setTransferError((e as Error).message);}
     finally{transferring.current=false;setSavingTransfer(false);}
    }}>Cargar a habitación</Button>}</div>
   </>;
 return <div className="space-y-4">
  <h3 className="text-xl font-semibold">Prefactura SPA <span className="text-sm font-normal text-muted-foreground">— {account.guestName}</span></h3>
  {effectiveType==="cierre_spa"||voucherPending?<SpaVoucherConfirmation accountId={accountId} userId={userId} canWrite={canWrite} valid={!problem&&!typeProblem&&discountValid&&!!projection.data&&!!context.data&&!active} selectionKey={selectionKey} settings={settings} expectedVersion={account.chargeVersion} collections={collections} review={reviewContent} form={formContent} onPending={setVoucherPending} onBusy={setVoucherBusy} onCompleted={()=>{void refreshAccount();onCompleted?.();}}/>:<>
  <SpaFundingPanel key={`${userId}:${accountId}:${revision}`} accountId={accountId} userId={userId} canWrite={canWrite&&!voucherPending} operational collectionShifts={shifts.data??[]} onCompleted={onCompleted}
   onPrepareDocument={async()=>{
    if(!prepareAttempt.current||prepareAttempt.current.selectionKey!==selectionKey)prepareAttempt.current={selectionKey,body:{requestId:crypto.randomUUID(),expectedVersion:account.chargeVersion,settings}};
    try {const prepared=await fundingApi.prepareDocument(accountId,prepareAttempt.current.body);prepareAttempt.current=null;await refreshAccount();return prepared.documentId;}
    catch(e){await refreshAccount();throw e;}
   }}
   prefactura={{applications,collections,selectionKey,review:reviewContent,reviewValid:discountValid&&!context.isError&&!!context.data&&!!projection.data,valid:!typeProblem&&!problem&&!context.isError&&!!context.data&&!!projection.data&&(kind==="client"||!!recipientId),children:formContent}}/>
  </>}
 </div>;
}

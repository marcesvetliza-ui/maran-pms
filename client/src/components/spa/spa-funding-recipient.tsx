import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fundingApi, type SpaRecipient } from "@/lib/paymentFunding";
import { GuestSearchCombobox } from "@/components/guest-search-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Fields={guestId?:string;kind:"guest"|"spa_client";firstName:string;lastName:string;documentType:"DNI"|"CUIT";
  documentNumber:string;vatCondition:string;cuit:string;address:string};
function fields(p?:SpaRecipient):Fields {
  const condition=(p?.vatCondition??"").trim().toLowerCase().replace(/[\s-]+/g,"_");
  const documentType=p?.documentType?.toUpperCase()==="CUIT"?"CUIT":"DNI";
  return {guestId:p?.guestId??undefined,kind:p?.kind??"guest",firstName:p?.firstName??"",lastName:p?.lastName??"",
    documentType,documentNumber:(p?.documentNumber||(documentType==="CUIT"?p?.cuit:"")||"").replace(/\D/g,""),
    vatCondition:condition==="monotributista"?"monotributo":condition,cuit:(p?.cuit??"").replace(/\D/g,""),address:p?.address??""};
}
export function SpaFundingRecipientEditor({accountId,userId,canWrite,onSaved}:{
  accountId:string;userId:string;canWrite:boolean;onSaved:()=>void;
}) {
  const client=useQueryClient();
  const profile=useQuery({queryKey:["/api/payment-funding/recipient",accountId,userId],queryFn:()=>fundingApi.recipient(accountId),retry:false,staleTime:0,refetchOnMount:"always"});
  const [form,setForm]=useState<Fields>(fields());
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>{if(profile.data)setForm(fields(profile.data));},[profile.data]);
  if(profile.isPending)return <p>Consultando datos fiscales del cliente…</p>;
  const disabled=!canWrite||busy||profile.data?.editable===false;
  return <details className="rounded border p-3" open={!profile.data?.guestId || !profile.data?.vatCondition}>
    <summary className="cursor-pointer font-medium">Datos fiscales del cliente{form.guestId?` · ${form.firstName} ${form.lastName}`:" · Falta vincular la ficha"}</summary>
    <p className="my-2 text-sm text-muted-foreground">Elegí una ficha o completá los datos para crearla y vincularla al turno. Guardar actualiza la ficha seleccionada; no emite ni cobra.</p>
    {(error||profile.isError)&&<p role="alert" className="text-destructive">{error||profile.error?.message}</p>}
    <fieldset disabled={disabled} className="min-w-0 space-y-3">
      <GuestSearchCombobox label="Buscar cliente para facturar" selectedGuestId={form.guestId??null}
        selectedGuestName={form.guestId?`${form.firstName} ${form.lastName}`:null}
        onClear={()=>setForm(v=>({...v,guestId:undefined,kind:"guest"}))}
        onCreateNew={()=>setForm({...fields(),firstName:profile.data?.firstName??"",lastName:profile.data?.lastName??""})}
        onGuestSelect={g=>{setBusy(true);setError("");void fundingApi.recipientCandidate(g.id)
          .then(p=>setForm(fields(p))).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}/>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label>Nombre / razón social<Input value={form.firstName} onChange={e=>setForm({...form,firstName:e.target.value})}/></label>
        <label>Apellido<Input value={form.lastName} onChange={e=>setForm({...form,lastName:e.target.value})}/></label>
        <label>Tipo de documento<select aria-label="Tipo de documento" className="block w-full rounded border bg-background p-2" value={form.documentType} onChange={e=>setForm({...form,documentType:e.target.value as Fields["documentType"]})}><option>DNI</option><option>CUIT</option></select></label>
        <label>Número de documento<Input inputMode="numeric" value={form.documentNumber} onChange={e=>setForm({...form,documentNumber:e.target.value.replace(/\D/g,"")})}/></label>
        <label>Condición IVA<select aria-label="Condición IVA" className="block w-full rounded border bg-background p-2" value={form.vatCondition} onChange={e=>setForm({...form,vatCondition:e.target.value})}>
          <option value="">Seleccionar condición IVA</option><option value="consumidor_final">Consumidor final</option>
          <option value="responsable_inscripto">Responsable inscripto</option><option value="monotributo">Monotributo</option>
          <option value="exento">Exento</option><option value="no_responsable">No responsable</option><option value="no_categorizado">No categorizado</option>
        </select></label>
        <label>CUIT (si corresponde)<Input inputMode="numeric" value={form.cuit} onChange={e=>setForm({...form,cuit:e.target.value.replace(/\D/g,"")})}/></label>
        <label className="sm:col-span-2">Domicilio<Input value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/></label>
      </div>
      <Button disabled={disabled||!form.firstName.trim()||!form.documentNumber||!form.vatCondition} onClick={async()=>{
        setBusy(true);setError("");
        try {
          const saved=await fundingApi.saveRecipient(accountId,form);
          client.setQueryData(["/api/payment-funding/recipient",accountId,userId],saved);
          await Promise.all(["/api/spa/clients","/api/spa/appointments","/api/guests"].map(key=>client.invalidateQueries({queryKey:[key]})));
          onSaved();
        } catch(e){setError(e instanceof Error?e.message:"No se pudieron guardar los datos fiscales.");}
        finally{setBusy(false);}
      }}>Guardar y vincular cliente</Button>
    </fieldset>
    {!canWrite&&<p>Sólo consulta.</p>}
  </details>;
}

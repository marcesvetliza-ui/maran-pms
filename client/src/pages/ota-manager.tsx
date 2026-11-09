import {ChannexRoomSelection} from '@/components/channex-room-selection';
import {useState} from 'react';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {useChannexAccess} from '@/hooks/use-channex-access';
import {apiRequest,parseApiError} from '@/lib/queryClient';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Card,CardHeader,CardTitle,CardContent} from '@/components/ui/card';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';
import {ChannexAriSettings} from '@/components/channex-ari-settings';
import {ChannexInboundSettings} from '@/components/channex-inbound-settings';
import {ChannexAccessManagement} from '@/components/channex-access-management';
import {ChannexRatePlanMapping} from '@/components/channex-rate-plan-mapping';
import {RateCalendar} from '@/components/rate-calendar';
const PRODUCTION='https://app.channex.io/api/v1';
export default function OtaManager(){
 const {data:access,isLoading,error:accessError}=useChannexAccess();const client=useQueryClient();
 const [feedback,setFeedback]=useState('');
 const [tab,setTab]=useState('');
 const [workspace,setWorkspace]=useState<'calendario'|'mapeos'>('mapeos');
 const [selected,setSelected]=useState(''),[label,setLabel]=useState('Maran'),[property,setProperty]=useState(''),[key,setKey]=useState('');
 const {data:runtime}=useQuery<any>({queryKey:['/api/channex/runtime'],enabled:!!access?.config});
 const {data:connections=[],error:connectionsError}=useQuery<any[]>({queryKey:['/api/channex/connections'],enabled:!!access?.entry});
 const id=selected||connections[0]?.id||'',connection=connections.find(row=>row.id===id);
 const {data:rooms=[]}=useQuery<any[]>({queryKey:['/api/room-types'],enabled:!!access?.config});
 const {data:plans=[]}=useQuery<any[]>({queryKey:['/api/rate-plans'],enabled:!!access?.config});
 const {data:roomOptions=[]}=useQuery<any[]>({queryKey:[`/api/channex/connections/${id}/room-options`],enabled:!!id&&!!access?.config});
 const {data:roomMaps=[]}=useQuery<any[]>({queryKey:[`/api/channex/connections/${id}/room-type-mappings`],enabled:!!id&&!!access?.config});
 const {data:planMaps=[]}=useQuery<any[]>({queryKey:[`/api/channex/connections/${id}/rate-plan-mappings`],enabled:!!id&&!!access?.config});
 const action=useMutation({mutationFn:async({method,path,body}:{method:string;path:string;body?:unknown})=>(await apiRequest(method,path,body)).json(),onMutate:()=>setFeedback(''),onSuccess:async(result,request)=>{setKey('');if(request.path.endsWith('/sync-catalog'))setFeedback(`Catálogo obtenido: ${result.roomTypes} categorías y ${result.ratePlans} planes tarifarios.`);else if(request.path.includes('/rate-plan-mappings/'))setFeedback('Tarifa vinculada guardada.');else if(request.path.includes('/room-type-mappings/'))setFeedback('Mapeo de habitaciones guardado.');else if(request.path==='/api/channex/connections'&&request.method==='POST'){setSelected(result.id);setFeedback('Conexión guardada desactivada.');}await client.invalidateQueries({predicate:query=>String(query.queryKey[0]).startsWith('/api/channex')});}});
 const run=(method:string,path:string,body?:unknown)=>action.mutate({method,path,body});
 if(isLoading)return <p className="p-6">Verificando permisos de Canales OTAs…</p>;
 if(accessError)return <p role="alert" className="p-6">No se pudieron verificar tus permisos. Volvé a cargar la página.</p>;
 if(!access?.entry)return <p className="p-6">No tenés acceso a Canales OTAs. Admin puede habilitarlo en Permisos.</p>;
 return <div className="p-6 space-y-5"><h1 className="text-2xl font-bold">Canales OTAs</h1><p>Conexión del hotel con los canales mediante Channex.</p>
 {access.config&&!connections.length&&<p className="rounded border p-3 text-sm">La cuenta y las credenciales de producción son independientes de Xenia. La conexión se crea desactivada; no habilites la venta hasta revisar habitaciones, tarifas, inventario y recepción de reservas.</p>}
 {connectionsError?<p role="alert">No se pudieron consultar las conexiones. Volvé a cargar la página antes de continuar.</p>:connections.length>0?<label className="block">Propiedad <select aria-label="Propiedad de Channex" className="mt-2 block w-full max-w-full rounded border bg-background p-2 sm:ml-2 sm:mt-0 sm:inline-block sm:w-auto" value={id} onChange={event=>setSelected(event.target.value)}>{connections.map(row=><option key={row.id} value={row.id}>{row.label} · {row.environment==='real'?'Producción':'Pruebas'} · {row.isActive?'Activa':'Desactivada'}</option>)}</select></label>:<p>Todavía no hay una conexión configurada. La cuenta se prepara cuando Channex entregue el Property ID y la clave API.</p>}
 {feedback&&<p role="status">{feedback}</p>}
 {action.error&&<p role="alert" className="text-destructive">{parseApiError(action.error)}</p>}
 <Tabs value={((tab==='configuracion'&&access.config)||(tab==='estado'&&access.status)||(tab==='reservas'&&access.read)||(tab==='permisos'&&access.owner))?tab:access.config?'configuracion':access.status?'estado':'reservas'} onValueChange={setTab}><TabsList className="h-auto flex-wrap justify-start">{access.status&&<TabsTrigger value="estado">Estado y sincronizaciones</TabsTrigger>}{access.read&&<TabsTrigger value="reservas">Reservas recibidas</TabsTrigger>}{access.config&&<TabsTrigger value="configuracion">Configuración y mapeos</TabsTrigger>}{access.owner&&<TabsTrigger value="permisos">Permisos</TabsTrigger>}</TabsList>
 {access.status&&<TabsContent value="estado">{id&&<ChannexAriSettings connectionId={id} canConfigure={access.config} canSync={access.sync}/>}</TabsContent>}
 {access.read&&<TabsContent value="reservas">{id&&<ChannexInboundSettings connectionId={id}/>}</TabsContent>}
 {access.config&&<TabsContent value="configuracion" className="space-y-4"><details hidden={workspace!=='mapeos'} className="rounded-lg border bg-card"><summary className="cursor-pointer p-4 font-medium">Cuenta y credenciales de Channex</summary><Card className="border-0 shadow-none"><CardHeader><CardTitle>Cuenta de producción</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm">{runtime?.productionAriEnabled&&runtime?.productionInboundEnabled?'Producción habilitada en el servidor.':'Producción desactivada: pendiente de la puesta en marcha del hotel.'}</p>{runtime&& !runtime.credentialsStorageReady&&<p role="alert">Falta preparar el almacenamiento seguro de credenciales en el servidor antes de guardar una clave.</p>}<div><Label htmlFor="ota-label">Nombre de la conexión</Label><Input id="ota-label" value={label} onChange={event=>setLabel(event.target.value)}/></div><div><Label htmlFor="ota-property">Property ID de producción</Label><Input id="ota-property" value={property} onChange={event=>setProperty(event.target.value)}/></div><div><Label htmlFor="ota-key">Clave API de producción</Label><Input id="ota-key" type="password" autoComplete="new-password" value={key} onChange={event=>setKey(event.target.value)}/></div><Button disabled={action.isPending||!runtime?.credentialsStorageReady||!label.trim()||!property.trim()||!key.trim()} onClick={()=>run('POST','/api/channex/connections',{label,environment:'real',baseUrl:PRODUCTION,channexPropertyId:property,apiKey:key,isActive:false})}>Guardar conexión desactivada</Button><p className="text-sm text-muted-foreground">La clave se guarda cifrada y no se vuelve a mostrar. La habilitación de producción en el servidor queda pendiente de la puesta en marcha.</p></CardContent></Card></details>
 <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4"><div><p className="text-xs text-muted-foreground">Canales OTAs › {workspace==='calendario'?'Calendario de tarifas':'Vincular habitaciones'}</p><h2 className="mt-1 text-xl font-semibold">{workspace==='calendario'?'Calendario de tarifas':'Habitaciones y tarifas vinculadas'}</h2></div><div className="flex gap-2"><Button variant={workspace==='calendario'?'default':'outline'} onClick={()=>setWorkspace('calendario')}>Calendario</Button><Button variant={workspace==='mapeos'?'default':'outline'} onClick={()=>setWorkspace('mapeos')}>Vincular habitaciones</Button></div></div>
 {connection&&<div hidden={workspace!=='mapeos'} className="space-y-4"><Button variant="outline" disabled={action.isPending} onClick={()=>run('POST',`/api/channex/connections/${id}/sync-catalog`)}>Obtener catálogo de Channex</Button><Button variant="outline" disabled={action.isPending||(!connection.isActive&&(!runtime?.productionAriEnabled||!runtime?.productionInboundEnabled))} onClick={()=>run('PATCH',`/api/channex/connections/${id}`,{isActive:!connection.isActive})}>{connection.isActive?'Desactivar conexión':'Activar conexión revisada'}</Button>
 <section className="space-y-4" aria-label="Mapeos de habitaciones y tarifas">
 <div><p className="text-sm text-muted-foreground">Cada bloque relaciona una categoría de Channex con las habitaciones del PMS y sus planes de venta.</p></div>
 <div className="grid gap-3 sm:grid-cols-3">{[
 ['Categorías de Channex',roomMaps.length],
 ['Categorías vinculadas',roomMaps.filter(map=>map.roomTypeId).length],
 ['Tarifas vinculadas',`${planMaps.filter(map=>map.ratePlanId).length} de ${planMaps.length}`]
 ].map(([title,count])=><div key={title} className="rounded-lg border bg-card p-4"><p className="text-sm text-muted-foreground">{title}</p><p className="text-2xl font-semibold">{count}</p></div>)}</div>
 {roomMaps.map(map=><Card key={map.id}>
 <CardHeader className="border-b bg-muted/20"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Categoría en Channex</p><CardTitle className="mt-1 text-lg">{map.channexRoomTypeTitle}</CardTitle></div><span className={`rounded-full px-3 py-1 text-xs font-medium ${map.roomTypeId?'bg-primary/10 text-primary':'bg-amber-100 text-amber-900'}`}>{map.roomTypeId?'Categoría vinculada':'Pendiente de vincular'}</span></div></CardHeader>
 <CardContent className="space-y-6 pt-5"><ChannexRoomSelection key={`${id}:${map.id}:${map.roomTypeId}:${JSON.stringify(map.roomIds)}`} mapping={map} types={rooms} rooms={roomOptions} disabled={action.isPending} onSave={body=>run('PATCH',`/api/channex/room-type-mappings/${map.id}`,body)}/>
 <div className="space-y-3 border-t pt-4"><h3 className="font-semibold">Tarifas de esta categoría</h3><p className="text-sm text-muted-foreground">Elegí qué plan del PMS alimenta cada tarifa de Channex. Revisá categoría, moneda y vigencia.</p>
 {planMaps.filter(plan=>plan.channexRoomTypeId===map.channexRoomTypeId).map(plan=><ChannexRatePlanMapping key={`${plan.id}:${plan.ratePlanId}`} pending={action.isPending} id={plan.id} title={plan.channexRatePlanTitle} roomTitle={map.channexRoomTypeTitle} selected={plan.ratePlanId} plans={plans} roomTypes={rooms} onChange={ratePlanId=>run('PATCH',`/api/channex/rate-plan-mappings/${plan.id}`,{ratePlanId})}/>)}
 {!planMaps.some(plan=>plan.channexRoomTypeId===map.channexRoomTypeId)&&<p className="text-sm text-muted-foreground">No hay tarifas en el catálogo para esta categoría.</p>}</div></CardContent></Card>)}
 {!roomMaps.length&&<Card><CardContent className="py-8 text-center text-muted-foreground">Obtené el catálogo de Channex para comenzar a vincular categorías y tarifas.</CardContent></Card>}
 </section></div>}

 {planMaps.some(map=>map.sellMode==='per_person')&&<p>Los planes por ocupación usan los importes por cantidad de personas del plan de Maran y del calendario. Actualizá el catálogo y revisá los precios y la vigencia antes de activar.</p>}
 {plans.length>0&&<div hidden={workspace!=='calendario'}><RateCalendar plans={plans.map(plan=>({...plan,sellMode:planMaps.some(map=>map.ratePlanId===plan.id&&map.sellMode==='per_person')?'per_person':planMaps.find(map=>map.ratePlanId===plan.id)?.sellMode||plan.sellMode}))} canEdit={access.config}/></div>}</TabsContent>}
 {access.owner&&<TabsContent value="permisos"><ChannexAccessManagement/></TabsContent>}</Tabs></div>;
}

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
 const [selected,setSelected]=useState(''),[label,setLabel]=useState('Maran'),[property,setProperty]=useState(''),[key,setKey]=useState('');
 const {data:runtime}=useQuery<any>({queryKey:['/api/channex/runtime'],enabled:!!access?.config});
 const {data:connections=[],error:connectionsError}=useQuery<any[]>({queryKey:['/api/channex/connections'],enabled:!!access?.read});
 const id=selected||connections[0]?.id||'',connection=connections.find(row=>row.id===id);
 const {data:rooms=[]}=useQuery<any[]>({queryKey:['/api/room-types'],enabled:!!access?.config});
 const {data:plans=[]}=useQuery<any[]>({queryKey:['/api/rate-plans'],enabled:!!access?.config});
 const {data:roomMaps=[]}=useQuery<any[]>({queryKey:[`/api/channex/connections/${id}/room-type-mappings`],enabled:!!id&&!!access?.config});
 const {data:planMaps=[]}=useQuery<any[]>({queryKey:[`/api/channex/connections/${id}/rate-plan-mappings`],enabled:!!id&&!!access?.config});
 const action=useMutation({mutationFn:async({method,path,body}:{method:string;path:string;body?:unknown})=>(await apiRequest(method,path,body)).json(),onSuccess:async()=>{setKey('');await client.invalidateQueries({predicate:query=>String(query.queryKey[0]).startsWith('/api/channex')});}});
 const run=(method:string,path:string,body?:unknown)=>action.mutate({method,path,body});
 if(isLoading)return <p className="p-6">Verificando permisos de Canales OTAs…</p>;
 if(accessError)return <p role="alert" className="p-6">No se pudieron verificar tus permisos. Volvé a cargar la página.</p>;
 if(!access?.read)return <p className="p-6">No tenés acceso a Canales OTAs. Admin puede habilitarlo en Permisos.</p>;
 return <div className="p-6 space-y-5"><h1 className="text-2xl font-bold">Canales OTAs</h1><p>Conexión del hotel con los canales mediante Channex.</p>
 <p className="rounded border p-3 text-sm">La cuenta y las credenciales de producción son independientes de Xenia. La conexión se crea desactivada; no habilites la venta hasta revisar habitaciones, tarifas, inventario y recepción de reservas.</p>
 {connectionsError?<p role="alert">No se pudieron consultar las conexiones. Volvé a cargar la página antes de continuar.</p>:connections.length>0?<label className="block">Propiedad <select aria-label="Propiedad de Channex" className="border rounded p-2 ml-2" value={id} onChange={event=>setSelected(event.target.value)}>{connections.map(row=><option key={row.id} value={row.id}>{row.label} · {row.environment==='real'?'Producción':'Pruebas'} · {row.isActive?'Activa':'Desactivada'}</option>)}</select></label>:<p>Todavía no hay una conexión configurada. La cuenta se prepara cuando Channex entregue el Property ID y la clave API.</p>}
 {action.error&&<p role="alert" className="text-destructive">{parseApiError(action.error)}</p>}
 <Tabs defaultValue={access.config?'configuracion':'estado'}><TabsList><TabsTrigger value="estado">Estado y sincronizaciones</TabsTrigger><TabsTrigger value="reservas">Reservas recibidas</TabsTrigger>{access.config&&<TabsTrigger value="configuracion">Configuración y mapeos</TabsTrigger>}{access.owner&&<TabsTrigger value="permisos">Permisos</TabsTrigger>}</TabsList>
 <TabsContent value="estado">{id&&<ChannexAriSettings connectionId={id} canConfigure={access.config} canSync={access.sync}/>}</TabsContent>
 <TabsContent value="reservas">{id&&<ChannexInboundSettings connectionId={id}/>}</TabsContent>
 {access.config&&<TabsContent value="configuracion" className="space-y-4"><Card><CardHeader><CardTitle>Cuenta de producción</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm">{runtime?.productionAriEnabled&&runtime?.productionInboundEnabled?'Producción habilitada en el servidor.':'Producción desactivada: pendiente de la puesta en marcha del hotel.'}</p>{runtime&& !runtime.credentialsStorageReady&&<p role="alert">Falta preparar el almacenamiento seguro de credenciales en el servidor antes de guardar una clave.</p>}<div><Label htmlFor="ota-label">Nombre de la conexión</Label><Input id="ota-label" value={label} onChange={event=>setLabel(event.target.value)}/></div><div><Label htmlFor="ota-property">Property ID de producción</Label><Input id="ota-property" value={property} onChange={event=>setProperty(event.target.value)}/></div><div><Label htmlFor="ota-key">Clave API de producción</Label><Input id="ota-key" type="password" autoComplete="new-password" value={key} onChange={event=>setKey(event.target.value)}/></div><Button disabled={action.isPending||!runtime?.credentialsStorageReady||!label.trim()||!property.trim()||!key.trim()} onClick={()=>run('POST','/api/channex/connections',{label,environment:'real',baseUrl:PRODUCTION,channexPropertyId:property,apiKey:key,isActive:false})}>Guardar conexión desactivada</Button><p className="text-sm text-muted-foreground">La clave se guarda cifrada y no se vuelve a mostrar. La habilitación de producción en el servidor queda pendiente de la puesta en marcha.</p></CardContent></Card>
 {connection&&<><Button variant="outline" disabled={action.isPending} onClick={()=>run('POST',`/api/channex/connections/${id}/sync-catalog`)}>Obtener catálogo de Channex</Button><Button variant="outline" disabled={action.isPending||(!connection.isActive&&(!runtime?.productionAriEnabled||!runtime?.productionInboundEnabled))} onClick={()=>run('PATCH',`/api/channex/connections/${id}`,{isActive:!connection.isActive})}>{connection.isActive?'Desactivar conexión':'Activar conexión revisada'}</Button>
 <Card><CardHeader><CardTitle>Mapeos de habitaciones y tarifas</CardTitle></CardHeader><CardContent className="space-y-4">{roomMaps.map(map=><label key={map.id} className="block">{map.channexRoomTypeTitle}<select className="border rounded p-2 ml-3" value={map.roomTypeId||''} onChange={event=>run('PATCH',`/api/channex/room-type-mappings/${map.id}`,{roomTypeId:event.target.value||null})}><option value="">Sin mapear</option>{rooms.map(room=><option key={room.id} value={room.id}>{room.name}</option>)}</select></label>)}{planMaps.map(map=><ChannexRatePlanMapping key={map.id} id={map.id} title={map.channexRatePlanTitle} roomTitle={roomMaps.find(room=>room.channexRoomTypeId===map.channexRoomTypeId)?.channexRoomTypeTitle||map.channexRoomTypeId} selected={map.ratePlanId} plans={plans} roomTypes={rooms} onChange={ratePlanId=>run('PATCH',`/api/channex/rate-plan-mappings/${map.id}`,{ratePlanId})}/>)}{!roomMaps.length&&<p>Obtené el catálogo para vincular las categorías reales del hotel.</p>}</CardContent></Card><ChannexInboundSettings connectionId={id}/></>}
 {plans.length>0&&<RateCalendar plans={plans} canEdit={access.config}/>}</TabsContent>}
 {access.owner&&<TabsContent value="permisos"><ChannexAccessManagement/></TabsContent>}</Tabs></div>;
}

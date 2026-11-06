import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import {apiRequest,parseApiError} from '@/lib/queryClient';
import {useChannexAccess} from '@/hooks/use-channex-access';
import {CHANNEX_CAPABILITIES,type ChannexCapability} from '@shared/channexAccess';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {Card,CardHeader,CardTitle,CardContent} from '@/components/ui/card';
export function ChannexAccessManagement(){
 const {data:access}=useChannexAccess();
 const {data,refetch}=useQuery<any>({queryKey:['/api/channex/access/users'],enabled:!!access?.owner});
 const [draft,setDraft]=useState<Record<string,string[]>>({});const client=useQueryClient();
 const action=useMutation({mutationFn:async({id,permissions}:{id:string;permissions:string[]})=>(await apiRequest('PUT',`/api/channex/access/users/${id}`,{permissions})).json(),onSuccess:async(_result,variables)=>{await refetch();setDraft(previous=>{const next={...previous};delete next[variables.id];return next;});await client.invalidateQueries({queryKey:['/api/channex/access']});}});
 if(!access?.owner)return null;
 return <Card><CardHeader><CardTitle>Canales OTAs — permisos por usuario</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm">Admin tiene acceso completo. Los demás usuarios necesitan autorización expresa para cada función. Los permisos de otros módulos se mantienen.</p>
 {data?.users.map((user:any)=>{const grants=draft[user.id]??data.grants.filter((row:any)=>row.userId===user.id&&row.allowed).map((row:any)=>row.resourceKey.replace('api:ota:',''));return <div key={user.id} className="rounded border p-3 space-y-2"><p className="font-medium">{user.fullName} · {user.username}{user.isActive!=='true'?' · Inactivo':''}</p><div className="flex flex-wrap gap-4">{Object.entries(CHANNEX_CAPABILITIES).map(([key,label])=><label key={key} className="flex gap-2 items-center text-sm"><Checkbox aria-label={`${user.username}: ${label}`} checked={user.role==='admin'||grants.includes(key)} disabled={user.role==='admin'||user.isActive!=='true'||action.isPending} onCheckedChange={value=>setDraft(previous=>({...previous,[user.id]:value?[...new Set([...grants,key,'read'])]:key==='read'?[]:grants.filter((item:string)=>item!==key)}))}/>{label}</label>)}</div>{user.role!=='admin'&&draft[user.id]&&<Button disabled={action.isPending} onClick={()=>action.mutate({id:user.id,permissions:grants})}>Guardar permisos de {user.username}</Button>}</div>;})}
 {action.error&&<p role="alert" className="text-destructive">{parseApiError(action.error)}</p>}{!data&&<p>Cargando usuarios…</p>}</CardContent></Card>;
}

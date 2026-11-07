import {render,screen,waitFor,cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {QueryClientProvider} from '@tanstack/react-query';
import {afterEach,it,expect,vi} from 'vitest';
import {queryClient} from '@/lib/queryClient';
import {ChannexAccessManagement} from './channex-access-management';
vi.mock('@/hooks/use-channex-access',()=>({useChannexAccess:()=>({data:{owner:true,read:true,config:true,bookings:true,sync:true}})}));
afterEach(()=>{cleanup();queryClient.clear();vi.unstubAllGlobals();});
it('keeps admin fully enabled and saves only the chosen user permissions, including consultation',async()=>{
 queryClient.clear();let saved:any;let grants:any[]=[];
 vi.stubGlobal('fetch',vi.fn(async(_url:any,init?:RequestInit)=>{
  if(init?.method==='PUT'){saved=JSON.parse(String(init.body));grants=saved.permissions.map((key:string)=>({userId:'reception',resourceKey:`api:ota:${key}`,allowed:true}));return new Response(JSON.stringify({saved:true}),{status:200});}
  return new Response(JSON.stringify({users:[{id:'admin',username:'admin',fullName:'Admin',role:'admin',isActive:'true'},{id:'reception',username:'recepcion',fullName:'Recepción',role:'reception',isActive:'true'}],grants}),{status:200});
 }));
 render(<QueryClientProvider client={queryClient}><ChannexAccessManagement/></QueryClientProvider>);const user=userEvent.setup();
 const fixed=await screen.findByLabelText('admin: Configurar conexiones, credenciales y mapeos');expect(fixed).toBeChecked();expect(fixed).toBeDisabled();
 const settings=screen.getByLabelText('recepcion: Configurar conexiones, credenciales y mapeos');expect(settings).not.toBeChecked();
 await user.click(screen.getByLabelText('recepcion: Gestionar y reintentar reservas recibidas'));expect(settings).not.toBeChecked();
 await user.click(screen.getByRole('button',{name:'Guardar permisos de recepcion'}));await waitFor(()=>expect(saved.permissions.sort()).toEqual(['bookings','read']));
 await waitFor(()=>expect(screen.queryByRole('button',{name:'Guardar permisos de recepcion'})).not.toBeInTheDocument());expect(fixed).toBeDisabled();
});

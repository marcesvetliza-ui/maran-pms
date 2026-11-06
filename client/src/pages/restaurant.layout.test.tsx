import { QueryClientProvider } from '@tanstack/react-query';
import { render,screen,waitFor,cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach,afterEach,it,expect,vi } from 'vitest';
import { queryClient } from '@/lib/queryClient';
vi.mock('@/App',()=>({useAuth:()=>({user:{role:'manager'},hasPermission:()=>true,selectedPosNumero:1,selectedPosNombre:'Restaurant'})}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:vi.fn()})}));
import RestaurantPage from './restaurant';
let tables:any[],requests:any[];
beforeEach(()=>{
 queryClient.clear();requests=[];tables=[{id:'one',tableNumber:'101',areaId:'a',positionX:0,positionY:0,status:'available',capacity:4,shape:'square',isActive:'true'}];
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,options?:RequestInit)=>{
  const path=String(input);const json=(body:any)=>new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
  if(path==='/api/restaurant/layout'){const payload=JSON.parse(String(options?.body));requests.push(payload);tables=tables.map(t=>({...t,...payload.tables.find((p:any)=>p.id===t.id)}));return json({saved:true});}
  if(path==='/api/restaurant/tables')return json(tables);
  if(path==='/api/restaurant/areas')return json([{id:'a',name:'Sector Prueba',areaType:'indoor',capacity:20,hasTables:'true',isActive:'true'}]);
  return json([]);
 }));
});
afterEach(()=>{cleanup();queryClient.clear();vi.unstubAllGlobals();});
it('moves a table, explicitly saves it and reloads the persisted layout when entering again',async()=>{
 const user=userEvent.setup();const view=render(<QueryClientProvider client={queryClient}><RestaurantPage/></QueryClientProvider>);
 await user.click(await screen.findByTestId('button-edit-layout'));
 await user.click(await screen.findByTestId('table-101'));await user.click(screen.getByTestId('layout-cell-a-3-2'));
 expect(screen.getByTestId('table-101')).toHaveStyle({gridColumn:'4',gridRow:'3'});expect(requests).toHaveLength(0);
 await user.click(screen.getByRole('button',{name:'Guardar Layout'}));await waitFor(()=>expect(requests).toHaveLength(1));
 await screen.findByRole('button',{name:'Editar Layout'});expect(tables[0]).toMatchObject({positionX:3,positionY:2,status:'available'});
 view.unmount();queryClient.clear();render(<QueryClientProvider client={queryClient}><RestaurantPage/></QueryClientProvider>);
 expect(await screen.findByTestId('table-101')).toHaveStyle({gridColumn:'4',gridRow:'3'});
});

import {QueryClientProvider} from '@tanstack/react-query';
import {render,screen,cleanup,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,it,expect,vi} from 'vitest';
const {toast}=vi.hoisted(()=>({toast:vi.fn()}));
vi.mock('@/App',()=>({useAuth:()=>({hasPermission:()=>true,permissionsReady:true,user:{role:'resp_deposito'}})}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast})}));
import {queryClient} from '@/lib/queryClient';
import InventoryPage from './inventory';
afterEach(()=>{cleanup();queryClient.clear();vi.unstubAllGlobals();});
it('allows archival with a reason, explains preserved balances and removes the item from the active list',async()=>{
 queryClient.clear();let active=true;
 const duplicate={id:'duplicate',name:'Duplicado con receta',unit:'kg',currentStock:'10.000',minStock:'0',costPrice:'100',itemKind:'materia_prima',isActive:'true'};
 const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const path=String(input);
  if(init?.method==='POST'&&path.endsWith('/deactivate')){active=false;return new Response(JSON.stringify({...duplicate,isActive:'false'}),{status:200});}
  return new Response(JSON.stringify(path==='/api/inventory/items'?[{...duplicate,isActive:active?'true':'false'}]:[]),{status:200,headers:{'content-type':'application/json'}});
 });vi.stubGlobal('fetch',fetcher);
 render(<QueryClientProvider client={queryClient}><InventoryPage/></QueryClientProvider>);
 const user=userEvent.setup();await user.click(await screen.findByRole('button',{name:'Dar de baja Duplicado con receta'}));
 expect(screen.getByText(/Se dará de baja aunque tenga saldo/)).toBeInTheDocument();expect(screen.getByRole('button',{name:'Confirmar operación'})).toBeDisabled();
 await user.type(screen.getByLabelText('Motivo obligatorio'),'Repetido');await user.click(screen.getByRole('button',{name:'Confirmar operación'}));
 await waitFor(()=>expect(fetcher.mock.calls.some(([,init])=>init?.method==='POST')).toBe(true));
 const call=fetcher.mock.calls.find(([,init])=>init?.method==='POST')!;expect(String(call[0])).toBe('/api/inventory/items/duplicate/deactivate');expect(JSON.parse(String(call[1]?.body)).reason).toBe('Repetido');
 await waitFor(()=>expect(screen.queryByRole('button',{name:'Dar de baja Duplicado con receta'})).not.toBeInTheDocument());
 expect(toast).toHaveBeenCalledWith(expect.objectContaining({title:'Artículo dado de baja'}));
});

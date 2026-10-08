vi.mock('@/App',()=>({useAuth:()=>({hasPermission:()=>true,permissionsReady:true})}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:vi.fn()})}));
import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {it,expect,vi,afterEach} from 'vitest';
import InventoryPage from './inventory';
afterEach(()=>vi.unstubAllGlobals());
function mount(legacy=false){
 const count={id:'count',date:'2026-10-08',status:'borrador',warehouse_id:legacy?null:'kitchen',warehouse_name:legacy?null:'Cocina',items:[{item_id:'item',item_name:'Harina',unit:'kg',expected_stock:'10',actual_stock:null}]};
 const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity,queryFn:async({queryKey})=>queryKey[0]==='/api/inventory/warehouses'?[{id:'kitchen',name:'Cocina',is_active:'true'}]:queryKey[0]==='/api/inventory/counts'&&legacy?[count]:[]}}});
 vi.stubGlobal('fetch',vi.fn(async(url)=>new Response(JSON.stringify(String(url).includes('/counts')?count:[]),{status:200,headers:{'Content-Type':'application/json'}})));
 render(<QueryClientProvider client={client}><InventoryPage/></QueryClientProvider>);
}
it('exige elegir depósito y lo envía al crear una toma',async()=>{
 const user=userEvent.setup();mount();await user.click(await screen.findByRole('tab',{name:'Toma de Inventario'}));
 await user.click(screen.getByTestId('btn-new-count'));
 expect(screen.getByTestId('btn-confirm-new-count')).toBeDisabled();
 await user.click(screen.getByTestId('select-count-warehouse'));await user.click(screen.getByRole('option',{name:'Cocina'}));
 await user.click(screen.getByTestId('btn-confirm-new-count'));
 await waitFor(()=>expect(vi.mocked(fetch).mock.calls.some(([url,init])=>String(url)==='/api/inventory/counts' && JSON.parse(String(init?.body)).warehouseId==='kitchen')).toBe(true));
});
it('una toma antigua permite consultar sin editar ni aplicar ajustes globales',async()=>{
 const user=userEvent.setup();mount(true);await user.click(await screen.findByRole('tab',{name:'Toma de Inventario'}));
 await user.click(await screen.findByRole('button',{name:'Ver'}));
 await screen.findByText(/Esta toma anterior se conserva para consulta/);
 expect(screen.queryByRole('button',{name:'Cerrar y aplicar ajustes'})).toBeNull();
 expect(screen.queryByRole('spinbutton')).toBeNull();
});

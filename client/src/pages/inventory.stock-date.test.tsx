vi.mock('@/App',()=>({useAuth:()=>({hasPermission:()=>true,permissionsReady:true})}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:vi.fn()})}));
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {it,expect,vi,afterEach} from 'vitest';
import InventoryPage from './inventory';
afterEach(()=>vi.unstubAllGlobals());
function mount(error=false){
 const item=(id:string,name:string)=>({id,name,sku:id,unit:'kg',currentStock:'99',minStock:'0',costPrice:'100',itemKind:'materia_prima',isActive:'true'});
 const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity,queryFn:async({queryKey})=>queryKey[0]==='/api/inventory/items'?[item('a','Carne'),item('b','Queso')]:[]}}});
 for(const key of [['/api/inventory/pending-consumptions','all'],['/api/inventory/locations']])client.setQueryData(key,[]);
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify(error?{error:'Error'}:{items:[{itemId:'a',stock:10},{itemId:'b',stock:null}],locations:[]}),{status:error?500:200})));
 render(<QueryClientProvider client={client}><InventoryPage/></QueryClientProvider>);
}
it('consulta la fecha, conserva desconocidos y la impresión respeta la búsqueda',async()=>{
 mount();await screen.findByText('Carne');fireEvent.change(screen.getByLabelText('Fecha de stock'),{target:{value:'2026-10-05'}});
 expect(await screen.findByText('Sin información histórica')).toBeInTheDocument();expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).includes('date=2026-10-05'))).toBe(true);
 await userEvent.type(screen.getByTestId('input-search'),'Carne');
 const write=vi.fn(),print=vi.fn();vi.stubGlobal('open',vi.fn(()=>({document:{write,close:vi.fn()},focus:vi.fn(),print})));
 await userEvent.click(screen.getByRole('button',{name:'Imprimir stock filtrado'}));expect(write.mock.calls[0][0]).toContain('05/10/2026');expect(write.mock.calls[0][0]).toContain('Carne');expect(write.mock.calls[0][0]).not.toContain('Queso');expect(print).toHaveBeenCalledOnce();
});
it('un fallo histórico no muestra saldos actuales y bloquea imprimir/exportar',async()=>{
 mount(true);await screen.findByText('Carne');fireEvent.change(screen.getByLabelText('Fecha de stock'),{target:{value:'2026-10-05'}});await screen.findByRole('alert');expect(screen.getByRole('button',{name:'Imprimir stock filtrado'})).toBeDisabled();expect(screen.getByRole('button',{name:'Exportar artículos filtrados'})).toBeDisabled();expect(screen.queryByText('Carne')).toBeNull();
});

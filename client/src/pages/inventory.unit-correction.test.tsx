import {vi,it,expect,afterEach} from 'vitest';
vi.mock('@/App',()=>({useAuth:()=>({hasPermission:()=>true,permissionsReady:true})}));
import {render,screen,waitFor,cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {NewItemForm} from './inventory';
afterEach(cleanup);
function mount(enabled:boolean){
 const client=new QueryClient({defaultOptions:{queries:{queryFn:async({queryKey})=>queryKey[0]==='/api/inventory/unit-correction-mode'?{enabled}:[],retry:false}}});client.setQueryData(['/api/inventory/unit-correction-mode'],{enabled});const save=vi.fn();
 render(<QueryClientProvider client={client}><NewItemForm initialItem={{id:'i',name:'Artículo',unit:'unidad',currentStock:'12',costPrice:'100',minStock:'2',criticalStock:'1',isActive:'true'} as any} categories={[]} brands={[]} suppliers={[]} existingItems={[]} onSubmit={save} isPending={false} onCancel={()=>{}}/></QueryClientProvider>);return save;
}
it('keeps saved base units locked when maintenance is closed',()=>{mount(false);expect(screen.getByTestId('select-unit')).toBeDisabled();});
it('enables correction during maintenance and submits new unit without overwriting stock',async()=>{
 const save=mount(true),user=userEvent.setup();await waitFor(()=>expect(screen.getByTestId('select-unit')).toBeEnabled());
 await user.click(screen.getByTestId('select-unit'));await user.click(screen.getByRole('option',{name:'Kilogramos'}));await user.click(screen.getByTestId('button-save-item'));
 expect(save).toHaveBeenCalledWith(expect.objectContaining({unit:'kg',conversions:[]}));expect(save.mock.calls[0][0].currentStock).toBeUndefined();expect(screen.getByText(/equivalencias anteriores no se reutilizan/)).toBeInTheDocument();
});

it('changing a milk item from units to litres uses one draft and never offers saving old-base equivalences',async()=>{
 const save=mount(true),user=userEvent.setup();
 await waitFor(()=>expect(screen.getByTestId('select-unit')).toBeEnabled());
 expect(screen.getAllByText('Equivalencias del artículo')).toHaveLength(1);
 await user.click(screen.getByTestId('select-unit'));await user.click(screen.getByRole('option',{name:'Litros'}));
 expect(screen.getAllByText('Equivalencias del artículo')).toHaveLength(1);
 expect(screen.queryByRole('button',{name:'Guardar equivalencias'})).not.toBeInTheDocument();
 await user.click(screen.getByTestId('button-save-item'));
 expect(save).toHaveBeenCalledWith(expect.objectContaining({unit:'litro',conversions:[]}));
 expect(save.mock.calls[0][0].currentStock).toBeUndefined();
});

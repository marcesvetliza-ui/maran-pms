import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {InventoryUnitConversions} from './inventory-unit-conversions';
import {apiRequest} from '@/lib/queryClient';
vi.mock('@/lib/queryClient',()=>({apiRequest:vi.fn().mockResolvedValue({}),queryClient:{invalidateQueries:vi.fn()}}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:vi.fn()})}));
vi.mock('./inventory-access',()=>({InventoryButton:({permission,...props}:any)=><button {...props}/> }));
afterEach(()=>{cleanup();vi.clearAllMocks();});
function setup(factor:string){
 const client=new QueryClient({defaultOptions:{queries:{retry:false,queryFn:async()=>[{fromUnit:'paquete',factor}]}}});
 render(<QueryClientProvider client={client}><InventoryUnitConversions itemId="test-item" stockUnit="unidad"/></QueryClientProvider>);
}
it('shows whole factors without padding and submits comma decimals in API format',async()=>{
 setup('24.00000000');
 const input=await screen.findByLabelText('Factor de equivalencia 1');
 await waitFor(()=>expect((input as HTMLInputElement).value).toBe('24'));
 expect(screen.getByText('1 paquete equivale a 24 unidades')).toBeTruthy();
 fireEvent.change(input,{target:{value:'0,008'}});
 fireEvent.click(screen.getByRole('button',{name:'Guardar equivalencias'}));
 await waitFor(()=>expect(apiRequest).toHaveBeenCalledWith('PUT','/api/inventory/items/test-item/unit-conversions',{conversions:[{fromUnit:'paquete',factor:'0.008'}]}));
});
it('preserves all nine decimal places when displaying and saving a small factor',async()=>{
 setup('0.000000123');
 const input=await screen.findByLabelText('Factor de equivalencia 1');
 await waitFor(()=>expect((input as HTMLInputElement).value).toBe('0,000000123'));
 fireEvent.click(screen.getByRole('button',{name:'Guardar equivalencias'}));
 await waitFor(()=>expect(apiRequest).toHaveBeenCalledWith('PUT','/api/inventory/items/test-item/unit-conversions',{conversions:[{fromUnit:'paquete',factor:'0.000000123'}]}));
});
it('loads a 3000 g unit container without asking for an inverse factor',async()=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false,queryFn:async()=>[]}}});
 render(<QueryClientProvider client={client}><InventoryUnitConversions itemId="bucket" stockUnit="unidad"/></QueryClientProvider>);
 const content=await screen.findByLabelText('Contenido del envase');
 fireEvent.change(content,{target:{value:'3000'}});
 fireEvent.click(screen.getByRole('button',{name:'Usar este contenido'}));
 expect(screen.getByRole('status').textContent).toContain('Falta guardar');
 fireEvent.click(screen.getByRole('button',{name:'Guardar equivalencias'}));
 await waitFor(()=>expect(apiRequest).toHaveBeenCalledWith('PUT','/api/inventory/items/bucket/unit-conversions',{conversions:[
  {fromUnit:'kg',factor:'0.333333333'}, {fromUnit:'g',factor:'0.000333333'},
 ]}));
});
it('a package content changes equivalences, not the stock unit or the price',async()=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false,queryFn:async()=>[]}}});
 render(<QueryClientProvider client={client}><InventoryUnitConversions itemId="chicken" stockUnit="kg"/></QueryClientProvider>);
 fireEvent.change(await screen.findByLabelText('Contenido del envase'),{target:{value:'3000'}});
 fireEvent.click(screen.getByRole('button',{name:'Usar este contenido'}));
 fireEvent.click(screen.getByRole('button',{name:'Guardar equivalencias'}));
 await waitFor(()=>expect(apiRequest).toHaveBeenCalledWith('PUT','/api/inventory/items/chicken/unit-conversions',{conversions:[{fromUnit:'unidad',factor:'3'}]}));
});

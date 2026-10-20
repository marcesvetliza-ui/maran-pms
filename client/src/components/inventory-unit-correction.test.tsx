import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {InventoryUnitCorrection} from './inventory-unit-correction';
import {apiRequest} from '@/lib/queryClient';
vi.mock('@/lib/queryClient',async original=>({...await original<any>(),apiRequest:vi.fn(),queryClient:{invalidateQueries:vi.fn()}}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:vi.fn()})}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
const preview={token:'preview-token',oldUnit:'unidad',newUnit:'kg',stock:'10.000',costPrice:'6000.00',warehouses:[{warehouseId:'wh',stock:'10.000'}],affected:{recipes:1,productionFormulas:0,treatments:0,openCounts:0,pendingConsumptions:0}};
function setup(){
 const close=vi.fn();
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{mutations:{retry:false}}})}><InventoryUnitCorrection item={{id:'chicken',name:'Pollo',unit:'unidad'}} onClose={close}/></QueryClientProvider>);
 return close;
}
it('requires review, reason and explicit label-only confirmation before applying',async()=>{
 vi.mocked(apiRequest).mockResolvedValue({json:async()=>preview} as Response);
 const close=setup();
 const confirm=screen.getByRole('button',{name:'Confirmar corrección'}) as HTMLButtonElement;
 expect(confirm.disabled).toBe(true);
 fireEvent.change(screen.getByLabelText('Unidad correcta'),{target:{value:'kg'}});
 fireEvent.click(screen.getByRole('button',{name:'Revisar cambio'}));
 await screen.findByText('unidad → kg');
 expect(confirm.disabled).toBe(true);
 fireEvent.change(screen.getByLabelText('Motivo de corrección de unidad'),{target:{value:'La cantidad ya era en kg'}});
 expect(confirm.disabled).toBe(true);
 fireEvent.click(screen.getByRole('checkbox'));
 fireEvent.click(confirm);
 await waitFor(()=>expect(apiRequest).toHaveBeenCalledWith('POST','/api/inventory/items/chicken/unit-correction/apply',{newUnit:'kg',reason:'La cantidad ya era en kg',mode:'label_only',token:'preview-token'}));
 await waitFor(()=>expect(close).toHaveBeenCalled());
});
it('a changed unit invalidates the previous preview and cannot reuse its token',async()=>{
 vi.mocked(apiRequest).mockResolvedValue({json:async()=>preview} as Response);
 setup();fireEvent.change(screen.getByLabelText('Unidad correcta'),{target:{value:'kg'}});
 fireEvent.click(screen.getByRole('button',{name:'Revisar cambio'}));await screen.findByText('unidad → kg');
 fireEvent.change(screen.getByLabelText('Unidad correcta'),{target:{value:'g'}});
 expect(screen.queryByText('unidad → kg')).toBeNull();
 expect((screen.getByRole('button',{name:'Confirmar corrección'}) as HTMLButtonElement).disabled).toBe(true);
 expect(vi.mocked(apiRequest).mock.calls).toHaveLength(1);
});
it('a conflict after review is readable and requires a new preview',async()=>{
 vi.mocked(apiRequest).mockResolvedValueOnce({json:async()=>preview} as Response).mockRejectedValueOnce(new Error('409: {"error":"Revisá una nueva vista previa"}'));
 setup();fireEvent.change(screen.getByLabelText('Unidad correcta'),{target:{value:'kg'}});
 fireEvent.click(screen.getByRole('button',{name:'Revisar cambio'}));await screen.findByText('unidad → kg');
 fireEvent.change(screen.getByLabelText('Motivo de corrección de unidad'),{target:{value:'Fix'}});fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Confirmar corrección'}));
 await waitFor(()=>expect(screen.getByRole('alert').textContent).toBe('Revisá una nueva vista previa'));
 expect((screen.getByRole('button',{name:'Confirmar corrección'}) as HTMLButtonElement).disabled).toBe(true);
});

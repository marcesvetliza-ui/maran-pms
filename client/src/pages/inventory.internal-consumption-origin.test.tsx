import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {QueryClientProvider} from '@tanstack/react-query';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {InternalMovementForm} from './inventory';
import {queryClient} from '@/lib/queryClient';
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:vi.fn()})}));
let transferred=true;
beforeEach(()=>{queryClient.clear();transferred=true;vi.stubGlobal('fetch',vi.fn(async(url:any)=>{
 const path=String(url);let data:any=[];
 if(path.endsWith('/items'))data=[{id:'coffee',name:'Café',unit:'kg',isActive:'true'}];
 if(path.endsWith('/warehouses'))data=[{id:'general',name:'General',isActive:'true'},{id:'restaurant',name:'Restaurant',isActive:'true'}];
 if(path.endsWith('/internal-consumption-origins'))data=[{itemId:'coffee',warehouseId:transferred?'restaurant':null,warehouseName:transferred?'Restaurant':null,active:transferred?'true':null,stock:'4.000'}];
 return new Response(JSON.stringify(data),{status:200});
}));});
afterEach(()=>vi.unstubAllGlobals());
async function chooseItem(){render(<QueryClientProvider client={queryClient}><InternalMovementForm embedded open onClose={vi.fn()}/></QueryClientProvider>);const user=userEvent.setup();await user.click(screen.getByTestId('select-im-item-0'));await user.click(await screen.findByText('Café'));return user;}
it('muestra el último destino y permite cambiarlo explícitamente',async()=>{const user=await chooseItem();await waitFor(()=>expect(screen.getByTestId('select-im-warehouse-0')).toHaveTextContent('Restaurant'));expect(screen.getByText(/Última transferencia/)).toHaveTextContent('4.000');expect(screen.getByTestId('btn-confirm-internal-mov')).toBeEnabled();await user.click(screen.getByTestId('select-im-warehouse-0'));await user.click(screen.getByRole('option',{name:'General'}));expect(screen.getByTestId('select-im-warehouse-0')).toHaveTextContent('General');expect(screen.getByText('Depósito elegido manualmente')).toBeInTheDocument();});
it('sin transferencia no confirma hasta elegir un depósito',async()=>{transferred=false;const user=await chooseItem();await waitFor(()=>expect(screen.getByText('Elegí un depósito activo')).toBeInTheDocument());expect(screen.getByTestId('btn-confirm-internal-mov')).toBeDisabled();await user.click(screen.getByTestId('select-im-warehouse-0'));await user.click(screen.getByRole('option',{name:'General'}));expect(screen.getByTestId('btn-confirm-internal-mov')).toBeEnabled();});

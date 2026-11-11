import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {render,screen,cleanup,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,it,expect,vi} from 'vitest';
vi.mock('@/App',()=>({useAuth:()=>({user:{username:'technician',role:'maintenance'}})}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:vi.fn()})}));
import MaintenancePage from './maintenance';
let client:QueryClient;
afterEach(()=>{cleanup();client?.clear();});
it('shows who loaded each task in the list and detail, keeps unknown historical authors explicit and supports author search',async()=>{
 const order={id:'new',orderCode:'OT-1',title:'Piso del balcón',category:'general',priority:'medium',status:'pending',reportedAt:'2026-11-11T12:00:00Z',reportedBy:'Luciana Lisman',assignedToId:null,location:'Balcón'};
 client=new QueryClient({defaultOptions:{queries:{retry:false,queryFn:async({queryKey})=>queryKey[0]==='/api/maintenance/work-orders'?[order,{...order,id:'old',orderCode:'OT-2',title:'Tarea histórica',reportedBy:null}]:[]}}});
 render(<QueryClientProvider client={client}><MaintenancePage/></QueryClientProvider>);
 expect(await screen.findByText('Cargada por: Luciana Lisman')).toBeInTheDocument();expect(screen.getByText('Cargada por: No registrado')).toBeInTheDocument();
 const user=userEvent.setup();await user.click(screen.getByTestId('button-view-order-new'));
 const dialog=await screen.findByRole('dialog',{name:'Orden OT-1'});expect(within(dialog).getByText('Cargada por')).toBeInTheDocument();expect(within(dialog).getByText('Luciana Lisman')).toBeInTheDocument();
 await user.keyboard('{Escape}');await user.type(screen.getByTestId('input-search-orders'),'Luciana');expect(screen.getByText('Piso del balcón')).toBeInTheDocument();expect(screen.queryByText('Tarea histórica')).not.toBeInTheDocument();
});

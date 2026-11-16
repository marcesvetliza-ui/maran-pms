import {cleanup,render,screen,waitFor,fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,expect,it,vi} from 'vitest';
import {apiRequest,apiRequestWithGroupInventoryWarning} from '@/lib/queryClient';
import {ChannexManualAssignment} from './channex-manual-assignment';
vi.mock('@/lib/queryClient',()=>({apiRequest:vi.fn(),apiRequestWithGroupInventoryWarning:vi.fn()}));
const options={revisionId:'r',payloadHash:'a'.repeat(64),configurationHash:'b'.repeat(64),reviewCode:'NO_PILOT_ROOM_AVAILABLE',arrival:'2026-11-28',departure:'2026-11-29',currency:'USD',amount:'142.04',exchangeRate:'1500.000000',settlementTotal:'213060.00',canOverrideScope:true,rooms:[{key:'remote',category:'Premium del canal',mappedCategory:'Premium',occupancy:2,sourceTotal:'142.04',choices:[{id:'307',number:'307',categoryId:'premium',category:'Premium',capacity:2,floor:3,categoryChanged:false,scopeOverride:false},{id:'501',number:'501',categoryId:'suite',category:'Suite Panorámica',capacity:3,floor:5,categoryChanged:true,scopeOverride:true}]}]};
function mount(){const onAssigned=vi.fn();const client=new QueryClient({defaultOptions:{queries:{retry:false}}});render(<QueryClientProvider client={client}><ChannexManualAssignment connectionId="c" revisionId="r" onAssigned={onAssigned}/></QueryClientProvider>);vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify(options)));return onAssigned;}
afterEach(()=>{cleanup();vi.resetAllMocks();});
it('shows the source and target categories and requires reason and explicit warnings before sending',async()=>{
 vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify(options)));const done=mount();const user=userEvent.setup();await screen.findByText('Premium del canal');
 expect(apiRequestWithGroupInventoryWarning).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'Confirmar asignación al PMS'})).toBeDisabled();
 await user.selectOptions(screen.getByLabelText('Categoría en PMS 1'),'suite');await user.selectOptions(screen.getByLabelText('Habitación disponible 1'),'501');
 expect(screen.getByText('Cambio de categoría: Premium → Suite Panorámica.')).toBeInTheDocument();expect(screen.getByText(/Total en PMS: ARS 213.060,00/)).toBeInTheDocument();
 await user.type(screen.getByLabelText('Motivo de la asignación'),'Mejora de categoría solicitada');fireEvent.click(screen.getByRole('checkbox',{name:/Confirmo que asigno una categoría diferente/}));
 expect(screen.getByRole('button',{name:'Confirmar asignación al PMS'})).toBeDisabled();fireEvent.click(screen.getByRole('checkbox',{name:/Confirmo esta asignación excepcional/}));
 expect(screen.getByRole('checkbox',{name:/Confirmo que asigno/})).toBeChecked();expect(screen.getByRole('checkbox',{name:/Confirmo esta/})).toBeChecked();expect(screen.getByRole('button',{name:'Confirmar asignación al PMS'})).toBeEnabled();
 vi.mocked(apiRequestWithGroupInventoryWarning).mockResolvedValue(new Response(JSON.stringify({applied:true,reservationIds:['pms']})));await user.click(screen.getByRole('button',{name:'Confirmar asignación al PMS'}));
 await waitFor(()=>expect(done).toHaveBeenCalledOnce());expect(apiRequestWithGroupInventoryWarning).toHaveBeenCalledWith('POST','/api/channex/connections/c/inbound/assign/r',expect.objectContaining({assignments:{remote:'501'},confirmCategoryChange:true,confirmScopeChange:true,reason:'Mejora de categoría solicitada'}));
 expect(screen.getByRole('link',{name:'Abrir reserva asignada'})).toHaveAttribute('href','/reservations?view=pms&returnTo=%2Fota-channels');
});
it('clears confirmations when changing the selection and retains the form after a server conflict',async()=>{
 vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify(options)));mount();const user=userEvent.setup();await screen.findByText('Premium del canal');
 await user.selectOptions(screen.getByLabelText('Categoría en PMS 1'),'suite');await user.selectOptions(screen.getByLabelText('Habitación disponible 1'),'501');await user.type(screen.getByLabelText('Motivo de la asignación'),'Solicitud');
 for(const checkbox of screen.getAllByRole('checkbox'))fireEvent.click(checkbox);
 await user.selectOptions(screen.getByLabelText('Habitación disponible 1'),'');await user.selectOptions(screen.getByLabelText('Habitación disponible 1'),'501');expect(screen.getAllByRole('checkbox').every(c=>!(c as HTMLInputElement).checked)).toBe(true);
 for(const checkbox of screen.getAllByRole('checkbox'))fireEvent.click(checkbox);
 vi.mocked(apiRequestWithGroupInventoryWarning).mockRejectedValue(new Error('409: {"error":"La habitación ya no está disponible"}'));await user.click(screen.getByRole('button',{name:'Confirmar asignación al PMS'}));expect(await screen.findByRole('alert')).toHaveTextContent('La habitación ya no está disponible');expect(screen.getByRole('button',{name:'Confirmar asignación al PMS'})).toBeDisabled();
});
it('does not require a category exception for a room in the original mapped category and scope',async()=>{
 vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify(options)));mount();const user=userEvent.setup();await screen.findByText('Premium del canal');await user.selectOptions(screen.getByLabelText('Categoría en PMS 1'),'premium');await user.selectOptions(screen.getByLabelText('Habitación disponible 1'),'307');await user.type(screen.getByLabelText('Motivo de la asignación'),'Asignación recepción');expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'Confirmar asignación al PMS'})).toBeEnabled();expect(apiRequestWithGroupInventoryWarning).not.toHaveBeenCalled();
});

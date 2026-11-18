import {cleanup,render,screen,waitFor,fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,expect,it,vi} from 'vitest';
import {apiRequest,apiRequestWithGroupInventoryWarning} from '@/lib/queryClient';
import {ChannexManualAssignment} from './channex-manual-assignment';
vi.mock('@/lib/queryClient',()=>({apiRequest:vi.fn(),apiRequestWithGroupInventoryWarning:vi.fn()}));
const options={revisionId:'r',payloadHash:'a'.repeat(64),configurationHash:'b'.repeat(64),reviewCode:'NO_PILOT_ROOM_AVAILABLE',arrival:'2026-11-28',departure:'2026-11-29',currency:'USD',amount:'142.04',exchangeRate:'1500.000000',settlementTotal:'213060.00',canOverrideScope:true,rooms:[{key:'remote',category:'Premium del canal',mappedCategory:'Premium',occupancy:2,sourceTotal:'142.04',choices:[{id:'307',number:'307',categoryId:'premium',category:'Premium',capacity:2,floor:3,categoryChanged:false,scopeOverride:false},{id:'501',number:'501',categoryId:'suite',category:'Suite Panorámica',capacity:3,floor:5,categoryChanged:true,scopeOverride:true}]}]};
function mount(){const onAssigned=vi.fn();const client=new QueryClient({defaultOptions:{queries:{retry:false}}});render(<QueryClientProvider client={client}><ChannexManualAssignment connectionId="c" revisionId="r" onAssigned={onAssigned}/></QueryClientProvider>);return onAssigned;}
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

it('shows the actual lookup error and allows refreshing without sending an assignment',async()=>{
 vi.mocked(apiRequest).mockRejectedValueOnce(new Error('409: {"error":"Guardá una cotización válida antes de asignar.","code":"SETTLEMENT_RATE_REQUIRED"}'));
 mount();
 expect(await screen.findByRole('alert')).toHaveTextContent('Guardá una cotización válida antes de asignar.');
 expect(screen.queryByText(/puede haber cambiado/)).not.toBeInTheDocument();
 expect(apiRequestWithGroupInventoryWarning).not.toHaveBeenCalled();
 vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify(options)));
 await userEvent.click(screen.getByRole('button',{name:'Actualizar habitaciones disponibles'}));
 await screen.findByText('Premium del canal');
 expect(screen.queryByRole('alert')).not.toBeInTheDocument();
 expect(apiRequestWithGroupInventoryWarning).not.toHaveBeenCalled();
});
it('shows declared VAT and the missing plan before requiring the exceptional assignment confirmation',async()=>{
 const received={...options,exchangeRate:'1545.000000',settlementTotal:'219451.80',rooms:[{...options.rooms[0],ratePlanMissing:true,sourceNetAmount:'117.39',sourceVatAmount:'24.65',choices:options.rooms[0].choices.map(r=>({...r,scopeOverride:true}))}]};
 vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify(received)));mount();
 expect(await screen.findByText(/El canal no identificó el plan tarifario/)).toBeInTheDocument();
 expect(screen.getByText(/Tarifa base: USD 117,39.*IVA informado: USD 24,65.*Total del canal: USD 142,04/)).toBeInTheDocument();
 expect(screen.getByText(/Total en PMS: ARS 219.451,80/)).toBeInTheDocument();
 const user=userEvent.setup();await user.selectOptions(screen.getByLabelText('Categoría en PMS 1'),'premium');await user.selectOptions(screen.getByLabelText('Habitación disponible 1'),'307');await user.type(screen.getByLabelText('Motivo de la asignación'),'Asignación de reserva histórica');
 expect(screen.getByRole('button',{name:'Confirmar asignación al PMS'})).toBeDisabled();
 fireEvent.click(screen.getByRole('checkbox',{name:/Confirmo esta asignación excepcional/}));
 expect(screen.getByRole('button',{name:'Confirmar asignación al PMS'})).toBeEnabled();
 expect(apiRequestWithGroupInventoryWarning).not.toHaveBeenCalled();
});

import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { render,screen,cleanup,waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
const {apiRequest}=vi.hoisted(()=>({apiRequest:vi.fn()}));
vi.mock('@/lib/queryClient',async()=>({...await vi.importActual('@/lib/queryClient'),apiRequest}));
import { ReservationPackageChange } from './reservation-package-change';
let client:QueryClient,state:any;const applied=vi.fn();
const preview={revision:2,previousTotalCents:20000,newTotalCents:25001,differenceCents:5001,checkIn:'2026-11-14',checkOut:'2026-11-15',packageProposal:{packageTotalCents:25001}};
beforeEach(()=>{vi.clearAllMocks();state={reservation:{pricingRevision:2},blocked:null};client=new QueryClient({defaultOptions:{queries:{retry:false,queryFn:async()=>state}}});apiRequest.mockImplementation(async(_m,path)=>new Response(JSON.stringify(path.endsWith('/preview')?preview:{id:'stay',notes:'[Paquete: Test]'}),{status:200}));});
afterEach(()=>{cleanup();client.clear();});
function mount(disabled=false){render(<QueryClientProvider client={client}><ReservationPackageChange reservationId="stay" packages={[{id:'pkg',name:'Test',nights:1} as any]} disabled={disabled} onApplied={applied}/></QueryClientProvider>);}
it('requires review before applying and sends only the chosen package, revision and reviewed amount',async()=>{
 mount();const user=userEvent.setup();await user.click(screen.getByRole('button',{name:'Aplicar paquete'}));
 await user.selectOptions(screen.getByLabelText('Paquete a aplicar'),'pkg');await user.type(screen.getByLabelText('Motivo del paquete'),'Era un paquete');
 await waitFor(()=>expect(screen.getByRole('button',{name:'Revisar importe'})).toBeEnabled());
 await user.click(screen.getByRole('button',{name:'Revisar importe'}));
 expect(await screen.findByRole('button',{name:'Confirmar paquete'})).toBeEnabled();expect(applied).not.toHaveBeenCalled();
 expect(apiRequest).toHaveBeenLastCalledWith('POST','/api/reservations/stay/nightly-pricing/preview',{revision:2,reason:'Era un paquete',edit:{kind:'package',packageId:'pkg'}});
 await user.click(screen.getByRole('button',{name:'Confirmar paquete'}));
 await waitFor(()=>expect(applied).toHaveBeenCalledOnce());
 expect(apiRequest).toHaveBeenLastCalledWith('POST','/api/reservations/stay/nightly-pricing/apply',{revision:2,reason:'Era un paquete',edit:{kind:'package',packageId:'pkg',expectedTotalCents:25001}});
});
it('cancels without saving and respects the accommodation permission',async()=>{
 mount();const user=userEvent.setup();await user.click(screen.getByRole('button',{name:'Aplicar paquete'}));await user.click(screen.getByRole('button',{name:'Cancelar'}));expect(apiRequest).not.toHaveBeenCalled();cleanup();mount(true);expect(screen.getByRole('button',{name:'Aplicar paquete'})).toBeDisabled();
});
it('shows the fiscal block and prevents confirmation',async()=>{
 state.blocked='Resolver la cobertura fiscal';mount();const user=userEvent.setup();await user.click(screen.getByRole('button',{name:'Aplicar paquete'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Resolver la cobertura fiscal');expect(screen.getByRole('button',{name:'Revisar importe'})).toBeDisabled();
});

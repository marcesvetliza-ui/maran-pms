import {cleanup,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,expect,it,vi} from 'vitest';
import {apiRequest} from '@/lib/queryClient';
import {ChannexReservationsInbox} from './channex-reservations-inbox';
vi.mock('@/lib/queryClient',()=>({apiRequest:vi.fn()}));
const revision={revision_id:'r3',booking_id:'booking',booking_status:'cancelled',status:'review',review_code:'LOCAL_FINANCIAL_HISTORY',acked_at:'2026-11-16T12:00:00Z',created_at:'2026-11-16T12:00:00Z',inserted_at:'2026-11-16T12:00:00Z',channel:'Booking.com',reference:'123456',guest_name:'Ana Perez',arrival:'2026-12-01',departure:'2026-12-02',amount:'145.00',currency:'USD'};
const booking={...revision,revision_count:3,inbox_view:'attention',reservations:[{id:'pms',code:'RES123',roomNumber:'307',category:'Premium'}]};
function mount(canRetry=true){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});const onRetry=vi.fn();render(<QueryClientProvider client={client}><ChannexReservationsInbox connectionId="conn" canRetry={canRetry} pending={false} onRetry={onRetry}/></QueryClientProvider>);return onRetry;}
afterEach(()=>{cleanup();vi.resetAllMocks();});
function mock(){vi.mocked(apiRequest).mockImplementation(async(_method,url)=>{
 const data=String(url).includes('/history/')?{total:3,revisions:[revision,{...revision,revision_id:'r2',status:'applied',booking_status:'modified'},{...revision,revision_id:'r1',status:'applied',booking_status:'new'}]}:
 {counts:{all:26,attention:1,new:24,modified:1,cancelled:0},bookings:String(url).includes('view=cancelled')?[]:[booking],page:1,pageSize:25};
 return new Response(JSON.stringify(data),{status:200});});}
it('separates a cancellation requiring review from its PMS result and expands history on demand',async()=>{
 mock();const onRetry=mount();const user=userEvent.setup();
 await screen.findByText('Ana Perez');expect(screen.getByText('Canal: Cancelada')).toBeInTheDocument();
 expect(screen.getByText(/Integración: Requiere revisión/)).toBeInTheDocument();expect(screen.getByText(/USD 145,00/)).toBeInTheDocument();
 expect(screen.getByRole('link',{name:/Ver reserva en PMS/})).toHaveAttribute('href','/reservations?view=pms&returnTo=%2Fota-channels');
 expect(vi.mocked(apiRequest).mock.calls).toHaveLength(1);
 await user.click(screen.getByRole('button',{name:'Historial (3)'}));await screen.findByText('Revisión: r1');
 expect(screen.getAllByText('Ana Perez')).toHaveLength(1);
 await user.click(screen.getByRole('button',{name:'Reintentar revisión'}));expect(onRetry).toHaveBeenCalledWith('r3');
 expect(vi.mocked(apiRequest).mock.calls.every(([method])=>method==='GET')).toBe(true);
});
it('uses server counters, paginates, resets the page on filter change and never offers retries to readers',async()=>{
 mock();mount(false);const user=userEvent.setup();await screen.findByText('Ana Perez');
 expect(screen.queryByRole('button',{name:'Reintentar revisión'})).not.toBeInTheDocument();
 await user.click(screen.getByRole('button',{name:'Siguiente'}));await waitFor(()=>expect(apiRequest).toHaveBeenCalledWith('GET',expect.stringContaining('page=2')));
 await user.click(screen.getByRole('button',{name:'Canceladas (0)'}));await screen.findByText('No hay reservas en esta vista.');
 expect(apiRequest).toHaveBeenLastCalledWith('GET',expect.stringContaining('view=cancelled&page=1'));
});
it('shows query failures without treating the inbox as empty',async()=>{
 vi.mocked(apiRequest).mockRejectedValue(new Error('offline'));mount();expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo consultar la bandeja');
});

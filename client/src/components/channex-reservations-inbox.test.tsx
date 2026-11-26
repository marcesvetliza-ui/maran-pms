import {cleanup,render,screen,waitFor,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,expect,it,vi} from 'vitest';
import {apiRequest} from '@/lib/queryClient';
import {ChannexReservationsInbox} from './channex-reservations-inbox';
vi.mock('@/lib/queryClient',()=>({apiRequest:vi.fn()}));
const revision={revision_id:'r3',booking_id:'booking',booking_status:'cancelled',status:'review',review_code:'LOCAL_FINANCIAL_HISTORY',acked_at:'2026-11-16T12:00:00Z',created_at:'2026-11-16T12:00:00Z',inserted_at:'2026-11-16T12:00:00Z',channel:'Booking.com',reference:'123456',guest_name:'Ana Perez',arrival:'2026-12-01',departure:'2026-12-02',amount:'145.00',currency:'USD'};
const booking={...revision,revision_count:3,inbox_view:'cancelled',reservations:[{id:'pms',code:'RES123',roomNumber:'307',category:'Premium',status:'confirmed',checkInDate:'2026-12-01',checkOutDate:'2026-12-02'}]};
function mount(canRetry=true){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});const onRetry=vi.fn();render(<QueryClientProvider client={client}><ChannexReservationsInbox connectionId="conn" canRetry={canRetry} pending={false} onRetry={onRetry}/></QueryClientProvider>);return onRetry;}
afterEach(()=>{cleanup();vi.resetAllMocks();});
function mock(detailBooking:unknown=booking){vi.mocked(apiRequest).mockImplementation(async(_method,url)=>{
 const path=String(url);
 const data=path.includes('/booking-detail/')?{notes:'Llegada después de las 22 hs',notesStatus:'available',settlements:[{reservation_id:'pms',source_currency:'USD',source_total:'145.00',exchange_rate:'1545.000000',settlement_currency:'ARS',settlement_total:'224025.00',created_at:'2026-11-16T12:00:00Z'}]}:
 path.includes('/history/')?{total:3,revisions:[revision,{...revision,revision_id:'r2',status:'applied',booking_status:'modified'},{...revision,revision_id:'r1',status:'applied',booking_status:'new'}]}:
 {counts:{all:26,attention:1,new:24,modified:0,cancelled:2},channels:['Booking.com','Expedia'],bookings:path.includes('view=modified')?[]:[detailBooking],page:1,pageSize:25};
 return new Response(JSON.stringify(data),{status:200});});}
it('shows a table, separates cancellation from application state and loads audited details only when opened',async()=>{
 mock();const onRetry=mount();const user=userEvent.setup();await screen.findByText('Ana Perez');
 expect(screen.getByRole('table',{name:'Reservas recibidas de canales OTAs'})).toBeInTheDocument();expect(screen.getAllByRole('columnheader')).toHaveLength(8);
 expect(screen.getByText('Cancelada')).toBeInTheDocument();expect(screen.getByText('Requiere revisión')).toBeInTheDocument();expect(screen.getByText('USD 145,00')).toBeInTheDocument();
 expect(vi.mocked(apiRequest).mock.calls).toHaveLength(1);
 await user.click(screen.getByRole('button',{name:/Ver detalle de Ana Perez/}));const dialog=await screen.findByRole('dialog');await within(dialog).findByText('Llegada después de las 22 hs');
 expect(within(dialog).getByText(/224.025,00/)).toBeInTheDocument();expect(within(dialog).getByText(/Cotización conservada: ARS 1.545 por USD/)).toBeInTheDocument();
 expect(within(dialog).getByRole('link',{name:/Ver reserva en PMS/})).toHaveAttribute('href','/reservations?view=pms&returnTo=%2Fota-channels');
 expect(within(dialog).getByText('1 noche')).toBeInTheDocument();
 expect(within(dialog).getByText('Reservada')).toBeInTheDocument();
 expect(within(dialog).getByText('Cancelada en el canal')).toBeInTheDocument();
 expect(within(dialog).queryByText('RES123')).not.toBeInTheDocument();
 expect(vi.mocked(apiRequest).mock.calls.some(([,url])=>String(url).includes('/history/'))).toBe(false);
 await user.click(within(dialog).getByRole('button',{name:'Reintentar revisión'}));expect(onRetry).toHaveBeenCalledWith('r3');
 await user.click(within(dialog).getByRole('button',{name:'Conexión e historial'}));
 await within(dialog).findByText('Revisión: r1');expect(within(dialog).getByText('RES123')).toBeInTheDocument();
 expect(vi.mocked(apiRequest).mock.calls.every(([method])=>method==='GET')).toBe(true);
});
it('applies search, channel and stay filters on the server and resets pagination',async()=>{
 mock();mount(false);const user=userEvent.setup();await screen.findByText('Ana Perez');
 await user.click(screen.getByRole('button',{name:'Siguiente'}));await waitFor(()=>expect(apiRequest).toHaveBeenCalledWith('GET',expect.stringContaining('page=2')));
 await user.type(screen.getByLabelText('Buscar por huésped o referencia'),'Ana 123');await user.selectOptions(screen.getByLabelText('Filtrar por canal'),'Booking.com');await user.selectOptions(screen.getByLabelText('Tipo de fecha'),'stay');
 const {fireEvent}=await import('@testing-library/react');fireEvent.change(screen.getByLabelText('Desde'),{target:{value:'2026-12-01'}});fireEvent.change(screen.getByLabelText('Hasta'),{target:{value:'2026-12-02'}});
 fireEvent.submit(screen.getByRole('button',{name:'Aplicar filtros'}).closest('form')!);await waitFor(()=>expect(apiRequest).toHaveBeenLastCalledWith('GET',expect.stringContaining('search=Ana+123&channel=Booking.com&dateType=stay&from=2026-12-01&to=2026-12-02')));
 expect(vi.mocked(apiRequest).mock.calls.at(-1)?.[1]).toContain('page=1');
 await user.click(await screen.findByRole('button',{name:'Modificadas (0)'}));await screen.findByText('No hay reservas en esta vista.');
});
it('rejects reversed dates without making a request and can clear filters',async()=>{
 mock();mount();const user=userEvent.setup();await screen.findByText('Ana Perez');const {fireEvent}=await import('@testing-library/react');
 fireEvent.change(screen.getByLabelText('Desde'),{target:{value:'2026-12-03'}});fireEvent.change(screen.getByLabelText('Hasta'),{target:{value:'2026-12-01'}});expect(screen.getByRole('button',{name:'Aplicar filtros'})).toBeDisabled();expect(screen.getByRole('alert')).toHaveTextContent('anterior o igual');
 expect(apiRequest).toHaveBeenCalledTimes(1);await user.click(screen.getByRole('button',{name:'Limpiar filtros'}));expect(screen.getByLabelText('Desde')).toHaveValue('');
});
it('opens details by keyboard and hides retry for read-only reception',async()=>{
 mock({...booking,booking_status:'new',reservations:booking.reservations.map(local=>({...local,status:'checked_in'}))});mount(false);await screen.findByText('Ana Perez');const {fireEvent}=await import('@testing-library/react');fireEvent.keyDown(screen.getAllByRole('row')[1],{key:'Enter'});const dialog=await screen.findByRole('dialog');await within(dialog).findByText('Llegada después de las 22 hs');expect(within(dialog).getByText('Alojada en PMS')).toBeInTheDocument();expect(within(dialog).queryByRole('button',{name:'Reintentar revisión'})).not.toBeInTheDocument();await userEvent.click(within(dialog).getByRole('button',{name:'Conexión e historial'}));await within(dialog).findByText('Revisión: r1');
});
it('shows query failures without treating the inbox as empty',async()=>{
 vi.mocked(apiRequest).mockRejectedValue(new Error('offline'));mount();expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo consultar la bandeja');
});

it('shows an accepted new booking as waiting for reception and never retries or assigns on its own',async()=>{
 const waiting={...booking,booking_status:'new',status:'review',review_code:'MANUAL_ASSIGNMENT_REQUIRED',inbox_view:'new',reservations:[],revision_count:1};
 vi.mocked(apiRequest).mockImplementation(async(_method,url)=>new Response(JSON.stringify(String(url).includes('/booking-detail/')?{notes:null,notesStatus:'none',settlements:[]}:String(url).includes('/history/')?{total:1,revisions:[waiting]}:{counts:{attention:1,new:1,modified:0,cancelled:0,all:1},channels:['Booking.com'],bookings:[waiting],page:1,pageSize:25}),{headers:{'Content-Type':'application/json'}}));
 const onRetry=mount();await screen.findByText('Pendiente de asignación');const user=userEvent.setup();await user.click(screen.getByRole('button',{name:/Ver detalle de Ana Perez/}));const dialog=await screen.findByRole('dialog');
 expect(within(dialog).getByRole('button',{name:'Asignar al PMS'})).toBeEnabled();expect(within(dialog).queryByRole('button',{name:'Reintentar revisión'})).not.toBeInTheDocument();expect(within(dialog).getByText('Todavía no hay una reserva vinculada en el PMS.')).toBeInTheDocument();expect(onRetry).not.toHaveBeenCalled();expect(vi.mocked(apiRequest).mock.calls.every(([method])=>method==='GET')).toBe(true);
});
it('shows the local guest and the original per-room guest and shared bed request without mutating the booking',async()=>{
 const details={version:1,bookerName:'Ana Perez',guestNames:['Guest Beta'],guestSource:'room',guestStatus:'imported',bedRequest:{text:'BED PREFERENCE: 2 singoli - 1 matrimoniale alla francese',scope:'booking'},importedBedNotes:null};
 const named={...booking,booking_status:'new',status:'applied',review_code:null,reservations:[{...booking.reservations[0],guestName:'Guest Beta',otaRoomDetails:details}]};
 mock(named);mount();await screen.findByText('Ana Perez');const user=userEvent.setup();await user.click(screen.getByRole('button',{name:/Ver detalle de Ana Perez/}));
 const dialog=await screen.findByRole('dialog');expect(within(dialog).getByText('Huésped: Guest Beta')).toBeInTheDocument();expect(within(dialog).getByText(/2 camas individuales/)).toBeInTheDocument();expect(within(dialog).getByText(/confirmá con recepción/i)).toBeInTheDocument();
 expect(vi.mocked(apiRequest).mock.calls.every(([method])=>method==='GET')).toBe(true);
});

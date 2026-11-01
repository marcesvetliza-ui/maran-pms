import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
const { toast, form, detail } = vi.hoisted(() => ({ toast:vi.fn(), form:vi.fn(), detail:vi.fn() }));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast})}));
vi.mock('./reservations',()=>({ReservationFormDialog:(props:any)=>{form(props);return props.open?<p>Formulario de nueva reserva</p>:null;}}));
vi.mock('@/components/planning-reservation-detail',()=>({ReservationDetailModal:(props:any)=>{detail(props);return props.open?<p>Detalle de reserva existente</p>:null;}}));
vi.mock('@/lib/utils',async()=>({...await vi.importActual('@/lib/utils'), getLocalToday:()=> '2026-11-01'}));
import PlanningPage from './planning';
const room={id:'room',roomNumber:'204',roomTypeId:'type',floor:2,status:'available',isActive:true,roomType:{id:'type',name:'Premium'}};
let data:any,client:QueryClient;
beforeEach(()=>{
 vi.clearAllMocks();
 data={days:['2026-11-01','2026-11-02','2026-11-03'],rooms:[room],occupancy:{room:['checked_in','late_blocked','available']},
  cellReservations:{room:{'2026-11-01':'stay','2026-11-02':'stay'}},reservations:{stay:{id:'stay',guestName:'Huésped saliente',checkIn:'2026-11-01',checkOut:'2026-11-02',status:'checked_in',source:'direct',lateCheckOut:true,lateCheckOutTime:'18:00'}},unassignedGroupBlocks:[],visibilityWarnings:[]};
 client=new QueryClient({defaultOptions:{queries:{retry:false,queryFn:async({queryKey})=>queryKey[0]==='/api/rooms'?[room]:[]}}});
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>new Response(JSON.stringify(String(input).startsWith('/api/planning?')?data:[]),{status:200,headers:{'content-type':'application/json'}})));
});
afterEach(()=>{cleanup();client.clear();vi.unstubAllGlobals();});
function mount(){render(<QueryClientProvider client={client}><TooltipProvider><PlanningPage/></TooltipProvider></QueryClientProvider>);}
it.each(['mouse','keyboard'])('opens a new stay on the departure date with late checkout using %s',async(method)=>{
 mount();const user=userEvent.setup();const cell=await screen.findByTestId('cell-room-2026-11-02');
 expect(cell.tagName).toBe('BUTTON');
 if(method==='mouse')await user.click(cell);else{cell.focus();await user.keyboard('{Enter}');}
 expect(await screen.findByText('Formulario de nueva reserva')).toBeInTheDocument();
 expect(form).toHaveBeenLastCalledWith(expect.objectContaining({open:true,reservation:undefined,defaultValues:{roomId:'room',roomTypeId:'type',checkInDate:'2026-11-02'}}));
 expect(toast).toHaveBeenCalledWith(expect.objectContaining({title:'Late check-out ese día'}));
 expect(screen.queryByText('Detalle de reserva existente')).not.toBeInTheDocument();
});
it('keeps occupied nights opening the current reservation rather than a new stay',async()=>{
 mount();await userEvent.setup().click(await screen.findByTestId('cell-room-2026-11-01'));
 expect(await screen.findByText('Detalle de reserva existente')).toBeInTheDocument();
 expect(detail).toHaveBeenLastCalledWith(expect.objectContaining({open:true,reservationId:'stay'}));
 expect(screen.queryByText('Formulario de nueva reserva')).not.toBeInTheDocument();
});

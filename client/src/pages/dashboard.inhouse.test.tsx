import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
vi.mock('@/App',()=>({useAuth:()=>({hasPermission:()=>true})}));
import Dashboard from './dashboard';
let client:QueryClient,requests:string[];
const entry=(roomNumber:string,numberOfGuests:number,companions:number)=>({reservationId:roomNumber,roomNumber,numberOfGuests,checkIn:'2026-11-23',checkOut:'2026-11-24',guest:{firstName:'Synthetic',lastName:'Room '+roomNumber},companions:Array.from({length:companions},(_,i)=>({firstName:'Companion '+i,lastName:'Room '+roomNumber}))});
beforeEach(()=>{
 requests=[];
 client=new QueryClient({defaultOptions:{queries:{retry:false,queryFn:async({queryKey})=>queryKey[0]==='/api/dashboard/stats'?{inHouseGuests:6,maintenanceBlockDetails:[]}:[]}}});
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>{
  const url=String(input);requests.push(url);
  return new Response(JSON.stringify(url.startsWith('/api/dashboard/inhouse?')?[entry('901',1,0),entry('1006',2,1),entry('1001',1,2)]:[]),{status:200,headers:{'Content-Type':'application/json'}});
 }));
});
afterEach(()=>{cleanup();client.clear();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
const mount=()=>render(<QueryClientProvider client={client}><Dashboard/></QueryClientProvider>);
it('prints every listed room and companion with the same pax count as the Dashboard',async()=>{
 let html='';vi.spyOn(window,'open').mockReturnValue({document:{write:(value:string)=>{html=value;},close:()=>{}}} as any);
 mount();fireEvent.click(await screen.findByText('Huéspedes In House'));
 expect(await screen.findByText(/3 habitación\(es\) · 6 huéspedes alojados · 6 identificados/)).toBeInTheDocument();
 fireEvent.click(screen.getByTestId('button-print-inhouse'));
 const printed=new DOMParser().parseFromString(html,'text/html');
 expect(printed.querySelectorAll('tbody tr')).toHaveLength(6);
 for(const room of ['901','1001','1006'])expect(printed.body.textContent).toContain(room);
 expect(printed.body.textContent).toContain('6 huésped(es) alojado(s)');
 expect(printed.body.textContent).toContain('6 persona(s) identificada(s)');
});
it('refreshes the current day after Argentina midnight while the Dashboard remains open',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-25T02:59:59Z'));
 mount();await act(async()=>{await vi.advanceTimersByTimeAsync(1);});
 fireEvent.click(screen.getByText('Huéspedes In House'));
 await act(async()=>{await vi.advanceTimersByTimeAsync(1);});
 expect(requests).toContain('/api/dashboard/inhouse?date=2026-11-24');
 await act(async()=>{await vi.advanceTimersByTimeAsync(1100);});
 expect(requests).toContain('/api/dashboard/inhouse?date=2026-11-25');
});

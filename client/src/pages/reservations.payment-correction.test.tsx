import { QueryClientProvider } from '@tanstack/react-query';
import { render,screen,cleanup,waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach,afterEach,it,expect,vi } from 'vitest';
import { queryClient } from '@/lib/queryClient';
const access=vi.hoisted(()=>({allowed:true}));
vi.mock('@/App',()=>({useAuth:()=>({user:{id:'reception-operator',role:'reception'},hasPermission:(key:string)=>access.allowed&&key==='funding:write'})}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:vi.fn(),toasts:[],dismiss:vi.fn()})}));
import {ReservationDetailDialog} from './reservations';
const reservation={id:'reservation-correction-ui',status:'checked_in',checkInDate:'2026-10-16',checkOutDate:'2026-10-17',reservationCode:'RES-201',totalRoomAmount:'180000',numberOfGuests:1,guest:{id:'g',firstName:'Pablo',lastName:'Prueba'},room:{id:'r',roomNumber:'201',roomType:{name:'Doble'}}};
beforeEach(()=>{
 queryClient.clear();sessionStorage.clear();access.allowed=true;vi.stubEnv('VITE_SPA_FUNDING_UI','true');
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>{
  const url=String(input),body=url.endsWith('/payments?includeAnulados=true')?[{id:'paid',amount:'90000',method:'tarjeta_credito',status:'active',date:'2026-10-16',invoiceRef:JSON.stringify({id:223,tipoComprobante:'FB',puntoVenta:21,numero:223})}]:url.endsWith('/api/billing/config')?{}:[];
  return new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
 }));
});
afterEach(()=>{cleanup();queryClient.clear();vi.unstubAllEnvs();vi.unstubAllGlobals();});
const mount=()=>render(<QueryClientProvider client={queryClient}><ReservationDetailDialog reservation={reservation as any} open onOpenChange={vi.fn()} onCancel={vi.fn()} currentUserRole="reception"/></QueryClientProvider>);
it.each([true, false])('keeps the folio payment visible without the duplicate correction action (funding permission: %s)',async(allowed)=>{
 access.allowed=allowed;mount();await userEvent.click(await screen.findByTestId('tab-folio'));await waitFor(()=>expect(screen.getByTestId('text-total-payments')).toHaveTextContent('90.000,00'));
 expect(screen.queryByTestId('button-correct-payment-paid')).not.toBeInTheDocument();
 expect(screen.queryByRole('heading',{name:'Corregir cobro'})).not.toBeInTheDocument();
 expect((fetch as ReturnType<typeof vi.fn>).mock.calls.some(([,init])=>init?.method==='POST')).toBe(false);
});

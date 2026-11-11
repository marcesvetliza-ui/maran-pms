import {render,screen,waitFor,cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {it,expect,vi,afterEach} from 'vitest';
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:vi.fn()})}));
const {PrefacturaDialog}=await import('./PrefacturaDialog');
afterEach(()=>{cleanup();vi.unstubAllGlobals();window.sessionStorage.clear();});
it('retries the original group room transfer and closes only its reservation from the same prefactura',async()=>{
 const id='room505',operationId='8ed6eac0-0f39-48a0-a59e-a8cc3de66e53';
 const payment={reservationId:id,amount:'796500.00',method:'transferencia',date:'2026-11-11',reference:null,notes:null,paymentRequestId:'8c0a31d3-47b0-4640-b85b-2ba22e28bb20'};
 const attempt={invoiceRequest:{reservaId:id,creditOperationId:operationId,tipoComprobante:'FB',puntoVentaOverride:5,cliente:{razonSocial:'AIMETTA'},prefacturaRecovery:{version:2,payments:[payment],checkoutRequested:true}},invoice:null,payments:[payment],checkoutRequested:true};
 window.sessionStorage.setItem(`prefactura-pending:${id}`,JSON.stringify(attempt));
 const fetcher=vi.fn(async(url:any,options?:RequestInit)=>{
  const path=String(url);
  if(options?.method==='POST'){
   if(path==='/api/billing/invoices')return Response.json({id:505,tipoComprobante:'FB',puntoVenta:5,numero:505,montoTotal:'796500.00'});
   if(path==='/api/payments')return Response.json({id:'paid505'});
   if(path.endsWith('/check-out'))return Response.json({status:'checked_out'});
  }
  if(path.endsWith('/reception-status'))return Response.json({stage:'prepared',safeToCorrect:true,attempt});
  if(path.endsWith('/pending-operation'))return Response.json({pending:null});
  if(path.endsWith('/folio'))return Response.json({groupId:'group505',reservationCode:'RES505',guestName:'AIMETTA',roomNumber:'505',nights:1,roomRate:'796500',roomTotal:796500,charges:[],payments:[],grandTotal:796500,totalCharges:0,totalPayments:0,balance:796500});
  if(path==='/api/billing/config')return Response.json({puntoVenta:5,arcaAmbiente:'ficticio'});
  return Response.json([]);
 });vi.stubGlobal('fetch',fetcher);
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><PrefacturaDialog open onClose={vi.fn()} onCheckoutComplete={vi.fn()} reservationId={id} reservation={{id,groupId:'group505',guestId:'g',status:'checked_in',guest:{firstName:'Patricio',lastName:'AIMETTA'},room:{roomNumber:'505'}} as any} mode="checkout"/></QueryClientProvider>);
 await userEvent.setup().click(await screen.findByRole('button',{name:'Completar operación pendiente'}));
 await waitFor(()=>expect(fetcher.mock.calls.some(([url,options])=>String(url)==='/api/reservations/room505/check-out'&&options?.method==='POST')).toBe(true));
 const writes=fetcher.mock.calls.filter(([,options])=>options?.method==='POST');
 expect(writes.map(([url])=>String(url))).toEqual(['/api/billing/invoices','/api/payments','/api/reservations/room505/check-out']);
 const body=JSON.parse(String(writes[1][1]?.body));expect(body).toMatchObject({reservationId:id,method:'transferencia',amount:'796500.00',paymentRequestId:payment.paymentRequestId});
});

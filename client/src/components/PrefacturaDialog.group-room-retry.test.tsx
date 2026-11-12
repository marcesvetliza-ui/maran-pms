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
it('documents pending sources of a group room without preparing a second payment or a CC transfer',async()=>{
 const id='room-doc-only';const writes:any[]=[];
 const fetcher=vi.fn(async(url:any,options?:RequestInit)=>{
  const path=String(url);
  if(options?.method==='POST'){
   writes.push({path,body:JSON.parse(String(options.body||'{}'))});
   if(path==='/api/billing/invoices')return Response.json({id:506,tipoComprobante:'FB',puntoVenta:5,numero:506,montoTotal:'121.00'});
  }
  if(path.endsWith('/group-account'))return Response.json({groupId:'g-doc',balance:121,charges:121,paid:0,pendingInvoice:121,groupCoverage:{},advances:[],reviewReceipts:[],unassigned:0});
  if(path.endsWith('/reception-status'))return Response.json({stage:'none'});
  if(path.endsWith('/pending-operation'))return Response.json({pending:null});
  if(path.endsWith('/folio'))return Response.json({groupId:'g-doc',reservationCode:'RES506',guestName:'Synthetic Guest',roomNumber:'506',nights:1,roomRate:'121',roomTotal:121,charges:[],payments:[],grandTotal:121,totalCharges:0,totalPayments:0,balance:121});
  if(path==='/api/billing/config')return Response.json({puntoVenta:5,arcaAmbiente:'ficticio'});
  return Response.json([]);
 });vi.stubGlobal('fetch',fetcher);
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><PrefacturaDialog open onClose={vi.fn()} reservationId={id} reservation={{id,groupId:'g-doc',guestId:'g',status:'checked_in',guest:{id:'g',firstName:'Synthetic',lastName:'Guest',condicionIva:'Consumidor Final'},room:{roomNumber:'506'}} as any} mode="billing"/></QueryClientProvider>);
 expect(await screen.findByDisplayValue('Solo facturación; conserva los pagos')).toBeInTheDocument();
 const button=await screen.findByTestId('button-registrar-emitir');await waitFor(()=>expect(button).toBeEnabled());
 expect(button).toHaveTextContent('Emitir factura sin cobrar');
 await userEvent.setup().click(button);
 await waitFor(()=>expect(writes.some(w=>w.path==='/api/billing/invoices')).toBe(true));
 expect(writes).toHaveLength(1);expect(writes[0].body).toMatchObject({reservaId:id,groupDocumentationOnly:true,prefacturaRecovery:{version:2,payments:[],checkoutRequested:false}});
 expect(writes[0].body.cashFormaPago).toBeUndefined();expect(writes[0].body.cashFormaPagoDetalle).toBeUndefined();expect(writes[0].body.reservationSettlementMethod).toBeUndefined();
});

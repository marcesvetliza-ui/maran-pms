import React from 'react';
import {cleanup,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {queryClient} from '@/lib/queryClient';
import {PrefacturaDialog} from './PrefacturaDialog';
import {createPrefacturaSubmission} from '@/lib/prefactura-submission';
import {savePrefacturaSelection} from '@/lib/prefactura-selection';
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:vi.fn()})}));
vi.mock('@/lib/queryClient',async original=>({...await original<typeof import('@/lib/queryClient')>(),queryClient:new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}));
const id='reservation-506',guestId='guest-506',night='accommodation:2026-11-18';
const reservation={id,guestId,status:'checked_in',checkOutDate:'2026-11-19',guest:{id:guestId,firstName:'Daniel',lastName:'González',nationality:'Argentina',vatCondition:'consumidor_final'},room:{roomNumber:'506'}} as any;
let writes:{path:string,body:any}[],invoices:any[],payments:any[],checkout:boolean,loseDepartureResponse:boolean,losePreparationResponse:boolean,replacements:Map<string,any>,closed:ReturnType<typeof vi.fn<()=>void>>;
const json=(value:any,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
beforeEach(()=>{
 sessionStorage.clear();queryClient.clear();writes=[];invoices=[];payments=[];checkout=false;loseDepartureResponse=false;losePreparationResponse=false;replacements=new Map();closed=vi.fn();
 vi.spyOn(window,'open').mockImplementation(()=>null);
 vi.stubGlobal('fetch',vi.fn(async(url:any,init?:RequestInit)=>{
  const path=String(url),method=init?.method || 'GET';
  if(method==='POST'){
   const body=JSON.parse(String(init?.body || '{}'));writes.push({path,body});
   if(path.endsWith('/prepare-excess-collection')){
    const attempt=body.attempt,old=attempt.invoiceRequest.creditOperationId,amount=235800;
    if(replacements.has(old))return json(replacements.get(old));
    const split=[{...attempt.payments[0],amount:amount.toFixed(2),paymentRequestId:crypto.randomUUID()},{...attempt.payments[0],amount:amount.toFixed(2),paymentRequestId:crypto.randomUUID(),unlinkedAdvance:true,receiptType:'none'}];
    const replacement={...attempt,payments:split,invoiceRequest:{...attempt.invoiceRequest,creditOperationId:crypto.randomUUID(),cashFormaPagoDetalle:[{method:'efectivo',amount}],prefacturaRecovery:{...attempt.invoiceRequest.prefacturaRecovery,payments:split},excessCollection:{originalOperationId:old}}};replacements.set(old,replacement);if(losePreparationResponse){losePreparationResponse=false;throw Error('Respuesta perdida al preparar');}return json(replacement);
   }
   if(path==='/api/billing/invoices'){const invoice={id:506,reservaId:id,estado:'emitida',tipo_comprobante:'cierre_habitacion',monto_total:body.items.reduce((s:number,i:any)=>s+i.subtotal,0),source_charge_ids:body.sourceChargeIds,source_charge_amounts:body.sourceChargeAmounts,items:body.items};invoices.push(invoice);return json(invoice);}
   if(path==='/api/payments'){const previous=payments.find(p=>p.paymentRequestId===body.paymentRequestId);if(previous)return json(previous);const payment={...body,id:body.paymentRequestId,invoiceRef:body.invoiceData?JSON.stringify(body.invoiceData):null};payments.push(payment);return json(payment);}
   if(path.endsWith('/check-out-to-account')){checkout=true;payments.push({amount:body.expectedBalance,method:'cuenta_corriente'});if(loseDepartureResponse){loseDepartureResponse=false;throw Error('Respuesta perdida después de cerrar');}return json({success:true});}
   if(path.endsWith('/check-out')){checkout=true;return json({success:true});}
   return json({});
  }
  if(path.endsWith('/folio'))return json({reservationCode:'506',guestName:'Daniel González',roomNumber:'506',nights:2,roomTotal:471600,roomRate:'235800',accommodationNights:[{id:night,date:'2026-11-18',amount:235800},{id:'accommodation:2026-11-19',date:'2026-11-19',amount:235800}],charges:[],payments,totalPayments:payments.reduce((s,p)=>s+Number(p.amount),0),grandTotal:471600,balance:471600-payments.reduce((s,p)=>s+Number(p.amount),0)});
  if(path.endsWith('/invoices'))return json(invoices);
  if(path.endsWith('/pending-operation'))return json({pending:null});
  if(path.endsWith('/reception-status'))return json([...replacements.keys()].some(key=>path.includes(key))?{stage:'corrected',code:'EXCESS_COLLECTION_SEPARATED',safeToCorrect:false}:{stage:'legacy_unknown',safeToCorrect:false});
  if(path.endsWith('/billing/config'))return json({puntoVenta:5,arcaAmbiente:'ficticio'});
  if(path===`/api/reservations/${id}`)return json({...reservation,status:checkout?'checked_out':reservation.status});
  return json([]);
 }));
});
afterEach(()=>{cleanup();queryClient.clear();vi.unstubAllGlobals();vi.restoreAllMocks();});
function renderDialog(mode:'billing'|'checkout'='billing'){return render(<QueryClientProvider client={queryClient}><PrefacturaDialog open onClose={closed} reservationId={id} reservation={reservation} mode={mode}/></QueryClientProvider>);}
function prepareOriginal(){
  const submission=createPrefacturaSubmission(sessionStorage);
  submission.prepare(id,{reservaId:id,tipoComprobante:'cierre_habitacion',creditOperationId:crypto.randomUUID(),puntoVentaOverride:5,cliente:{razonSocial:'Daniel González'},items:[{descripcion:'Una noche',subtotal:235800}],sourceChargeIds:[night],cashFormaPago:'efectivo',cashFormaPagoDetalle:[{method:'efectivo',amount:471600}]},[{reservationId:id,amount:'471600.00',method:'efectivo',date:'2026-11-18',receiptType:'cierre_habitacion'}]);
}
describe('Aviso sin bloqueo cuando el cobro supera el comprobante',()=>{
 it('avisa antes de guardar un intento nuevo con una noche seleccionada y cobra ambas al confirmar',async()=>{
  savePrefacturaSelection(sessionStorage,id,[night]);const user=userEvent.setup();renderDialog();
  await waitFor(()=>expect(screen.getByTestId('input-payment-amount-0')).toHaveValue(235800));
  await user.clear(screen.getByTestId('input-payment-amount-0'));await user.type(screen.getByTestId('input-payment-amount-0'),'471600');
  await user.click(screen.getByTestId('button-registrar-emitir'));await screen.findByTestId('confirm-collection-difference');
  expect(writes).toEqual([]);expect(sessionStorage.getItem(`prefactura-pending:${id}`)).toBeNull();
  await user.click(screen.getByTestId('confirm-collection-difference'));await waitFor(()=>expect(payments).toHaveLength(2));
  expect(invoices[0].source_charge_ids).toEqual([night]);expect(invoices[0].monto_total).toBe(235800);expect(payments.reduce((sum,p)=>sum+Number(p.amount),0)).toBe(471600);
  await waitFor(()=>expect(window.open).toHaveBeenCalledWith(expect.stringMatching(/collection-receipts\/[^/]+\/pdf$/),'_blank'));
  expect(window.open).not.toHaveBeenCalledWith('/api/billing/invoices/506/pdf','_blank');
 });

 it('reintenta la preparación confirmada si su respuesta se perdió y el intento anterior ya fue retirado',async()=>{
  prepareOriginal();losePreparationResponse=true;const user=userEvent.setup();renderDialog();
  await user.click(await screen.findByTestId('button-retry-prefactura'));await user.click(await screen.findByTestId('confirm-collection-difference'));
  await screen.findByText(/Respuesta perdida al preparar/);
  await waitFor(()=>expect(screen.getByTestId('button-retry-prefactura')).toBeEnabled());expect(invoices).toHaveLength(0);expect(payments).toHaveLength(0);
  await user.click(screen.getByTestId('button-retry-prefactura'));await user.click(await screen.findByTestId('confirm-collection-difference'));
  await waitFor(()=>expect(payments).toHaveLength(2));expect(invoices).toHaveLength(1);expect(payments.reduce((sum,p)=>sum+Number(p.amount),0)).toBe(471600);
 });

 it('recupera un cierre cuya respuesta se perdió sin repetir el cobro ni el traslado',async()=>{
  loseDepartureResponse=true;const user=userEvent.setup();renderDialog('checkout');
  await waitFor(()=>expect(screen.getByTestId('input-payment-amount-0')).toHaveValue(471600));
  await user.clear(screen.getByTestId('input-payment-amount-0'));await user.type(screen.getByTestId('input-payment-amount-0'),'235800');
  await user.click(screen.getByTestId('button-registrar-emitir'));await user.click(await screen.findByTestId('confirm-collection-difference'));
  await waitFor(()=>expect(checkout).toBe(true));
  const retry=await screen.findByTestId('button-retry-prefactura');await waitFor(()=>expect(retry).toBeEnabled());
  await user.click(retry);await waitFor(()=>expect(closed).toHaveBeenCalled());
  expect(invoices).toHaveLength(1);expect(payments).toHaveLength(2);expect(writes.filter(w=>w.path.endsWith('/check-out-to-account'))).toHaveLength(1);
 });

 it('recupera el intento de la 506 sin emitir ni cobrar antes de confirmar',async()=>{
  prepareOriginal();
  const user=userEvent.setup();renderDialog();
  await user.click(await screen.findByTestId('button-retry-prefactura'));
  expect(await screen.findByRole('heading',{name:'Revisar cobro y comprobante'})).toBeInTheDocument();expect(writes).toEqual([]);
  await user.click(screen.getByRole('button',{name:'Volver a revisar'}));expect(writes).toEqual([]);
  await user.click(screen.getByTestId('button-retry-prefactura'));await user.click(await screen.findByTestId('confirm-collection-difference'));
  await waitFor(()=>expect(payments).toHaveLength(2));
  expect(invoices).toHaveLength(1);expect(invoices[0].monto_total).toBe(235800);
  expect(payments.reduce((s,p)=>s+Number(p.amount),0)).toBe(471600);expect(payments[0].invoiceData.id).toBe(506);expect(payments[1].invoiceData).toBeUndefined();
  expect(checkout).toBe(false);
 });
 it('avisa el saldo de toda la estadía y lo lleva a cuenta corriente al cerrar después de cobrar',async()=>{
  const user=userEvent.setup();renderDialog('checkout');
  await waitFor(()=>expect(screen.getByTestId('input-payment-amount-0')).toHaveValue(471600));
  await user.clear(screen.getByTestId('input-payment-amount-0'));await user.type(screen.getByTestId('input-payment-amount-0'),'235800');
  await user.click(screen.getByTestId('button-registrar-emitir'));
  expect(await screen.findByRole('heading',{name:'Revisar cobro y comprobante'})).toBeInTheDocument();expect(writes).toEqual([]);
  expect(screen.getByText(/pasará a la cuenta corriente/)).toHaveTextContent('235.800');
  await user.click(screen.getByTestId('confirm-collection-difference'));
  await waitFor(()=>expect(checkout).toBe(true));
  const transfer=writes.find(w=>w.path.endsWith('/check-out-to-account'))!;
  expect(transfer.body).toMatchObject({entityType:'guest',entityId:guestId,expectedBalance:'235800.00'});
  expect(invoices).toHaveLength(1);expect(payments.filter(p=>p.method==='efectivo')).toHaveLength(1);expect(Number(payments[0].amount)).toBe(235800);
 });
});

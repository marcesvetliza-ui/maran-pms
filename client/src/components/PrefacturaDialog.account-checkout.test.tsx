import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

vi.mock("@/hooks/use-toast",()=>({useToast:()=>({toast:vi.fn(),toasts:[],dismiss:vi.fn()})}));
vi.mock("@/lib/queryClient",async original=>({...await original<typeof import("@/lib/queryClient")>(),queryClient:new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}));
const {PrefacturaDialog}=await import('./PrefacturaDialog');
const id='account-checkout-room';
const folio={reservationCode:'R-806',guestName:'Synthetic Guest',roomNumber:'806',checkInDate:'2026-11-12',checkOutDate:'2026-11-14',nights:2,roomTotal:0,roomRate:0,
  charges:[{id:'spa-transfer',description:'Transferencia entrada SPA',amount:'70000.00',date:'2026-11-14',category:'transfer_in',status:'active'}],payments:[],totalCharges:70000,totalPayments:0,grandTotal:70000,balance:70000,financialSummary:{operationalFolioBalance:70000}};
const reservation={id,guestId:'account-guest',status:'checked_in',guest:{id:'account-guest',firstName:'Synthetic',lastName:'Guest',vatCondition:'consumidor_final',condicionVentaPredeterminada:'cuenta_corriente'},room:{roomNumber:'806'}} as any;
function setup(failOnce=false,changedBalance=false,overrides:{folio?:any;reservation?:any;invoices?:any[];status?:any;settledAfterLoss?:boolean}={}){
  let failures=failOnce?1:0;let committed=false;
  const fetchMock=vi.fn(async(url:any,options?:RequestInit)=>{
    const path=String(url);const post=options?.method==='POST';let data:any=[];
    if(path.endsWith('/check-out-to-account')&&post){if(failures-- >0){if(changedBalance)return new Response(JSON.stringify({error:'El saldo cambió',notApplied:true}),{status:409});committed=true;throw new Error('Response lost after commit');}data={success:true,amount:'70000.00'};}
    else if(path.endsWith('/folio')){data=overrides.folio || folio;if(committed && overrides.settledAfterLoss)data={...data,balance:0,financialSummary:{...data.financialSummary,operationalFolioBalance:0}};}
    else if(path.endsWith('/invoices'))data=overrides.invoices || [];
    else if(path.endsWith('/reception-status'))data=overrides.status || {};
    else if(path.includes('/api/billing/config'))data={puntoVenta:5,arcaAmbiente:'homologacion'};
    else if(path.endsWith('/pending-operation'))data={attempt:null};
    return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
  });
  vi.stubGlobal('fetch',fetchMock);const onClose=vi.fn(),onCheckoutComplete=vi.fn();
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><PrefacturaDialog open onClose={onClose} reservationId={id} reservation={overrides.reservation || reservation} mode="checkout" onCheckoutComplete={onCheckoutComplete}/></QueryClientProvider>);
  return {fetchMock,onClose,onCheckoutComplete};
}
describe('Prefactura checkout with a documented/transfer balance in Cuenta Corriente',()=>{
  beforeEach(()=>{sessionStorage.clear();vi.stubGlobal('open',vi.fn());});
  afterEach(()=>{cleanup();vi.unstubAllGlobals();sessionStorage.clear();});
  it('releases a completed prior departure after reopening and keeps the new balance and unbilled charges',async()=>{
    const operationId=crypto.randomUUID(),oldDeparture=crypto.randomUUID();
    sessionStorage.setItem(`prefactura-pending:${id}`,JSON.stringify({ownerReservationId:id,invoiceRequest:{reservaId:id,creditOperationId:operationId,tipoComprobante:'FA',items:[{descripcion:'Alojamiento',cantidad:1,precioUnitario:147000}],sourceChargeIds:['accommodation:2026-11-12'],sourceChargeAmounts:{'accommodation:2026-11-12':147000}},invoice:{id:1784,reserva_id:id},payments:[],checkoutRequested:true,checkoutDebtAccount:{operationId:oldDeparture,entityType:'agency',entityId:'original-agency',entityName:'Original agency',maximumBalance:7500}}));
    const current={...folio,roomTotal:147000,roomRate:147000,nights:1,accommodationNights:[{date:'2026-11-12',rateCents:14700000,discountCents:0}],
      charges:[{id:'parking',description:'Cochera',amount:'7500.00',category:'otros',status:'active',date:'2026-11-12'},{id:'restaurant',description:'JUSTO',amount:'64000.00',category:'restaurant',status:'active',date:'2026-11-14'}],
      payments:[{id:'agency-lodging',amount:'147000.00',method:'cuenta_corriente',status:'active',invoiceRef:JSON.stringify({id:1784})},{id:'old-departure',amount:'7500.00',method:'cuenta_corriente',status:'active'}],totalPayments:154500,totalCharges:71500,grandTotal:218500,balance:64000,financialSummary:{operationalFolioBalance:64000}};
    const {fetchMock,onCheckoutComplete}=setup(false,false,{folio:current,invoices:[{id:1784,tipo_comprobante:'FA',estado:'emitida',monto_total:'147000.00',source_charge_ids:['accommodation:2026-11-12'],source_charge_amounts:{'accommodation:2026-11-12':147000}}],status:{operationId,stage:'authorized',financiallyComplete:true,departureReopened:true}});
    await waitFor(()=>expect(sessionStorage.getItem(`prefactura-pending:${id}`)).toBeNull());
    expect(screen.getByTestId('checkout-outstanding-balance')).toHaveTextContent('$64.000,00');
    expect(screen.queryByTestId('button-retry-prefactura')).not.toBeInTheDocument();
    expect(sessionStorage.getItem(`reservation-settlement-operation:${id}`)).not.toBe(operationId);
    expect(fetchMock.mock.calls.filter(([,o])=>o?.method==='POST')).toHaveLength(0);
    const user=userEvent.setup();await user.click(screen.getByTestId('button-checkout-balance-to-account'));
    expect(screen.getByRole('dialog',{name:'Check-out con deuda en cuenta corriente'})).toHaveTextContent('$64.000,00');
    await user.click(screen.getByTestId('confirm-account-checkout'));
    await waitFor(()=>expect(onCheckoutComplete).toHaveBeenCalledTimes(1));
    const writes=fetchMock.mock.calls.filter(([,o])=>o?.method==='POST');expect(writes).toHaveLength(1);
    expect(String(writes[0][0])).toContain('/check-out-to-account');const body=JSON.parse(String(writes[0][1]?.body));
    expect(body).toMatchObject({expectedBalance:'64000.00',entityType:'guest',entityId:'account-guest'});expect(body.operationId).not.toBe(oldDeparture);
  });
  it('shows the full $70,000 transfer, asks for confirmation, and closes without another invoice',async()=>{
    const {fetchMock,onCheckoutComplete}=setup();const user=userEvent.setup();
    const button=await screen.findByRole('button',{name:'Cerrar y pasar a Cuenta Corriente'});
    await waitFor(()=>expect(button).toBeEnabled());
    expect(screen.getByTestId('new-charge-required')).toHaveTextContent('$70.000,00');
    await user.click(button);
    expect(screen.getByRole('dialog',{name:'Check-out con deuda en cuenta corriente'})).toHaveTextContent('$70.000,00');
    expect(fetchMock.mock.calls.filter(([u,o])=>o?.method==='POST')).toHaveLength(0);
    await user.click(screen.getByTestId('confirm-account-checkout'));
    await waitFor(()=>expect(onCheckoutComplete).toHaveBeenCalledTimes(1));
    const writes=fetchMock.mock.calls.filter(([u,o])=>o?.method==='POST');
    expect(writes).toHaveLength(1);expect(String(writes[0][0])).toContain('/check-out-to-account');
    expect(JSON.parse(String(writes[0][1]?.body))).toMatchObject({entityType:'guest',entityId:'account-guest',expectedBalance:'70000.00'});
  });
  it('retries a lost response with the same account, amount and operation id',async()=>{
    const {fetchMock,onCheckoutComplete}=setup(true);const user=userEvent.setup();
    await user.click(await screen.findByRole('button',{name:'Cerrar y pasar a Cuenta Corriente'}));
    await user.click(screen.getByTestId('confirm-account-checkout'));
    await screen.findByText('Response lost after commit');
    await user.click(screen.getByTestId('button-retry-prefactura'));
    await waitFor(()=>expect(onCheckoutComplete).toHaveBeenCalledTimes(1));
    const writes=fetchMock.mock.calls.filter(([u,o])=>o?.method==='POST');expect(writes).toHaveLength(2);expect(writes[0][1]?.body).toEqual(writes[1][1]?.body);
  });
  it('allows a fresh confirmation when the server explicitly applied nothing',async()=>{
    const {onCheckoutComplete}=setup(true,true);const user=userEvent.setup();
    await user.click(await screen.findByRole('button',{name:'Cerrar y pasar a Cuenta Corriente'}));await user.click(screen.getByTestId('confirm-account-checkout'));
    await screen.findByText('El saldo cambió');expect(onCheckoutComplete).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(`prefactura-pending:${id}`)).toBeNull();
    expect(screen.getByRole('button',{name:'Cerrar y pasar a Cuenta Corriente'})).toBeEnabled();
  });
  it('recovers a checkout saved by the previous version without changing its operation or account',async()=>{
    const request={operationId:crypto.randomUUID(),entityType:'guest',entityId:'account-guest',entityName:'Original guest account',expectedBalance:'70000.00'};
    sessionStorage.setItem(`prefactura-pending:${id}`,JSON.stringify({ownerReservationId:id,invoiceRequest:null,invoice:null,payments:[],checkoutRequested:true,accountCheckout:request}));
    const {fetchMock,onCheckoutComplete}=setup();const user=userEvent.setup();
    await user.click(await screen.findByTestId('button-retry-prefactura'));
    await waitFor(()=>expect(onCheckoutComplete).toHaveBeenCalledTimes(1));
    const writes=fetchMock.mock.calls.filter(([,o])=>o?.method==='POST');expect(writes).toHaveLength(1);
    expect(JSON.parse(String(writes[0][1]?.body))).toEqual(request);
    expect(sessionStorage.getItem(`prefactura-pending:${id}`)).toBeNull();expect(sessionStorage.getItem(`prefactura-account-checkout:${id}`)).toBeNull();
  });
  it('preserves both original intents if an older checkout and another checkout are already stored',async()=>{
    const attempt=(operationId:string)=>({ownerReservationId:id,invoiceRequest:null,invoice:null,payments:[],checkoutRequested:true,accountCheckout:{operationId,entityType:'guest',entityId:'account-guest',entityName:'Guest',expectedBalance:'70000.00'}});
    const older=JSON.stringify(attempt(crypto.randomUUID())),current=JSON.stringify(attempt(crypto.randomUUID()));
    sessionStorage.setItem(`prefactura-pending:${id}`,older);sessionStorage.setItem(`prefactura-account-checkout:${id}`,current);
    const {fetchMock}=setup();await screen.findByTestId('button-retry-prefactura');
    expect(sessionStorage.getItem(`prefactura-pending:${id}`)).toBe(older);expect(sessionStorage.getItem(`prefactura-account-checkout:${id}`)).toBe(current);
    expect(fetchMock.mock.calls.filter(([,o])=>o?.method==='POST')).toHaveLength(0);
  });
  it.each([false,true])('closes with a one-cent late charge while preserving a corrected-payment fiscal attempt (lost response=%s)',async lost=>{
    const original={ownerReservationId:id,invoiceRequest:{reservaId:id,creditOperationId:crypto.randomUUID(),tipoComprobante:'FB',cliente:{razonSocial:'Original recipient'},sourceChargeIds:['accommodation:2026-11-14'],sourceChargeAmounts:{'accommodation:2026-11-14':201000}},invoice:{id:1591,reserva_id:id},payments:[{reservationId:id,amount:'201000.00',method:'efectivo',paymentRequestId:crypto.randomUUID()}],checkoutRequested:false};
    const originalJson=JSON.stringify(original);sessionStorage.setItem(`prefactura-pending:${id}`,originalJson);
    const current={...folio,roomTotal:201000,charges:[{id:'late',description:'Late Check-out 19:00',amount:'0.01',category:'otros',status:'active',date:'2026-11-14'}],payments:[{id:'original-paid',amount:'201000.00',method:'transferencia',status:'active',invoiceRef:JSON.stringify({id:1591})}],totalPayments:201000,grandTotal:201000.01,balance:0.010000000009313226,financialSummary:{operationalFolioBalance:0.01}};
    const {fetchMock,onCheckoutComplete}=setup(lost,false,{settledAfterLoss:lost,folio:current,reservation:{...reservation,companyId:'debt-company'},invoices:[{id:1591,tipo_comprobante:'FB',estado:'emitida',monto_total:'201000.00',source_charge_ids:['accommodation:2026-11-14'],source_charge_amounts:{'accommodation:2026-11-14':201000}}],status:{stage:'authorized',paymentConflicts:[original.payments[0].paymentRequestId],paymentConflictMessage:'El cobro original fue modificado. Requiere conciliación.'}});
    const user=userEvent.setup();const banner=await screen.findByTestId('checkout-outstanding-balance');expect(banner).toHaveTextContent('$0,01');
    expect(screen.queryByTestId('checkout-settled-confirmation')).not.toBeInTheDocument();
    await screen.findByText('El cobro original fue modificado. Requiere conciliación.');
    expect(screen.getByTestId('button-retry-prefactura')).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Cuenta corriente para el saldo'),'company:debt-company');
    await user.click(screen.getByTestId('button-checkout-balance-to-account'));
    expect(screen.getByRole('dialog',{name:'Check-out con deuda en cuenta corriente'})).toHaveTextContent('$0,01');
    expect(fetchMock.mock.calls.filter(([,o])=>o?.method==='POST')).toHaveLength(0);
    await user.click(screen.getByTestId('confirm-account-checkout'));
    if(lost){await screen.findByText('Response lost after commit');expect(screen.getByTestId('button-retry-prefactura')).toBeEnabled();await user.click(screen.getByTestId('button-retry-prefactura'));}
    await waitFor(()=>expect(onCheckoutComplete).toHaveBeenCalledTimes(1));
    const writes=fetchMock.mock.calls.filter(([,o])=>o?.method==='POST');expect(writes).toHaveLength(lost?2:1);
    for(const [url,options] of writes){expect(String(url)).toContain('/check-out-to-account');expect(JSON.parse(String(options?.body))).toMatchObject({entityType:'company',entityId:'debt-company',expectedBalance:'0.01'});}
    if(lost)expect(writes[0][1]?.body).toEqual(writes[1][1]?.body);
    expect(sessionStorage.getItem(`prefactura-pending:${id}`)).toBe(originalJson);
    expect(sessionStorage.getItem(`prefactura-account-checkout:${id}`)).toBeNull();
  });
});

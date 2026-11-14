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
function setup(failOnce=false,changedBalance=false){
  let failures=failOnce?1:0;
  const fetchMock=vi.fn(async(url:any,options?:RequestInit)=>{
    const path=String(url);const post=options?.method==='POST';let data:any=[];
    if(path.endsWith('/check-out-to-account')&&post){if(failures-- >0){if(changedBalance)return new Response(JSON.stringify({error:'El saldo cambió',notApplied:true}),{status:409});throw new Error('Response lost after commit');}data={success:true,amount:'70000.00'};}
    else if(path.endsWith('/folio'))data=folio;
    else if(path.includes('/api/billing/config'))data={puntoVenta:5,arcaAmbiente:'homologacion'};
    else if(path.endsWith('/pending-operation'))data={attempt:null};
    return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
  });
  vi.stubGlobal('fetch',fetchMock);const onClose=vi.fn(),onCheckoutComplete=vi.fn();
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><PrefacturaDialog open onClose={onClose} reservationId={id} reservation={reservation} mode="checkout" onCheckoutComplete={onCheckoutComplete}/></QueryClientProvider>);
  return {fetchMock,onClose,onCheckoutComplete};
}
describe('Prefactura checkout with a documented/transfer balance in Cuenta Corriente',()=>{
  beforeEach(()=>{sessionStorage.clear();vi.stubGlobal('open',vi.fn());});
  afterEach(()=>{cleanup();vi.unstubAllGlobals();sessionStorage.clear();});
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
});

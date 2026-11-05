import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/hooks/use-toast",()=>({useToast:()=>({toast:vi.fn()})}));
const { PrefacturaDialog } = await import("./PrefacturaDialog");
afterEach(()=>{cleanup();vi.unstubAllGlobals();window.sessionStorage.clear();});
it("advierte, permite cancelar y traslada a CC sin crear un segundo pago de caja antes del checkout", async()=>{
 const user=userEvent.setup(); let emitted=false;
 const fetcher=vi.fn(async(url: any, options?:RequestInit)=>{
  const path=String(url), method=options?.method || "GET";
  if(path.endsWith('/recover'))return Response.json({error:'No existe operación'},{status:404});
  if(path.includes('/folio')) return Response.json({reservationCode:'NF-CC',guestName:'Cliente Prueba',roomNumber:'202',nights:1,roomRate:'100',roomTotal:100,charges:[],payments:[],grandTotal:100,totalCharges:0,totalPayments:0,balance:100});
  if(path==='/api/billing/config')return Response.json({puntoVenta:1,arcaAmbiente:'ficticio'});
  if(path==='/api/billing/invoices'&&method==='POST') {emitted=true;return Response.json({id:9901,tipoComprobante:'cierre_habitacion',puntoVenta:1,numero:9901,montoTotal:'100.00',paymentId:'cc-settlement',cae:null},{status:201});}
  if(path.endsWith('/check-out')&&method==='POST')return Response.json({ok:true});
  return Response.json([]);
 });
 vi.stubGlobal('fetch',fetcher); vi.stubGlobal('open',vi.fn());
 const done=vi.fn();
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><PrefacturaDialog open onClose={vi.fn()} reservationId="nf-cc-room" reservation={{id:'nf-cc-room',guestId:'nf-cc-guest',status:'checked_in',checkOutDate:new Date().toISOString().slice(0,10),guest:{id:'nf-cc-guest',firstName:'Cliente',lastName:'Prueba',vatCondition:'consumidor_final'},room:{roomNumber:'202'}} as any} mode="checkout" onCheckoutComplete={done}/></QueryClientProvider>);
 await user.click(await screen.findByTestId('select-receipt-type'));
 await user.click(screen.getByRole('option',{name:'Cierre de habitación (no fiscal)'}));
 await user.click(screen.getByTestId('select-sale-condition'));
 await user.click(screen.getByRole('option',{name:'Cuenta Corriente'}));
 await user.click(screen.getByTestId('button-registrar-emitir'));
 await screen.findByRole('heading',{name:'Check-out con deuda en cuenta corriente'});
 expect(emitted).toBe(false);
 await user.click(screen.getByRole('button',{name:'Volver a revisar'}));
 expect(emitted).toBe(false);
 await user.click(screen.getByTestId('button-registrar-emitir'));
 await user.click(await screen.findByTestId('confirm-account-checkout'));
 await waitFor(()=>expect(done).toHaveBeenCalledOnce());
 const posts=fetcher.mock.calls.filter(([,o])=>o?.method==='POST');
 const invoice=posts.find(([url])=>url==='/api/billing/invoices');
 expect(JSON.parse(String(invoice?.[1]?.body))).toMatchObject({tipoComprobante:'cierre_habitacion',reservationSettlementMethod:'cuenta_corriente',ccEntityType:'guest',ccEntityId:'nf-cc-guest',cashFormaPago:'cuenta_corriente'});
 expect(posts.filter(([url])=>url==='/api/payments')).toHaveLength(0);
 expect(posts.filter(([url])=>String(url).endsWith('/check-out'))).toHaveLength(1);
});

import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { queryClient } from '@/lib/queryClient';
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:vi.fn()})}));
import { PrefacturaDialog, suggestTipo } from './PrefacturaDialog';
const reservation:any={id:'exempt-recovery',status:'checked_in',guest:{id:'g',firstName:'Prueba',lastName:'Exento'},room:{roomNumber:'307'},checkInDate:'2026-10-31',checkOutDate:'2026-11-01',nights:1};
const op='282ba3fa-fc24-472e-b628-7b09a5ec84c7';
let fail=false;
beforeEach(()=>{
 queryClient.clear();sessionStorage.clear();fail=false;
 sessionStorage.setItem('prefactura-pending:'+reservation.id,JSON.stringify({invoiceRequest:{tipoComprobante:'FA',creditOperationId:op,sourceChargeIds:['accommodation'],puntoVentaOverride:5,cliente:{razonSocial:'Institución',cuit:'30545515926',condicionIva:'Exento'}},invoice:null,payments:[{amount:'531600',method:'tarjeta_credito',paymentRequestId:'original'}],checkoutRequested:true}));
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input),json=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json'}});
  if(url.endsWith('/correct-exempt-rejection'))return fail?json({error:'ARCA informa un comprobante autorizado.'},409):json({discarded:true,correctedCompanyId:'company'});
  if(url.endsWith('/folio'))return json({roomNumber:'307',guestName:'Prueba Exento',roomTotal:531600,charges:[],payments:[],totalPayments:0,totalCharges:0,grandTotal:531600,balance:531600,nights:1});
  if(url.endsWith('/transfer-remaining'))return json({accommodation:531600,charges:{}});
  return json(url.endsWith('/api/billing/config')?{puntoVenta:5,arcaAmbiente:'produccion'}:[]);
 }));
});
afterEach(()=>{cleanup();queryClient.clear();sessionStorage.clear();vi.unstubAllGlobals();});
function mount(){render(<QueryClientProvider client={queryClient}><PrefacturaDialog open onClose={vi.fn()} reservationId={reservation.id} reservation={reservation} mode="checkout" /></QueryClientProvider>);}
it('suggests B for an exempt recipient, preserving the separate RI behavior',()=>{
 expect(suggestTipo('30545515926','Exento')).toBe('FB');expect(suggestTipo('30545515926','Responsable Inscripto')).toBe('FA');
});
it('only verifies/discards the rejected attempt and leaves B for a new review, without issuing or collecting',async()=>{
 mount();await waitFor(()=>expect(screen.getByTestId('button-correct-exempt-rejection')).toBeEnabled());await userEvent.click(screen.getByTestId('button-correct-exempt-rejection'));
 await waitFor(()=>expect(screen.queryByTestId('button-retry-prefactura')).not.toBeInTheDocument());
 expect(sessionStorage.getItem('prefactura-pending:'+reservation.id)).toBeNull();
 const posts=(fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([,i])=>i?.method==='POST');
 expect(posts).toHaveLength(1);expect(String(posts[0][0])).toContain('/'+op+'/correct-exempt-rejection');
 expect(screen.getAllByText('$531.600,00').length).toBeGreaterThan(0);
 expect(await screen.findByDisplayValue('Exento')).toBeInTheDocument();
 expect(screen.getByDisplayValue('30545515926')).toBeInTheDocument();
 expect(screen.getByTestId('select-payment-method-0')).toHaveTextContent('Tarjeta Crédito');
});
it('keeps the exact pending invoice/payment intent when ARCA does not prove a rejection',async()=>{
 fail=true;const original=sessionStorage.getItem('prefactura-pending:'+reservation.id);mount();
 await waitFor(()=>expect(screen.getByTestId('button-correct-exempt-rejection')).toBeEnabled());await userEvent.click(screen.getByTestId('button-correct-exempt-rejection'));
 await screen.findByText('ARCA informa un comprobante autorizado.');
 expect(sessionStorage.getItem('prefactura-pending:'+reservation.id)).toBe(original);
 expect(screen.getByTestId('button-retry-prefactura')).toBeInTheDocument();
});

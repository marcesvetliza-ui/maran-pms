import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { queryClient } from '@/lib/queryClient';
const state=vi.hoisted(()=>({toast:vi.fn(),role:'reception'}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:state.toast,toasts:[],dismiss:vi.fn()})}));
vi.mock('@/App',()=>({useAuth:()=>({user:{role:state.role}})}));
import { PrefacturaDialog } from './PrefacturaDialog';
const reservation={id:'checkout-actions',reservationCode:'CHECKOUT',status:'checked_in',checkInDate:'2026-11-01',checkOutDate:'2026-11-02',nights:1,totalRoomAmount:'85.00',numberOfGuests:1,guest:{id:'g',firstName:'Prueba',lastName:'Acciones'},room:{id:'room',roomNumber:'202',roomType:{name:'Ejecutiva'}}};
let charge:any,fail:boolean,voided:boolean;
beforeEach(()=>{
 queryClient.clear();state.toast.mockClear();state.role='reception';fail=false;voided=false;
 charge={id:'restaurant-charge',description:'Restaurante - Pedido ORD-PRUEBA',amount:'2500.00',category:'restaurant',date:'2026-11-01',status:'active'};
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input),json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
  if(url==='/api/charges/restaurant-charge/anular'&&init?.method==='PATCH'){
   if(fail)return json({error:'El cargo ya tiene un comprobante asociado.'},409);
   voided=true;return json({...charge,status:'anulado',roomOnly:true});
  }
  if(url.endsWith('/manual-charge-actions'))return json({charges:[{...charge,eligible:false,canEdit:false,reason:'El origen del cargo no corresponde a un extra manual editable.'}]});
  if(url.endsWith('/folio'))return json({...reservation,guestName:'Prueba Acciones',roomNumber:'202',roomTotal:85,charges:voided?[]:[charge],payments:[],totalPayments:0,totalCharges:voided?0:2500,grandTotal:voided?85:2585,balance:voided?85:2585});
  if(url.endsWith('/transfer-remaining'))return json({accommodation:85,charges:voided?{}:{'restaurant-charge':2500}});
  if(url===`/api/reservations/${reservation.id}`)return json(reservation);
  return json(url.endsWith('/api/billing/config')?{puntoVenta:1,arcaAmbiente:'ficticio'}:[]);
 }));
});
afterEach(()=>{cleanup();queryClient.clear();vi.unstubAllGlobals();vi.restoreAllMocks();});
async function open(){
 render(<QueryClientProvider client={queryClient}><PrefacturaDialog reservationId={reservation.id} reservation={reservation as any} open onClose={vi.fn()} mode="checkout"/></QueryClientProvider>);
 const user=userEvent.setup();await user.click(await screen.findByRole('button',{name:/Cargos de la habitación/}));return user;
}
it('allows cancelling a restaurant room imputation from checkout with a required reason and refreshes the invoice selection',async()=>{
 const invalidate=vi.spyOn(queryClient,'invalidateQueries'),user=await open();
 await user.click(await screen.findByTestId('button-void-prefactura-charge-restaurant-charge'));
 expect(screen.getByRole('button',{name:'Confirmar anulación'})).toBeDisabled();
 expect(screen.getByText(/El pedido, los consumos y la caja de Restaurante se conservan/)).toBeInTheDocument();
 await user.type(screen.getByLabelText('Motivo obligatorio'),'Cargo en habitación equivocada');await user.click(screen.getByRole('button',{name:'Confirmar anulación'}));
 await waitFor(()=>expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({title:'Cargo anulado'})));
 await waitFor(()=>expect(screen.queryByText(charge.description)).not.toBeInTheDocument());
 expect(screen.getAllByText('$85,00').length).toBeGreaterThan(0);
 const requests=(fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([url,init])=>String(url).endsWith('/anular')&&init?.method==='PATCH');
 expect(requests).toHaveLength(1);expect(JSON.parse(String(requests[0][1]?.body))).toEqual({motivoAnulacion:'Cargo en habitación equivocada',expectedDescription:charge.description,expectedAmount:'2500.00'});
 for(const key of ['/api/dashboard/departures','/api/rooms/in-house','/api/planning'])expect(invalidate).toHaveBeenCalledWith({queryKey:[key]});
});
it('retains the reason and balance when the server rejects cancellation',async()=>{
 fail=true;const user=await open();await user.click(await screen.findByTestId('button-void-prefactura-charge-restaurant-charge'));
 await user.type(screen.getByLabelText('Motivo obligatorio'),'Revisar cargo');await user.click(screen.getByRole('button',{name:'Confirmar anulación'}));
 await waitFor(()=>expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({description:'El cargo ya tiene un comprobante asociado.',variant:'destructive'})));
 expect(screen.getByLabelText('Motivo obligatorio')).toHaveValue('Revisar cargo');expect(voided).toBe(false);
});
it('provides a working description-only pencil for restaurant sources without changing the original consumption',async()=>{
 const user=await open();await user.click(await screen.findByTestId('button-edit-charge-description-restaurant-charge'));
 expect(screen.getByDisplayValue(charge.description)).toBeInTheDocument();
 expect(screen.queryByLabelText('Importe total')).not.toBeInTheDocument();
 expect((fetch as ReturnType<typeof vi.fn>).mock.calls.some(([,init])=>init?.method==='PATCH')).toBe(false);
});
it.each(['restaurant','housekeeping'])('does not offer cancellation to %s',async role=>{
 state.role=role;await open();expect(await screen.findByText(charge.description)).toBeInTheDocument();expect(screen.queryByTestId('button-void-prefactura-charge-restaurant-charge')).not.toBeInTheDocument();
});

it('allows Reception Head restaurant cancellation without extending the permission to manual charges',async()=>{
 state.role='jefe_recepcion';charge.category='otros';await open();
 expect(await screen.findByText(charge.description)).toBeInTheDocument();
 expect(screen.queryByTestId('button-void-prefactura-charge-restaurant-charge')).not.toBeInTheDocument();
});

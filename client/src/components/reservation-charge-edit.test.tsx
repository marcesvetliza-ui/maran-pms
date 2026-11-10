import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { queryClient } from '@/lib/queryClient';
const { toast }=vi.hoisted(()=>({toast:vi.fn()}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast,toasts:[],dismiss:vi.fn()})}));
import { ReservationDetailDialog } from '@/pages/reservations';
import { PrefacturaDialog } from '@/components/PrefacturaDialog';
const reservation={id:'edit-res',reservationCode:'EDIT',status:'checked_in',checkInDate:'2026-11-01',checkOutDate:'2026-11-02',nights:1,totalRoomAmount:'85.00',numberOfGuests:2,guest:{id:'g',firstName:'Prueba',lastName:'Edición'},room:{id:'room',roomNumber:'202',roomType:{name:'Ejecutiva'}}};
let charge:any, fail:boolean, eligible:boolean;
beforeEach(()=>{
 queryClient.clear();fail=false;eligible=true;charge={id:'parking',description:'Cochera',amount:'2500.00',category:'otros',date:'2026-11-01',status:'active'};
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
  if(url.endsWith('/manual-charges/parking')&&init?.method==='PATCH'){
   if(fail)return json({error:'El cargo cambió desde que se abrió.'},409);
   const body=JSON.parse(String(init.body));charge={...charge,description:body.description,amount:body.amount};return json(charge);
  }
  if(url.endsWith('/manual-charge-actions'))return json({charges:[{...charge,eligible,reason:eligible?undefined:'El cargo tiene comprobantes asociados.'}]});
  if(url===`/api/reservations/${reservation.id}`)return json(reservation);
  if(url.endsWith('/charges?includeAnulados=true'))return json([charge]);
  if(url.endsWith('/folio'))return json({...reservation,guestName:'Prueba Edición',roomNumber:'202',roomTotal:85,charges:[charge],payments:[],totalPayments:0,totalCharges:Number(charge.amount),grandTotal:85+Number(charge.amount),balance:85+Number(charge.amount)});
  if(url.endsWith('/transfer-remaining'))return json({accommodation:85,charges:{parking:Number(charge.amount)}});
  return json(url.endsWith('/api/billing/config')?{puntoVenta:1,arcaAmbiente:'ficticio'}:[]);
 }));
});
afterEach(()=>{cleanup();queryClient.clear();vi.unstubAllGlobals();});
async function open(view:'folio'|'checkout'){
 const user=userEvent.setup();
 render(<QueryClientProvider client={queryClient}>{view==='folio'?<ReservationDetailDialog reservation={reservation as any} open onOpenChange={vi.fn()} onCancel={vi.fn()}/>:<PrefacturaDialog reservationId={reservation.id} reservation={reservation as any} open onClose={vi.fn()} mode="checkout"/>}</QueryClientProvider>);
 if(view==='folio')await user.click(await screen.findByTestId('tab-folio'));
 else await user.click(await screen.findByRole('button',{name:/Cargos de la habitación/}));
 await waitFor(()=>expect(screen.getByTestId('button-edit-charge-parking')).toBeEnabled());
 await user.click(screen.getByTestId('button-edit-charge-parking'));return user;
}
it.each(['folio','checkout'] as const)('persists description/amount and refreshes totals from %s',async(view)=>{
 const user=await open(view);
 const description=screen.getByLabelText('Descripción'),amount=screen.getByLabelText('Importe total');
 await user.clear(description);await user.type(description,'Cochera acordada');await user.clear(amount);await user.type(amount,'2000,50');
 expect(screen.getByRole('button',{name:'Guardar cargo'})).toBeDisabled();
 await user.type(screen.getByLabelText('Motivo del cambio'),'Corrección de importe');await user.click(screen.getByRole('button',{name:'Guardar cargo'}));
 await waitFor(()=>expect(toast).toHaveBeenCalledWith(expect.objectContaining({title:'Cargo actualizado'})));
 expect(screen.queryByRole('heading',{name:'Editar cargo'})).not.toBeInTheDocument();
 const patch=(fetch as ReturnType<typeof vi.fn>).mock.calls.find(([url,init])=>String(url).endsWith('/manual-charges/parking')&&init?.method==='PATCH');
 expect(JSON.parse(String(patch?.[1]?.body))).toEqual({description:'Cochera acordada',amount:'2000.50',motivo:'Corrección de importe',expectedDescription:'Cochera',expectedAmount:'2500.00'});
 await waitFor(()=>expect(screen.getAllByText(/Cochera acordada/).length).toBeGreaterThan(0));
 if(view==='folio')expect(screen.getByTestId('text-balance')).toHaveTextContent('2.085,50');
 else expect(screen.getAllByText('$2.085,50').length).toBeGreaterThan(0);
});
it('retains unsaved input on a server conflict',async()=>{
 fail=true;const user=await open('folio');await user.type(screen.getByLabelText('Motivo del cambio'),'Corrección');await user.click(screen.getByRole('button',{name:'Guardar cargo'}));
 await waitFor(()=>expect(toast).toHaveBeenCalledWith(expect.objectContaining({description:'El cargo cambió desde que se abrió.',variant:'destructive'})));
 expect(screen.getByLabelText('Motivo del cambio')).toHaveValue('Corrección');expect(charge.amount).toBe('2500.00');
});
it('disables the pencil when server fiscal/source checks reject editing',async()=>{
 eligible=false;
 render(<QueryClientProvider client={queryClient}><ReservationDetailDialog reservation={reservation as any} open onOpenChange={vi.fn()} onCancel={vi.fn()}/></QueryClientProvider>);
 await userEvent.setup().click(await screen.findByTestId('tab-folio'));
 await waitFor(()=>expect(screen.getByTestId('button-edit-charge-parking')).toHaveAttribute('title','El cargo tiene comprobantes asociados.'));
 expect(screen.getByTestId('button-edit-charge-parking')).toBeDisabled();
});

it.each(['folio','checkout'] as const)('edits a Restaurant imputation from %s with its scope explained',async view=>{
 charge={...charge,category:'restaurant',description:'CONSUMOS JUSTO RESTAURANT',roomOnly:true};
 const user=await open(view);
 expect(screen.getByText(/Se corrige el cargo a la habitación/)).toBeInTheDocument();
 await user.clear(screen.getByLabelText('Importe total'));await user.type(screen.getByLabelText('Importe total'),'1500');
 await user.type(screen.getByLabelText('Motivo del cambio'),'Consumo cargado de más');
 await user.click(screen.getByRole('button',{name:'Guardar cargo'}));
 await waitFor(()=>expect(charge.amount).toBe('1500'));
});

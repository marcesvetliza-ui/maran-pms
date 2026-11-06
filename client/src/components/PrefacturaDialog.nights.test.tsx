import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup,render,screen,waitFor,within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach,afterEach,it,expect,vi } from 'vitest';
import { queryClient } from '@/lib/queryClient';
import { PrefacturaDialog,getAllBillableFolioItems,getSelectedFolioItems,getRemainingChargeAmounts } from './PrefacturaDialog';
vi.mock('@/App',()=>({useAuth:()=>({user:{role:'admin'}})}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:vi.fn()})}));
let amount:number,total:number,revision:number,calls:any[],fail:boolean,extras:any[];
const dates=['2026-11-01','2026-11-02'];
const reservation={id:'night-case',reservationCode:'NIGHT',status:'checked_in',checkInDate:dates[0],checkOutDate:'2026-11-03',nights:2,guest:{firstName:'Prueba',lastName:'Noches'},room:{roomNumber:'403'}};
function folio(){return {...reservation,roomNumber:'403',roomTotal:total,pricingRevision:revision,accommodationNights:[{id:`accommodation:${dates[0]}`,date:dates[0],amount,derived:false},{id:`accommodation:${dates[1]}`,date:dates[1],amount:200,derived:false}],charges:extras,payments:[],totalPayments:0,totalCharges:0,grandTotal:total,balance:total};}
beforeEach(()=>{
 queryClient.clear();amount=100;total=300;revision=0;calls=[];fail=false;extras=[];
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
 const url=String(input),json=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
 if(url.endsWith('/accommodation-night')){const body=JSON.parse(String(init?.body));calls.push(body);if(fail)return json({error:'La noche tiene cobertura fiscal.'},409);amount=Number(body.amount);total=amount+200;revision++;return json({...reservation,totalRoomAmount:String(total),pricingRevision:revision});}
 if(url.endsWith('/folio'))return json(folio());
 if(url==='/api/reservation-edit-permission')return json({canEdit:true});
 if(url.endsWith('/transfer-remaining'))return json({accommodation:total,charges:{}});
 if(url==='/api/billing/config')return json({puntoVenta:1,arcaAmbiente:'ficticio'});
 if(url===`/api/reservations/${reservation.id}`)return json(reservation);
 return json([]);
 }));
});
afterEach(()=>{cleanup();queryClient.clear();vi.unstubAllGlobals();});
it('selects nights separately using their saved unequal values and reserves previous grouped coverage',()=>{
 const f=folio() as any;
 expect(getAllBillableFolioItems(f).map(i=>i.amount)).toEqual([100,200]);
 expect(getSelectedFolioItems(new Set([`accommodation:${dates[1]}`]),f)).toMatchObject([{id:`accommodation:${dates[1]}`,amount:200}]);
 expect(getRemainingChargeAmounts(getAllBillableFolioItems(f),{accommodation:150})).toEqual({[`accommodation:${dates[0]}`]:0,[`accommodation:${dates[1]}`]:150});
});
it('edits a dated amount with a reason and reloads the folio total without posting an invoice or payment',async()=>{
 render(<QueryClientProvider client={queryClient}><PrefacturaDialog reservationId={reservation.id} reservation={reservation as any} open mode="checkout" onClose={vi.fn()}/></QueryClientProvider>);
 const user=userEvent.setup();await user.click(await screen.findByRole('button',{name:/Cargos de la habitación/}));
 const first=await screen.findByText(/Alojamiento Hab. 403 · noche 01\/11\/2026/);
 const row=first.closest('tr')!;expect(within(row).getByRole('checkbox')).toBeChecked();
 const second=screen.getByText(/Alojamiento Hab. 403 · noche 02\/11\/2026/).closest('tr')!;
 await user.click(within(second).getByRole('checkbox'));expect(within(second).getByRole('checkbox')).not.toBeChecked();expect(within(row).getByRole('checkbox')).toBeChecked();
 await user.click(await screen.findByRole('button',{name:'Editar importe de la noche 01/11/2026'}));
 const input=screen.getByLabelText('Importe de la noche');await user.clear(input);await user.type(input,'125,50');await user.type(screen.getByLabelText('Motivo del cambio'),'Tarifa acordada con huésped');await user.click(screen.getByRole('button',{name:'Guardar noche'}));
 await waitFor(()=>expect(calls).toHaveLength(1));
 expect(calls[0]).toMatchObject({date:'2026-11-01',amount:'125.50',expectedAmount:100,expectedTotal:300,revision:0,reason:'Tarifa acordada con huésped'});
 await waitFor(()=>expect(screen.queryByRole('button',{name:'Guardar noche'})).not.toBeInTheDocument());expect(total).toBe(325.5);
 const writes=(vi.mocked(fetch).mock.calls).filter(([,init])=>init?.method&&init.method!=='GET');expect(writes).toHaveLength(1);
});

it('renders and selects each parking unit independently without changing the original charge',async()=>{
 extras=[{id:'parking',description:'Cochera (x2)',amount:'15000',category:'otros',date:'2026-11-06',status:'active'}];
 const f=folio() as any,items=getAllBillableFolioItems(f);
 expect(items.slice(-2).map(i=>i.amount)).toEqual([7500,7500]);
 expect(getSelectedFolioItems(new Set(['charge-unit:parking:2']),f)).toMatchObject([{id:'charge-unit:parking:2',amount:7500}]);
 expect(getRemainingChargeAmounts(items,{parking:7500})['charge-unit:parking:1']).toBe(0);
 expect(getRemainingChargeAmounts(items,{parking:7500})['charge-unit:parking:2']).toBe(7500);
 render(<QueryClientProvider client={queryClient}><PrefacturaDialog reservationId={reservation.id} reservation={reservation as any} open mode="checkout" onClose={vi.fn()}/></QueryClientProvider>);
 const user=userEvent.setup();await user.click(await screen.findByRole('button',{name:/Cargos de la habitación/}));
 const first=(await screen.findByText('Cochera · unidad 1 de 2')).closest('tr')!;
 const second=screen.getByText('Cochera · unidad 2 de 2').closest('tr')!;
 expect(within(first).getByRole('checkbox')).toBeChecked();expect(within(second).getByRole('checkbox')).toBeChecked();
 await user.click(within(first).getByRole('checkbox'));
 expect(within(first).getByRole('checkbox')).not.toBeChecked();expect(within(second).getByRole('checkbox')).toBeChecked();
 expect(extras[0].amount).toBe('15000');expect(vi.mocked(fetch).mock.calls.filter(([,init])=>init?.method&&init.method!=='GET')).toHaveLength(0);
});

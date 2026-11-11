import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {QueryClientProvider} from '@tanstack/react-query';
import {queryClient} from '@/lib/queryClient';
const {toast}=vi.hoisted(()=>({toast:vi.fn()}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast})}));
vi.mock('@/App',()=>({useAuth:()=>({user:{id:'admin',role:'admin'}})}));
vi.mock('@/components/entity-selector',async original=>({...await original<any>(),GuestSelector:()=> <span>Huésped de prueba</span>}));
import {ReservationFormDialog} from './reservations';
const guest:any={id:'guest',firstName:'María',lastName:'Prueba'};
const room:any={id:'room',roomNumber:'202',roomTypeId:'type',status:'available'};
const original:any={id:'rate-edit',guestId:guest.id,guest,roomId:room.id,room,roomTypeId:'type',ratePlanId:'plan',reservationCode:'RES-EDIT',status:'confirmed',checkInDate:'2026-11-02',checkOutDate:'2026-11-03',numberOfGuests:1,nights:1,pricingScheme:'nightly_v1',pricingRevision:1,nightlyPricing:[{date:'2026-11-02',rateCents:8500,discountCents:0}],baseRatePerNight:'85.00',finalRatePerNight:'85.00',totalRoomAmount:'85.00',discountType:'none',discountValue:'0',notes:'Nota original'};
let saved:any,allowed:boolean,blocked:string|null,conflict:boolean;
const onClose=vi.fn();
beforeEach(()=>{
 queryClient.clear();toast.mockReset();onClose.mockReset();saved={...original};allowed=true;blocked=null;conflict=false;
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const path=String(input),method=init?.method||'GET';
  const json=(data:any,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
  if(path.endsWith('/api/reservation-edit-permission'))return json({canEdit:allowed});
  if(path.endsWith('/nightly-pricing'))return json({reservation:saved,blocked,fiscal:{state:'pendiente',coveredCents:0,pendingCents:8500}});
  if(path.endsWith('/api/packages/active'))return json([{id:'pkg',name:'Nuevo',nights:1,status:'active'}]);
  if(path.endsWith('/nightly-pricing/preview'))return json(JSON.parse(String(init?.body)).edit.kind==='package'?{revision:1,previousTotalCents:8500,newTotalCents:9000000,differenceCents:8991500,checkIn:original.checkInDate,checkOut:original.checkOutDate,packageProposal:{packageTotalCents:9000000}}:{newTotalCents:9000000});
  if(path.endsWith('/nightly-pricing/apply')){
   if(conflict)return json({error:'Otra persona modificó los precios.'},409);
   saved={...saved,...(JSON.parse(String(init?.body)).edit.kind==='package'?{ratePlanId:null,notes:'[Paquete: Nuevo] Nota original'}:{}),pricingRevision:2,nightlyPricing:[{date:'2026-11-02',rateCents:9000000,discountCents:0}],baseRatePerNight:'90000.00',finalRatePerNight:'90000.00',totalRoomAmount:'90000.00'};return json(saved);
  }
  if(path.endsWith('/api/reservations/rate-edit') && method==='PATCH')return json({...saved,...JSON.parse(String(init?.body))});
  if(path.endsWith('/api/rate-plans'))return json([{id:'plan',name:'BAR',roomTypeId:'type',baseRate:'85.00',rate1pax:'85.00',isActive:true}]);
  return json([]);
 }));
});
afterEach(()=>{cleanup();queryClient.clear();vi.unstubAllGlobals();});
function mount(){render(<QueryClientProvider client={queryClient}><ReservationFormDialog reservation={original} guests={[guest]} rooms={[room]} roomTypes={[{id:'type',name:'Ejecutiva'} as any]} open onOpenChange={onClose} onSuccess={vi.fn()}/></QueryClientProvider>);}
function writes(){return vi.mocked(fetch).mock.calls.filter(([,init])=>['POST','PATCH','DELETE'].includes(init?.method||''));}
async function openEditor(){await waitFor(()=>expect(screen.getByTestId('button-edit-reservation-rates')).toBeEnabled());fireEvent.click(screen.getByTestId('button-edit-reservation-rates'));return screen.findByRole('dialog',{name:'Editar 1 noche'});}
async function proposal(){fireEvent.change(screen.getByLabelText('Nueva tarifa común'),{target:{value:'90000'}});fireEvent.change(screen.getByLabelText('Motivo del cambio'),{target:{value:'Corrección de tarifa acordada'}});fireEvent.click(screen.getByRole('button',{name:'Revisar propuesta'}));await screen.findByText(/Propuesta validada por el servidor/);}
it('opens the existing rate editor without submitting the general form and cancels without writes',async()=>{
 mount();fireEvent.change(screen.getByTestId('input-reservation-notes'),{target:{value:'Nota sin guardar'}});
 const editor=await openEditor();expect(writes()).toHaveLength(0);
 fireEvent.click(within(editor).getByRole('button',{name:'Cancelar · Sin cambios'}));
 expect(screen.getByTestId('input-reservation-notes')).toHaveValue('Nota sin guardar');expect(writes()).toHaveLength(0);expect(onClose).not.toHaveBeenCalled();
});
it('applies pricing with the existing preview/revision/reason contract, preserves unsaved notes and excludes prices from general PATCH',async()=>{
 mount();fireEvent.change(screen.getByTestId('input-reservation-notes'),{target:{value:'Nota sin guardar'}});await openEditor();await proposal();
 expect(writes()).toHaveLength(1);expect(String(writes()[0][0])).toMatch(/nightly-pricing\/preview$/);
 fireEvent.click(screen.getByRole('button',{name:'Confirmar cambios'}));
 await waitFor(()=>expect(screen.queryByRole('dialog',{name:'Editar 1 noche'})).not.toBeInTheDocument());
 expect(screen.getByTestId('input-reservation-notes')).toHaveValue('Nota sin guardar');
 expect(within(screen.getByRole('complementary',{name:'Resumen de la reserva'})).getByText(/90\.000,00/)).toBeInTheDocument();
 expect(onClose).not.toHaveBeenCalled();
 const apply=writes().find(([path])=>String(path).endsWith('/nightly-pricing/apply'))!;
 expect(JSON.parse(String(apply[1]?.body))).toMatchObject({revision:1,reason:'Corrección de tarifa acordada',edit:{kind:'rates',dates:['2026-11-02'],rate:'90000'}});
 fireEvent.click(screen.getByTestId('button-submit-reservation'));
 await waitFor(()=>expect(writes().some(([,init])=>init?.method==='PATCH')).toBe(true));
 const patch=JSON.parse(String(writes().find(([,init])=>init?.method==='PATCH')![1]?.body));
 expect(patch.notes).toBe('Nota sin guardar');
 for(const key of ['baseRatePerNight','finalRatePerNight','totalRoomAmount','nightlyPricing','pricingRevision','checkInDate','checkOutDate','nights'])expect(patch).not.toHaveProperty(key);
 expect(writes().every(([path])=>!String(path).includes('/payments'))).toBe(true);
});
it('keeps the fiscal block enforced by the same editor without issuing a mutation',async()=>{
 blocked='El alojamiento tiene cobertura fiscal.';mount();
 await waitFor(()=>expect(screen.getByTestId('button-edit-reservation-rates')).toBeEnabled());
 // Wait for the independent lodging query before invoking its imperative action.
 await waitFor(()=>expect(vi.mocked(fetch).mock.calls.some(([path])=>String(path).endsWith('/nightly-pricing'))).toBe(true));
 fireEvent.click(screen.getByTestId('button-edit-reservation-rates'));
 expect(screen.queryByRole('dialog',{name:'Editar 1 noche'})).not.toBeInTheDocument();
 expect(toast).toHaveBeenCalledWith(expect.objectContaining({description:blocked}));expect(writes()).toHaveLength(0);
});
it('keeps editing disabled when the operator has no individual permission',async()=>{
 allowed=false;mount();await screen.findByText(/Tarifas y noches en sólo lectura/);
 expect(screen.getByTestId('button-edit-reservation-rates')).toBeDisabled();expect(writes()).toHaveLength(0);
});
it('preserves the draft when the server rejects an outdated pricing revision',async()=>{
 conflict=true;mount();fireEvent.change(screen.getByTestId('input-reservation-notes'),{target:{value:'Conservar nota'}});await openEditor();await proposal();
 fireEvent.click(screen.getByRole('button',{name:'Confirmar cambios'}));
 await screen.findByText(/Otra persona modificó los precios/);
 expect(screen.getByRole('dialog',{name:'Editar 1 noche'})).toBeInTheDocument();
 expect(onClose).not.toHaveBeenCalled();expect(writes().filter(([,init])=>init?.method==='PATCH')).toHaveLength(0);
});

it('applies a package through the revisioned editor, keeps unsaved notes and does not restore the previous plan',async()=>{
 mount();fireEvent.change(screen.getByTestId('input-reservation-notes'),{target:{value:'Nota sin guardar'}});
 await waitFor(()=>expect(screen.getByRole('button',{name:'Aplicar paquete'})).toBeEnabled());
 fireEvent.click(screen.getByRole('button',{name:'Aplicar paquete'}));
 const dialog=await screen.findByRole('dialog',{name:'Aplicar paquete a la reserva'});
 await waitFor(()=>expect(within(dialog).getByRole('option',{name:'Nuevo · 1 noche(s)'})).toBeInTheDocument());
 fireEvent.change(within(dialog).getByLabelText('Paquete a aplicar'),{target:{value:'pkg'}});
 fireEvent.change(within(dialog).getByLabelText('Motivo del paquete'),{target:{value:'Corregir a paquete'}});
 await waitFor(()=>expect(within(dialog).getByRole('button',{name:'Revisar importe'})).toBeEnabled());
 fireEvent.click(within(dialog).getByRole('button',{name:'Revisar importe'}));
 fireEvent.click(await within(dialog).findByRole('button',{name:'Confirmar paquete'}));
 await waitFor(()=>expect(screen.queryByRole('dialog',{name:'Aplicar paquete a la reserva'})).not.toBeInTheDocument());
 expect(screen.getByTestId('input-reservation-notes')).toHaveValue('[Paquete: Nuevo] Nota sin guardar');
 fireEvent.click(screen.getByTestId('button-submit-reservation'));
 await waitFor(()=>expect(writes().some(([,init])=>init?.method==='PATCH')).toBe(true));
 const patch=JSON.parse(String(writes().find(([,init])=>init?.method==='PATCH')![1]?.body));
 expect(patch.ratePlanId).not.toBe('plan');expect(patch.notes).toBe('[Paquete: Nuevo] Nota sin guardar');expect(patch).not.toHaveProperty('totalRoomAmount');
});

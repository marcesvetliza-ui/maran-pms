import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GroupAssignmentReleaseDialog } from './group-assignment-release-dialog';
const {apiRequest}=vi.hoisted(()=>({apiRequest:vi.fn()}));
vi.mock('@/lib/queryClient',async()=>({...await vi.importActual<any>('@/lib/queryClient'),apiRequest}));
let facts:any;
const reservation={id:'res',reservationCode:'GRP-1',room:{roomNumber:'201'}} as any;
function setup(){
 const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
 const onReleased=vi.fn();
 render(<QueryClientProvider client={client}><GroupAssignmentReleaseDialog groupId="group" reservation={reservation} onClose={vi.fn()} onReleased={onReleased}/></QueryClientProvider>);
 return {user:userEvent.setup(),onReleased};
}
beforeEach(()=>{
 vi.clearAllMocks();facts={fingerprint:'snapshot',blockers:[],canRelease:true,groupAdvance:30,personalAdvance:40,availableAdvance:70};
 apiRequest.mockImplementation(async(method:string)=>({json:async()=>method==='GET'?facts:{replacementId:'new',availableAdvance:70}}));
});
describe('Liberar asignación conservando cupo',()=>{
 it('muestra el dinero disponible y exige motivo y consentimiento antes de trasladar un anticipo personal',async()=>{
  const {user,onReleased}=setup();
  await screen.findByText(/Personales, sujetos a tu confirmación/);
  const confirm=screen.getByRole('button',{name:'Liberar y conservar cupo'});expect(confirm).toBeDisabled();
  await user.type(screen.getByRole('textbox',{name:'Motivo de liberación'}),'El pasajero no viene');expect(confirm).toBeDisabled();
  await user.click(screen.getByRole('checkbox'));await user.click(confirm);
  await waitFor(()=>expect(onReleased).toHaveBeenCalledOnce());
  expect(apiRequest).toHaveBeenCalledWith('POST','/api/groups/group/reservations/res/release-assignment',expect.objectContaining({reason:'El pasajero no viene',fingerprint:'snapshot',transferPersonalAdvances:true,operationId:expect.any(String)}));
 });
 it('muestra qué operación requiere revisión y no ofrece una confirmación habilitada',async()=>{
  facts={...facts,canRelease:false,blockers:['Hay consumos pendientes de conciliación.']};const{user}=setup();
  expect(await screen.findByRole('alert')).toHaveTextContent('Hay consumos pendientes');
  await user.click(screen.getByRole('button',{name:'Liberar y conservar cupo'}));
  expect(apiRequest.mock.calls.filter(([method])=>method==='POST')).toHaveLength(0);
 });
 it('conserva la identidad del intento ante una respuesta incierta para que reintentar no libere otro cupo ni otro anticipo',async()=>{
  facts={...facts,personalAdvance:0};let tries=0;
  apiRequest.mockImplementation(async method=>{if(method==='POST'&&++tries===1)throw new Error('503: {"error":"Respuesta no confirmada"}');return{json:async()=>method==='GET'?facts:{replacementId:'new'}};});
  const {user,onReleased}=setup();await screen.findByRole('textbox',{name:'Motivo de liberación'});
  await user.type(screen.getByRole('textbox',{name:'Motivo de liberación'}),'Reasignar el cupo');await user.click(screen.getByRole('button',{name:'Liberar y conservar cupo'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Reintentá la misma operación');expect(screen.getByRole('textbox')).toBeDisabled();
  await user.click(screen.getByRole('button',{name:'Reintentar misma operación'}));await waitFor(()=>expect(onReleased).toHaveBeenCalledOnce());
  const calls=apiRequest.mock.calls.filter(([method])=>method==='POST');expect(calls).toHaveLength(2);expect(calls[1][2]).toEqual(calls[0][2]);
 });
 it('conserva el motivo y actualiza una vista previa que quedó desactualizada',async()=>{
  facts={...facts,personalAdvance:0};let tries=0;
  apiRequest.mockImplementation(async method=>{
   if(method==='POST'&&++tries===1){facts={...facts,fingerprint:'new-snapshot'};throw new Error('409: {"error":"La reserva cambió"}');}
   return{json:async()=>method==='GET'?facts:{replacementId:'new'}};
  });
  const{user,onReleased}=setup();await screen.findByRole('textbox',{name:'Motivo de liberación'});await user.type(screen.getByRole('textbox'),'No viene');await user.click(screen.getByRole('button',{name:'Liberar y conservar cupo'}));
  await waitFor(()=>expect(apiRequest.mock.calls.filter(([method])=>method==='GET')).toHaveLength(2));
  expect(screen.getByRole('textbox')).toHaveValue('No viene');
  await waitFor(()=>expect(screen.getByRole('button',{name:'Liberar y conservar cupo'})).toBeEnabled());
  await user.click(screen.getByRole('button',{name:'Liberar y conservar cupo'}));await waitFor(()=>expect(onReleased).toHaveBeenCalledOnce());
  expect(apiRequest.mock.calls.filter(([method])=>method==='POST')[1][2].fingerprint).toBe('new-snapshot');
 });
});

import { render,screen,waitFor,cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach,afterEach,it,expect,vi } from "vitest";
import { ReservationPaymentCorrection } from './reservation-payment-correction';
let calls:any[],lose:boolean,fail:boolean;
const saved=vi.fn(),closed=vi.fn();
const mount=()=>render(<ReservationPaymentCorrection userId="cashier" reservationId="r" payment={{id:'p',amount:'90000',method:'tarjeta_credito'}} onSaved={saved} onClose={closed}/>);
beforeEach(()=>{
 calls=[];lose=false;fail=false;sessionStorage.clear();saved.mockClear();closed.mockClear();
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
  const body=JSON.parse(String(init?.body));calls.push({url,body});
  if(fail)return new Response(JSON.stringify({ok:false,error:{code:'HISTORICAL_CONFIRMATION_REQUIRED',message:'El turno está cerrado.'}}),{status:409});
  if(url.endsWith('/preview'))return new Response(JSON.stringify({ok:true,data:{previewHash:'hash',request:body,amountCents:9000000,debtAfterCents:body.action==='void_nonexistent'?9000000:0,obligations:[],proposals:body.action==='void_nonexistent'?[{paymentId:'debit',invoiceId:1,amountCents:6000000}]:[]}}));
  if(lose){lose=false;throw new TypeError('Respuesta perdida');}
  return new Response(JSON.stringify({ok:true,data:{operationId:body.operationId}}));
 }));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
async function fill(){await userEvent.type(screen.getByLabelText('Motivo'),'Registro de tarjeta incorrecto');await userEvent.type(screen.getByLabelText('Referencia de comprobación'),'Control de Caja');}
it('requires a reason/evidence, reviews and explicitly confirms a method correction',async()=>{
 mount();expect(screen.getByRole('button',{name:'Revisar corrección'})).toBeDisabled();await fill();await userEvent.click(screen.getByRole('button',{name:'Revisar corrección'}));
 await userEvent.click(await screen.findByRole('button',{name:'Confirmar corrección'}));await waitFor(()=>expect(saved).toHaveBeenCalledTimes(1));
 expect(calls[1].body).toMatchObject({operationId:expect.any(String),previewHash:'hash',request:{action:'change_method',newMethod:'efectivo',restorations:[]}});
});
it('restoration requires accepting the proposal and reviewing its explicit IDs/amount before confirmation',async()=>{
 mount();await userEvent.selectOptions(screen.getByLabelText('Tipo de corrección'),'void_nonexistent');await fill();await userEvent.click(screen.getByRole('button',{name:'Revisar corrección'}));
 await waitFor(()=>expect(screen.getByRole('checkbox')).toBeEnabled());await userEvent.click(screen.getByRole('checkbox'));expect(screen.getByRole('checkbox')).toBeChecked();expect(screen.getByRole('button',{name:'Confirmar corrección'})).toBeDisabled();
 await userEvent.click(screen.getByRole('button',{name:'Revisar corrección'}));await waitFor(()=>expect(screen.getByRole('button',{name:'Confirmar corrección'})).toBeEnabled());
 await userEvent.click(screen.getByRole('button',{name:'Confirmar corrección'}));await waitFor(()=>expect(saved).toHaveBeenCalled());
 expect(calls[2].body.request.restorations).toEqual([{paymentId:'debit',invoiceId:1,amountCents:6000000}]);
});
it('a lost response preserves the same correction UUID and request across reopening',async()=>{
 const first=mount();await fill();await userEvent.click(screen.getByRole('button',{name:'Revisar corrección'}));lose=true;
 await userEvent.click(await screen.findByRole('button',{name:'Confirmar corrección'}));expect(await screen.findByRole('alert')).toHaveTextContent('Respuesta perdida');const request=calls[1].body;
 first.unmount();mount();await userEvent.click(screen.getByRole('button',{name:'Recuperar la misma corrección'}));await waitFor(()=>expect(saved).toHaveBeenCalled());expect(calls[2].body).toEqual(request);
});
it('a closed cash shift is reported without creating a correction',async()=>{
 mount();await fill();fail=true;await userEvent.click(screen.getByRole('button',{name:'Revisar corrección'}));expect(await screen.findByRole('alert')).toHaveTextContent('El turno está cerrado.');expect(calls).toHaveLength(1);expect(saved).not.toHaveBeenCalled();
});

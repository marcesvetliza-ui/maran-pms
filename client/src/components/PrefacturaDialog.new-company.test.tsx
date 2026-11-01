import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { queryClient } from '@/lib/queryClient';
const { toast } = vi.hoisted(()=>({toast:vi.fn()}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast,toasts:[],dismiss:vi.fn()})}));
import { PrefacturaDialog } from './PrefacturaDialog';
const reservation:any={id:'res-company-create',status:'checked_in',guest:{id:'guest',firstName:'Prueba',lastName:'Empresa',vatCondition:'consumidor_final'},room:{roomNumber:'202'},checkInDate:'2026-11-01',checkOutDate:'2026-11-02',nights:1};
let companies:any[],fail:boolean;
beforeEach(()=>{
 queryClient.clear();fail=false;companies=[];
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
  if(url==='/api/companies'&&init?.method==='POST'){
   if(fail)return json({error:'No se pudo guardar la empresa.'},500);
   const created={...JSON.parse(String(init.body)),id:'new-company'};companies.push(created);return json(created,201);
  }
  if(url==='/api/companies')return json(companies);
  if(url.endsWith('/folio'))return json({roomNumber:'202',guestName:'Prueba Empresa',roomTotal:85,charges:[{id:'parking',description:'Cochera',category:'otros',amount:'2500.00'}],payments:[],totalPayments:0,totalCharges:2500,grandTotal:2585,balance:2585,nights:1});
  if(url.endsWith('/transfer-remaining'))return json({accommodation:85,charges:{parking:2500}});
  return json(url.endsWith('/api/billing/config')?{puntoVenta:1,arcaAmbiente:'ficticio'}:[]);
 }));
});
afterEach(()=>{cleanup();queryClient.clear();vi.unstubAllGlobals();});
async function open(){
 const user=userEvent.setup();render(<QueryClientProvider client={queryClient}><PrefacturaDialog open onClose={vi.fn()} reservationId={reservation.id} reservation={reservation} mode="checkout" /></QueryClientProvider>);
 await user.click(await screen.findByTestId('select-billing-target'));await user.click(await screen.findByRole('option',{name:'Empresa'}));
 await user.click(screen.getByTestId('button-new-billing-company'));return user;
}
async function fill(user:ReturnType<typeof userEvent.setup>){
 await user.type(screen.getByTestId('input-company-razonsocial'),'Empresa Nueva SA');
 await user.type(screen.getByTestId('input-company-cuilcuit'),'30-12345678-9');
}
it('creates and selects a company without leaving checkout or registering payment/invoice',async()=>{
 const user=await open();expect(screen.getByTestId('button-create-company')).toBeDisabled();
 await fill(user);await user.click(screen.getByTestId('button-create-company'));
 await waitFor(()=>expect(screen.queryByRole('heading',{name:'Nueva empresa para facturar'})).not.toBeInTheDocument());
 await waitFor(()=>expect(screen.getByTestId('select-billing-company')).toHaveTextContent('Empresa Nueva SA'));
 expect(screen.getByDisplayValue('Empresa Nueva SA')).toBeInTheDocument();
 expect(screen.getByDisplayValue('30-12345678-9')).toBeInTheDocument();
 expect(screen.getByTestId('select-billing-target')).toHaveTextContent('Empresa');
 expect(screen.getAllByText('$2.585,00').length).toBeGreaterThan(0);
 const posts=(fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([,init])=>init?.method==='POST');
 expect(posts).toHaveLength(1);expect(posts[0][0]).toBe('/api/companies');
 expect(JSON.parse(String(posts[0][1]?.body))).toMatchObject({razonSocial:'Empresa Nueva SA',cuilCuit:'30-12345678-9',condicionIva:'responsable_inscripto'});
 // A later cache refresh must not reapply the reservation's initial guest recipient.
 await queryClient.invalidateQueries({queryKey:['/api/companies']});
 await waitFor(()=>expect(screen.getByTestId('select-billing-target')).toHaveTextContent('Empresa'));
});
it('retains company details on save error and permits retry',async()=>{
 fail=true;const user=await open();await fill(user);await user.click(screen.getByTestId('button-create-company'));
 await waitFor(()=>expect(toast).toHaveBeenCalledWith(expect.objectContaining({title:'No se pudo crear la empresa',description:'No se pudo guardar la empresa.',variant:'destructive'})));
 expect(screen.getByTestId('input-company-razonsocial')).toHaveValue('Empresa Nueva SA');expect(screen.getByTestId('input-company-cuilcuit')).toHaveValue('30-12345678-9');
 fail=false;await user.click(screen.getByTestId('button-create-company'));
 await waitFor(()=>expect(screen.getByTestId('select-billing-company')).toHaveTextContent('Empresa Nueva SA'));
});
it('cancels without creating a company or closing the prefactura',async()=>{
 const user=await open();await fill(user);await user.click(screen.getByRole('button',{name:'Cancelar alta de empresa'}));
 expect(screen.queryByRole('heading',{name:'Nueva empresa para facturar'})).not.toBeInTheDocument();expect(screen.getByTestId('select-billing-target')).toHaveTextContent('Empresa');
 expect((fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0);
});

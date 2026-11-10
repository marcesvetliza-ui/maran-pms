import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {QueryClientProvider} from '@tanstack/react-query';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {queryClient} from '@/lib/queryClient';
import {ChannexUsdQuotation} from './channex-usd-quotation';
const plans=[{id:'ars',name:'RACK',currency:'ARS',roomType:{name:'Ejecutiva'}},{id:'usd',name:'USD existente',currency:'USD'}];
let calls:any[],savedQuote:boolean;
beforeEach(()=>{queryClient.clear();calls=[];savedQuote=true;vi.stubGlobal('fetch',vi.fn(async(input:any,init?:RequestInit)=>{
 const url=String(input),body=init?.body?JSON.parse(String(init.body)):null;calls.push({url,body,method:init?.method||'GET'});
 let data:any={quote:{rate:savedQuote?'1545':null,updatedAt:savedQuote?'2026-11-10T12:00:00Z':null},lastEdit:{actor:'Marcelo',reason:'Manual'}};
 if(init?.method==='PATCH'){savedQuote=true;data={ok:true};}
 if(url.endsWith('/preview'))data={previewToken:'a'.repeat(64),exchangeRate:'1545',effectiveFrom:'2026-11-10',plans:[{sourceId:'ars',sourceName:'RACK',targetName:'RACK · Booking USD',values:{base_rate:'126.21',rate_1pax:'111.97',rate_2pax:'126.21'},sourceValues:{base_rate:'195000',rate_1pax:'173000',rate_2pax:'195000'},before:null,calendarChanges:[]}]};
 if(url.endsWith('/apply'))data={applied:true};
 return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
}));});
afterEach(()=>{cleanup();queryClient.clear();vi.unstubAllGlobals();});
function mount(){render(<QueryClientProvider client={queryClient}><ChannexUsdQuotation connectionId="conn" plans={plans}/></QueryClientProvider>);}
it('prepares a USD review without writes and applies exactly its token only after confirmation',async()=>{
 mount();await screen.findByText(/Actualizó: Marcelo/);
 expect(screen.queryByLabelText(/USD existente/)).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('checkbox',{name:/Ejecutiva · RACK/}));
 expect(calls.filter(c=>c.method!=='GET')).toHaveLength(0);
 fireEvent.click(screen.getByRole('button',{name:'Revisar conversión a USD'}));
 await screen.findByRole('region',{name:'Revisión de conversión USD'});
 expect(screen.getAllByText(/USD\s*126,21/).length).toBeGreaterThan(0);
 expect(calls.some(c=>c.url.endsWith('/apply'))).toBe(false);
 fireEvent.click(screen.getByRole('button',{name:'Confirmar conversión de planes USD'}));
 await waitFor(()=>expect(calls.find(c=>c.url.endsWith('/apply'))?.body).toEqual({ratePlanIds:['ars'],previewToken:'a'.repeat(64)}));
});
it('proposes 1545 without saving automatically and requires a saved quote before conversion',async()=>{
 savedQuote=false;mount();await screen.findByText(/Todavía no hay cotización guardada/);
 expect(screen.getByLabelText('Pesos por USD')).toHaveValue('1545');
 fireEvent.click(screen.getByRole('checkbox',{name:/Ejecutiva · RACK/}));
 expect(screen.getByRole('button',{name:'Revisar conversión a USD'})).toBeDisabled();
 expect(calls.filter(c=>c.method!=='GET')).toHaveLength(0);
 fireEvent.change(screen.getByLabelText('Fuente o motivo de la cotización'),{target:{value:'Cotización manual del hotel'}});
 fireEvent.click(screen.getByRole('button',{name:'Guardar cotización'}));
 await waitFor(()=>expect(calls.find(c=>c.method==='PATCH')?.body).toEqual({rate:'1545',reason:'Cotización manual del hotel'}));
});
it('invalidates the pending review when selected source plans change',async()=>{
 mount();await screen.findByText(/Actualizó: Marcelo/);fireEvent.click(screen.getByRole('checkbox',{name:/Ejecutiva · RACK/}));fireEvent.click(screen.getByRole('button',{name:'Revisar conversión a USD'}));await screen.findByRole('region',{name:'Revisión de conversión USD'});
 fireEvent.click(screen.getByRole('checkbox',{name:/Ejecutiva · RACK/}));
 expect(screen.queryByRole('button',{name:'Confirmar conversión de planes USD'})).not.toBeInTheDocument();
});

import {render,screen,waitFor,cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {it,expect,vi,afterEach} from 'vitest';
import {GroupRoomAccount} from './group-room-account';
afterEach(()=>{cleanup();vi.unstubAllGlobals();sessionStorage.clear();});
it('collects an existing invoice without issuing a new document and retries its original payment after a lost response',async()=>{
 const writes:any[]=[];let lost=true;
 vi.stubGlobal('fetch',vi.fn(async(url:any,options?:RequestInit)=>{
  if(options?.method==='POST'){
   writes.push({url:String(url),body:JSON.parse(String(options.body))});
   if(lost){lost=false;throw new Error('Lost response');}
   return Response.json({id:'paid'});
  }
  return Response.json({groupId:'g',charges:15000,paid:0,balance:15000,pendingInvoice:0,unassigned:0,advances:[],reviewReceipts:[],collectibleInvoices:[{id:1513,type:'FB',pointOfSale:5,number:246,amount:15000}]});
 }));
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><GroupRoomAccount reservationId="room706" onSaved={vi.fn().mockResolvedValue(undefined)}/></QueryClientProvider>);
 const user=userEvent.setup();
 await user.selectOptions(await screen.findByLabelText('Factura a cobrar'),'1513');
 await user.selectOptions(screen.getByLabelText('Medio del nuevo cobro'),'efectivo');
 await user.click(screen.getByRole('button',{name:'Cobrar factura elegida'}));
 await user.click(await screen.findByRole('button',{name:'Reintentar la misma operación'}));
 await waitFor(()=>expect(writes).toHaveLength(2));
 expect(writes[0]).toEqual(writes[1]);
 expect(writes[0].url).toBe('/api/reservations/room706/invoices/1513/collect');
 expect(writes[0].body).toMatchObject({amount:'15000',method:'efectivo'});
 expect(writes.some(write=>write.url==='/api/billing/invoices')).toBe(false);
});

import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {render,screen,cleanup,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,it,expect,vi} from 'vitest';
import {GroupRoomAccount} from './group-room-account';
import {GroupAdvanceAllocation} from './group-advance-allocation';
const wrap=(node:React.ReactNode)=>render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}>{node}</QueryClientProvider>);
afterEach(()=>{cleanup();vi.unstubAllGlobals();sessionStorage.clear();});
const account={groupId:'g',reservationId:'r',roomNumber:'505',charges:121,paid:0,balance:121,pendingInvoice:0,groupCoverage:{accommodation:121},advances:[],reviewReceipts:[],unassigned:0};
it('collects an already invoiced room without submitting another invoice; a lost response retains the original request after reload',async()=>{
 const writes:any[]=[];let first=true;
 vi.stubGlobal('fetch',vi.fn(async(url:any,init:any)=>{
  if(init?.method==='POST'){writes.push({url:String(url),body:JSON.parse(init.body)});if(first){first=false;throw new TypeError('Lost response');}return Response.json({id:'p'});}
  return Response.json(account);
 }));
 const user=userEvent.setup(),saved=vi.fn(async()=>{});
 wrap(<GroupRoomAccount reservationId="r" onSaved={saved}/>);
 await user.type(await screen.findByLabelText('Importe para la cuenta grupal'),'121');
 await user.click(screen.getByRole('button',{name:'Registrar pago sin facturar'}));
 expect(await screen.findByRole('button',{name:'Reintentar la misma operación'})).toBeEnabled();
 cleanup();wrap(<GroupRoomAccount reservationId="r" onSaved={saved}/>);
 await user.click(await screen.findByRole('button',{name:'Reintentar la misma operación'}));
 await waitFor(()=>expect(saved).toHaveBeenCalledOnce());
 expect(writes).toHaveLength(2);expect(writes[0]).toEqual(writes[1]);
 expect(writes[0]).toMatchObject({url:'/api/payments',body:{reservationId:'r',amount:'121',method:'transferencia',paymentPurpose:'group_room_collection',receiptType:'none'}});
 expect(sessionStorage.getItem('group-room-operation:r')).toBeNull();
});
it('requires an explicit acknowledgement for new money when the group has unassigned funds',async()=>{
 const fetcher=vi.fn(async()=>Response.json({...account,unassigned:50,advances:[{id:'advance',label:'Transferencia grupo',available:50}]}));vi.stubGlobal('fetch',fetcher);
 const user=userEvent.setup();wrap(<GroupRoomAccount reservationId="r" onSaved={async()=>{}}/>);
 await user.type(await screen.findByLabelText('Importe para la cuenta grupal'),'50');
 expect(screen.getByRole('button',{name:'Registrar pago sin facturar'})).toBeDisabled();
 await user.click(screen.getByRole('checkbox',{name:'Confirmo que registro dinero nuevo y mantengo los anticipos sin asignar.'}));
 expect(screen.getByRole('button',{name:'Registrar pago sin facturar'})).toBeEnabled();
 await user.selectOptions(screen.getByRole('combobox',{name:'Anticipo disponible'}),'advance');
 await user.click(screen.getByRole('button',{name:'Aplicar importe a esta habitación'}));
 await waitFor(()=>expect(fetcher.mock.calls.some((args:any)=>args[1]?.method==='POST')).toBe(true));
 const call=(fetcher.mock.calls as any[]).find(([,init])=>init?.method==='POST');expect(call[0]).toBe('/api/groups/g/allocate-advance');expect(JSON.parse(call[1].body)).toMatchObject({receiptId:'advance',allocations:{r:'50'}});
});
it('distributes an existing receipt across selected rooms with exact cents and no new collection request',async()=>{
 const writes:any[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:any,init:any)=>{
  if(init?.method==='POST'){writes.push({url:String(url),body:JSON.parse(init.body)});return Response.json({replayed:false});}
  return Response.json({advances:[{id:'a',label:'Anticipo banco',available:50}],rooms:[{id:'r1',number:'505',name:'Uno',balance:40},{id:'r2',number:'506',name:'Dos',balance:40}]});
 }));
 const user=userEvent.setup(),saved=vi.fn(async()=>{});wrap(<GroupAdvanceAllocation groupId="g" onSaved={saved}/>);
 await user.selectOptions(await screen.findByRole('combobox',{name:'Anticipo grupal a distribuir'}),'a');
 await user.type(screen.getByLabelText('Importe del anticipo a aplicar'),'12.01');
 for(const box of screen.getAllByRole('checkbox'))await user.click(box);
 await user.click(screen.getByRole('button',{name:'Confirmar asignación del anticipo'}));
 await waitFor(()=>expect(saved).toHaveBeenCalledOnce());
 expect(writes).toHaveLength(1);expect(writes[0]).toMatchObject({url:'/api/groups/g/allocate-advance',body:{receiptId:'a',allocations:{r1:6.01,r2:6}}});
});
it('does not crash on corrupt local pending JSON',async()=>{
 sessionStorage.setItem('group-room-operation:r','invalid JSON');vi.stubGlobal('fetch',vi.fn(async()=>Response.json(account)));
 wrap(<GroupRoomAccount reservationId="r" onSaved={async()=>{}}/>);expect(await screen.findByRole('button',{name:'Registrar pago sin facturar'})).toBeInTheDocument();
});

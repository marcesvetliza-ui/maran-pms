import {QueryClientProvider} from '@tanstack/react-query';
import {render,screen,cleanup,within,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {queryClient} from '@/lib/queryClient';
vi.mock('@/App',()=>({useAuth:()=>({user:{id:'test',role:'manager'},hasPermission:()=>true,selectedPosNumero:1,selectedPosNombre:'Restaurant'})}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:vi.fn()})}));
import RestaurantPage from './restaurant';
let table:any,areaType:string,orders:any[],writes:any[];
beforeEach(()=>{
 queryClient.clear();areaType='event';orders=[];writes=[];
 table={id:'table',tableNumber:'1',areaId:'area',capacity:4,shape:'square',status:'available',positionX:0,positionY:0,isActive:'true'};
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,options?:RequestInit)=>{
  const path=String(input),json=(data:any,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  if(options?.method && !['GET','HEAD'].includes(options.method)){
   writes.push({path,body:JSON.parse(String(options.body||'{}'))});
   if(path==='/api/restaurant/orders')return json({id:'started',orderNumber:'TEST',tableId:'table',covers:3,orderLabel:'Previous guest',status:'open',total:'0',items:[]},201);
   return json({});
  }
  if(path==='/api/restaurant/areas')return json([{id:'area',name:'Salón de prueba',areaType,hasTables:'true',isActive:'true',capacity:30}]);
  if(path==='/api/restaurant/tables')return json([table]);
  if(path==='/api/restaurant/orders')return json(orders);
  if(path.startsWith('/api/restaurant/events/orders/'))return json(null);
  if(path==='/api/restaurant/events/catalog')return json({areas:[],items:[]});
  return json([]);
 }));
});
afterEach(()=>{cleanup();queryClient.clear();vi.unstubAllGlobals();});
function show(){return render(<QueryClientProvider client={queryClient}><RestaurantPage/></QueryClientProvider>);}
it('sends a free event table to Evento restaurant without creating a precarga or opening an old form',async()=>{
 const user=userEvent.setup();show();await user.click(await screen.findByTestId('table-1'));
 await waitFor(()=>expect(screen.getByTestId('tab-restaurant-events')).toHaveAttribute('data-state','active'));
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(writes).toEqual([]);
});
it('keeps the legacy advance read-only and starts only the existing service without saving the table again',async()=>{
 table={...table,status:'preloaded',eventClientName:'Previous guest',eventClientPhone:'12345',eventSeats:3,eventNotes:'Menú anterior',eventAdvanceAmount:'150.00',eventAdvanceMethod:'transferencia',eventAdvanceDate:'2026-11-22'};
 const user=userEvent.setup();show();await user.click(await screen.findByTestId('table-1'));
 const dialog=await screen.findByRole('dialog');expect(within(dialog).getByText('Previous guest')).toBeInTheDocument();
 expect(within(dialog).getByText(/150,00/)).toBeInTheDocument();expect(within(dialog).getByText(/22\/11\/2026/)).toBeInTheDocument();
 expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();expect(within(dialog).queryByText('Guardar Pre-carga')).not.toBeInTheDocument();
 await user.click(within(dialog).getByTestId('button-legacy-event-start'));
 await waitFor(()=>expect(writes).toHaveLength(1));expect(writes[0]).toMatchObject({path:'/api/restaurant/orders',body:{tableId:'table',covers:3,orderLabel:'Previous guest'}});
 expect(writes.some(w=>w.path.includes('/tables/'))).toBe(false);
});
it('shows remaining data from a released table without offering to start the same precarga twice',async()=>{
 table={...table,eventClientName:'Previous guest',eventSeats:3};const user=userEvent.setup();show();await user.click(await screen.findByTestId('table-1'));
 const dialog=await screen.findByRole('dialog');expect(within(dialog).queryByTestId('button-legacy-event-start')).not.toBeInTheDocument();
 await user.click(within(dialog).getByRole('button',{name:'Ir a Evento restaurant'}));
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(screen.getByTestId('tab-restaurant-events')).toHaveAttribute('data-state','active');expect(writes).toEqual([]);
});
it('continues to open an occupied event account from the floor',async()=>{
 table={...table,status:'occupied',eventClientName:'Previous guest'};orders=[{id:'live',orderNumber:'LIVE',tableId:'table',status:'open',total:'0',openedAt:new Date().toISOString(),items:[]}];
 const user=userEvent.setup();show();await user.click(await screen.findByTestId('table-1'));await screen.findByRole('dialog');
 expect(screen.getByTestId('tab-floor')).toHaveAttribute('data-state','active');expect(screen.queryByText(/Precarga anterior · Mesa/)).not.toBeInTheDocument();expect(writes).toEqual([]);
});
it('keeps normal table opening available in the dining room',async()=>{
 areaType='indoor';const user=userEvent.setup();show();await user.click(await screen.findByTestId('table-1'));
 expect(await screen.findByRole('heading',{name:/Nuevo Pedido/})).toBeInTheDocument();expect(screen.getByTestId('tab-floor')).toHaveAttribute('data-state','active');expect(writes).toEqual([]);
});

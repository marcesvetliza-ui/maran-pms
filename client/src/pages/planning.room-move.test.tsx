import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, cleanup, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
const { dnd, drags, toast } = vi.hoisted(()=>({dnd:{current:null as any},drags:new Map<string,any>(),toast:vi.fn()}));
vi.mock('@dnd-kit/core',()=>({
 DndContext:({children,...props}:any)=>{dnd.current=props;return children;},DragOverlay:()=>null,
 useDraggable:({id,data}:any)=>{drags.set(id,data);return {attributes:{},listeners:{},setNodeRef:()=>{},isDragging:false};},
 useDroppable:()=>({setNodeRef:()=>{},isOver:false}),useSensor:()=>({}),useSensors:()=>[],PointerSensor:class{},
}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast})}));
vi.mock('./reservations',()=>({ReservationFormDialog:()=>null}));
vi.mock('@/components/planning-reservation-detail',()=>({ReservationDetailModal:()=>null}));
vi.mock('@/lib/utils',async()=>({...await vi.importActual('@/lib/utils'),getLocalToday:()=> '2026-11-11'}));
import PlanningPage from './planning';
const source={id:'source',roomNumber:'601',roomTypeId:'premium',floor:6,status:'available',isActive:true,roomType:{id:'premium',name:'Premium'}};
const destination={...source,id:'reub',roomNumber:'REUB',roomTypeId:'executive',isVirtual:true,roomType:{id:'executive',name:'Ejecutiva'}};
let client:QueryClient,patches:any[];
beforeEach(()=>{
 vi.clearAllMocks();drags.clear();patches=[];localStorage.clear();
 const data={days:['2026-11-11','2026-11-12','2026-11-13'],rooms:[source,destination],
  occupancy:{source:['booked','booked','available'],reub:['available','available','available']},
  cellReservations:{source:{'2026-11-11':'stay','2026-11-12':'stay'},reub:{}},
  reservations:{stay:{id:'stay',guestName:'Synthetic Guest',checkIn:'2026-11-10',checkOut:'2026-11-13',status:'confirmed',source:'direct'}},unassignedGroupBlocks:[],visibilityWarnings:[]};
 client=new QueryClient({defaultOptions:{queries:{retry:false,queryFn:async({queryKey})=>queryKey[0]==='/api/rooms'?[source,destination]:[]}}});
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  if(init?.method==='PATCH'){patches.push(JSON.parse(String(init.body)));return new Response(JSON.stringify({id:'stay'}),{status:200});}
  return new Response(JSON.stringify(String(input).startsWith('/api/planning?')?data:[]),{status:200,headers:{'content-type':'application/json'}});
 }));
});
afterEach(()=>{cleanup();client.clear();vi.unstubAllGlobals();});
it('moves a continuation cell to REUB without sending changes to the stay or prices',async()=>{
 render(<QueryClientProvider client={client}><TooltipProvider><PlanningPage/></TooltipProvider></QueryClientProvider>);
 await screen.findByTestId('cell-source-2026-11-11');
 const grabbed=drags.get('drag-stay-source-2026-11-11');expect(grabbed.day).toBe('2026-11-11');
 act(()=>dnd.current.onDragEnd({active:{data:{current:grabbed}},over:{data:{current:{roomId:'reub',day:'2026-11-11'}}}}));
 expect(await screen.findByTestId('dialog-move-reservation')).toBeInTheDocument();
 expect(screen.queryByText('Nuevas fechas:')).not.toBeInTheDocument();
 await userEvent.setup().click(screen.getByRole('button',{name:'Confirmar Movimiento'}));
 await waitFor(()=>expect(patches).toEqual([{roomId:'reub'}]));
});

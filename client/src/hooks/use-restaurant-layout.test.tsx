import { renderHook,act,waitFor,cleanup } from '@testing-library/react';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { afterEach,describe,it,expect,vi } from 'vitest';
import { useRestaurantLayout } from './use-restaurant-layout';
import { moveLayoutTable,layoutChanges } from '@shared/restaurant-layout';
const tables=[{id:'one',areaId:'a',positionX:0,positionY:0,status:'occupied'},{id:'two',areaId:'a',positionX:1,positionY:0,status:'available'}];
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('explicit restaurant layout save',()=>{
 it('moves and swaps only positions, preserving table identity and operating state',()=>{const swapped=moveLayoutTable(tables,'one',1,0,'a');expect(swapped).toEqual([{...tables[0],positionX:1},{...tables[1],positionX:0}]);expect(layoutChanges(tables,swapped)).toHaveLength(2);expect(moveLayoutTable(tables,'one',1,0,'other')).toBe(tables);});
 it('waits for a successful save, retains the draft on failure, and can retry the exact movement',async()=>{
  let succeed=false;const requests:any[]=[];const notify=vi.fn();
  vi.stubGlobal('fetch',vi.fn(async(_url:any,options:any)=>{requests.push(JSON.parse(options.body));return new Response(JSON.stringify(succeed?{saved:true}:{error:'No se pudo guardar la posición'}),{status:succeed?200:500,headers:{'Content-Type':'application/json'}});}));
  const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
  client.setQueryData(['/api/restaurant/tables'],tables);
  const wrapper=({children}:any)=><QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const {result}=renderHook(()=>useRestaurantLayout(tables,notify),{wrapper});
  act(()=>result.current.toggle());act(()=>result.current.move('one',3,2,'a'));
  expect(requests).toHaveLength(0);expect(result.current.tables[0]).toMatchObject({positionX:3,positionY:2});
  act(()=>result.current.toggle());await waitFor(()=>expect(result.current.error).toContain('No se pudo guardar'));
  expect(result.current.editing).toBe(true);expect(result.current.changes).toBe(1);
  expect(requests[0]).toEqual({tables:[{id:'one',areaId:'a',positionX:3,positionY:2,expectedPositionX:0,expectedPositionY:0}]});
  succeed=true;act(()=>result.current.toggle());await waitFor(()=>expect(result.current.editing).toBe(false));expect(requests[1]).toEqual(requests[0]);expect((client.getQueryData<any[]>(['/api/restaurant/tables']))?.[0]).toMatchObject({positionX:3,positionY:2,status:'occupied'});expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({title:'Layout guardado'}));
 });
 it('discards an unsaved movement without writing to the server',()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const client=new QueryClient();
  const {result}=renderHook(()=>useRestaurantLayout(tables,vi.fn()),{wrapper:({children}:any)=><QueryClientProvider client={client}>{children}</QueryClientProvider>});
  act(()=>result.current.toggle());act(()=>result.current.move('one',4,2,'a'));act(()=>result.current.discard());expect(result.current.tables).toEqual(tables);expect(fetcher).not.toHaveBeenCalled();
 });
});

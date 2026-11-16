import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,expect,it,vi} from 'vitest';
import {ChannexAriPreview} from './channex-ari-preview';
let client:QueryClient;
afterEach(()=>{cleanup();client?.clear();vi.unstubAllGlobals();});
it('only reads on request and displays selected rooms, occupancy prices and both Stop Sell states',async()=>{
 const fetcher=vi.fn(async(_url:any,_options?:RequestInit)=>new Response(JSON.stringify({checkedAt:'2026-11-16T12:00:00Z',from:'2026-11-16',through:'2028-03-29',currency:'USD',rooms:[{number:'307',category:'Premium'}],categories:[{id:'type',name:'Premium 2'}],plans:[{id:'plan',name:'Booking USD'}],availability:[{room_type_id:'type',date_from:'2026-11-16',date_to:'2028-03-29',availability:1}],restrictions:[true,false].map((closed,i)=>({rate_plan_id:'plan',date_from:`2026-11-${16+i}`,date_to:`2026-11-${16+i}`,rates:[{occupancy:1,rate:'120.00'},{occupancy:2,rate:'145.00'}],stop_sell:closed}))}),{status:200,headers:{'Content-Type':'application/json'}}));
 vi.stubGlobal('fetch',fetcher);client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 render(<QueryClientProvider client={client}><ChannexAriPreview connectionId="conn"/></QueryClientProvider>);
 expect(fetcher).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Ver valores actuales sin enviar'}));
 expect(await screen.findByText(/Habitaciones incluidas: 307/)).toBeInTheDocument();
 expect(screen.getByText('Cerrado')).toBeInTheDocument();expect(screen.getByText('Abierto')).toBeInTheDocument();
 expect(screen.getAllByText(/1 persona\(s\).*120.*2 persona\(s\).*145/)).toHaveLength(2);
 expect(String(fetcher.mock.calls[0][0])).toBe('/api/channex/connections/conn/ari/preview');
 expect((fetcher.mock.calls[0] as any)[1]?.method).toBe('GET');
});

import {beforeEach,expect,it,vi} from 'vitest';
import {charges,payments} from '@shared/schema';
const mocks=vi.hoisted(()=>({departures:vi.fn(),select:vi.fn()}));
vi.mock('../db-storage',()=>({storage:{getReservationsForCheckOut:mocks.departures}}));
vi.mock('../db',()=>({db:{select:mocks.select}}));
import {registerDepartureRoutes} from '../routes/departures';
let chargeRows:any[],paymentRows:any[];
beforeEach(()=>{
 vi.clearAllMocks();chargeRows=[];paymentRows=[];
 mocks.select.mockImplementation(()=>({from:(table:unknown)=>({where:async()=>table===charges?chargeRows:table===payments?paymentRows:[]})}));
});
async function request(){let handler:any;const app={get:vi.fn((path:string,fn:any)=>{expect(path).toBe('/api/dashboard/departures');handler=fn;})};registerDepartureRoutes(app as any);const res:any={json:vi.fn(),status:vi.fn(()=>res)};await handler({},res);return res;}
it('returns the same folio balance as occupied rooms, including extras and payments, without changing accommodation totals',async()=>{
 mocks.departures.mockResolvedValue([{id:'502',totalRoomAmount:'332000',notes:'Conservar'},{id:'paid',totalRoomAmount:'144000'},{id:'group',groupId:'master',totalRoomAmount:'0'}]);
 chargeRows=[{reservationId:'502',amount:'28500',status:'active'},{reservationId:'502',amount:'50000',status:'anulado'},{reservationId:'group',amount:'1500',status:'active'}];
 paymentRows=[{reservationId:'paid',amount:'144000',status:'active'},{reservationId:'502',amount:'8000',status:'anulado'}];
 const res=await request();
 expect(res.json).toHaveBeenCalledWith([{id:'502',totalRoomAmount:'332000',notes:'Conservar',folioBalance:360500},{id:'paid',totalRoomAmount:'144000',folioBalance:0},{id:'group',groupId:'master',totalRoomAmount:'0',folioBalance:1500}]);
 expect(mocks.select).toHaveBeenCalledTimes(2);
});
it('deducts active collections instead of treating a service total as outstanding debt',async()=>{
 mocks.departures.mockResolvedValue([{id:'r',totalRoomAmount:'332000'}]);chargeRows=[{reservationId:'r',amount:'28500',status:'active'}];paymentRows=[{reservationId:'r',amount:'100000',status:'active'}];
 expect((await request()).json).toHaveBeenCalledWith([expect.objectContaining({folioBalance:260500})]);
});
it('does not query financial tables when no departures exist',async()=>{
 mocks.departures.mockResolvedValue([]);expect((await request()).json).toHaveBeenCalledWith([]);expect(mocks.select).not.toHaveBeenCalled();
});
it('fails instead of returning an accommodation-only or zero balance when financial reads fail',async()=>{
 mocks.departures.mockResolvedValue([{id:'r',totalRoomAmount:'332000'}]);mocks.select.mockImplementation(()=>{throw Error('read unavailable');});
 const res=await request();expect(res.status).toHaveBeenCalledWith(500);expect(res.json).toHaveBeenCalledWith({error:'Error fetching departures'});
});

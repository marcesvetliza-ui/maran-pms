import {it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({load:vi.fn(),select:vi.fn()}));
vi.mock('../db',()=>({db:{select:mocks.select},pool:{},withDatabaseTransaction:(fn:any)=>fn()}));
vi.mock('../reports/lodging',async importOriginal=>{const original=await importOriginal<typeof import('../reports/lodging')>();return {...original,loadLodging:mocks.load};});
import {storage} from '../db-storage';
it('uses period room-nights for Executive KPIs while retaining current room states separately',async()=>{
 mocks.select.mockReturnValue({from:()=>({then:(fn:any)=>Promise.resolve([{id:'r1',roomNumber:'101',status:'occupied',isActive:true,isVirtual:false},{id:'r2',roomNumber:'102',status:'available',isActive:true,isVirtual:false}]).then(fn),where:()=>Promise.resolve([])})});
 mocks.load.mockResolvedValue({summary:{revenue:900,occupancy:25,adr:300,revpar:75,roomNights:3,capacityNights:12},forecast:{revenue:0,roomNights:0},warnings:{},methodology:'common nightly source',nights:[{phase:'actual',source:'directo',reservationId:'s',amount:900}]});
 const stats=await storage.getExecutiveStats('2026-10-30','2026-11-01');expect(stats.occupancyRate).toBe(25);expect(stats.occupiedRooms).toBe(1);expect(stats.totalRooms).toBe(2);expect(stats.accommodationRevenue).toBe(900);expect(stats.adr).toBe(300);expect(stats.revpar).toBe(75);expect(mocks.load).toHaveBeenCalledWith('2026-10-30','2026-11-01');expect(mocks.load).toHaveBeenCalledWith('2025-10-30','2025-11-01');
});

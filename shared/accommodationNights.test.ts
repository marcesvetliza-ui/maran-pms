import { describe,it,expect } from 'vitest';
import { accommodationNights,expandAccommodationCoverage,accommodationCoverageTotal } from './accommodationNights';
describe('nightly folio sources',()=>{
 const input={checkInDate:'2026-11-01',checkOutDate:'2026-11-03',totalRoomAmount:'300.01',pricingScheme:'nightly_v1',nightlyPricing:[{date:'2026-11-01',rateCents:12001,discountCents:1000},{date:'2026-11-02',rateCents:20000,discountCents:1000}]};
 it('uses saved dated net prices and excludes checkout',()=>{expect(accommodationNights(input)).toMatchObject([{id:'accommodation:2026-11-01',amount:110.01,derived:false},{id:'accommodation:2026-11-02',amount:190,derived:false}]);});
 it('does not reconstruct inconsistent saved pricing',()=>{expect(accommodationNights({...input,totalRoomAmount:'300'})).toEqual([]);});
 it('labels a legacy allocation and preserves the exact total including cents',()=>{const rows=accommodationNights({...input,pricingScheme:'legacy',nightlyPricing:null,totalRoomAmount:'300.01'});expect(rows).toMatchObject([{amount:150.01,derived:true},{amount:150,derived:true}]);});
 it('subtracts old grouped and exact dated coverage without losing or duplicating capacity',()=>{const rows=accommodationNights(input);const amounts=expandAccommodationCoverage({accommodation:150,'accommodation:2026-11-02':50,other:25},rows);expect(amounts).toEqual({'accommodation:2026-11-01':110.01,'accommodation:2026-11-02':89.99,other:25});expect(accommodationCoverageTotal(amounts)).toBe(200);});
 it('never drops grouped coverage greater than the current lodging total',()=>{const amounts=expandAccommodationCoverage({accommodation:500},accommodationNights(input));expect(accommodationCoverageTotal(amounts)).toBe(500);});
});

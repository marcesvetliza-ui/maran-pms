import {it,expect} from 'vitest';
import {allocateFundingCents} from './fundingAllocation';
it('conserves one cent and uneven partial NC amounts with deterministic tie breaking',()=>{
 expect(allocateFundingCents(1,[1,1,1])).toEqual([1,0,0]);
 expect(allocateFundingCents(10000,[10000,10000,10000])).toEqual([3334,3333,3333]);
 expect(allocateFundingCents(10001,[10001,10001])).toEqual([5001,5000]);
});
it('never exceeds live capacities, including empty or unpaid coverage',()=>{
 expect(allocateFundingCents(3,[1,0,2])).toEqual([1,0,2]);expect(allocateFundingCents(0,[0,0])).toEqual([0,0]);
 expect(()=>allocateFundingCents(4,[1,2])).toThrow();expect(()=>allocateFundingCents(0.5,[2])).toThrow();
});

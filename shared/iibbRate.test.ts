import { expect,it } from 'vitest';
import { iibbRateFromAmount } from './iibbRate';
it('computes an effective percentage rounded to the four decimals supported by storage',()=>{
 expect(iibbRateFromAmount(100000,3500)).toBe(3.5);
 expect(iibbRateFromAmount(140495.87,175.62)).toBe(0.125);
 expect(iibbRateFromAmount(958143.53,19162.87)).toBe(2);
 for(const base of [0,-1,NaN,Infinity])expect(iibbRateFromAmount(base,10)).toBe(0);
 expect(iibbRateFromAmount(100,0)).toBe(0);
});

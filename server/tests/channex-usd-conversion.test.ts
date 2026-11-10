import {it,expect} from 'vitest';
import {arsToUsd} from '../channex/usdConversion';
it('divides ARS by pesos per USD with decimal half-up rounding',()=>{
 expect(arsToUsd('195000.00','1545')).toBe('126.21');
 expect(arsToUsd('173000.00','1545.000000')).toBe('111.97');
 expect(arsToUsd('1.01','2')).toBe('0.51');
 expect(arsToUsd(null,'1545')).toBeNull();
});
it('rejects free/negative, malformed and sub-cent converted fares',()=>{
 for(const value of ['0','-100','abc','1.001','0.01'])expect(()=>arsToUsd(value,'1545')).toThrow();
 expect(()=>arsToUsd('100','0')).toThrow();
});

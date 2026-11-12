import {describe,it,expect} from 'vitest';
import {allocateGroupMoney,groupMoneyCents} from './groupAccount';
describe('operator-directed group money amounts',()=>{
 it('preserves cents in a manual distribution',()=>expect(allocateGroupMoney({a:'12.01',b:'0.01'})).toEqual({a:1201,b:1}));
 it.each(['-1','1.001','1e2','NaN','Infinity','100000000','1,00','',null])('rejects invalid monetary amounts %s',v=>expect(()=>groupMoneyCents(v)).toThrow());
 it.each([{},[],{__unassigned__:1},{a:0},{a:-1}])('rejects allocations outside real room identifiers/positive cents %o',v=>expect(()=>allocateGroupMoney(v)).toThrow());
});

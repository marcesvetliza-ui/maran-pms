import {describe,expect,it} from 'vitest';
import {inHousePax} from './inHousePax';
describe('people currently in house',()=>{
 it.each([[2,1,2],[1,2,3],[4,1,4],[1,0,1],[null,1,2],[0,0,1],[undefined,0,1]])('counts %s declared and %s companions as %s people',(declared,companions,expected)=>{
  expect(inHousePax(declared,companions)).toBe(expected);
 });
});

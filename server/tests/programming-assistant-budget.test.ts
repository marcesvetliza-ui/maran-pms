import {it,expect} from 'vitest';
import {dailyInvestigationLimit} from '../../services/programming-assistant/budget';
it('keeps ten by default and permits a bounded test budget',()=>{
  expect(dailyInvestigationLimit()).toBe(10);
  expect(dailyInvestigationLimit('20')).toBe(20);
  expect(dailyInvestigationLimit(30)).toBe(30);
});
it.each(['',0,-1,31,2.5,'unlimited',Infinity])('rejects invalid budget %s',value=>{
  expect(()=>dailyInvestigationLimit(value)).toThrow('entre 1 y 30');
});

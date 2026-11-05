import {it,expect} from 'vitest';
import {restaurantPortionCents} from './restaurant-item-quantities';
it('carries fractional cents into the remaining line without loss',()=>{const a=restaurantPortionCents('100.00',3,1);const b=restaurantPortionCents(((10000-a)/100).toFixed(2),2,1);const c=10000-a-b;expect([a,b,c]).toEqual([3333,3333,3334]);});
it.each([0,-1,1.5,5,NaN])('rejects invalid quantity %s',qty=>expect(()=>restaurantPortionCents('48.00',4,qty)).toThrow());

import {describe,it,expect} from 'vitest';
import {chargeUnits,expandChargeUnitCoverage,groupedChargeCoverage} from './chargeUnits';
const c={id:'parking',description:'Cochera (x2)',amount:'15000.00',category:'otros'};
describe('folio charge units',()=>{
 it('preserves the exact total and provides stable independent identities',()=>{const rows=chargeUnits(c);expect(rows.map(r=>r.amount)).toEqual([7500,7500]);expect(rows.map(r=>r.id)).toEqual(['charge-unit:parking:1','charge-unit:parking:2']);expect(rows[0].description).toBe('Cochera · unidad 1 de 2');expect(chargeUnits({...c,description:'Agua (x3)',amount:'100'}).map(r=>r.amount)).toEqual([33.34,33.33,33.33]);});
 it('does not infer quantity from an amount or expand financial adjustments',()=>{for(const description of ['Cochera','Cena para dos','Cochera (x0)','Cochera (x99999)'])expect(chargeUnits({...c,description})).toHaveLength(1);expect(chargeUnits({...c,category:'adjustment'})).toHaveLength(1);});
 it('reserves historical grouped coverage after direct unit coverage and never loses excess',()=>{const rows=chargeUnits(c);expect(expandChargeUnitCoverage({parking:7500,'charge-unit:parking:2':7500},rows)).toEqual({'charge-unit:parking:1':7500,'charge-unit:parking:2':7500});expect(groupedChargeCoverage({'charge-unit:parking:1':7500},'parking')).toBe(7500);expect(Object.values(expandChargeUnitCoverage({parking:16000},rows)).reduce((a,b)=>a+b,0)).toBe(16000);});
});

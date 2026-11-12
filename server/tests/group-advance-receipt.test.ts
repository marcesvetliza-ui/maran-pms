import {describe,it,expect} from 'vitest';
import {groupAdvanceReceipt} from '../billing/groupAdvanceReceipt';
const receipt={amount:'100.00',method:'varios',payment_method_detail:[{method:'cash',amount:'40.00'},{method:'transfer',amount:'60.00'}],distribution_detail:{__unassigned__:70,r:30}};
const children=[{reservation_id:'r',method:'efectivo',amount:'30.00'}];
describe('existing group receipt allocation evidence',()=>{
 it('preserves remaining instruments and explicit unassigned cents',()=>{const result=groupAdvanceReceipt(receipt,children);expect(result.requiresReview).toBe(false);expect(result.available).toBe(70);expect(Object.fromEntries(result.budgets)).toEqual({efectivo:1000,transferencia:6000});});
 it.each([
  {...receipt,distribution_detail:null},
  {...receipt,distribution_detail:{}},
  {...receipt,distribution_detail:{r:100}},
  {...receipt,distribution_detail:{__master_balance__:70,r:30}},
  {...receipt,distribution_detail:{__unassigned__:71,r:30}},
  {...receipt,distribution_detail:{__unassigned__:-1,r:101}},
  {...receipt,distribution_detail:{__unassigned__:70,foreign:30}},
  {...receipt,payment_method_detail:[{method:'cuenta_corriente',amount:100}]},
  {...receipt,payment_method_detail:[{method:'transfer',amount:95,retention:{tipo:'iibb',monto:5}}]},
 ])('keeps ambiguous history or non-money instruments for review without attributing funds: %o',p=>expect(groupAdvanceReceipt(p,children)).toMatchObject({requiresReview:true,available:0}));
 it('does not block other rooms because a verified receipt was settled through CC or retentions',()=>expect(groupAdvanceReceipt({...receipt,method:'cuenta_corriente',payment_method_detail:[{method:'cuenta_corriente',amount:100}],distribution_detail:{r:100}},[{reservation_id:'r',method:'cuenta_corriente',amount:100}])).toMatchObject({requiresReview:false,available:0}));
 it('does not expose money already applied to a room or group charge',()=>expect(groupAdvanceReceipt({...receipt,distribution_detail:{r:30,__group_charges__:70}},children)).toMatchObject({requiresReview:false,available:0}));
 it('detects a reversed child or a method different from the receipt',()=>{expect(groupAdvanceReceipt(receipt,[]).requiresReview).toBe(true);expect(groupAdvanceReceipt(receipt,[{...children[0],method:'tarjeta_credito'}]).requiresReview).toBe(true);});
});

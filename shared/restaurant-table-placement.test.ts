import { describe, it, expect } from 'vitest';
import { restaurantTablePlacement, layoutChanges } from './restaurant-layout';

describe('restaurant table placement', () => {
 it('uses holes in a sparse plan rather than appending outside its last row', () => {
  const tables=[{positionX:0,positionY:0},{positionX:7,positionY:0},{positionX:7,positionY:5}];
  const placement=restaurantTablePlacement(tables,'indoor');
  expect(placement.firstFree).toEqual({positionX:1,positionY:0});expect(placement.unplaced).toEqual([]);
  expect(tables[2]).toEqual({positionX:7,positionY:5});
 });
 it('preserves the first table in a cell and exposes duplicates, missing and outside positions', () => {
  const tables=[{id:'one',positionX:0,positionY:0},{id:'bis',positionX:0,positionY:0},{id:'outside',positionX:0,positionY:6},{id:'null',positionX:null,positionY:null},{id:'negative',positionX:-1,positionY:0}];
  const p=restaurantTablePlacement(tables,'indoor');expect(p.byCell.get('0:0')?.id).toBe('one');expect(p.unplaced.map(t=>t.id)).toEqual(['bis','outside','null','negative']);expect(p.firstFree).toEqual({positionX:1,positionY:0});
 });
 it('uses the smaller event plan and returns no free cell when every valid cell is occupied', () => {
  const tables=Array.from({length:15},(_,i)=>({positionX:i%5,positionY:Math.floor(i/5)}));
  expect(restaurantTablePlacement(tables,'event')).toMatchObject({columns:5,rows:3,firstFree:null});
  expect(restaurantTablePlacement([{positionX:5,positionY:0}],'event').unplaced).toHaveLength(1);
 });
 it('retains null expected coordinates when recovering a legacy unplaced table', () => {
  const before=[{id:'bis',areaId:'a',positionX:null,positionY:null}];
  expect(layoutChanges(before,[{...before[0],positionX:1,positionY:0}])).toEqual([{id:'bis',areaId:'a',positionX:1,positionY:0,expectedPositionX:null,expectedPositionY:null}]);
 });
});

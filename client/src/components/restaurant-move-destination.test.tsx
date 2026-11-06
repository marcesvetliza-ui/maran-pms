import {fireEvent,render,screen} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import {RestaurantMoveDestination} from './restaurant-move-destination';
describe('Mesa destino al dividir cuenta',()=>{
 it('offers available tables by number and area instead of a detached ticket',()=>{
  const onChange=vi.fn();render(<RestaurantMoveDestination orders={[{id:'source',status:'open',orderNumber:'ORD-1',tableId:'source-table'}]} sourceId="source" tables={[
    {id:'free',tableNumber:'12',areaId:'salon',status:'available',isActive:'true'},
    {id:'reserved',tableNumber:'13',status:'reserved',isActive:'true'},
    {id:'occupied',tableNumber:'14',status:'occupied',isActive:'true'},
    {id:'inactive',tableNumber:'15',status:'available',isActive:'false'},
    {id:'source-table',tableNumber:'16',status:'available',isActive:'true'},
  ]} areas={[{id:'salon',name:'Salón'}]} value="" onChange={onChange}/>);
  expect(screen.getByRole('option',{name:'Mesa 12 — Salón · Disponible'})).toBeVisible();
  for(const n of ['13','14','15','16'])expect(screen.queryByRole('option',{name:new RegExp(`Mesa ${n}`)})).not.toBeInTheDocument();
  expect(screen.queryByRole('option',{name:/Nueva comanda/})).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox',{name:'Mesa destino'}),{target:{value:'table:free'}});expect(onChange).toHaveBeenCalledWith('table:free');
 });
 it('preserves open destinations and hides closed or cancelled ones',()=>{
  render(<RestaurantMoveDestination orders={[
    {id:'open',status:'open',orderNumber:'ORD-1',tableId:'busy',table:{tableNumber:'5'}},
    {id:'prep',status:'in_progress',orderNumber:'Preparación'},
    {id:'served',status:'served',orderNumber:'Servida'},
    {id:'closed',status:'closed',orderNumber:'Cerrada'},
    {id:'cancelled',status:'cancelled',orderNumber:'Anulada'},
  ]} tables={[{id:'busy',status:'available',tableNumber:'5'}]} value="" onChange={vi.fn()}/>);
  expect(screen.getByRole('option',{name:'Mesa 5 — ORD-1'})).toBeInTheDocument();
  expect(screen.getByRole('option',{name:'Preparación'})).toBeInTheDocument();expect(screen.getByRole('option',{name:'Servida'})).toBeInTheDocument();
  expect(screen.queryByRole('option',{name:'Cerrada'})).not.toBeInTheDocument();expect(screen.queryByRole('option',{name:/Disponible/})).not.toBeInTheDocument();
 });
});

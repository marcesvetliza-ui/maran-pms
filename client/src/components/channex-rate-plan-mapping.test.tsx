import { render, screen, fireEvent } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ChannexRatePlanMapping } from './channex-rate-plan-mapping';
const props = { id: 'mapping', title: 'Best Available Rate', roomTitle: 'Twin Room', roomTypeId:'p', selected: null,
  roomTypes: [{ id: 'p', name: 'Premium' }, { id: 'e', name: 'Ejecutiva' }],
  plans: [{ id: 'ars', name: 'BAR', roomTypeId: 'p', currency: 'ARS' }, { id: 'usd', name: 'BAR', roomTypeId: 'p', currency: 'USD' }, { id: 'exec', name: 'BAR', roomTypeId: 'e', currency: 'USD' }] };
it('offers only USD plans in the mapped category and saves the exact selected ID', async () => {
  const onChange = vi.fn(); render(<ChannexRatePlanMapping {...props} onChange={onChange} />);
  fireEvent.pointerDown(screen.getByRole('combobox', { name: 'Best Available Rate · Twin Room' }), { button: 0, ctrlKey: false });
  expect(await screen.findByRole('option', { name: 'BAR · Premium · USD' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'BAR · Premium · ARS' })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'BAR · Ejecutiva · USD' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('option', { name: 'BAR · Premium · USD' }));
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Guardar tarifa'}));
  expect(onChange).toHaveBeenCalledWith('usd');
});
it('shows the remote category for identically named remote plans and permits clearing a mapping', async () => {
  const onChange = vi.fn(); render(<ChannexRatePlanMapping {...props} roomTitle="Double Room" selected="usd" onChange={onChange} />);
  fireEvent.pointerDown(screen.getByRole('combobox', { name: 'Best Available Rate · Double Room' }), { button: 0 });
  fireEvent.click(await screen.findByRole('option', { name: 'Sin mapear' }));
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Guardar tarifa'}));
  expect(onChange).toHaveBeenCalledWith(null);
});

it.each(['ars','exec','deleted'])('preserves and flags an incompatible saved %s plan until the operator corrects it',async selected=>{
 const onChange=vi.fn();render(<ChannexRatePlanMapping {...props} selected={selected} onChange={onChange}/>);
 expect(screen.getByRole('alert')).toHaveTextContent('La tarifa vinculada no es un plan USD de esta categoría');
 expect(screen.getByRole('button',{name:'Guardar tarifa'})).toBeDisabled();expect(onChange).not.toHaveBeenCalled();
 fireEvent.pointerDown(screen.getByRole('combobox'),{button:0,ctrlKey:false});
 expect(await screen.findByRole('option',{name:/Vínculo anterior a revisar/})).toHaveAttribute('aria-disabled','true');
 fireEvent.click(screen.getByRole('option',{name:'BAR · Premium · USD'}));
 expect(screen.getByRole('button',{name:'Guardar tarifa'})).toBeEnabled();
 fireEvent.click(screen.getByRole('button',{name:'Guardar tarifa'}));expect(onChange).toHaveBeenCalledWith('usd');
});
it('explains a missing USD plan without offering ARS or another category',async()=>{
 render(<ChannexRatePlanMapping {...props} plans={props.plans.filter(p=>p.id!=='usd')} onChange={vi.fn()}/>);
 expect(screen.getByText('No hay tarifas USD para esta categoría. Creala desde Tarifas USD.')).toBeInTheDocument();
 fireEvent.pointerDown(screen.getByRole('combobox'),{button:0,ctrlKey:false});
 expect(await screen.findAllByRole('option')).toHaveLength(1);expect(screen.getByRole('option')).toHaveTextContent('Sin mapear');
});
it('requires the room category and resets an unsaved selection when that category changes',async()=>{
 const onChange=vi.fn();const {rerender}=render(<ChannexRatePlanMapping {...props} onChange={onChange}/>);
 fireEvent.pointerDown(screen.getByRole('combobox'),{button:0,ctrlKey:false});fireEvent.click(await screen.findByRole('option',{name:'BAR · Premium · USD'}));
 expect(screen.getByRole('button',{name:'Guardar tarifa'})).toBeEnabled();
 rerender(<ChannexRatePlanMapping {...props} roomTypeId="e" onChange={onChange}/>);
 expect(screen.getByRole('button',{name:'Guardar tarifa'})).toBeDisabled();
 fireEvent.pointerDown(screen.getByRole('combobox'),{button:0,ctrlKey:false});
 expect(await screen.findByRole('option',{name:'BAR · Ejecutiva · USD'})).toBeInTheDocument();expect(screen.queryByRole('option',{name:'BAR · Premium · USD'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('option',{name:'Sin mapear'}));
 rerender(<ChannexRatePlanMapping {...props} roomTypeId={null} onChange={onChange}/>);
 expect(screen.getByText('Primero vinculá la categoría de Maran para elegir su tarifa USD.')).toBeInTheDocument();expect(onChange).not.toHaveBeenCalled();
});

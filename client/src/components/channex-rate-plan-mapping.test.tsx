import { render, screen, fireEvent } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ChannexRatePlanMapping } from './channex-rate-plan-mapping';
const props = { id: 'mapping', title: 'Best Available Rate', roomTitle: 'Twin Room', selected: null,
  roomTypes: [{ id: 'p', name: 'Premium' }, { id: 'e', name: 'Ejecutiva' }],
  plans: [{ id: 'ars', name: 'BAR', roomTypeId: 'p', currency: 'ARS' }, { id: 'usd', name: 'BAR', roomTypeId: 'p', currency: 'USD' }, { id: 'exec', name: 'BAR', roomTypeId: 'e', currency: 'USD' }] };
it('distinguishes duplicate plan names by category and currency and saves the exact selected ID', async () => {
  const onChange = vi.fn(); render(<ChannexRatePlanMapping {...props} onChange={onChange} />);
  fireEvent.pointerDown(screen.getByRole('combobox', { name: 'Best Available Rate · Twin Room' }), { button: 0, ctrlKey: false });
  expect(await screen.findByRole('option', { name: 'BAR · Premium · ARS' })).toBeTruthy();
  expect(screen.getByRole('option', { name: 'BAR · Ejecutiva · USD' })).toBeTruthy();
  fireEvent.click(screen.getByRole('option', { name: 'BAR · Premium · USD' }));
  expect(onChange).toHaveBeenCalledWith('usd');
});
it('shows the remote category for identically named remote plans and permits clearing a mapping', async () => {
  const onChange = vi.fn(); render(<ChannexRatePlanMapping {...props} roomTitle="Double Room" selected="usd" onChange={onChange} />);
  fireEvent.pointerDown(screen.getByRole('combobox', { name: 'Best Available Rate · Double Room' }), { button: 0 });
  fireEvent.click(await screen.findByRole('option', { name: 'Sin mapear' }));
  expect(onChange).toHaveBeenCalledWith(null);
});

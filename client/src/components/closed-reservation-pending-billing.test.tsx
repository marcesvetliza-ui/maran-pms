import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
const { props } = vi.hoisted(() => ({ props: vi.fn() }));
vi.mock('@/App', () => ({ useAuth: () => ({ hasPermission: () => true }) }));
vi.mock('./PrefacturaDialog', () => ({ PrefacturaDialog: (value: any) => { props(value); return <div>Prefactura abierta</div>; } }));
import { ClosedReservationBilling } from './closed-reservation-billing';
afterEach(() => { cleanup(); props.mockClear(); });
it('abre directamente la facturación pendiente sin pedir cargos nuevos ni una factura previa', async () => {
  const reservation = { id: 'old-stay', status: 'checked_out', groupId: 'hinojo', room: { roomNumber: '401', status: 'occupied' }, guest: { firstName: 'Nicolás', lastName: 'Prueba' } } as any;
  render(<ClosedReservationBilling reservation={reservation} />);
  const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: 'Cuenta y facturación' }));
  await user.click(screen.getByRole('button', { name: /^Facturar pendientes de la estadía/ }));
  expect(screen.getByText('Prefactura abierta')).toBeInTheDocument();
  expect(props.mock.calls.at(-1)?.[0]).toMatchObject({ open: true, mode: 'billing', closedStayOnly: true, postCheckoutOnly: false, reservationId: 'old-stay', reservation });
});
it('conserva por separado la carga de consumos posteriores y la corrección de facturas', async () => {
  render(<ClosedReservationBilling reservation={{ id: 'old', status: 'checked_out' } as any} />);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Cuenta y facturación' }));
  expect(screen.getByRole('button', { name: /^Consumos posteriores/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Corregir facturación/ })).toBeInTheDocument();
});

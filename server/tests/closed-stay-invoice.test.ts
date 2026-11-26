import { expect, it } from 'vitest';
import { assertClosedStayInvoiceRequest } from '../billing/closedStayInvoice';
const request = () => ({ reservaId: 'closed', tipoComprobante: 'FB', creditOperationId: 'abcdef12-1234-4123-8123-abcdef123456',
  sourceChargeIds: ['accommodation'], sourceChargeAmounts: { accommodation: 294000 }, closedStayDocumentationOnly: true,
  creditReapplications: [], ordinaryAdvanceApplications: [], prefacturaRecovery: { version: 2, payments: [], checkoutRequested: false },
});
it('acepta documentar conceptos de una estadía cerrada sin movimientos de dinero', () => {
  expect(() => assertClosedStayInvoiceRequest({ status: 'checked_out' }, request())).not.toThrow();
  expect(() => assertClosedStayInvoiceRequest({ status: 'checked_out' }, { ...request(), groupDocumentationOnly: true })).not.toThrow();
});
it.each(['checked_in', 'confirmed', 'cancelled'])('no usa este circuito en una reserva %s', status => {
  expect(() => assertClosedStayInvoiceRequest({ status }, request())).toThrow('check-out realizado');
});
it.each([
  { cashFormaPago: 'efectivo' }, { cashFormaPagoDetalle: [{ method: 'efectivo', amount: 294000 }] },
  { cashArea: 'reception' }, { reservationSettlementMethod: 'cuenta_corriente' }, { ccEntityId: 'company' },
  { paymentId: 'payment' }, { ordinaryAdvanceApplications: [{ paymentId: 'old', amount: 294000 }] },
  { creditReapplications: [{ paymentId: 'old', amount: 294000 }] }, { checkoutDiscount: { value: 100 } },
  { prefacturaRecovery: { version: 2, payments: [], checkoutRequested: true } },
  { prefacturaRecovery: { version: 2, payments: [{ amount: 294000 }], checkoutRequested: false } },
])('rechaza un intento de cambiar pagos, descuentos o salida: %j', mutation => {
  expect(() => assertClosedStayInvoiceRequest({ status: 'checked_out' }, { ...request(), ...mutation })).toThrow('conserva los cobros');
});
it('exige conceptos y una operación verificable para reutilizar la protección contra duplicados', () => {
  expect(() => assertClosedStayInvoiceRequest({ status: 'checked_out' }, { ...request(), sourceChargeIds: [] })).toThrow('conceptos pendientes');
  expect(() => assertClosedStayInvoiceRequest({ status: 'checked_out' }, { ...request(), creditOperationId: '' })).toThrow('conceptos pendientes');
});

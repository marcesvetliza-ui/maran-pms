import { expect, it } from 'vitest';
import { accountMovementReferenceHtml, accountMovementReferenceLines } from './account-movement-reference';
it('el estado impreso usa la misma referencia legible que la pantalla y escapa nombres y referencias', () => {
  const movement = {
    reference: 'credit-operation:internal-id',
    invoiceDisplay: { id: 1, type: 'FB', pointOfSale: 5, number: 510, status: 'emitida' },
    reservationDisplay: { guestName: '<script>alert("Ana")</script> & Pérez', checkInDate: '2026-11-20', checkOutDate: '2026-11-22' },
  };
  const lines = accountMovementReferenceLines(movement), html = accountMovementReferenceHtml(movement);
  expect(lines[0]).toBe('Factura B 00005-00000510');
  expect(html).toContain(lines[0]); expect(html).toContain('Estadía: 20/11/2026 → 22/11/2026');
  expect(html).toContain('&lt;script&gt;alert(&quot;Ana&quot;)&lt;/script&gt; &amp; Pérez');
  expect(html).not.toContain('<script>'); expect(html).not.toContain('credit-operation');
});
it('no imprime identificadores técnicos o JSON si no hay comprobante identificado', () => {
  for (const reference of ['credit-operation:abc', 'invoice:23:FA:5:1', '{"id":23}']) {
    expect(accountMovementReferenceLines({ reference })).toEqual(['Sin reserva vinculada']);
    expect(accountMovementReferenceHtml({ reference })).not.toContain(reference);
  }
});
it('conserva una referencia manual cuando existe un huésped histórico', () => {
  expect(accountMovementReferenceLines({ guestName: 'Pérez, Ana', reference: 'Recibo de seña' })).toEqual(['Recibo de seña', 'Pérez, Ana']);
});
it('conserva el número documental histórico aunque también exista una estadía vinculada', () => {
  expect(accountMovementReferenceLines({ reference: 'FA-0005-00001234', reservationDisplay: {
    guestName: 'Pérez, Ana', checkInDate: '2026-11-20', checkOutDate: '2026-11-22',
  } })).toEqual(['FA-0005-00001234', 'Pérez, Ana', 'Estadía: 20/11/2026 → 22/11/2026']);
});

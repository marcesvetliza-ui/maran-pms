import { describe, expect, it } from 'vitest';
import { buildSpaInvoiceRecipient } from './spaInvoiceRecipient';
describe('receptor fiscal de SPA', () => {
  it('conserva condición real y documento del cliente sin derivarlos de un tipo de factura', () => {
    const result = buildSpaInvoiceRecipient(null, { id: 'guest', firstName: 'Ana', lastName: 'Pérez', vatCondition: 'Exento', cuilCuit: '27123456780', documentNumber: '12345678' }, 'Turno');
    expect(result.initialValues).toMatchObject({ razonSocial: 'Ana Pérez', condicionIva: 'Exento', cuit: '27123456780', dni: '12345678' });
    expect(result.recipientProfile).toMatchObject({ type: 'guest', id: 'guest' });
  });
  it('no completa los datos faltantes de la empresa con los del huésped', () => {
    const result = buildSpaInvoiceRecipient({ id: 'company', razonSocial: 'Empresa' }, { id: 'guest', firstName: 'Ana', vatCondition: 'Responsable Inscripto', cuilCuit: '27123456780', documentNumber: '12345678' }, 'Turno');
    expect(result.initialValues).toMatchObject({ razonSocial: 'Empresa', condicionIva: '', cuit: undefined, dni: undefined });
    expect(result.recipientProfile).toMatchObject({ type: 'company', id: 'company' });
  });
  it('deja los datos fiscales pendientes de revisión cuando sólo se conoce un nombre', () => {
    expect(buildSpaInvoiceRecipient(null, null, 'Cliente sin ficha').initialValues).toMatchObject({ razonSocial: 'Cliente sin ficha', condicionIva: '', cuit: undefined });
  });
});

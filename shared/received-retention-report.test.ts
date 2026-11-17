import { describe, expect, it } from 'vitest';
import { receivedRetentionRow, matchesRetentionFilters, retentionTotals, retentionMoney, validateRetentionFilters, retentionCalendarDate } from './received-retention-report';

const certificate = { id: 1, tipo_comprobante: 'RETENCION', proveedor_nombre: 'Compañía José SA', proveedor_cuit: '30-01234567-8', supplier_nombre: 'Nombre cambiado', supplier_cuit: 'otro', fecha_emision: '2026-11-01', created_at: '2026-11-02T01:30:00Z', numero_comprobante: '123', punto_venta: '1', monto_total: '1234.56', estado: 'registrado', periodo: '11/2026', special_details: { issuerType: 'company', subtipo: 'iibb', jurisdiction: 'Entre Ríos', period: '2026-10' } };

describe('Informe de retenciones recibidas', () => {
  it('incluye agentes empresa/agencia e históricos sin datos especiales, conserva nombre/CUIT históricos', () => {
    expect(receivedRetentionRow(certificate)).toMatchObject({ agente: 'Compañía José SA', cuit: '30-01234567-8', impuesto: 'iibb', periodo: '2026-10', certificado: '00001-00000123' });
    expect(receivedRetentionRow({ ...certificate, proveedor_nombre: '', proveedor_cuit: '', special_details: null, subtipo_retencion: 'iva' })).toMatchObject({ agente: 'Nombre cambiado', cuit: 'otro', impuesto: 'iva', periodo: '2026-11' });
    expect(receivedRetentionRow({ ...certificate, special_details: {} })!.impuestoLabel).toBe('Sin clasificar');
    expect(receivedRetentionRow({ ...certificate, numero_comprobante_ext: '00020-00000111' })!.certificado).toBe('00020-00000111');
  });
  it('no mezcla facturas, percepciones, ni retenciones de tarjetas con certificados recibidos', () => {
    for (const type of ['FACT-A', 'LIQ-TARJETA', 'NC-A']) expect(receivedRetentionRow({ ...certificate, tipo_comprobante: type, retencion_iibb: '50' })).toBeNull();
  });
  it('combina fechas inclusivas, agente sin acentos, CUIT parcial/formateado, impuesto, certificado, período y jurisdicción', () => {
    const row = receivedRetentionRow(certificate)!;
    expect(matchesRetentionFilters(row, { desde: '2026-11-01', hasta: '2026-11-01', agente: 'COMPANIA JOSE', cuit: '30012345678', impuesto: 'iibb', certificado: '00000123', periodo: '2026-10', jurisdiccion: 'entre rios' })).toBe(true);
    for (const filter of [{ hasta: '2026-10-31' }, { agente: 'otro' }, { cuit: '999' }, { impuesto: 'iva' }, { certificado: '999' }, { periodo: '2026-11' }, { jurisdiccion: 'Buenos Aires' }]) expect(matchesRetentionFilters(row, filter)).toBe(false);
    expect(matchesRetentionFilters(row, { cuit: '30-01234567-8' })).toBe(true);
  });
  it('filtra carga en día argentino y no desplaza la fecha de emisión del certificado', () => {
    const row = receivedRetentionRow(certificate)!;
    expect(row.fecha).toBe('2026-11-01'); expect(row.carga).toBe('2026-11-01');
    expect(matchesRetentionFilters(row, { dateType: 'carga', desde: '2026-11-02' })).toBe(false);
    expect(retentionCalendarDate(new Date('2026-11-02T03:01:00Z'))).toBe('2026-11-02');
  });
  it('las anuladas se consultan aparte y no suman al total vigente; centavos exactos', () => {
    const rows = ['0.10', '0.20', '100.00'].map((amount, i) => receivedRetentionRow({ ...certificate, id: i, monto_total: amount, estado: i === 2 ? 'anulado' : 'registrado' })!);
    expect(retentionTotals(rows)).toEqual({ vigentes: 2, anuladas: 1, totalVigente: '0.30', totalAnulado: '100.00' });
    expect(matchesRetentionFilters(rows[2], {})).toBe(false);
    expect(matchesRetentionFilters(rows[2], { estado: 'todas' })).toBe(true);
    expect(matchesRetentionFilters(rows[0], { estado: 'anuladas' })).toBe(false);
    expect(retentionMoney('123456789.01')).toBe('123.456.789,01');
  });
  it.each([{ desde: '2026-02-30' }, { desde: '2026-11-02', hasta: '2026-11-01' }, { cuit: 'abc' }, { cuit: '123456789012' }, { dateType: 'otro' }, { impuesto: 'otro' }, { estado: 'pagado' }, { periodo: '2026-13' }])('rechaza filtros inválidos %j', filters => expect(() => validateRetentionFilters(filters)).toThrow());
});

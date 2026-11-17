import { formatDisplayDate } from './date-display';
import { RETENTION_LABELS } from './specialPurchase';

export const retentionFilterKeys = ['dateType', 'desde', 'hasta', 'agente', 'cuit', 'impuesto', 'estado', 'certificado', 'periodo', 'jurisdiccion'] as const;
export type RetentionFilters = Partial<Record<typeof retentionFilterKeys[number], string>>;
export const defaultRetentionFilters: RetentionFilters = { dateType: 'emision', estado: 'vigentes' };
export const retentionTaxes: Record<string, string> = { ...RETENTION_LABELS, sin_tipo: 'Sin clasificar' };
export interface ReceivedRetentionRow {
  id: number; fecha: string; carga: string; agente: string; cuit: string;
  impuesto: string; impuestoLabel: string; certificado: string; jurisdiccion: string;
  periodo: string; estado: string; importe: string;
}
export interface RetentionTotals { vigentes: number; anuladas: number; totalVigente: string; totalAnulado: string }
export interface RetentionReportResult {
  rows: ReceivedRetentionRow[]; count: number; page: number; pageSize: number; totals: RetentionTotals;
}
const normalize = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

export function validateRetentionFilters(filters: RetentionFilters): void {
  for (const key of retentionFilterKeys) {
    const value = filters[key];
    if (value != null && (typeof value !== 'string' || value.length > 200)) throw new Error('Los filtros no son válidos.');
  }
  if (filters.dateType && !['emision', 'carga'].includes(filters.dateType)) throw new Error('Elegí fecha de emisión o de carga.');
  for (const key of ['desde', 'hasta'] as const) if (filters[key] && !validDate(filters[key]!)) throw new Error('Ingresá una fecha válida.');
  if (filters.desde && filters.hasta && filters.desde > filters.hasta) throw new Error('La fecha desde debe ser anterior o igual a hasta.');
  if (filters.estado && !['vigentes', 'anuladas', 'todas'].includes(filters.estado)) throw new Error('Elegí un estado válido.');
  if (filters.impuesto && !Object.hasOwn(retentionTaxes, filters.impuesto)) throw new Error('Elegí un impuesto válido.');
  if (filters.cuit && (!/^[\d\s.\-]+$/.test(filters.cuit) || !digits(filters.cuit) || digits(filters.cuit).length > 11)) throw new Error('Buscá el CUIT con hasta 11 dígitos, con o sin guiones.');
  if (filters.periodo && !/^\d{4}-(0[1-9]|1[0-2])$/.test(filters.periodo)) throw new Error('Ingresá un período válido.');
}

// Calendar dates from SQL stay calendar dates. Instants are displayed in Argentina.
export function retentionCalendarDate(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string' && validDate(value)) return value;
  const label = formatDisplayDate(value instanceof Date ? value : String(value));
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(label);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
}
function decimal(value: unknown): string {
  const text = String(value ?? '0');
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) throw new Error('Importe de retención inválido.');
  const [whole, fraction = ''] = text.split('.');
  return `${whole}.${fraction.padEnd(2, '0')}`;
}
const cents = (value: string) => BigInt(value.replace('.', ''));
const fromCents = (value: bigint) => `${value < BigInt(0) ? '-' : ''}${(value < BigInt(0) ? -value : value) / BigInt(100)}.${String((value < BigInt(0) ? -value : value) % BigInt(100)).padStart(2, '0')}`;
export function retentionMoney(value: string): string {
  const [whole, fraction] = decimal(value).split('.');
  return `${BigInt(whole).toLocaleString('es-AR')},${fraction}`;
}
export function receivedRetentionRow(raw: any): ReceivedRetentionRow | null {
  if (raw.tipo_comprobante !== 'RETENCION') return null;
  const details = raw.special_details ?? {};
  const subtype = raw.subtipo_retencion || details.subtipo || '';
  const impuesto = Object.hasOwn(RETENTION_LABELS, subtype) ? subtype : 'sin_tipo';
  const point = String(raw.punto_venta ?? '').trim();
  const number = String(raw.numero_comprobante ?? '').trim();
  const certificate = raw.numero_comprobante_ext || (point ? `${point.padStart(5, '0')}-${/^\d+$/.test(number) ? number.padStart(8, '0') : number}` : number);
  const period = String(details.period || raw.periodo || '');
  const periodMatch = /^(\d{2})\/(\d{4})$/.exec(period);
  return {
    id: Number(raw.id), fecha: retentionCalendarDate(raw.fecha_emision), carga: retentionCalendarDate(raw.created_at),
    agente: String(raw.proveedor_nombre || raw.supplier_nombre || 'Sin nombre registrado'),
    cuit: String(raw.proveedor_cuit || raw.supplier_cuit || ''), impuesto, impuestoLabel: retentionTaxes[impuesto],
    certificado: String(certificate), jurisdiccion: String(details.jurisdiction || ''),
    periodo: periodMatch ? `${periodMatch[2]}-${periodMatch[1]}` : period,
    estado: String(raw.estado || 'registrado'), importe: decimal(raw.monto_total),
  };
}
export function matchesRetentionFilters(row: ReceivedRetentionRow, filters: RetentionFilters): boolean {
  const date = filters.dateType === 'carga' ? row.carga : row.fecha;
  if ((filters.desde && (!date || date < filters.desde)) || (filters.hasta && (!date || date > filters.hasta))) return false;
  const state = filters.estado || 'vigentes';
  return !(state === 'vigentes' && row.estado === 'anulado') && !(state === 'anuladas' && row.estado !== 'anulado')
    && (!filters.agente || normalize(row.agente).includes(normalize(filters.agente)))
    && (!filters.cuit || digits(row.cuit).includes(digits(filters.cuit)))
    && (!filters.impuesto || row.impuesto === filters.impuesto)
    && (!filters.certificado || normalize(row.certificado).includes(normalize(filters.certificado)))
    && (!filters.periodo || row.periodo === filters.periodo)
    && (!filters.jurisdiccion || normalize(row.jurisdiccion).includes(normalize(filters.jurisdiccion)));
}
export function retentionTotals(rows: ReceivedRetentionRow[]): RetentionTotals {
  let active = BigInt(0), cancelled = BigInt(0), anuladas = 0;
  for (const row of rows) { if (row.estado === 'anulado') { cancelled += cents(row.importe); anuladas++; } else active += cents(row.importe); }
  return { vigentes: rows.length - anuladas, anuladas, totalVigente: fromCents(active), totalAnulado: fromCents(cancelled) };
}
export function retentionFilterSummary(filters: RetentionFilters): string {
  return [
    `${filters.dateType === 'carga' ? 'Carga' : 'Emisión'}: ${formatDisplayDate(filters.desde)} al ${formatDisplayDate(filters.hasta)} (sin fecha = sin límite)`,
    `Agente: ${filters.agente || 'Todos'}`, `CUIT: ${filters.cuit || 'Todos'}`,
    `Impuesto: ${retentionTaxes[filters.impuesto || ''] || 'Todos'}`,
    `Estado: ${{ vigentes: 'Vigentes', anuladas: 'Anuladas', todas: 'Todas' }[filters.estado || 'vigentes']}`,
    `Certificado: ${filters.certificado || 'Todos'}`, `Período: ${filters.periodo || 'Todos'}`, `Jurisdicción: ${filters.jurisdiccion || 'Todas'}`,
  ].join(' · ');
}
export function retentionReportUrl(filters: RetentionFilters, format: 'json' | 'pdf' | 'xlsx' = 'json', page = 1, inline = false): string {
  const params = new URLSearchParams();
  for (const key of retentionFilterKeys) if (filters[key]) params.set(key, filters[key]!);
  params.set('format', format);
  if (format === 'json') params.set('page', String(page));
  if (inline) params.set('inline', 'true');
  return `/api/purchase-retentions/report?${params}`;
}

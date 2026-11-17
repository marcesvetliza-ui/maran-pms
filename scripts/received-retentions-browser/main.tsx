import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import PurchaseInvoices from '@/pages/purchase-invoices';
import { receivedRetentionRow, matchesRetentionFilters, retentionTotals } from '@shared/received-retention-report';
import '@/index.css';

const rows = Array.from({ length: 53 }, (_, i) => receivedRetentionRow({
  id: i + 1, tipo_comprobante: 'RETENCION', proveedor_nombre: i % 2 ? 'Agencia ficticia José SA' : 'Empresa de prueba con nombre extenso SA',
  proveedor_cuit: '30-01234567-8', numero_comprobante_ext: `00001-${String(i + 1).padStart(8, '0')}`,
  fecha_emision: '2026-11-01', created_at: '2026-11-02T12:00:00Z', monto_total: '1234567.89', estado: i === 52 ? 'anulado' : 'registrado',
  special_details: { subtipo: i % 2 ? 'iva' : 'iibb', period: '2026-11', jurisdiction: 'Entre Ríos' },
})!);
window.fetch = async (input, options) => {
  const method = options?.method || (input instanceof Request ? input.method : 'GET');
  if (method !== 'GET') { document.body.dataset.attemptedWrite = method; throw new Error('El fixture no permite escrituras'); }
  const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
  if (url.pathname === '/api/purchase-retentions/report') {
    if (url.searchParams.get('format') !== 'json') throw new Error('El fixture visual no genera archivos');
    const filtered = rows.filter(row => matchesRetentionFilters(row, Object.fromEntries(url.searchParams)));
    const page = Number(url.searchParams.get('page') || 1);
    return new Response(JSON.stringify({ rows: filtered.slice((page - 1) * 50, page * 50), count: filtered.length, page, pageSize: 50, totals: retentionTotals(filtered) }));
  }
  if (['/api/purchase-invoices', '/api/accounting-suppliers', '/api/accounting-accounts'].includes(url.pathname)) return new Response('[]');
  throw new Error(`Lectura no prevista: ${url.pathname}`);
};
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={queryClient}>
  <p className="p-3 text-sm">Prueba visual · Datos ficticios · Sin conexión a Administración</p>
  <PurchaseInvoices />
</QueryClientProvider>);

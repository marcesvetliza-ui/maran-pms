import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
vi.mock('../billing/billingConfig', async (importOriginal) => {
 const actual = await importOriginal<typeof import('../billing/billingConfig')>();
 return { ...actual, getBillingConfig: async () => ({ ...(await actual.getBillingConfig()), modoArca: false, arcaAmbiente: 'ficticio' }) };
});
import { db } from '../db';
import { calculateCheckoutDiscount } from '@shared/checkoutDiscount';
import { reconcileReservationCreditInvoice } from '../billing/reservationCreditReconciliation';
const suite = process.env.DATABASE_URL ? describe : describe.skip;
suite('checkout discount persistence', () => {
  it('applies once under concurrent recovery and leaves cash untouched', async () => {
    const reservationId = randomUUID(); const folioId = randomUUID(); let invoiceId = 0;
    const discount = calculateCheckoutDiscount({ accommodation: 100 }, { type: 'percent', value: 10, reason: 'Efectivo' });
    try {
      await db.execute(sql`INSERT INTO folios (id,codigo,entity_type,entity_id) VALUES (${folioId},${'test-'+randomUUID()},'reservation',${reservationId})`);
      await db.execute(sql`INSERT INTO folio_movements (folio_id,type,amount,description) VALUES (${folioId},'charge',100,'Alojamiento')`);
      const intent = { operationId: randomUUID(), invoiceTotal: 90, payments: [], ordinaryAdvances: [], status: 'pending', checkoutDiscount: discount };
      const inserted = await db.execute(sql`INSERT INTO sales_invoices (tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_condicion_iva,monto_neto,monto_total,estado,reserva_id,folio_id,credit_reapplication_intent)
        VALUES ('FB',1,1,CURRENT_DATE,'Prueba','Consumidor Final',90,90,'emitida',${reservationId},${folioId},${JSON.stringify(intent)}::jsonb) RETURNING id`);
      invoiceId = Number((inserted.rows[0] as any).id);
      await Promise.all([reconcileReservationCreditInvoice(invoiceId), reconcileReservationCreditInvoice(invoiceId)]);
      await reconcileReservationCreditInvoice(invoiceId);
      const charges = await db.execute(sql`SELECT amount,description FROM charges WHERE reservation_id=${reservationId}`);
      expect(charges.rows).toHaveLength(1); expect(Number((charges.rows[0] as any).amount)).toBe(-10);
      expect((charges.rows[0] as any).description).toContain('Efectivo');
      const movements = await db.execute(sql`SELECT type,amount FROM folio_movements WHERE folio_id=${folioId} AND type='discount'`);
      expect(movements.rows).toHaveLength(1); expect(Number((movements.rows[0] as any).amount)).toBe(10);
      const folio = await db.execute(sql`SELECT balance FROM folios WHERE id=${folioId}`);
      expect(Number((folio.rows[0] as any).balance)).toBe(90);
      const payments = await db.execute(sql`SELECT id FROM payments WHERE reservation_id=${reservationId}`);
      expect(payments.rows).toHaveLength(0);
      const cash = await db.execute(sql`SELECT id FROM cash_movements WHERE source_id=${String(invoiceId)} AND source_type='checkout_discount'`);
      expect(cash.rows).toHaveLength(0);
    } finally {
      await db.execute(sql`DELETE FROM charges WHERE reservation_id=${reservationId}`);
      await db.execute(sql`DELETE FROM folio_movements WHERE folio_id=${folioId}`);
      if (invoiceId) await db.execute(sql`DELETE FROM sales_invoices WHERE id=${invoiceId}`);
      await db.execute(sql`DELETE FROM folios WHERE id=${folioId}`);
    }
  });
});

suite('checkout discount invoice endpoint', () => {
  it.each(['percent','fixed'] as const)('issues net invoice with %s discount, rejects tampering and recovers once', async (type) => {
    const reservationId = randomUUID(); let server: Server | undefined;
    const { registerBillingRoutes } = await import('../billing/routes');
    const { loadRolePermissionsCache } = await import('../permissions');
    await loadRolePermissionsCache();
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { req.user = { id: 'discount-test', username: 'discount-test', role: 'admin' } as any; req.isAuthenticated = () => true; next(); });
    const { registerReservationsRoutes } = await import('../routes/reservations');
    registerReservationsRoutes(app);
    registerBillingRoutes(app);
    server = await new Promise<Server>(resolve => { const started = app.listen(0, '127.0.0.1', () => resolve(started)); });
    const address = server.address() as any; const url = `http://127.0.0.1:${address.port}/api/billing/invoices`;
    const post = async (body: any) => { const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: response.status, body: await response.json() }; };
    try {
      await db.execute(sql`INSERT INTO reservations (id,reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,total_room_amount,status,created_at)
        VALUES (${reservationId},${'D-'+randomUUID()},${randomUUID()},${randomUUID()},${randomUUID()},CURRENT_DATE,CURRENT_DATE+1,100,'checked_in',NOW())`);
      const body = { tipoComprobante: 'FB', cliente: { razonSocial: 'Consumidor Final', condicionIva: 'Consumidor Final' }, reservaId: reservationId,
        creditOperationId: randomUUID(), sourceChargeIds: ['accommodation'], sourceChargeAmounts: { accommodation: 90 },
        items: [{ descripcion: 'Alojamiento', cantidad: 1, precioUnitario: 90, alicuotaIva: '21', subtotalNeto: 74.38, subtotal: 90 }],
        cashFormaPago: 'efectivo', cashFormaPagoDetalle: [{ method: 'efectivo', amount: 90 }],
        checkoutDiscount: { type, value: 10, reason: 'Efectivo', originalSourceAmounts: { accommodation: 100 } } };
      expect((await post({ ...body, checkoutDiscount: { ...body.checkoutDiscount, reason: '' } })).status).toBe(400);
      const advanceId = randomUUID();
      await db.execute(sql`INSERT INTO payments (id,reservation_id,amount,method,date,status) VALUES (${advanceId},${reservationId},95,'efectivo',CURRENT_DATE,'active')`);
      expect((await post(body)).status).toBe(409);
      await db.execute(sql`DELETE FROM payments WHERE id=${advanceId}`);
      const issued = await post(body); expect(issued.status, JSON.stringify(issued.body)).toBe(201);
      expect(Number(issued.body.montoTotal ?? issued.body.monto_total)).toBe(90);
      const retry = await post(body); expect(retry.status, JSON.stringify(retry.body)).toBe(201);
      expect(retry.body.id).toBe(issued.body.id);
      expect((await post({ ...body, checkoutDiscount: { ...body.checkoutDiscount, reason: 'Otro' } })).status).toBe(409);
      const duplicate = await post({ ...body, creditOperationId: randomUUID() }); expect(duplicate.status, JSON.stringify(duplicate.body)).toBe(409);
      const listResponse = await fetch(`http://127.0.0.1:${address.port}/api/reservations/${reservationId}/invoices`);
      const list = await listResponse.json() as any[];
      expect(list[0].credit_reapplication_intent.checkoutDiscount.amount).toBe(10);
      const invoices = await db.execute(sql`SELECT id FROM sales_invoices WHERE reserva_id=${reservationId}`); expect(invoices.rows).toHaveLength(1);
      const reductions = await db.execute(sql`SELECT amount FROM charges WHERE reservation_id=${reservationId}`); expect(reductions.rows).toHaveLength(1); expect(Number((reductions.rows[0] as any).amount)).toBe(-10);
      await db.execute(sql`INSERT INTO sales_invoices (tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_condicion_iva,monto_neto,monto_total,estado,reserva_id,nota_credito_id,source_charge_amounts)
        VALUES ('NCB',1,1,CURRENT_DATE,'Prueba','Consumidor Final',90,90,'emitida',${reservationId},${Number(issued.body.id)},${JSON.stringify({ accommodation: 90 })}::jsonb)`);
      await db.execute(sql`UPDATE sales_invoices SET monto_acreditado=90,estado='anulada' WHERE id=${Number(issued.body.id)}`);
      const { checkoutDiscount: _discount, ...replacement } = body;
      expect((await post({ ...replacement, creditOperationId: randomUUID() })).status).toBe(201);
      const leftover = await post({ ...replacement, creditOperationId: randomUUID(), sourceChargeAmounts: { accommodation: 10 },
        items: [{ ...body.items[0], subtotal: 10, precioUnitario: 10 }], cashFormaPagoDetalle: [{ method: 'efectivo', amount: 10 }] });
      expect(leftover.status, JSON.stringify(leftover.body)).toBe(409);

    } finally {
      await new Promise<void>(resolve => server!.close(() => resolve()));
      await db.execute(sql`DELETE FROM charges WHERE reservation_id=${reservationId}`);
      await db.execute(sql`DELETE FROM folio_movements WHERE folio_id IN (SELECT id FROM folios WHERE entity_id=${reservationId})`);
      await db.execute(sql`DELETE FROM sales_invoices WHERE reserva_id=${reservationId}`);
      await db.execute(sql`DELETE FROM folios WHERE entity_id=${reservationId}`);
      await db.execute(sql`DELETE FROM payments WHERE reservation_id=${reservationId}`);
      await db.execute(sql`DELETE FROM reservations WHERE id=${reservationId}`);
    }
  });
});

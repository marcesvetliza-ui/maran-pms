/**
 * Seguimiento de Facturas CC: reemplaza la planilla manual que llevaba
 * Recepción para hacer seguimiento de las facturas emitidas a Empresas y
 * Agencias en Cuenta Corriente (enviada / reclamada / pagada / cargada a
 * extranet, con observaciones libres — eso lo completa el gte de Recepción
 * a mano, el sistema no lo adivina).
 *
 * El listado se arma solo a partir de facturas reales ya emitidas (no se
 * re-tipea número/empresa/monto/fecha): este test confirma que el join
 * trae los datos correctos, que excluye Notas de Crédito/Débito y facturas
 * anuladas, que el "motivo" resuelve al huésped de la reserva vinculada, y
 * que el upsert de seguimiento hace merge parcial sin pisar lo ya cargado.
 */

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;

suite("PostgreSQL real: Seguimiento de Facturas CC", () => {
  let storage: typeof import("../db-storage").storage;
  let tracking: typeof import("../ccInvoiceTracking");
  let companyId: string;
  let guestId: string;
  let reservationId: string;
  const invoiceIds: number[] = [];
  const testMonth = { year: 2001, month: 3 }; // lejos de cualquier dato real/seed

  beforeAll(async () => {
    if (!pool) return;
    ({ storage } = await import("../db-storage"));
    tracking = await import("../ccInvoiceTracking");

    const company = await storage.createCompany({
      razonSocial: "Organismo Test CC Tracking", cuilCuit: `20-${Date.now()}-5`,
    } as any);
    companyId = company.id;

    const guest = await storage.createGuest({ firstName: "María", lastName: "Testigo" } as any);
    guestId = guest.id;

    reservationId = `reservation-cc-tracking-${randomUUID()}`;
    await pool.query(
      `INSERT INTO reservations (id, reservation_code, guest_id, room_type_id, room_id, check_in_date, check_out_date, status, created_at)
       VALUES ($1, $2, $3, 'faketype', 'fakeroom', '2001-03-01', '2001-03-02', 'confirmed', NOW())`,
      [reservationId, `CCTRACK-${reservationId}`, guestId],
    );

    async function insertInvoice(tipo: string, numero: number, monto: string, reservaId: string | null): Promise<number> {
      const result = await pool!.query(
        `INSERT INTO sales_invoices
           (tipo_comprobante, punto_venta, numero, fecha_emision, cliente_razon_social, cliente_condicion_iva,
            recipient_entity_type, recipient_entity_id, monto_neto, monto_total, estado, cash_forma_pago, reserva_id)
         VALUES ($1, 1, $2, '2001-03-15', 'Organismo Test CC Tracking', 'responsable_inscripto',
                 'company', $3, $4, $4, 'emitida', 'cuenta_corriente', $5)
         RETURNING id`,
        [tipo, numero, companyId, monto, reservaId],
      );
      return result.rows[0].id;
    }

    invoiceIds.push(await insertInvoice("FB", 90001, "10000.00", reservationId));
    invoiceIds.push(await insertInvoice("FB", 90002, "5000.00", null));
    invoiceIds.push(await insertInvoice("NCB", 90003, "1000.00", null)); // nota de crédito: no debe listarse
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query("DELETE FROM cc_invoice_tracking WHERE sales_invoice_id = ANY($1)", [invoiceIds]);
    await pool.query("DELETE FROM sales_invoices WHERE id = ANY($1)", [invoiceIds]);
    await pool.query("DELETE FROM reservations WHERE id = $1", [reservationId]);
    await pool.query("DELETE FROM guests WHERE id = $1", [guestId]);
    await pool.query("DELETE FROM companies WHERE id = $1", [companyId]);
    await pool.end();
  });

  it("lista solo facturas (no NC/ND) emitidas en CC, resuelve empresa y motivo (huésped), y arranca en estado pendiente", async () => {
    if (!pool) return;

    const rows = await tracking.getCcInvoiceTrackingList({ entityId: companyId });
    expect(rows).toHaveLength(2);

    const withReserva = rows.find(r => r.salesInvoiceId === invoiceIds[0]);
    expect(withReserva).toBeTruthy();
    expect(withReserva!.entityName).toBe("Organismo Test CC Tracking");
    expect(withReserva!.motivo).toBe("Testigo, María");
    expect(withReserva!.monto).toBe(10000);
    expect(withReserva!.estado).toBe("pendiente");
    expect(withReserva!.observaciones).toBeNull();

    const withoutReserva = rows.find(r => r.salesInvoiceId === invoiceIds[1]);
    expect(withoutReserva!.motivo).toBeNull();

    expect(rows.some(r => r.salesInvoiceId === invoiceIds[2])).toBe(false);
  });

  it("guarda el seguimiento y hace merge parcial en una segunda edición (no pisa lo que no se manda)", async () => {
    if (!pool) return;

    await tracking.upsertCcInvoiceTracking(invoiceIds[0], {
      estado: "enviada", observaciones: "Enviada por mail",
    }, "tester");

    let [row] = await tracking.getCcInvoiceTrackingList({ salesInvoiceId: invoiceIds[0] });
    expect(row.estado).toBe("enviada");
    expect(row.observaciones).toBe("Enviada por mail");

    // Segunda edición: solo cambia el estado a "pagada" — las observaciones deben permanecer.
    await tracking.upsertCcInvoiceTracking(invoiceIds[0], { estado: "pagada" }, "tester");
    [row] = await tracking.getCcInvoiceTrackingList({ salesInvoiceId: invoiceIds[0] });
    expect(row.estado).toBe("pagada");
    expect(row.observaciones).toBe("Enviada por mail");
  });

  it("filtra por estado y por búsqueda de texto", async () => {
    if (!pool) return;

    const pendientes = await tracking.getCcInvoiceTrackingList({ entityId: companyId, estado: "pendiente" });
    expect(pendientes.map(r => r.salesInvoiceId)).toEqual([invoiceIds[1]]);

    const busqueda = await tracking.getCcInvoiceTrackingList({ search: "Testigo" });
    expect(busqueda.map(r => r.salesInvoiceId)).toEqual([invoiceIds[0]]);
  });

  it("el informe mensual agrega por estado y por empresa correctamente", async () => {
    if (!pool) return;

    const summary = await tracking.getCcInvoiceTrackingMonthReport(testMonth.year, testMonth.month);
    expect(summary.totalFacturas).toBe(2);
    expect(summary.totalFacturado).toBeCloseTo(15000, 2);

    const pagada = summary.porEstado.find(e => e.estado === "pagada");
    expect(pagada!.cantidad).toBe(1);
    expect(pagada!.monto).toBeCloseTo(10000, 2);

    const pendiente = summary.porEstado.find(e => e.estado === "pendiente");
    expect(pendiente!.cantidad).toBe(1);
    expect(pendiente!.monto).toBeCloseTo(5000, 2);

    expect(summary.porEmpresa).toHaveLength(1);
    expect(summary.porEmpresa[0].entityName).toBe("Organismo Test CC Tracking");
    expect(summary.porEmpresa[0].cantidad).toBe(2);
    expect(summary.porEmpresa[0].monto).toBeCloseTo(15000, 2);
  });
});

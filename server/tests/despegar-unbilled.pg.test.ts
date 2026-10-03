/**
 * Reservas de Despegar que ya hicieron check-out y todavía no tienen
 * factura vigente vinculada (p. ej. tarifas en USD, pendientes de la
 * orden de pago de Despegar). Pedido de la jefa de comercial: que
 * aparezcan en el reporte nocturno para que ninguna se pierda de vista.
 */

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;

suite("PostgreSQL real: Reservas Despegar sin facturar", () => {
  let storage: typeof import("../db-storage").storage;
  let despegarUnbilled: typeof import("../despegarUnbilled");
  let guestId: string;
  let roomId: string;
  const reservationIds: string[] = [];
  const invoiceIds: number[] = [];

  async function insertReservation(opts: {
    source: string; status: string; checkIn: string; checkOut: string; code: string;
  }): Promise<string> {
    const id = `reservation-despegar-${randomUUID()}`;
    await pool!.query(
      `INSERT INTO reservations
         (id, reservation_code, guest_id, room_type_id, room_id, check_in_date, check_out_date,
          status, source, total_room_amount, created_at)
       VALUES ($1, $2, $3, 'faketype', $4, $5, $6, $7, $8, 50000, NOW())`,
      [id, opts.code, guestId, roomId, opts.checkIn, opts.checkOut, opts.status, opts.source],
    );
    reservationIds.push(id);
    return id;
  }

  async function insertInvoice(reservaId: string, estado: string, numero: number): Promise<number> {
    const result = await pool!.query(
      `INSERT INTO sales_invoices
         (tipo_comprobante, punto_venta, numero, fecha_emision, cliente_razon_social, cliente_condicion_iva,
          monto_neto, monto_total, estado, reserva_id)
       VALUES ('FB', 1, $1, '2001-04-15', 'Despegarcomar SA', 'responsable_inscripto', 50000, 50000, $2, $3)
       RETURNING id`,
      [numero, estado, reservaId],
    );
    const id = result.rows[0].id;
    invoiceIds.push(id);
    return id;
  }

  beforeAll(async () => {
    if (!pool) return;
    ({ storage } = await import("../db-storage"));
    despegarUnbilled = await import("../despegarUnbilled");

    const guest = await storage.createGuest({ firstName: "Carla", lastName: "Despegartest" } as any);
    guestId = guest.id;

    const roomRow = await pool.query("SELECT id FROM rooms LIMIT 1");
    roomId = roomRow.rows[0].id;
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query("DELETE FROM sales_invoices WHERE id = ANY($1)", [invoiceIds]);
    await pool.query("DELETE FROM reservations WHERE id = ANY($1)", [reservationIds]);
    await pool.query("DELETE FROM guests WHERE id = $1", [guestId]);
    await pool.end();
  });

  it("incluye una reserva Despegar con checkout y sin factura, y excluye las que no corresponden", async () => {
    if (!pool) return;

    const unbilled = await insertReservation({
      source: "despegar", status: "checked_out", checkIn: "2001-04-10", checkOut: "2001-04-15", code: "DESP-UNBILLED",
    });
    const billed = await insertReservation({
      source: "despegar", status: "checked_out", checkIn: "2001-04-10", checkOut: "2001-04-15", code: "DESP-BILLED",
    });
    await insertInvoice(billed, "emitida", 70001);
    const onlyVoidedInvoice = await insertReservation({
      source: "despegar", status: "checked_out", checkIn: "2001-04-10", checkOut: "2001-04-15", code: "DESP-VOIDED-INVOICE",
    });
    await insertInvoice(onlyVoidedInvoice, "anulada", 70002);
    const stillCheckedIn = await insertReservation({
      source: "despegar", status: "checked_in", checkIn: "2001-04-10", checkOut: "2001-04-20", code: "DESP-CHECKEDIN",
    });
    const otherSource = await insertReservation({
      source: "directo", status: "checked_out", checkIn: "2001-04-10", checkOut: "2001-04-15", code: "DIRECTO-UNBILLED",
    });

    const rows = await despegarUnbilled.getDespegarUnbilledCheckouts();
    const ids = rows.map(r => r.reservationId);

    expect(ids).toContain(unbilled);
    expect(ids).toContain(onlyVoidedInvoice); // la factura anulada no cuenta como facturada
    expect(ids).not.toContain(billed);
    expect(ids).not.toContain(stillCheckedIn); // todavía no hizo check-out
    expect(ids).not.toContain(otherSource); // no es de Despegar

    const row = rows.find(r => r.reservationId === unbilled)!;
    expect(row.reservationCode).toBe("DESP-UNBILLED");
    expect(row.guestName).toBe("Despegartest, Carla");
    expect(row.checkOutDate).toBe("2001-04-15");
    expect(row.totalRoomAmount).toBe(50000);
  });
});

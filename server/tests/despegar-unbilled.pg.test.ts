import pg from "pg";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("../db", () => ({ db: { execute } }));

const suite = process.env.DATABASE_URL ? describe : describe.skip;

suite("Despegar: consulta real en tablas temporales aisladas", () => {
  let client: pg.Client;
  let getRows: typeof import("../despegarUnbilled").getDespegarUnbilledCheckouts;

  beforeAll(async () => {
    client = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      types: {
        getTypeParser(oid: number) {
          return oid === 1082 ? (value: string) => value : pg.types.getTypeParser(oid);
        },
      },
    });
    await client.connect();
    // Nunca acceder a tablas de negocio: todas las tablas viven en esta sesión
    // y desaparecen al cerrar la conexión, incluso ante una prueba fallida.
    await client.query(`
      BEGIN;
      SET LOCAL search_path TO pg_temp;
      CREATE TEMP TABLE agencies (id text, razon_social text, nombre_fantasia text);
      CREATE TEMP TABLE rooms (id text, room_number text);
      CREATE TEMP TABLE guests (id text, last_name text, first_name text);
      CREATE TEMP TABLE reservations (
        id text, reservation_code text, room_id text, guest_id text, agency_id text,
        source text, status text, check_in_date date, check_out_date date,
        total_room_amount numeric
      );
      CREATE TEMP TABLE sales_invoices (reserva_id text, estado text, monto_total numeric);
      INSERT INTO rooms VALUES ('room-test', '202');
      INSERT INTO guests VALUES ('guest-test', 'Prueba', 'Despegar');
      INSERT INTO agencies VALUES
        ('despegar-legal', 'DESPEGAR.COM.AR SA', NULL),
        ('despegar-fantasia', 'Otra razón social', ' despegar '),
        ('lookalike', 'Viajes Despegar del Sur SA', 'Despegar del Sur'),
        ('other', 'Otra agencia', 'Otra agencia');
    `);
    const dialect = new PgDialect();
    execute.mockImplementation((query) => {
      const compiled = dialect.sqlToQuery(query);
      return client.query(compiled.sql, compiled.params);
    });
    ({ getDespegarUnbilledCheckouts: getRows } = await import("../despegarUnbilled"));
  });

  afterAll(async () => {
    if (client) {
      await client.query("ROLLBACK").catch(() => {});
      await client.end();
    }
  });

  async function add(id: string, options: { source?: string; agency?: string; status?: string; total?: number | null; invoices?: { amount: number; status: string }[] } = {}) {
    await client.query(
      `INSERT INTO reservations VALUES ($1, $2, 'room-test', 'guest-test', $3, $4, $5, '2026-10-01', '2026-10-02', $6)`,
      [id, `RES-TEST-${id}`, options.agency ?? "despegar-legal", options.source ?? "agencia", options.status ?? "checked_out", options.total === undefined ? 0 : options.total],
    );
    for (const invoice of options.invoices ?? []) {
      await client.query("INSERT INTO sales_invoices VALUES ($1, $2, $3)", [id, invoice.status, invoice.amount]);
    }
  }

  it("incluye el caso de la 202, agencia por razón social/fantasía y origen histórico", async () => {
    await add("zero-cc");
    await add("fantasia", { agency: "despegar-fantasia", total: 50000 });
    await add("legacy", { source: "despegar", agency: undefined });
    await client.query("UPDATE reservations SET agency_id = NULL WHERE id = 'legacy'");
    await add("zero-invoice", { invoices: [{ amount: 0, status: "emitida" }] });
    await add("voided-invoice", { invoices: [{ amount: 100, status: "anulada" }] });
    await add("billed", { invoices: [{ amount: 100, status: "emitida" }, { amount: 0, status: "emitida" }] });
    await add("in-house", { status: "checked_in" });
    await add("cancelled", { status: "cancelled" });
    await add("other", { agency: "other" });
    await add("lookalike", { agency: "lookalike" });
    await add("no-agency", { agency: "" });

    const rows = await getRows();
    expect(rows.map(row => row.reservationId).sort()).toEqual([
      "fantasia", "legacy", "voided-invoice", "zero-cc", "zero-invoice",
    ]);
    expect(rows.find(row => row.reservationId === "zero-cc")).toMatchObject({
      roomNumber: "202", totalRoomAmount: 0, checkInDate: "2026-10-01", checkOutDate: "2026-10-02",
    });
  });
});
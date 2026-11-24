import express from "express";
import http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL })
  : null;
let server: http.Server,
  base: string,
  authenticated = true,
  role = "admin";
type Fixture = {
  id: string;
  reservation: string;
  second: string;
  old: string;
  next: string;
};
const fixtures: Fixture[] = [];
async function fixture(financial = false) {
  const id = "holder-" + randomUUID();
  const f = {
    id,
    reservation: id + "-r",
    second: id + "-other",
    old: id + "-old",
    next: id + "-next",
  };
  fixtures.push(f);
  await pool!.query(
    "INSERT INTO room_types(id,code,name) VALUES($1,$2,'Holder test')",
    [id, id],
  );
  await pool!.query(
    "INSERT INTO rooms(id,room_number,room_type_id,status) VALUES($1,$2,$3,'occupied')",
    [id, id, id],
  );
  for (const [guestId, name] of [
    [f.old, "Original"],
    [f.next, "Correcto"],
  ])
    await pool!.query(
      "INSERT INTO guests(id,first_name,last_name,document_number) VALUES($1,$2,'Prueba',$3)",
      [guestId, name, guestId],
    );
  await pool!.query(
    "INSERT INTO groups(id,group_code,name,check_in_date,check_out_date,created_at) VALUES($1,$2,'Holder group','2027-01-01','2027-01-03',now())",
    [id, id],
  );
  for (const reservationId of [f.reservation, f.second])
    await pool!.query(
      `INSERT INTO reservations(id,reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,nights,status,number_of_guests,created_at,final_rate_per_night,total_room_amount,notes)
    VALUES($1,$2,$3,$4,$5,'2027-01-01','2027-01-03',2,'checked_in',2,now(),500,1000,'Original notes')`,
      [reservationId, reservationId, f.old, id, id],
    );
  await pool!.query(
    "INSERT INTO group_reservation_links(group_id,reservation_id) VALUES($1,$2)",
    [id, f.reservation],
  );
  const stay = {
    guestId: f.old,
    version: 4,
    family: [
      {
        id: "family",
        firstName: "Acompañante",
        lastName: "Prueba",
        documentType: "DNI",
        documentNumber: id + "-comp",
        dateOfBirth: "",
        nationality: "",
        relationship: "Familiar",
      },
    ],
    vehicles: [
      { id: "vehicle", plate: "TEST", brand: "", model: "", color: "" },
    ],
    pets: [{ id: "pet", name: "Mascota", species: "Perro", notes: "" }],
  };
  await pool!.query("UPDATE reservations SET stay_details=$2 WHERE id=$1", [
    f.reservation,
    JSON.stringify(stay),
  ]);
  await pool!.query(
    "INSERT INTO reservation_companions(reservation_id,first_name,last_name,document_number,profile_member_id) VALUES($1,'Acompañante','Prueba',$2,'family')",
    [f.reservation, id + "-comp"],
  );
  if (financial) {
    await pool!.query(
      "INSERT INTO charges(id,reservation_id,description,amount,date,category) VALUES($1,$2,'Consumo original',300,CURRENT_DATE,'restaurant')",
      [id, f.reservation],
    );
    await pool!.query(
      "INSERT INTO payments(id,reservation_id,amount,method,date,status,billing_target,reference) VALUES($1,$2,400,'efectivo',CURRENT_DATE,'active','guest','Referencia original')",
      [id, f.reservation],
    );
    await pool!.query(
      "INSERT INTO cash_shifts(id,area,shift_number,status,opened_at,opened_by) VALUES($1,'reception',887766,'open',now(),'synthetic')",
      [id],
    );
    await pool!.query(
      "INSERT INTO cash_movements(id,shift_id,area,source_type,source_id,payment_method,amount,movement_type,payment_id,registered_by) VALUES($1,$2,'reception','reservation',$3,'efectivo',400,'income',$4,'synthetic')",
      [id, id, f.reservation, id],
    );
    await pool!.query(
      "INSERT INTO folios(id,codigo,entity_type,entity_id,status,total_charges,total_payments,balance) VALUES($1,$2,'reservation',$3,'open',1300,400,900)",
      [id, id, f.reservation],
    );
    await pool!.query(
      "INSERT INTO folio_movements(folio_id,type,amount,description,source_type,source_id) VALUES($1,'charge',300,'Consumo original','charge',$2)",
      [id, id],
    );
    await pool!.query(
      "INSERT INTO account_movements(id,entity_type,entity_id,date,type,description,amount,reservation_id,guest_name) VALUES($1,'guest',$2,CURRENT_DATE,'cargo','Deuda original',200,$3,'Original Prueba')",
      [id, f.old, f.reservation],
    );
    await pool!.query(
      "INSERT INTO sales_invoices(tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_condicion_iva,monto_neto,monto_iva21,monto_total,estado,items,reserva_id,group_id) VALUES('FB',99999,nextval('group_payments_receipt_number_seq'),CURRENT_DATE,'Destinatario original','Consumidor Final',1000,0,1000,'emitida','[]',$1,$2)",
      [f.reservation, id],
    );
  }
  return f;
}
async function readReservation(f: Fixture) {
  return (
    await pool!.query("SELECT * FROM reservations WHERE id=$1", [f.reservation])
  ).rows[0];
}
async function finances(f: Fixture) {
  const result: Record<string, any> = {};
  for (const [table, column, value] of [
    ["charges", "reservation_id", f.reservation],
    ["payments", "reservation_id", f.reservation],
    ["cash_movements", "source_id", f.reservation],
    ["folios", "entity_id", f.reservation],
    ["folio_movements", "folio_id", f.id],
    ["account_movements", "reservation_id", f.reservation],
    ["sales_invoices", "reserva_id", f.reservation],
  ]) {
    result[table] = (
      await pool!.query(
        `SELECT to_jsonb(t) AS value FROM ${table} t WHERE ${column}=$1 ORDER BY id`,
        [value],
      )
    ).rows;
  }
  return result;
}
async function request(
  f: Fixture,
  patch: Record<string, unknown> = {},
  method = "POST",
) {
  const response = await fetch(
    `${base}/api/reservations/${f.reservation}/holder-correction`,
    {
      method,
      headers: { "Content-Type": "application/json" },
      body:
        method === "GET"
          ? undefined
          : JSON.stringify({
              guestId: f.next,
              expectedGuestId: f.old,
              reason: "Se registró otro pasajero por error al ingresar.",
              confirmed: true,
              ...patch,
            }),
    },
  );
  return { status: response.status, body: (await response.json()) as any };
}
suite("Corrección auditada del titular de una estadía iniciada", () => {
  beforeAll(async () => {
    const { loadRolePermissionsCache } = await import("../permissions");
    await loadRolePermissionsCache();
    const { registerReservationHolderRoutes } = await import(
      "../routes/reservation-holder"
    );
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = {
        id: "holder-test-operator",
        username: "Recepción prueba",
        role,
      } as any;
      req.isAuthenticated = () => authenticated;
      next();
    });
    registerReservationHolderRoutes(app);
    server = http.createServer(app);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  afterAll(async () => {
    if (server?.listening) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    for (const f of fixtures) {
      for (const table of ["audit_logs"])
        await pool!.query(`DELETE FROM ${table} WHERE entity_id=$1`, [
          f.reservation,
        ]);
      for (const table of [
        "reservation_changelog",
        "reservation_companions",
        "account_movements",
        "charges",
        "payments",
      ])
        await pool!.query(`DELETE FROM ${table} WHERE reservation_id=$1`, [
          f.reservation,
        ]);
      await pool!.query("DELETE FROM sales_invoices WHERE reserva_id=ANY($1::varchar[]) OR group_id=$2", [
        [f.reservation, f.second], f.id,
      ]);
      await pool!.query("DELETE FROM cash_movements WHERE shift_id=$1", [f.id]);
      await pool!.query("DELETE FROM cash_shifts WHERE id=$1", [f.id]);
      await pool!.query("DELETE FROM folio_movements WHERE folio_id=$1", [
        f.id,
      ]);
      await pool!.query("DELETE FROM folios WHERE id=$1", [f.id]);
      await pool!.query(
        "DELETE FROM group_reservation_links WHERE group_id=$1",
        [f.id],
      );
      await pool!.query(
        "DELETE FROM reservations WHERE id=ANY($1::varchar[])",
        [[f.reservation, f.second]],
      );
      await pool!.query("DELETE FROM groups WHERE id=$1", [f.id]);
      await pool!.query("DELETE FROM rooms WHERE id=$1", [f.id]);
      await pool!.query("DELETE FROM room_types WHERE id=$1", [f.id]);
      await pool!.query("DELETE FROM guests WHERE id=ANY($1::varchar[])", [
        [f.old, f.next],
      ]);
    }
    await pool?.end();
  });
  it("corrects a group stay with charges, payments, an invoice and current-account debt while preserving all financial rows and guest profiles", async () => {
    const f = await fixture(true),
      before = await readReservation(f),
      money = await finances(f);
    const people = (
      await pool!.query(
        "SELECT * FROM guests WHERE id=ANY($1::varchar[]) ORDER BY id",
        [[f.old, f.next]],
      )
    ).rows;
    const companions = (
      await pool!.query(
        "SELECT * FROM reservation_companions WHERE reservation_id=$1",
        [f.reservation],
      )
    ).rows;
    const preview = await request(f, {}, "GET");
    expect(preview.body).toMatchObject({
      canCorrect: true,
      groupLinked: true,
      companionCount: 1,
      guest: { id: f.old },
    });
    expect(
      (
        await pool!.query(
          "SELECT id FROM reservation_changelog WHERE reservation_id=$1",
          [f.reservation],
        )
      ).rows,
    ).toHaveLength(0);
    expect((await request(f)).status).toBe(200);
    const after = await readReservation(f);
    expect(after.guest_id).toBe(f.next);
    expect(after.stay_details).toEqual({
      ...before.stay_details,
      guestId: f.next,
      version: 5,
    });
    for (const key of Object.keys(before).filter(
      (key) => !["guest_id", "stay_details", "last_modified_by"].includes(key),
    ))
      expect(after[key], key).toEqual(before[key]);
    expect(await finances(f)).toEqual(money);
    expect(
      (
        await pool!.query(
          "SELECT * FROM guests WHERE id=ANY($1::varchar[]) ORDER BY id",
          [[f.old, f.next]],
        )
      ).rows,
    ).toEqual(people);
    expect(
      (
        await pool!.query(
          "SELECT * FROM reservation_companions WHERE reservation_id=$1",
          [f.reservation],
        )
      ).rows,
    ).toEqual(companions);
    expect(
      (
        await pool!.query("SELECT guest_id FROM reservations WHERE id=$1", [
          f.second,
        ])
      ).rows[0].guest_id,
    ).toBe(f.old);
    const history = (
      await pool!.query(
        "SELECT * FROM reservation_changelog WHERE reservation_id=$1",
        [f.reservation],
      )
    ).rows;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      operador: "Recepción prueba",
      tipo: "huesped",
    });
    expect(history[0].descripcion).toContain("Original");
    expect(history[0].descripcion).toContain("Correcto");
    expect(history[0].descripcion).toContain("por error");
    const audit = (
      await pool!.query("SELECT * FROM audit_logs WHERE entity_id=$1", [
        f.reservation,
      ])
    ).rows;
    expect(audit).toHaveLength(1);
    expect(JSON.parse(audit[0].details)).toMatchObject({
      previousGuestId: f.old,
      guestId: f.next,
    });
    expect(audit[0].timestamp).toBeTruthy();
  });
  it("requires a reason and confirmation and rejects attempts to change other fields", async () => {
    const f = await fixture();
    for (const patch of [
      { reason: "" },
      { reason: "corto" },
      { confirmed: false },
      { totalRoomAmount: 1 },
      { guestId: f.old },
    ])
      expect((await request(f, patch)).status).toBe(400);
    expect((await readReservation(f)).guest_id).toBe(f.old);
    expect(
      (
        await pool!.query(
          "SELECT id FROM reservation_changelog WHERE reservation_id=$1",
          [f.reservation],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("rejects callers without authentication or the reception reservation permission", async () => {
    const f = await fixture();
    authenticated = false;
    try {
      expect((await request(f)).status).toBe(401);
    } finally {
      authenticated = true;
    }
    role = "no-holder-permission";
    try {
      expect((await request(f, {}, "GET")).status).toBe(403);
      expect((await request(f)).status).toBe(403);
    } finally {
      role = "admin";
    }
  });
  it("rejects closed and pre-arrival stays and keeps legacy group replacement protected", async () => {
    const f = await fixture();
    const { storage } = await import("../db-storage");
    await expect(
      storage.updateReservation(f.reservation, { guestId: f.next }),
    ).rejects.toThrow("antes del check-in");
    for (const status of ["checked_out", "cancelled", "confirmed"]) {
      await pool!.query("UPDATE reservations SET status=$2 WHERE id=$1", [
        f.reservation,
        status,
      ]);
      expect((await request(f)).status).toBe(409);
    }
    expect((await readReservation(f)).guest_id).toBe(f.old);
  });
  it("rejects inactive, group-placeholder and duplicate-companion candidates", async () => {
    const f = await fixture();
    await pool!.query("UPDATE guests SET active=false WHERE id=$1", [f.next]);
    expect((await request(f)).status).toBe(400);
    await pool!.query(
      "UPDATE guests SET active=true,tipo_persona='juridica' WHERE id=$1",
      [f.next],
    );
    expect((await request(f)).status).toBe(400);
    await pool!.query(
      "UPDATE guests SET tipo_persona='fisica',codigo='GROUP-test' WHERE id=$1",
      [f.next],
    );
    expect((await request(f)).status).toBe(400);
    await pool!.query("UPDATE guests SET codigo=NULL WHERE id=$1", [f.next]);
    await pool!.query(
      "UPDATE reservation_companions SET guest_id=$2 WHERE reservation_id=$1",
      [f.reservation, f.next],
    );
    expect((await request(f)).status).toBe(409);
  });
  it("blocks a pending fiscal authorization but preserves issued invoices", async () => {
    const f = await fixture(true);
    await pool!.query(
      "UPDATE sales_invoices SET estado='autorizacion_pendiente' WHERE reserva_id=$1",
      [f.reservation],
    );
    expect((await request(f)).status).toBe(409);
    expect((await readReservation(f)).guest_id).toBe(f.old);
    // Another room's pending invoice must not veto a correction in this room.
    await pool!.query(
      "UPDATE sales_invoices SET reserva_id=$2 WHERE reserva_id=$1",
      [f.reservation, f.second],
    );
    expect((await request(f)).status).toBe(200);
  });
  it("serializes simultaneous confirmations and rejects stale replays without duplicate history", async () => {
    const f = await fixture();
    const results = await Promise.all([request(f), request(f)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      (
        await pool!.query(
          "SELECT id FROM reservation_changelog WHERE reservation_id=$1",
          [f.reservation],
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("rolls back the holder and history if the required audit cannot be persisted", async () => {
    const f = await fixture();
    await pool!.query(
      `CREATE FUNCTION holder_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_id='${f.reservation}' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`,
    );
    await pool!.query(
      "CREATE TRIGGER holder_fail_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION holder_fail_audit()",
    );
    try {
      expect((await request(f)).status).toBe(500);
      expect((await readReservation(f)).guest_id).toBe(f.old);
      expect(
        (
          await pool!.query(
            "SELECT id FROM reservation_changelog WHERE reservation_id=$1",
            [f.reservation],
          )
        ).rows,
      ).toHaveLength(0);
    } finally {
      await pool!.query("DROP TRIGGER holder_fail_audit ON audit_logs");
      await pool!.query("DROP FUNCTION holder_fail_audit()");
    }
  });
});

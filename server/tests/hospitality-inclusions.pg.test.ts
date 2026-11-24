import express from "express";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";

vi.mock("../auth", () => ({
  requireAuth: (req: any, res: any, next: () => void) => {
    const role = req.headers["x-test-role"];
    if (!role) return res.status(401).json({ error: "No autenticado" });
    req.user = {
      role,
      id: "hospitality-test-operator",
      username: "Operador ficticio",
    };
    next();
  },
}));
const url = process.env.DATABASE_URL;
const enabled = !!url && process.env.ALLOW_DESTRUCTIVE_PG_TESTS === "true";
if (
  enabled &&
  (!["localhost", "127.0.0.1"].includes(new URL(url!).hostname) ||
    !/test/i.test(new URL(url!).pathname))
)
  throw Error("Se requiere PostgreSQL local descartable");
const pool = enabled ? new pg.Pool({ connectionString: url }) : null;
const prefix = "hospitality-test-" + randomUUID();
let server: Server, base: string;
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
const nextDate = (date: string, days: number) => {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const rule = (patch: any = {}) => ({
  id: randomUUID(),
  area: "restaurant",
  service: "Cena ficticia",
  quantity: 1,
  basis: "person_night",
  conditions: "Sin bebidas",
  readyWhen: "arrival",
  ...patch,
});
async function api(
  method: string,
  path: string,
  body?: any,
  role: string | null = "admin",
) {
  const r = await fetch(base + "/api/hospitality/included-services" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(role ? { "x-test-role": role } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}
async function fixture(rules = [rule()], people = 2, nights = 2) {
  const id = prefix + "-" + randomUUID();
  await pool!.query(
    "INSERT INTO packages(id,code,name,nights,base_price,created_at) VALUES($1::text,$1::text,'Escapada ficticia',2,100,now())",
    [id],
  );
  await pool!.query(
    "INSERT INTO hospitality_inclusion_templates(owner_type,owner_id,rules,updated_by) VALUES('package',$1::text,$2,'prueba')",
    [id, JSON.stringify(rules)],
  );
  await pool!.query(
    "INSERT INTO room_types(id,name,code) VALUES($1::text,'Categoría ficticia',$1::text)",
    [id],
  );
  await pool!.query(
    "INSERT INTO rooms(id,room_type_id,room_number) VALUES($1::text,$1::text,$1::text)",
    [id],
  );
  await pool!.query(
    "INSERT INTO guests(id,first_name,last_name) VALUES($1::text,'Persona','Ficticia')",
    [id],
  );
  await pool!.query(
    "INSERT INTO reservations(id,reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,number_of_guests,created_at,hospitality_package_id,status) VALUES($1::text,$1::text,$1::text,$1::text,$1::text,$2,$3,$4,now(),$1::text,'checked_in')",
    [id, today(), nextDate(today(), nights), people],
  );
  return id;
}
async function benefits(id: string) {
  return (
    await pool!.query(
      "SELECT b.* FROM hospitality_included_services b JOIN hospitality_included_sources s ON s.id=b.source_id WHERE s.entity_id=$1 ORDER BY service_date NULLS LAST,b.id",
      [id],
    )
  ).rows;
}
async function action(b: any, patch: any = {}) {
  return api("POST", `/${b.id}/actions`, {
    action: "fulfill",
    quantity: 1,
    note: "Atención ficticia",
    version: b.version,
    requestId: randomUUID(),
    ...patch,
  });
}
describe.skipIf(!enabled)(
  "Hospitalidad · incluidos operativos con PostgreSQL",
  () => {
    beforeAll(async () => {
      const { ensureHospitalityInclusionsSchema } = await import(
        "../hospitalityInclusionsSchema"
      );
      await ensureHospitalityInclusionsSchema();
      await ensureHospitalityInclusionsSchema();
      const { loadRolePermissionsCache } = await import("../permissions");
      await loadRolePermissionsCache();
      const { registerHospitalityInclusions } = await import(
        "../hospitalityInclusions"
      );
      const app = express();
      app.use(express.json());
      registerHospitalityInclusions(app);
      server = app.listen(0, "127.0.0.1");
      await new Promise<void>((resolve) => server.once("listening", resolve));
      base = `http://127.0.0.1:${(server.address() as any).port}`;
    });
    afterAll(async () => {
      if (server) {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      if (pool) {
        await pool.query(
          "DELETE FROM hospitality_included_events WHERE source_id IN (SELECT id FROM hospitality_included_sources WHERE entity_id LIKE $1)",
          [prefix + "%"],
        );
        await pool.query(
          "DELETE FROM hospitality_included_services WHERE source_id IN (SELECT id FROM hospitality_included_sources WHERE entity_id LIKE $1)",
          [prefix + "%"],
        );
        await pool.query(
          "DELETE FROM hospitality_included_sources WHERE entity_id LIKE $1",
          [prefix + "%"],
        );
        for (const table of [
          "spa_appointments",
          "spa_treatment_sales",
          "reservations",
          "rooms",
          "room_types",
          "guests",
          "packages",
          "spa_treatments",
        ])
          await pool.query(`DELETE FROM ${table} WHERE id LIKE $1`, [
            prefix + "%",
          ]);
        await pool.query(
          "DELETE FROM hospitality_inclusion_templates WHERE owner_id LIKE $1",
          [prefix + "%"],
        );
        await pool.query(
          "DELETE FROM audit_logs WHERE user_id='hospitality-test-operator'",
        );
        await pool.query(
          "DELETE FROM sales_invoices WHERE cliente_razon_social=$1",
          [prefix],
        );
        await pool.end();
        const db = await import("../db");
        await db.pool.end();
      }
    });
    it("genera una cena por persona y noche y un masaje por estadía, sin cargos", async () => {
      const id = await fixture([
        rule(),
        rule({ area: "spa", service: "Masaje ficticio", basis: "person" }),
      ]);
      const b = await benefits(id);
      expect(b).toHaveLength(3);
      expect(b.reduce((s, r) => s + r.quantity, 0)).toBe(6);
      expect(
        b.filter((r) => r.area === "restaurant").map((r) => r.quantity),
      ).toEqual([2, 2]);
      expect(
        (
          await pool!.query(
            "SELECT count(*)::int n FROM charges WHERE reservation_id=$1",
            [id],
          )
        ).rows[0].n,
      ).toBe(0);
    });
    it("conserva la configuración vendida aunque se cambie la plantilla y se mueva la estadía", async () => {
      const id = await fixture();
      await pool!.query(
        "UPDATE hospitality_inclusion_templates SET rules=$2 WHERE owner_id=$1",
        [id, JSON.stringify([rule({ quantity: 7 })])],
      );
      await pool!.query(
        "UPDATE guests SET first_name='Corregida' WHERE id=$1",
        [id],
      );
      await pool!.query(
        "UPDATE rooms SET room_number='QA-MOVIDA' WHERE id=$1",
        [id],
      );
      await pool!.query(
        "UPDATE reservations SET status='confirmed' WHERE id=$1",
        [id],
      );
      expect((await benefits(id)).map((b) => b.quantity)).toEqual([2, 2]);
      const list = await api("GET", `?view=pending&reservationId=${id}`);
      expect(list.status).toBe(200);
      expect(
        list.body.items.every(
          (b: any) => b.person.includes("Corregida") && b.room === "QA-MOVIDA",
        ),
      ).toBe(true);
      for (const benefit of await benefits(id))
        await action(benefit, {
          action: "acknowledge",
          quantity: undefined,
          note: undefined,
        });
      expect((await api("GET", `?reservationId=${id}`)).body.unseenToday).toBe(
        0,
      );
      await pool!.query(
        "UPDATE reservations SET status='checked_in' WHERE id=$1",
        [id],
      );
      expect((await api("GET", `?reservationId=${id}`)).body.unseenToday).toBe(
        1,
      );
      expect((await benefits(id)).every((b) => b.used === 0)).toBe(true);
    });
    it("visto no consume; atención parcial y reintento conservan una sola utilización", async () => {
      const id = await fixture();
      let [b] = await benefits(id);
      expect(
        (
          await action(b, {
            action: "acknowledge",
            quantity: undefined,
            note: undefined,
          })
        ).status,
      ).toBe(200);
      [b] = await benefits(id);
      expect(b.used).toBe(0);
      const body = {
        action: "fulfill",
        quantity: 1,
        note: "Atención parcial ficticia",
        version: b.version,
        requestId: randomUUID(),
      };
      expect((await api("POST", `/${b.id}/actions`, body)).status).toBe(200);
      expect((await api("POST", `/${b.id}/actions`, body)).status).toBe(200);
      expect(
        (await api("POST", `/${b.id}/actions`, { ...body, quantity: 2 }))
          .status,
      ).toBe(409);
      expect((await benefits(id))[0].used).toBe(1);
      const events = await api("GET", `/${b.id}/events`);
      expect(
        events.body.filter((e: any) => e.action === "fulfill"),
      ).toHaveLength(1);
      expect(events.body[0].actorName).toBe("Operador ficticio");
    });
    it("dos operadores no consumen dos veces la última unidad ni superan el saldo", async () => {
      const id = await fixture([rule({ basis: "stay" })], 1, 1);
      const [b] = await benefits(id);
      const results = await Promise.all([action(b), action(b)]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect((await benefits(id))[0].used).toBe(1);
    });
    it("limita consulta y escritura al área del usuario y rechaza anónimos", async () => {
      const id = await fixture([rule(), rule({ area: "spa", basis: "stay" })]);
      const b = await benefits(id);
      expect((await api("GET", "", undefined, null)).status).toBe(401);
      expect((await api("GET", "", undefined, "housekeeping")).status).toBe(
        403,
      );
      const list = await api(
        "GET",
        `?view=pending&reservationId=${id}`,
        undefined,
        "restaurant",
      );
      expect(list.body.items.every((r: any) => r.area === "restaurant")).toBe(
        true,
      );
      expect(
        (await api("GET", "?area=spa", undefined, "restaurant")).status,
      ).toBe(403);
      const spa = b.find((r) => r.area === "spa");
      expect(
        (
          await api(
            "POST",
            `/${spa.id}/actions`,
            {
              action: "acknowledge",
              version: spa.version,
              requestId: randomUUID(),
            },
            "restaurant",
          )
        ).status,
      ).toBe(404);
    });
    it("cancelar retira pendientes y conserva lo utilizado, sin borrar historial", async () => {
      const id = await fixture();
      const [b] = await benefits(id);
      await action(b);
      await pool!.query(
        "UPDATE reservations SET status='cancelled' WHERE id=$1",
        [id],
      );
      expect(
        (await api("GET", `?view=pending&reservationId=${id}`)).body.items,
      ).toEqual([]);
      const history = await api("GET", `?view=history&reservationId=${id}`);
      expect(history.body.items.find((r: any) => r.id === b.id).used).toBe(1);
      expect((await action((await benefits(id))[0])).status).toBe(409);
      await pool!.query(
        "UPDATE reservations SET status='checked_in' WHERE id=$1",
        [id],
      );
      expect((await benefits(id)).filter((r) => !r.cancelled)).toHaveLength(2);
      expect((await benefits(id))[0].used).toBe(1);
    });
    it("al acortar fechas conserva consumos anteriores y señala revisión", async () => {
      const id = await fixture();
      let b = await benefits(id);
      await pool!.query(
        "UPDATE hospitality_included_services SET used=1 WHERE id=$1",
        [b[1].id],
      );
      await pool!.query(
        "UPDATE reservations SET check_out_date=$2 WHERE id=$1",
        [id, nextDate(today(), 1)],
      );
      b = await benefits(id);
      expect(b[1].cancelled).toBe(true);
      expect(b[1].used).toBe(1);
      expect(b[1].needs_review).toBe(true);
      await pool!.query(
        "UPDATE reservations SET number_of_guests=1 WHERE id=$1",
        [id],
      );
      expect((await benefits(id))[0].quantity).toBe(1);
    });
    it("vende SPA con almuerzo y alojamiento sin asignarlos ni duplicar beneficios al agendar", async () => {
      const id = prefix + "-" + randomUUID();
      await pool!.query(
        "INSERT INTO spa_treatments(id,name,is_circuit) VALUES($1::text,'Circuito ficticio',true)",
        [id],
      );
      await pool!.query(
        "INSERT INTO hospitality_inclusion_templates(owner_type,owner_id,rules,updated_by) VALUES('treatment',$1::text,$2,'prueba')",
        [
          id,
          JSON.stringify([
            rule({ basis: "stay", readyWhen: "spa_completed" }),
            rule({
              area: "reception",
              service: "Una noche ficticia",
              basis: "stay",
              readyWhen: "coordinate",
            }),
          ]),
        ],
      );
      const invoice = (
        await pool!.query(
          "INSERT INTO sales_invoices(tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_condicion_iva,monto_neto,monto_total) VALUES('FB',987654,1,$1::date,$2,'Consumidor Final',100,121) RETURNING id",
          [today(), prefix],
        )
      ).rows[0].id;
      await pool!.query(
        "INSERT INTO spa_treatment_sales(id,sales_invoice_id,invoice_item_index,treatment_id,buyer_name,quantity_purchased,unit_price_frozen) VALUES($1::text,$2,0,$1::text,'Comprador ficticio',2,50)",
        [id, invoice],
      );
      const before = await benefits(id);
      expect(before).toHaveLength(2);
      expect(
        before.every((b) => b.quantity === 2 && b.service_date === null),
      ).toBe(true);
      await pool!.query(
        "INSERT INTO spa_appointments(id,cabin_id,treatment_id,guest_name,appointment_date,start_time,end_time,created_at,sold_treatment_sale_id,status) VALUES($1::text,$1::text,$1::text,'Visitante ficticio',$2,'12:00','13:00',now(),$1::text,'confirmed')",
        [id, today()],
      );
      expect(await benefits(id)).toHaveLength(2);
      await pool!.query(
        "UPDATE spa_appointments SET status='completed' WHERE id=$1",
        [id],
      );
      const list = await api("GET", "?view=pending");
      expect(
        list.body.items.find(
          (b: any) =>
            b.sourceKind === "spa_sale" &&
            b.sourceTitle === "Circuito ficticio" &&
            b.area === "restaurant",
        ).ready,
      ).toBe(true);
      const todayList = await api("GET", "?view=today&area=restaurant");
      const spaNotice = todayList.body.items.find(
        (b: any) =>
          b.sourceKind === "spa_sale" && b.sourceTitle === "Circuito ficticio",
      );
      expect(spaNotice).toBeTruthy();
      expect(spaNotice.forecastDate).toBe(today());
      expect(spaNotice.linkedAppointments).toEqual([
        {
          person: "Visitante ficticio",
          date: today(),
          time: "12:00",
          status: "completed",
        },
      ]);
      expect(spaNotice.quantity).toBe(2);
      expect(spaNotice.used).toBe(0);
      expect(
        (
          await pool!.query(
            "SELECT count(*)::int n FROM reservations WHERE id=$1",
            [id],
          )
        ).rows[0].n,
      ).toBe(0);
      await pool!.query(
        "UPDATE spa_treatment_sales SET status='vencido' WHERE id=$1",
        [id],
      );
      expect((await benefits(id)).every((b) => b.cancelled)).toBe(true);
    });
    it("el turno SPA directo genera incluidos y su cancelación los retira", async () => {
      const id = prefix + "-" + randomUUID();
      await pool!.query(
        "INSERT INTO spa_treatments(id,name) VALUES($1::text,'Masaje ficticio')",
        [id],
      );
      await pool!.query(
        "INSERT INTO hospitality_inclusion_templates(owner_type,owner_id,rules,updated_by) VALUES('treatment',$1::text,$2,'prueba')",
        [
          id,
          JSON.stringify([rule({ basis: "stay", readyWhen: "spa_completed" })]),
        ],
      );
      await pool!.query(
        "INSERT INTO spa_appointments(id,cabin_id,treatment_id,guest_name,appointment_date,start_time,end_time,created_at,status) VALUES($1::text,$1::text,$1::text,'Visitante ficticio',$2,'12:00','13:00',now(),'confirmed')",
        [id, today()],
      );
      expect(await benefits(id)).toHaveLength(1);
      await action((await benefits(id))[0], {
        action: "acknowledge",
        quantity: undefined,
        note: undefined,
      });
      await pool!.query(
        "UPDATE spa_appointments SET status='completed' WHERE id=$1",
        [id],
      );
      expect((await benefits(id))[0].acknowledged_at).toBeNull();
      expect((await benefits(id))[0].used).toBe(0);
      await pool!.query(
        "UPDATE spa_appointments SET status='cancelled' WHERE id=$1",
        [id],
      );
      expect((await benefits(id))[0].cancelled).toBe(true);
    });
    it("registra media pensión de forma idempotente sin agregar cobros ni pagos", async () => {
      const id = await fixture([]);
      const body = {
        reservationId: id,
        title: "Media pensión ficticia",
        reason: "Venta ficticia registrada en recepción",
        rules: [rule()],
        requestId: randomUUID(),
      };
      expect((await api("POST", "/supplements", body)).status).toBe(201);
      expect((await api("POST", "/supplements", body)).status).toBe(201);
      expect(await benefits(id)).toHaveLength(2);
      expect(
        (await api("POST", "/supplements", { ...body, title: "Otro" })).status,
      ).toBe(409);
      for (const table of ["charges", "payments"])
        expect(
          (
            await pool!.query(
              `SELECT count(*)::int n FROM ${table} WHERE reservation_id=$1`,
              [id],
            )
          ).rows[0].n,
        ).toBe(0);
    });
    it("coordina horarios vigentes, no permite prestar fuera de fecha ni exceso de cantidad", async () => {
      const id = await fixture();
      let [b] = await benefits(id);
      expect((await action(b, { quantity: 3 })).status).toBe(409);
      expect(
        (
          await action(b, {
            action: "schedule",
            quantity: undefined,
            date: nextDate(today(), 5) + "T16:00:00-03:00",
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await action(b, {
            action: "schedule",
            quantity: undefined,
            date: today() + "T16:00:00-03:00",
            note: "Mesa a coordinar",
          })
        ).status,
      ).toBe(200);
      [b] = await benefits(id);
      expect(b.scheduled_at).toBeTruthy();
      expect((await action(b)).status).toBe(200);
      expect((await action(b)).status).toBe(409);
    });
    it("controla revisiones de configuración y no crea incluidos retroactivos", async () => {
      const id = await fixture([]);
      const path = `/templates/package/${id}`;
      expect(
        (await api("PUT", path, { rules: [rule()], revision: 1 })).status,
      ).toBe(200);
      expect((await api("PUT", path, { rules: [], revision: 1 })).status).toBe(
        409,
      );
      await pool!.query(
        "UPDATE reservations SET status='confirmed' WHERE id=$1",
        [id],
      );
      expect(await benefits(id)).toHaveLength(0);
      expect(
        (
          await api("PUT", path, {
            rules: [rule({ quantity: -1 })],
            revision: 2,
          })
        ).status,
      ).toBe(400);
    });
    it("retira una media pensión con motivo sin reactivarla por cambios posteriores", async () => {
      const id = await fixture([]);
      const body = {
        reservationId: id,
        title: "Media pensión a retirar",
        reason: "Venta ficticia de prueba en recepción",
        rules: [rule()],
        requestId: randomUUID(),
      };
      const created = await api("POST", "/supplements", body);
      const [b] = await benefits(id);
      await action(b);
      const path = `/supplements/${encodeURIComponent(created.body.sourceId)}/cancel`;
      const cancel = {
        reason: "El cliente desistió de la media pensión",
        requestId: randomUUID(),
      };
      expect((await api("POST", path, cancel, "restaurant")).status).toBe(403);
      expect((await api("POST", path, cancel, "comercial")).status).toBe(200);
      expect((await api("POST", path, cancel, "comercial")).status).toBe(200);
      await pool!.query(
        "UPDATE reservations SET number_of_guests=3 WHERE id=$1",
        [id],
      );
      expect((await benefits(id)).every((x) => x.cancelled)).toBe(true);
      expect((await benefits(id))[0].used).toBe(1);
      const events = await api("GET", `/${b.id}/events`);
      expect(
        events.body.some(
          (e: any) => e.action === "cancel" && e.note === cancel.reason,
        ),
      ).toBe(true);
    });
    it("si falla el historial, la utilización se revierte en la misma transacción", async () => {
      const id = await fixture();
      const [b] = await benefits(id);
      await pool!.query(
        "CREATE FUNCTION hospitality_test_fail_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.note='Falla sintética de historial' THEN RAISE EXCEPTION 'synthetic event failure'; END IF; RETURN NEW; END $$",
      );
      await pool!.query(
        "CREATE TRIGGER hospitality_test_fail_event BEFORE INSERT ON hospitality_included_events FOR EACH ROW EXECUTE FUNCTION hospitality_test_fail_event()",
      );
      try {
        expect(
          (await action(b, { note: "Falla sintética de historial" })).status,
        ).toBe(500);
        expect((await benefits(id))[0].used).toBe(0);
        expect((await benefits(id))[0].version).toBe(b.version);
      } finally {
        await pool!.query(
          "DROP TRIGGER hospitality_test_fail_event ON hospitality_included_events",
        );
        await pool!.query("DROP FUNCTION hospitality_test_fail_event()");
      }
    });
  },
);

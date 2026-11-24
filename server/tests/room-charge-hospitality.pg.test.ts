import express from "express";
import http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
const url = process.env.DATABASE_URL;
const enabled = !!url && process.env.ALLOW_DESTRUCTIVE_PG_TESTS === "true";
if (
  enabled &&
  (!["localhost", "127.0.0.1"].includes(new URL(url!).hostname) ||
    !/test/i.test(new URL(url!).pathname))
)
  throw Error("Use una base local descartable");
const suite = enabled ? describe : describe.skip;
const prefix = "hcharge-" + randomUUID(),
  fixtures: string[] = [];
let pool: pg.Pool,
  server: http.Server,
  base: string,
  role = "reception";
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
async function request(
  path: string,
  body?: any,
  method = body ? "POST" : "GET",
) {
  const response = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    body: response.status === 204 ? null : await response.json(),
  };
}
async function fixture(recurring = false) {
  const id = prefix + "-" + randomUUID();
  fixtures.push(id);
  const rule = {
    id: randomUUID(),
    area: "restaurant",
    service: "Cena de media pensión",
    quantity: 1,
    basis: "stay",
    conditions: "Sin bebidas",
    readyWhen: "arrival",
  };
  await pool.query(
    "INSERT INTO room_types(id,code,name) VALUES($1::text,$1::text,'Habitación ficticia')",
    [id],
  );
  await pool.query(
    "INSERT INTO rooms(id,room_number,room_type_id,status) VALUES($1::text,$1::text,$1::text,'available')",
    [id],
  );
  await pool.query(
    "INSERT INTO guests(id,first_name,last_name) VALUES($1::text,'Huésped','Ficticio')",
    [id],
  );
  await pool.query(
    "INSERT INTO reservations(id,reservation_code,guest_id,room_id,room_type_id,check_in_date,check_out_date,nights,status,number_of_guests,total_room_amount,final_rate_per_night,created_at) VALUES($1::text,$1::text,$1::text,$1::text,$1::text,$2::date,$2::date+2,2,'checked_in',2,100,50,now())",
    [id, today()],
  );
  await pool.query(
    "INSERT INTO charge_types(id,label,description,default_amount,category,allow_price_edit,allow_recurring,hospitality_rules) VALUES($1::text,'Media pensión ficticia','Media pensión',10,'restaurant',true,$2,$3::jsonb)",
    [id, recurring, JSON.stringify([rule])],
  );
  const body = {
    reservationId: id,
    chargeTypeId: id,
    description: "Media pensión",
    amount: recurring ? "20.00" : "40.00",
    category: "restaurant",
    date: today(),
    quantity: recurring ? 2 : 4,
    hospitalityRequestId: randomUUID(),
    hospitalityExpectedRules: [rule],
    ...(recurring ? { isRecurring: true, unitAmount: "10.00" } : {}),
  };
  return { id, rule, body };
}
async function benefits(id: string) {
  return (
    await pool.query(
      "SELECT b.* FROM hospitality_included_services b JOIN hospitality_included_sources s ON s.id=b.source_id WHERE s.entity_id=$1::text ORDER BY b.service_date,b.id",
      [id],
    )
  ).rows;
}
suite(
  "Cargos predefinidos con Hospitalidad sin duplicar ventas ni atenciones",
  () => {
    beforeAll(async () => {
      pool = new pg.Pool({ connectionString: url });
      await (
        await import("../hospitalityInclusionsSchema")
      ).ensureHospitalityInclusionsSchema();
      await (
        await import("../hospitalityInclusionsSchema")
      ).ensureHospitalityInclusionsSchema();
      await (await import("../permissions")).loadRolePermissionsCache();
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.user = { id: prefix, username: "Operador de prueba", role } as any;
        req.isAuthenticated = () => true;
        next();
      });
      (await import("../routes/reservations")).registerReservationsRoutes(app);
      (await import("../hospitalityInclusions")).registerHospitalityInclusions(
        app,
      );
      server = http.createServer(app);
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      base = `http://127.0.0.1:${(server.address() as any).port}`;
    });
    afterAll(async () => {
      if (server) {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      if (pool) {
        for (const id of fixtures) {
          await pool.query(
            "DELETE FROM hospitality_included_events WHERE source_id IN (SELECT id FROM hospitality_included_sources WHERE entity_id=$1::text)",
            [id],
          );
          await pool.query(
            "DELETE FROM hospitality_included_services WHERE source_id IN (SELECT id FROM hospitality_included_sources WHERE entity_id=$1::text)",
            [id],
          );
          await pool.query(
            "DELETE FROM hospitality_included_sources WHERE entity_id=$1::text",
            [id],
          );
          await pool.query(
            "DELETE FROM folio_movements WHERE folio_id IN(SELECT id FROM folios WHERE entity_id=$1::text)",
            [id],
          );
          await pool.query("DELETE FROM folios WHERE entity_id=$1::text", [id]);
          await pool.query(
            "DELETE FROM sales_invoices WHERE reserva_id=$1::text",
            [id],
          );
          await pool.query(
            "DELETE FROM payments WHERE reservation_id=$1::text",
            [id],
          );
          await pool.query(
            "DELETE FROM group_payments WHERE group_id=$1::text",
            [id],
          );
          await pool.query(
            "DELETE FROM group_reservation_links WHERE reservation_id=$1::text",
            [id],
          );
          await pool.query("DELETE FROM groups WHERE id=$1::text", [id]);
          await pool.query(
            "DELETE FROM charges WHERE reservation_id=$1::text",
            [id],
          );
          await pool.query("DELETE FROM charge_types WHERE id=$1::text", [id]);
          await pool.query(
            "DELETE FROM reservation_changelog WHERE reservation_id=$1::text",
            [id],
          );
          await pool.query("DELETE FROM reservations WHERE id=$1::text", [id]);
          await pool.query("DELETE FROM rooms WHERE id=$1::text", [id]);
          await pool.query("DELETE FROM room_types WHERE id=$1::text", [id]);
          await pool.query("DELETE FROM guests WHERE id=$1::text", [id]);
        }
        await pool.query("DELETE FROM audit_logs WHERE user_id=$1::text", [
          prefix,
        ]);
        await pool.end();
        await (await import("../db")).pool.end();
      }
    });
    it("crea cargo, folio y cuatro comidas una sola vez incluso con dos solicitudes simultáneas", async () => {
      const f = await fixture();
      const results = await Promise.all([
        request("/api/charges", f.body),
        request("/api/charges", f.body),
      ]);
      expect(
        results.map((r) => r.status),
        JSON.stringify(results),
      ).toEqual([201, 201]);
      expect(results[0].body.id).toBe(results[1].body.id);
      const b = await benefits(f.id);
      expect(b).toHaveLength(1);
      expect(b[0]).toMatchObject({ quantity: 4, used: 0 });
      expect(
        (
          await pool.query(
            "SELECT * FROM charges WHERE reservation_id=$1::text",
            [f.id],
          )
        ).rows,
      ).toHaveLength(1);
      expect(
        (
          await pool.query(
            "SELECT fm.* FROM folio_movements fm JOIN folios f ON f.id=fm.folio_id WHERE f.entity_id=$1::text AND fm.type='charge'",
            [f.id],
          )
        ).rows,
      ).toHaveLength(1);
      expect(
        (await request("/api/charges", { ...f.body, amount: "50.00" })).status,
      ).toBe(409);
      expect(
        (
          await pool.query(
            "SELECT * FROM payments WHERE reservation_id=$1::text",
            [f.id],
          )
        ).rows,
      ).toHaveLength(0);
    });
    it("cambiar la plantilla o el precio no cambia los servicios vendidos; una vista previa vieja se rechaza", async () => {
      const f = await fixture(),
        created = await request("/api/charges", f.body);
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      await pool.query(
        "UPDATE charge_types SET hospitality_rules=$2::jsonb WHERE id=$1::text",
        [f.id, JSON.stringify([{ ...f.rule, quantity: 7 }])],
      );
      const stale = await request("/api/charges", {
        ...f.body,
        hospitalityRequestId: randomUUID(),
      });
      expect(stale.status).toBe(409);
      const edit = await request(
        `/api/reservations/${f.id}/manual-charges/${created.body.id}`,
        {
          description: "Precio acordado de media pensión",
          amount: "50.00",
          motivo: "Corrección del precio acordado",
          expectedDescription: created.body.description,
          expectedAmount: "40.00",
        },
        "PATCH",
      );
      expect(edit.status, JSON.stringify(edit.body)).toBe(200);
      expect((await benefits(f.id))[0].quantity).toBe(4);
      expect(
        (
          await pool.query(
            "SELECT hospitality_rules_snapshot FROM charges WHERE id=$1::text",
            [created.body.id],
          )
        ).rows[0].hospitality_rules_snapshot,
      ).toEqual([f.rule]);
    });
    it("anular el cargo retira los pendientes y conserva la atención y su historial", async () => {
      const f = await fixture(),
        created = await request("/api/charges", f.body);
      expect(created.status).toBe(201);
      let [b] = await benefits(f.id);
      const used = await request(
        `/api/hospitality/included-services/${b.id}/actions`,
        {
          action: "fulfill",
          version: b.version,
          requestId: randomUUID(),
          quantity: 1,
          note: "Cena servida de prueba",
        },
      );
      expect(used.status, JSON.stringify(used.body)).toBe(200);
      const source = (
        await pool.query(
          "SELECT * FROM hospitality_included_sources WHERE origin_charge_id=$1::text",
          [created.body.id],
        )
      ).rows[0];
      expect(
        (
          await request(
            `/api/hospitality/included-services/supplements/${source.id}/cancel`,
            {
              reason: "No debe retirar un servicio con cargo",
              requestId: randomUUID(),
            },
          )
        ).status,
      ).toBe(409);
      const result = await request(
        `/api/charges/${created.body.id}/anular`,
        {
          motivoAnulacion: "Cargo corregido por recepción",
          expectedDescription: created.body.description,
          expectedAmount: "40.00",
        },
        "PATCH",
      );
      expect(result.status, JSON.stringify(result.body)).toBe(200);
      [b] = await benefits(f.id);
      expect(b).toMatchObject({ cancelled: true, used: 1, needs_review: true });
      expect(
        (
          await pool.query(
            "SELECT action FROM hospitality_included_events WHERE source_id=$1::text",
            [source.id],
          )
        ).rows.map((e) => e.action),
      ).toEqual(
        expect.arrayContaining(["charge_created", "fulfill", "charge_voided"]),
      );
      expect(
        (
          await request(
            `/api/charges/${created.body.id}/anular`,
            {
              motivoAnulacion: "Cargo corregido por recepción",
              expectedDescription: created.body.description,
              expectedAmount: "40.00",
            },
            "PATCH",
          )
        ).status,
      ).toBe(200);
      expect((await benefits(f.id))[0].used).toBe(1);
    });
    it("los cargos por noche siguen las unidades efectivamente cobradas y admiten corrección y anulación segura", async () => {
      const f = await fixture(true),
        created = await request("/api/charges", f.body);
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      expect((await benefits(f.id)).map((b) => b.quantity)).toEqual([1, 1]);
      const edit = await request(
        `/api/reservations/${f.id}/manual-charges/${created.body.id}`,
        {
          description: "Media pensión",
          amount: "24.00",
          motivo: "Precio por noche corregido",
          expectedDescription: created.body.description,
          expectedAmount: "20.00",
        },
        "PATCH",
      );
      expect(edit.status, JSON.stringify(edit.body)).toBe(200);
      expect(
        Number(
          (
            await pool.query(
              "SELECT unit_amount FROM charges WHERE id=$1::text",
              [created.body.id],
            )
          ).rows[0].unit_amount,
        ),
      ).toBe(12);
      await pool.query(
        "UPDATE reservations SET check_out_date=check_out_date+1,nights=3 WHERE id=$1::text",
        [f.id],
      );
      expect((await benefits(f.id)).filter((b) => !b.cancelled)).toHaveLength(
        2,
      );
      await (
        await import("../roomChargeHospitalityActions")
      ).repriceHospitalityCharge(f.id, created.body.id, 3, {
        id: prefix,
        name: "Operador de prueba",
      });
      expect((await benefits(f.id)).filter((b) => !b.cancelled)).toHaveLength(
        3,
      );
      const result = await request(
        `/api/charges/${created.body.id}/anular`,
        {
          motivoAnulacion: "Se cancela la media pensión",
          expectedDescription: "Media pensión (x3)",
          expectedAmount: "36.00",
        },
        "PATCH",
      );
      expect(result.status, JSON.stringify(result.body)).toBe(200);
      expect((await benefits(f.id)).every((b) => b.cancelled)).toBe(true);
    });
    it("un fallo al escribir el folio revierte también cargo, avisos y eventos", async () => {
      const f = await fixture(),
        fn = "hcharge_fail_" + randomUUID().replaceAll("-", "");
      f.body.description = f.id;
      await pool.query(
        `CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.description LIKE '${f.id}%' THEN RAISE EXCEPTION 'Synthetic folio failure'; END IF; RETURN NEW; END $$`,
      );
      await pool.query(
        `CREATE TRIGGER ${fn} BEFORE INSERT ON folio_movements FOR EACH ROW EXECUTE FUNCTION ${fn}()`,
      );
      try {
        expect((await request("/api/charges", f.body)).status).toBe(500);
        expect(await benefits(f.id)).toHaveLength(0);
        expect(
          (
            await pool.query(
              "SELECT * FROM charges WHERE reservation_id=$1::text",
              [f.id],
            )
          ).rows,
        ).toHaveLength(0);
      } finally {
        await pool.query(`DROP TRIGGER ${fn} ON folio_movements`);
        await pool.query(`DROP FUNCTION ${fn}()`);
      }
    });
    it("un consumo de Restaurante sin selección del concepto no genera nuevos servicios", async () => {
      const f = await fixture();
      const result = await request("/api/charges", {
        reservationId: f.id,
        description: "Media pensión",
        amount: "40.00",
        category: "restaurant",
        date: today(),
      });
      expect(result.status).toBe(201);
      expect(await benefits(f.id)).toHaveLength(0);
    });
    it("conserva las atenciones si se corrige la cantidad y no reactiva un cargo anulado al cambiar fechas", async () => {
      const f = await fixture(),
        created = await request("/api/charges", f.body);
      let [b] = await benefits(f.id);
      expect(
        (
          await request(`/api/hospitality/included-services/${b.id}/actions`, {
            action: "fulfill",
            version: b.version,
            requestId: randomUUID(),
            quantity: 3,
            note: "Tres cenas atendidas",
          })
        ).status,
      ).toBe(200);
      const correction = await request(
        `/api/reservations/${f.id}/manual-charges/${created.body.id}`,
        {
          description: created.body.description,
          amount: "40.00",
          motivo: "Se corrige la cantidad vendida",
          expectedDescription: created.body.description,
          expectedAmount: "40.00",
          quantity: 2,
          expectedQuantity: 4,
        },
        "PATCH",
      );
      expect(correction.status, JSON.stringify(correction.body)).toBe(200);
      [b] = await benefits(f.id);
      expect(b).toMatchObject({ quantity: 3, used: 3, needs_review: true });
      expect(
        (
          await request(
            `/api/charges/${created.body.id}/anular`,
            {
              motivoAnulacion: "Venta anulada con atención conservada",
              expectedDescription: created.body.description,
              expectedAmount: "40.00",
            },
            "PATCH",
          )
        ).status,
      ).toBe(200);
      await pool.query(
        "UPDATE reservations SET check_out_date=check_out_date+1,nights=3 WHERE id=$1::text",
        [f.id],
      );
      expect((await benefits(f.id)).every((row) => row.cancelled)).toBe(true);
      expect((await benefits(f.id))[0].used).toBe(3);
    });
    it("los anticipos de un grupo no bloquean la venta ni la anulación; recibos y pagos quedan intactos", async () => {
      const f = await fixture();
      await pool.query(
        "INSERT INTO groups(id,group_code,name,status,check_in_date,check_out_date,created_at) SELECT $1::text,$1::text,'Grupo ficticio','confirmed',check_in_date,check_out_date,now() FROM reservations WHERE id=$1::text",
        [f.id],
      );
      await pool.query(
        "INSERT INTO group_reservation_links(group_id,reservation_id) VALUES($1::text,$1::text)",
        [f.id],
      );
      await pool.query(
        "INSERT INTO group_payments(id,group_id,amount,method,date,distribution,distribution_detail) VALUES($1::text,$1::text,5,'transferencia',CURRENT_DATE,'equal',$2::jsonb)",
        [f.id, JSON.stringify({ [f.id]: 5 })],
      );
      await pool.query(
        "INSERT INTO payments(id,reservation_id,group_payment_id,amount,method,date,status) VALUES($1::text,$1::text,$1::text,5,'transferencia',CURRENT_DATE,'active')",
        [f.id],
      );
      const before = (
          await pool.query(
            "SELECT * FROM payments WHERE reservation_id=$1::text",
            [f.id],
          )
        ).rows,
        receipt = (
          await pool.query("SELECT * FROM group_payments WHERE id=$1::text", [
            f.id,
          ])
        ).rows;
      const created = await request("/api/charges", f.body);
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      const out = await request(
        `/api/charges/${created.body.id}/anular`,
        {
          motivoAnulacion: "Corrección sin afectar anticipo",
          expectedDescription: created.body.description,
          expectedAmount: "40.00",
        },
        "PATCH",
      );
      expect(out.status, JSON.stringify(out.body)).toBe(200);
      expect(
        (
          await pool.query(
            "SELECT * FROM payments WHERE reservation_id=$1::text",
            [f.id],
          )
        ).rows,
      ).toEqual(before);
      expect(
        (
          await pool.query("SELECT * FROM group_payments WHERE id=$1::text", [
            f.id,
          ])
        ).rows,
      ).toEqual(receipt);
    });
    it("una factura que cubre el cargo mantiene el control fiscal y sus incluidos sin cambios", async () => {
      const f = await fixture(),
        created = await request("/api/charges", f.body);
      await pool.query(
        "INSERT INTO sales_invoices(tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_condicion_iva,monto_neto,monto_iva21,monto_total,estado,items,reserva_id,source_charge_ids,source_charge_amounts) VALUES('FB',99888,nextval('group_payments_receipt_number_seq'),CURRENT_DATE,'Cliente ficticio','Consumidor Final',40,0,40,'emitida','[]',$1,$2::jsonb,$3::jsonb)",
        [
          f.id,
          JSON.stringify([created.body.id]),
          JSON.stringify({ [created.body.id]: 40 }),
        ],
      );
      const before = await benefits(f.id);
      expect(
        (
          await request(
            `/api/charges/${created.body.id}/anular`,
            {
              motivoAnulacion: "No debe saltar factura emitida",
              expectedDescription: created.body.description,
              expectedAmount: "40.00",
            },
            "PATCH",
          )
        ).status,
      ).toBe(409);
      expect(await benefits(f.id)).toEqual(before);
    });
    it("un concepto SPA elegido manualmente puede corregirse y anularse sin modificar turnos", async () => {
      const f = await fixture();
      await pool.query(
        "UPDATE charge_types SET category='spa' WHERE id=$1::text",
        [f.id],
      );
      const created = await request("/api/charges", {
        ...f.body,
        category: "spa",
      });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      const editBody = {
        description: created.body.description,
        amount: "20.00",
        motivo: "Se corrige la cantidad vendida",
        expectedDescription: created.body.description,
        expectedAmount: "40.00",
        quantity: 2,
        expectedQuantity: 4,
      };
      const edit = await request(
        `/api/reservations/${f.id}/manual-charges/${created.body.id}`,
        editBody,
        "PATCH",
      );
      expect(edit.status, JSON.stringify(edit.body)).toBe(200);
      expect((await benefits(f.id))[0].quantity).toBe(2);
      const stale = await request(
        `/api/reservations/${f.id}/manual-charges/${created.body.id}`,
        { ...editBody, amount: "20.00", expectedAmount: "20.00" },
        "PATCH",
      );
      expect(stale.status).toBe(409);
      const out = await request(
        `/api/charges/${created.body.id}/anular`,
        {
          motivoAnulacion: "Se retira la propuesta de prueba",
          expectedDescription: created.body.description,
          expectedAmount: "20.00",
        },
        "PATCH",
      );
      expect(out.status, JSON.stringify(out.body)).toBe(200);
      expect((await benefits(f.id))[0].cancelled).toBe(true);
      expect(
        (
          await pool.query(
            "SELECT * FROM spa_appointments WHERE reservation_id=$1::text",
            [f.id],
          )
        ).rows,
      ).toHaveLength(0);
    });
    it("guarda configuración normalizada y evita borrar un concepto ya usado aunque cambie su nombre", async () => {
      const f = await fixture();
      role = "admin";
      const configured = await request(
        `/api/charge-types/${f.id}`,
        { hospitalityRules: [{ ...f.rule, service: "  Cena acordada  " }] },
        "PATCH",
      );
      role = "reception";
      expect(configured.status).toBe(200);
      expect(configured.body.hospitalityRules[0].service).toBe("Cena acordada");
      const created = await request("/api/charges", {
        ...f.body,
        hospitalityExpectedRules: configured.body.hospitalityRules,
      });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      await request(
        `/api/charge-types/${f.id}`,
        { label: "Otro nombre", description: "Otro texto" },
        "PATCH",
      );
      expect(
        (await request(`/api/charge-types/${f.id}`, undefined, "DELETE"))
          .status,
      ).toBe(400);
    });
    it("valida configuración, cantidad, alcance y permisos sin crear ventas", async () => {
      const f = await fixture();
      for (const patch of [
        { quantity: 0 },
        { hospitalityExpectedRules: [] },
        { category: "transfer_in" },
        { amount: "0.00" },
      ])
        expect(
          (await request("/api/charges", { ...f.body, ...patch })).status,
        ).toBeGreaterThanOrEqual(400);
      role = "restaurant";
      expect((await request("/api/charges", f.body)).status).toBe(403);
      role = "reception";
      expect(
        (
          await pool.query(
            "SELECT * FROM charges WHERE reservation_id=$1::text",
            [f.id],
          )
        ).rows,
      ).toHaveLength(0);
    });
  },
);

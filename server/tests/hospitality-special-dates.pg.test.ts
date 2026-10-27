import express from "express";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { readFileSync } from "node:fs";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
const mail = vi.hoisted(() => ({ ready: true }));
vi.mock("../email-service", () => ({
  birthdayEmailReadiness: async () => ({
    ok: mail.ready,
    reason: "Configuración de prueba desactivada",
  }),
  sendBirthdayEmail: vi.fn(async () => {
    throw Error("Live provider must never be used");
  }),
}));
const enabled =
  !!process.env.DATABASE_URL &&
  process.env.ALLOW_DESTRUCTIVE_PG_TESTS === "true";
const prefix = "birthday-" + randomUUID(),
  id = (name: string) => prefix + "-" + name;
let pool: pg.Pool,
  server: Server,
  base = "",
  role = "admin",
  processQueue: any;
const year = Number(
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Cordoba" })
    .format(new Date())
    .slice(0, 4),
);
const email = (name: string) => id(name) + "@example.invalid";
async function api(method: string, path: string, body?: unknown) {
  const r = await fetch(base + "/api/hospitality/special-dates" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}
const preview = (names = ["a"]) =>
  api("POST", "/preview", { month: 2, year, guestIds: names.map(id) });
const confirm = (draft: string) => api("POST", `/drafts/${draft}/confirm`);
async function resetRate() {
  await pool.query(
    "UPDATE hospitality_birthday_contacts SET sending_since=NOW()-INTERVAL '2 seconds' WHERE guest_id LIKE $1",
    [prefix + "%"],
  );
}
describe.skipIf(!enabled)(
  "Special dates · real database, simulated provider only",
  () => {
    beforeAll(async () => {
      const url = new URL(process.env.DATABASE_URL!);
      if (
        !["localhost", "127.0.0.1"].includes(url.hostname) ||
        !/test/i.test(url.pathname)
      )
        throw Error("Disposable local test database required");
      ({ pool } = await import("../db"));
      await pool.query(
        readFileSync(
          "migrations/20261024_hospitality_special_dates.sql",
          "utf8",
        ),
      );
      const { setRolePermissionsCacheForTests } = await import(
        "../permissions"
      );
      setRolePermissionsCacheForTests([
        { role: "admin", resourceKey: "sidebar:/hospitality" },
        { role: "admin", resourceKey: "api:hospitality:campaigns" },
        { role: "housekeeping", resourceKey: "sidebar:/hospitality" },
      ]);
      await pool.query(
        "INSERT INTO system_users(id,username,password,full_name,email,role,is_active,created_at)VALUES($1::text,$1::text,'synthetic','Operador de prueba','synthetic@example.invalid','admin','true',NOW())",
        [id("actor")],
      );
      for (const [name, birthday, address] of [
        ["a", "1980-02-29", email("a")],
        ["b", "1981-02-01", " " + email("a").toUpperCase() + " "],
        ["c", "1980-02-03", null],
        ["d", "1980-02-04", email("d")],
        ["e", "1980-03-04", email("e")],
        ["f", "1980-02-07", email("f")],
        ["h", "1980-02-08", email("h")],
      ])
        await pool.query(
          "INSERT INTO guests(id,first_name,last_name,fecha_nacimiento,email,phone,tipo_persona)VALUES($1,$2,'Ejemplo',$3,$4,'+5493435000000','fisica')",
          [id(name), name, birthday, address],
        );
      const module = await import("../hospitalitySpecialDates");
      processQueue = module.processBirthdayEmailQueue;
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.user = {
          id: id("actor"),
          username: "synthetic",
          fullName: "Operador de prueba",
          role,
        } as any;
        req.isAuthenticated = () => role !== "none";
        next();
      });
      module.registerHospitalitySpecialDates(app);
      server = app.listen(0, "127.0.0.1");
      await new Promise<void>((r) => server.once("listening", r));
      base = `http://127.0.0.1:${(server.address() as any).port}`;
    });
    beforeEach(async () => {
      role = "admin";
      mail.ready = true;
      await pool.query(
        "DELETE FROM hospitality_birthday_contact_events WHERE contact_id IN(SELECT id FROM hospitality_birthday_contacts WHERE guest_id LIKE $1)",
        [prefix + "%"],
      );
      await pool.query(
        "DELETE FROM hospitality_birthday_contacts WHERE guest_id LIKE $1",
        [prefix + "%"],
      );
      await pool.query(
        "DELETE FROM hospitality_birthday_drafts WHERE created_by=$1",
        [id("actor")],
      );
      await pool.query(
        "DELETE FROM hospitality_marketing_exclusions WHERE guest_id LIKE $1",
        [prefix + "%"],
      );
      await pool.query(
        "DELETE FROM hospitality_birthday_settings WHERE updated_by=$1",
        ["Operador de prueba"],
      );
      await pool.query("UPDATE guests SET email=$1 WHERE id=$2", [
        email("a"),
        id("a"),
      ]);
    });
    afterAll(async () => {
      if (server) {
        server.closeAllConnections();
        await new Promise<void>((r) => server.close(() => r()));
      }
      if (pool) {
        await pool.query(
          "DELETE FROM hospitality_birthday_contact_events WHERE contact_id IN(SELECT id FROM hospitality_birthday_contacts WHERE guest_id LIKE $1)",
          [prefix + "%"],
        );
        await pool.query(
          "DELETE FROM hospitality_birthday_contacts WHERE guest_id LIKE $1",
          [prefix + "%"],
        );
        await pool.query(
          "DELETE FROM hospitality_birthday_drafts WHERE created_by=$1",
          [id("actor")],
        );
        await pool.query(
          "DELETE FROM hospitality_marketing_exclusions WHERE guest_id LIKE $1",
          [prefix + "%"],
        );
        await pool.query(
          "DELETE FROM hospitality_birthday_settings WHERE updated_by=$1",
          ["Operador de prueba"],
        );
        await pool.query("DELETE FROM audit_logs WHERE user_id=$1", [
          id("actor"),
        ]);
        await pool.query("DELETE FROM guests WHERE id LIKE $1", [prefix + "%"]);
        await pool.query("DELETE FROM system_users WHERE id=$1", [id("actor")]);
        await pool.end();
      }
    });
    it("requires authentication and a campaign permission beyond Hospitality access", async () => {
      role = "none";
      expect((await api("GET", `?month=2&year=${year}`)).status).toBe(401);
      role = "housekeeping";
      expect((await preview()).status).toBe(403);
      expect((await api("GET", `?month=2&year=${year}`)).status).toBe(403);
    });
    it("lists February including Feb 29 without restricting to current stays, and preserves missing email", async () => {
      const result = await api("GET", `?month=2&year=${year}`);
      expect(result.status).toBe(200);
      const rows = result.body.guests.filter((g: any) =>
        g.id.startsWith(prefix),
      );
      expect(rows.map((g: any) => g.id)).toContain(id("a"));
      expect(rows.map((g: any) => g.id)).not.toContain(id("e"));
      expect(rows.find((g: any) => g.id === id("a")).birthday).toBe(
        "1980-02-29",
      );
      expect(rows.find((g: any) => g.id === id("c")).emailAvailable).toBe(
        false,
      );
      expect((await api("GET", `?month=13&year=${year}`)).status).toBe(400);
    });
    it("saves the template with version conflict protection and rejects unknown variables", async () => {
      const original = await api("GET", "/settings");
      const template = {
        ...original.body.template,
        benefit: "Beneficio de prueba",
        terms: "Con reserva previa",
      };
      expect(
        (
          await api("PUT", "/settings", {
            template,
            version: original.body.version,
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await api("PUT", "/settings", {
            template,
            version: original.body.version,
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await api("PUT", "/settings", {
            template: { ...template, body: "{variable_inventada}" },
            version: 1,
          })
        ).status,
      ).toBe(400);
      expect((await preview()).body.messages[0].body).toContain(
        "Beneficio de prueba",
      );
    });
    it("deduplicates email addresses and does not queue anything before confirmation", async () => {
      const draft = await preview(["a", "b", "c"]);
      expect(draft.body.messages).toHaveLength(1);
      expect(draft.body.skipped).toHaveLength(2);
      expect(
        (
          await pool.query(
            "SELECT id FROM hospitality_birthday_contacts WHERE guest_id LIKE $1",
            [prefix + "%"],
          )
        ).rowCount,
      ).toBe(0);
      expect((await confirm(draft.body.id)).body.queued).toBe(1);
      expect((await confirm(draft.body.id)).body.alreadyConfirmed).toBe(true);
    });
    it("serializes overlapping confirmations and queues one email per recipient/year", async () => {
      const a = await preview(),
        b = await preview();
      const results = await Promise.all([
        confirm(a.body.id),
        confirm(b.body.id),
      ]);
      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(results.reduce((sum, r) => sum + r.body.queued, 0)).toBe(1);
    });
    it("rechecks exclusion and changed recipient after preview", async () => {
      const draft = await preview(["a", "d"]);
      await api("PUT", `/guests/${id("d")}/exclusion`, {
        blocked: true,
        reason: "No desea promociones",
      });
      await pool.query("UPDATE guests SET email=$1 WHERE id=$2", [
        email("changed"),
        id("a"),
      ]);
      const result = await confirm(draft.body.id);
      expect(result.body.queued).toBe(0);
      expect(result.body.skipped).toHaveLength(2);
    });
    it("prevents another guest with the same email from bypassing an exclusion", async () => {
      await api("PUT", `/guests/${id("b")}/exclusion`, {
        blocked: true,
        reason: "No recibir correos",
      });
      const draft = await preview();
      expect(draft.body.messages).toHaveLength(0);
    });
    it("deduplicates the recipient even when the other guest belongs to a different month", async () => {
      await pool.query("UPDATE guests SET email=$1 WHERE id=$2", [
        email("a"),
        id("e"),
      ]);
      try {
        const draft = await api("POST", "/preview", {
          month: 3,
          year,
          guestIds: [id("e")],
        });
        expect((await confirm(draft.body.id)).body.queued).toBe(1);
        expect((await preview()).body.messages).toHaveLength(0);
      } finally {
        await pool.query("UPDATE guests SET email=$1 WHERE id=$2", [
          email("e"),
          id("e"),
        ]);
      }
    });
    it("queues individual messages, records provider acceptance and blocks repeat campaigns", async () => {
      const draft = await preview();
      await confirm(draft.body.id);
      const sender = vi.fn(async () => ({
        status: "sent",
        providerId: "simulated-id",
      }));
      expect(await processQueue(sender)).toBe(true);
      expect(sender).toHaveBeenCalledWith(
        expect.objectContaining({ to: email("a") }),
      );
      const contact = (
        await pool.query(
          "SELECT * FROM hospitality_birthday_contacts WHERE guest_id=$1",
          [id("a")],
        )
      ).rows[0];
      expect(contact.status).toBe("sent");
      const history = await api("GET", `/guests/${id("a")}/history`);
      expect(history.body.map((e: any) => e.status)).toEqual(
        expect.arrayContaining(["queued", "sending", "sent"]),
      );
      expect((await preview()).body.messages).toHaveLength(0);
      await processQueue(sender);
      expect(sender).toHaveBeenCalledTimes(1);
    });
    it("does not retry uncertain results or interrupted sending jobs", async () => {
      const draft = await preview();
      await confirm(draft.body.id);
      const sender = vi.fn(async () => ({
        status: "unknown",
        error: "Simulated timeout",
      }));
      await processQueue(sender);
      await resetRate();
      await processQueue(sender);
      expect(sender).toHaveBeenCalledTimes(1);
      expect((await preview()).body.messages).toHaveLength(0);
      await pool.query(
        "UPDATE hospitality_birthday_contacts SET status='sending',sending_since=NOW()-INTERVAL '11 minutes' WHERE guest_id=$1",
        [id("a")],
      );
      await processQueue(sender);
      expect(sender).toHaveBeenCalledTimes(1);
      expect(
        (
          await pool.query(
            "SELECT status FROM hospitality_birthday_contacts WHERE guest_id=$1",
            [id("a")],
          )
        ).rows[0].status,
      ).toBe("unknown");
    });
    it("rechecks opt-out before sending queued jobs", async () => {
      const draft = await preview();
      await confirm(draft.body.id);
      await api("PUT", `/guests/${id("a")}/exclusion`, {
        blocked: true,
        reason: "No recibir correos",
      });
      const sender = vi.fn();
      await processQueue(sender);
      expect(sender).not.toHaveBeenCalled();
      expect(
        (
          await pool.query(
            "SELECT status FROM hospitality_birthday_contacts WHERE guest_id=$1",
            [id("a")],
          )
        ).rows[0].status,
      ).toBe("cancelled");
    });
    it("allows a reviewed retry after a definite failure and retains both attempts", async () => {
      const draft = await preview();
      await confirm(draft.body.id);
      await processQueue(async () => ({
        status: "failed",
        error: "Simulated rejection",
      }));
      await resetRate();
      const retry = await preview();
      expect(retry.body.messages).toHaveLength(1);
      await confirm(retry.body.id);
      await processQueue(async () => ({ status: "sent" }));
      const row = (
        await pool.query(
          "SELECT status,attempts FROM hospitality_birthday_contacts WHERE guest_id=$1",
          [id("a")],
        )
      ).rows[0];
      expect(row).toMatchObject({ status: "sent", attempts: 2 });
    });
    it("marks WhatsApp only through explicit manual confirmation and prevents cross-channel duplicates", async () => {
      const body = {
        month: 2,
        year,
        guestId: id("a"),
        recipient: "+54 9 343 5000000",
        body: "Mensaje de prueba",
      };
      expect((await api("POST", "/whatsapp-contact", body)).status).toBe(200);
      expect((await preview()).body.messages).toHaveLength(0);
      expect((await api("POST", "/whatsapp-contact", body)).status).toBe(409);
    });
    it("claims a queued recipient once across simultaneous workers", async () => {
      const draft = await preview();
      await confirm(draft.body.id);
      const sender = vi.fn(async () => ({ status: "sent" }));
      await Promise.all([processQueue(sender), processQueue(sender)]);
      expect(sender).toHaveBeenCalledTimes(1);
    });
    it("keeps partial batch results separate for each individual recipient", async () => {
      const draft = await preview(["a", "f"]);
      await confirm(draft.body.id);
      const sender = vi
        .fn()
        .mockResolvedValueOnce({
          status: "failed",
          error: "Simulated rejection",
        })
        .mockResolvedValueOnce({ status: "sent" });
      await processQueue(sender);
      await resetRate();
      await processQueue(sender);
      const statuses = (
        await pool.query(
          "SELECT status FROM hospitality_birthday_contacts WHERE guest_id LIKE $1",
          [prefix + "%"],
        )
      ).rows
        .map((r) => r.status)
        .sort();
      expect(statuses).toEqual(["failed", "sent"]);
    });
    it("retains contact history when the schema is applied again", async () => {
      const draft = await preview();
      await confirm(draft.body.id);
      await pool.query(
        readFileSync(
          "migrations/20261024_hospitality_special_dates.sql",
          "utf8",
        ),
      );
      expect(
        (
          await pool.query(
            "SELECT id FROM hospitality_birthday_contacts WHERE guest_id=$1",
            [id("a")],
          )
        ).rowCount,
      ).toBe(1);
    });
    it("cancels queued jobs if the operator loses campaign access", async () => {
      const draft = await preview();
      await confirm(draft.body.id);
      await pool.query(
        "UPDATE system_users SET role='housekeeping' WHERE id=$1",
        [id("actor")],
      );
      const sender = vi.fn();
      try {
        await processQueue(sender);
        expect(sender).not.toHaveBeenCalled();
        expect(
          (
            await pool.query(
              "SELECT status FROM hospitality_birthday_contacts WHERE guest_id=$1",
              [id("a")],
            )
          ).rows[0].status,
        ).toBe("cancelled");
      } finally {
        await pool.query("UPDATE system_users SET role='admin' WHERE id=$1", [
          id("actor"),
        ]);
      }
    });
    it("does not use another operator's preview or accept oversized batches", async () => {
      const draft = await preview();
      await pool.query(
        "UPDATE hospitality_birthday_drafts SET created_by=$1 WHERE id=$2",
        [id("other-operator"), draft.body.id],
      );
      expect((await confirm(draft.body.id)).status).toBe(404);
      await pool.query("DELETE FROM hospitality_birthday_drafts WHERE id=$1", [
        draft.body.id,
      ]);
      expect(
        (
          await api("POST", "/preview", {
            month: 2,
            year,
            guestIds: Array.from({ length: 251 }, () => id("a")),
          })
        ).status,
      ).toBe(400);
    });
    it("can prepare a cancelled contact again after a birthday month correction",async()=>{
      const original=await preview();await confirm(original.body.id);
      await pool.query("UPDATE guests SET fecha_nacimiento='1980-03-01' WHERE id=$1",[id('a')]);
      const sender=vi.fn(async()=>({status:'sent'}));
      try {
        await processQueue(sender);expect(sender).not.toHaveBeenCalled();
        const revised=await api('POST','/preview',{month:3,year,guestIds:[id('a')]});expect(revised.body.messages).toHaveLength(1);
        await confirm(revised.body.id);await processQueue(sender);expect(sender).toHaveBeenCalledTimes(1);
      } finally {await pool.query("UPDATE guests SET fecha_nacimiento='1980-02-29' WHERE id=$1",[id('a')]);}
    });
    it("expires previews and refuses queueing with disabled email", async () => {
      const draft = await preview();
      mail.ready = false;
      expect((await confirm(draft.body.id)).status).toBe(400);
      mail.ready = true;
      await pool.query(
        "UPDATE hospitality_birthday_drafts SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1",
        [draft.body.id],
      );
      expect((await confirm(draft.body.id)).status).toBe(409);
    });
  },
);

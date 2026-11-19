import express from "express";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { confirmationBodyTemplate } from "@shared/confirmationEmail";
vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));
const suite = process.env.DATABASE_URL ? describe : describe.skip;
let pool: any, server: any, base: string, saved: any;
const legacy =
  "Hola {nombre_huesped},\nTu reserva está confirmada en la habitación {numero_habitacion}.\nMis condiciones especiales.\n{link_webcheckin}";
async function request(body?: any) {
  const r = await fetch(base + "/api/email/config", {
    method: body === undefined ? "GET" : "PATCH",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}
suite(
  "Confirmation email settings expose the same roomless text that is sent",
  () => {
    beforeAll(async () => {
      ({ pool } = await import("../db"));
      saved = (
        await pool.query(
          "SELECT confirmation_body,confirmation_subject FROM email_config WHERE id=1",
        )
      ).rows[0];
      if (!saved) await pool.query("INSERT INTO email_config(id) VALUES(1)");
      const app = express();
      app.use(express.json());
      (await import("../routes/emails")).registerEmailRoutes(app);
      server = app.listen(0, "127.0.0.1");
      await new Promise<void>((r) => server.once("listening", r));
      base = `http://127.0.0.1:${server.address().port}`;
    });
    afterAll(async () => {
      if (server) await new Promise<void>((r) => server.close(() => r()));
      if (saved)
        await pool.query(
          "UPDATE email_config SET confirmation_body=$1,confirmation_subject=$2 WHERE id=1",
          [saved.confirmation_body, saved.confirmation_subject],
        );
      else await pool.query("DELETE FROM email_config WHERE id=1");
      await pool?.end();
    });
    it("normalizes existing saved prose on read, keeping custom text and the private credentials out of the response", async () => {
      await pool.query(
        "UPDATE email_config SET confirmation_body=$1,confirmation_subject=$2 WHERE id=1",
        [legacy, "Reserva {codigo_reserva} - Hab. {numero_habitacion}"],
      );
      const r = await request();
      expect(r.status).toBe(200);
      expect(r.body.confirmationBody).toBe(confirmationBodyTemplate(legacy));
      expect(r.body.confirmationSubject).toBe(
        "Reserva {codigo_reserva} - Hab. {tipo_habitacion}",
      );
      expect(r.body.apiKey).toBeUndefined();
      expect(r.body.smtpPass).toBeUndefined();
      expect(r.body.confirmationBody).toContain("Mis condiciones especiales.");
      expect(
        (
          await pool.query(
            "SELECT confirmation_body FROM email_config WHERE id=1",
          )
        ).rows[0].confirmation_body,
      ).toBe(legacy);
    });
    it("normalizes only confirmation fields when saving and keeps the reminder template unchanged", async () => {
      const reminder = (
        await pool.query("SELECT reminder_body FROM email_config WHERE id=1")
      ).rows[0].reminder_body;
      const r = await request({
        confirmationBody: legacy,
        confirmationSubject: "Tu habitación {numero_habitacion}",
      });
      expect(r.status).toBe(200);
      const current = (
        await pool.query(
          "SELECT confirmation_body,confirmation_subject,reminder_body FROM email_config WHERE id=1",
        )
      ).rows[0];
      expect(current.confirmation_body).not.toContain("{numero_habitacion}");
      expect(current.confirmation_subject).toContain("{tipo_habitacion}");
      expect(current.reminder_body).toBe(reminder);
    });
    it("rejects a non-text confirmation template before touching the configuration", async () => {
      const before = (
        await pool.query(
          "SELECT confirmation_body FROM email_config WHERE id=1",
        )
      ).rows[0];
      expect((await request({ confirmationBody: 123 })).status).toBe(400);
      expect(
        (
          await pool.query(
            "SELECT confirmation_body FROM email_config WHERE id=1",
          )
        ).rows[0],
      ).toEqual(before);
    });
  },
);

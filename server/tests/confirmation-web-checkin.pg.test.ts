import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import express from "express";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { emailConfig, webCheckins } from "@shared/schema";
import { eq } from "drizzle-orm";

const smtp = vi.hoisted(() => ({
  sendMail: vi.fn().mockResolvedValue({ messageId: "synthetic" }),
  close: vi.fn(),
}));
vi.mock("../lib/smtpTransport", () => ({
  createIpv4SmtpTransport: async () => smtp,
}));
const url = process.env.DATABASE_URL || "";
const enabled =
  !!url &&
  (process.env.CI === "true" ||
    process.env.ALLOW_DESTRUCTIVE_PG_TESTS === "true");
if (
  enabled &&
  (!["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    !/test/i.test(new URL(url).pathname))
)
  throw Error("Disposable local test database required");
let db: any, pool: any, savedConfig: any, server: any, base: string;
let getOrCreate: typeof import("../lib/webCheckinAccess").getOrCreateWebCheckin;
let getPublic: typeof import("../lib/webCheckinAccess").getPublicWebCheckin;
let confirm: typeof import("../email-service").sendConfirmationEmail;
let remind: typeof import("../email-service").runReminderScheduler;
const ids: string[] = [];
const current = new Date("2026-11-18T12:00:00Z");
async function fixture(arrival = "2027-04-20") {
  const id = `confirmation-checkin-test-${randomUUID()}`;
  ids.push(id);
  await pool.query(
    "INSERT INTO guests(id,first_name,last_name,email) VALUES($1,'Invitada','Sintética','guest@example.invalid')",
    [id],
  );
  await pool.query(
    "INSERT INTO room_types(id,code,name) VALUES($1::text,$1::text,'Synthetic type')",
    [id],
  );
  await pool.query(
    "INSERT INTO rooms(id,room_number,room_type_id,status) VALUES($1::text,$1::text,$1,'available')",
    [id],
  );
  await pool.query(
    `INSERT INTO reservations(id,reservation_code,guest_id,room_id,room_type_id,check_in_date,check_out_date,nights,total_room_amount,status,created_at)
    VALUES($1::text,$1::text,$1,$1,$1,$2::date,$2::date+1,1,100,'confirmed',NOW())`,
    [id, arrival],
  );
  return id;
}
async function configure(patch: any = {}) {
  await db
    .update(emailConfig)
    .set({
      globalEnabled: true,
      confirmationEnabled: true,
      reminderEnabled: true,
      provider: "smtp",
      smtpUser: "test@example.invalid",
      smtpPass: "synthetic",
      confirmationSubject: "Reserva {codigo_reserva}",
      confirmationBody: "Hola {nombre_huesped},\nTu texto personalizado",
      reminderBody: "Te esperamos el {fecha_checkin}",
      ...patch,
    })
    .where(eq(emailConfig.id, 1));
}

describe.skipIf(!enabled)(
  "Confirmation and reminder web check-in · disposable PostgreSQL, simulated SMTP",
  () => {
    beforeAll(async () => {
      ({ db, pool } = await import("../db"));
      ({ getOrCreateWebCheckin: getOrCreate, getPublicWebCheckin: getPublic } =
        await import("../lib/webCheckinAccess"));
      ({ sendConfirmationEmail: confirm, runReminderScheduler: remind } =
        await import("../email-service"));
      [savedConfig] = await db
        .select()
        .from(emailConfig)
        .where(eq(emailConfig.id, 1));
      if (!savedConfig) await db.insert(emailConfig).values({ id: 1 });
      const app = express();
      app.use(express.json());
      (await import("../routes/web-checkin")).registerWebCheckinRoutes(app);
      server = app.listen(0, "127.0.0.1");
      await new Promise<void>((resolve) => server.once("listening", resolve));
      base = `http://127.0.0.1:${server.address().port}`;
    });
    beforeEach(async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(current);
      vi.stubEnv("SITE_BASE_URL", "https://hotel.example.invalid");
      smtp.sendMail.mockClear();
      await configure();
    });
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });
    afterAll(async () => {
      if (server) await new Promise<void>((resolve) => server.close(resolve));
      for (const id of ids) {
        await pool.query("DELETE FROM email_logs WHERE reservation_id=$1", [
          id,
        ]);
        await pool.query("DELETE FROM web_checkins WHERE reservation_id=$1", [
          id,
        ]);
        await pool.query(
          "DELETE FROM reservation_companions WHERE reservation_id=$1",
          [id],
        );
        await pool.query("DELETE FROM reservations WHERE id=$1", [id]);
        await pool.query("DELETE FROM rooms WHERE id=$1", [id]);
        await pool.query("DELETE FROM room_types WHERE id=$1", [id]);
        await pool.query("DELETE FROM guests WHERE id=$1", [id]);
        await pool.query(
          "DELETE FROM system_notifications WHERE related_entity_id=$1",
          [id],
        );
        await pool.query(
          "DELETE FROM reservation_changelog WHERE reservation_id=$1",
          [id],
        );
        await pool.query("DELETE FROM audit_logs WHERE entity_id=$1", [id]);
      }
      if (savedConfig)
        await db
          .update(emailConfig)
          .set(savedConfig)
          .where(eq(emailConfig.id, 1));
      else await db.delete(emailConfig).where(eq(emailConfig.id, 1));
      await pool?.end();
    });
    it("includes a clickable personal link in confirmation for a reservation months away", async () => {
      const id = await fixture();
      await confirm(id);
      expect(smtp.sendMail).toHaveBeenCalledTimes(1);
      const checkin = await getOrCreate(id);
      const message = smtp.sendMail.mock.calls[0][0];
      expect(message.to).toBe("guest@example.invalid");
      const link = `https://hotel.example.invalid/web-checkin/${checkin.token}`;
      expect(message.text).toContain("Tu texto personalizado");
      expect(message.text).toContain(link);
      expect(message.html).toContain(`href="${link}"`);
      expect(message.text).not.toContain("{link_webcheckin}");
      expect(message.attachments).toHaveLength(1);
      expect(message.attachments[0].filename).toBe(`Confirmacion-${id}.pdf`);
      expect(message.attachments[0].contentType).toBe("application/pdf");
      expect(message.attachments[0].content.subarray(0, 5).toString()).toBe(
        "%PDF-",
      );
      expect(checkin.expiresAt?.toISOString()).toBe("2027-04-21T03:00:00.000Z");
      vi.setSystemTime(new Date("2027-04-21T02:59:59Z"));
      expect((await getPublic(checkin.token)).status).toBe("pending");
      vi.setSystemTime(new Date("2027-04-21T03:00:00Z"));
      await expect(getPublic(checkin.token)).rejects.toThrow("expirado");
    });
    it("reuses one token across concurrent generation, confirmation and reminder", async () => {
      vi.setSystemTime(new Date("2026-11-19T01:00:00Z")); // Still November 18 in Argentina.
      const id = await fixture("2026-11-20");
      const records = await Promise.all(
        Array.from({ length: 5 }, () => getOrCreate(id)),
      );
      expect(new Set(records.map((r) => r.token)).size).toBe(1);
      expect(
        (
          await pool.query(
            "SELECT id FROM web_checkins WHERE reservation_id=$1",
            [id],
          )
        ).rows,
      ).toHaveLength(1);
      await confirm(id);
      await remind("https://untrusted-fallback.invalid");
      const messages = smtp.sendMail.mock.calls.map((call) => call[0]);
      expect(messages).toHaveLength(2);
      const manual = await fetch(`${base}/api/web-checkin/generate/${id}`, {
        method: "POST",
      });
      expect(((await manual.json()) as any).token).toBe(records[0].token);
      const lookup = await fetch(
        `${base}/api/public/reservation-lookup?code=${id}&lastName=${encodeURIComponent("Sintética")}`,
      );
      expect(((await lookup.json()) as any).token).toBe(records[0].token);
      for (const message of messages)
        expect(message.text).toContain(
          `https://hotel.example.invalid/web-checkin/${records[0].token}`,
        );
      await remind();
      expect(smtp.sendMail).toHaveBeenCalledTimes(2);
      expect(
        (await pool.query("SELECT status FROM reservations WHERE id=$1", [id]))
          .rows[0].status,
      ).toBe("confirmed");
    });
    it("repairs a legacy expired token and adjusts the same link after a date change", async () => {
      const id = await fixture();
      await db
        .insert(webCheckins)
        .values({
          reservationId: id,
          token: randomUUID(),
          status: "expired",
          expiresAt: new Date("2026-11-01T03:00:00Z"),
          confirmedPhone: "synthetic-phone",
        });
      const record = await getOrCreate(id);
      expect(record.status).toBe("pending");
      expect(record.confirmedPhone).toBe("synthetic-phone");
      await pool.query(
        "UPDATE reservations SET check_in_date='2027-05-15',check_out_date='2027-05-16' WHERE id=$1",
        [id],
      );
      const refreshed = await getPublic(record.token);
      expect(refreshed.token).toBe(record.token);
      expect(refreshed.expiresAt?.toISOString()).toBe(
        "2027-05-16T03:00:00.000Z",
      );
    });
    it("preserves completed data and still sends the arrival reminder without requesting the form again", async () => {
      const id = await fixture("2026-11-20");
      const original = await getOrCreate(id);
      await db
        .update(webCheckins)
        .set({
          status: "completed",
          signatureImage: "synthetic-signature",
          confirmedPhone: "123",
        })
        .where(eq(webCheckins.id, original.id));
      await db
        .insert(webCheckins)
        .values({ reservationId: id, token: randomUUID(), status: "pending" });
      expect((await getOrCreate(id)).token).toBe(original.token);
      await configure({
        confirmationBody: "Hola {nombre_huesped}\n{link_webcheckin}",
      });
      await confirm(id);
      await pool.query(
        "UPDATE reservations SET status='web_checkin' WHERE id=$1",
        [id],
      );
      await remind();
      const message = smtp.sendMail.mock.calls[0][0];
      expect(message.text).toContain("ya fue completado");
      expect(message.text).not.toContain("/web-checkin/");
      expect(smtp.sendMail).toHaveBeenCalledTimes(2);
      const reminder = smtp.sendMail.mock.calls[1][0];
      expect(reminder.attachments).toBeUndefined();
      expect(reminder.text).toContain("ya fue completado");
      expect(reminder.text).not.toContain("/web-checkin/");
      await remind();
      expect(smtp.sendMail).toHaveBeenCalledTimes(2);
      const [record] = await db
        .select()
        .from(webCheckins)
        .where(eq(webCheckins.id, original.id));
      expect(record.signatureImage).toBe("synthetic-signature");
      expect(record.confirmedPhone).toBe("123");
      await expect(getPublic(original.token)).rejects.toThrow(
        "ya fue completado",
      );
      const duplicates = await db
        .select()
        .from(webCheckins)
        .where(eq(webCheckins.reservationId, id));
      for (const record of duplicates)
        await expect(getPublic(record.token)).rejects.toThrow(
          "ya fue completado",
        );
    });
    it.each(["cancelled", "no_show", "checked_in", "checked_out"])(
      "rejects old links for %s reservations",
      async (status) => {
        const id = await fixture();
        const record = await getOrCreate(id);
        await pool.query("UPDATE reservations SET status=$2 WHERE id=$1", [
          id,
          status,
        ]);
        await expect(getPublic(record.token)).rejects.toThrow(
          "no permite pre-ingreso",
        );
        for (const method of ["GET", "POST"]) {
          const response = await fetch(
            `${base}/api/public/web-checkin/${record.token}`,
            {
              method,
              ...(method === "POST"
                ? {
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                      termsAccepted: true,
                      confirmedFirstName: "No",
                      confirmedLastName: "Cambiar",
                    }),
                  }
                : {}),
            },
          );
          expect(response.status).toBe(410);
        }
        expect(
          (
            await pool.query("SELECT status FROM reservations WHERE id=$1", [
              id,
            ])
          ).rows[0].status,
        ).toBe(status);
        expect(
          (await pool.query("SELECT first_name FROM guests WHERE id=$1", [id]))
            .rows[0].first_name,
        ).toBe("Invitada");
      },
    );
    it("does not create links or send emails if disabled or without a recipient", async () => {
      const id = await fixture();
      await configure({ confirmationEnabled: false });
      await confirm(id);
      await configure();
      await pool.query("UPDATE guests SET email=NULL WHERE id=$1", [id]);
      await confirm(id);
      expect(smtp.sendMail).not.toHaveBeenCalled();
      expect(
        (
          await pool.query(
            "SELECT id FROM web_checkins WHERE reservation_id=$1",
            [id],
          )
        ).rows,
      ).toHaveLength(0);
    });
    it("inserts the link once at a custom position in the saved template", async () => {
      const id = await fixture();
      await configure({
        confirmationBody: "Hola\nTu acceso: {link_webcheckin}\nNos vemos",
      });
      await confirm(id);
      const text = smtp.sendMail.mock.calls[0][0].text;
      expect(
        text.match(/https:\/\/hotel\.example\.invalid\/web-checkin\//g),
      ).toHaveLength(1);
      expect(text).toMatch(
        /^Hola\nTu acceso: https:.*\nNos vemos\n\nCódigo de reserva:/,
      );
    });
    it("lets the guest complete the emailed form once without occupying the room", async () => {
      const id = await fixture();
      await confirm(id);
      const record = await getOrCreate(id);
      expect(
        (await fetch(`${base}/api/public/web-checkin/${record.token}`)).status,
      ).toBe(200);
      const submit = () =>
        fetch(`${base}/api/public/web-checkin/${record.token}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            termsAccepted: true,
            confirmedFirstName: "Invitada",
            confirmedLastName: "Sintética",
            confirmedPhone: "12345",
          }),
        });
      const responses = await Promise.all([submit(), submit()]);
      expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(
        (await pool.query("SELECT status FROM reservations WHERE id=$1", [id]))
          .rows[0].status,
      ).toBe("web_checkin");
      expect(
        (await pool.query("SELECT status FROM rooms WHERE id=$1", [id])).rows[0]
          .status,
      ).toBe("available");
      expect(
        (
          await pool.query(
            "SELECT id FROM system_notifications WHERE related_entity_id=$1",
            [id],
          )
        ).rows,
      ).toHaveLength(1);
      const response = await fetch(
        `${base}/api/public/web-checkin/${record.token}`,
      );
      expect(response.status).toBe(409);
    });

    it("uses the reserved category after a physical-room change and omits the assigned number from mail and PDF", async () => {
      const id = await fixture();
      const assigned = id + "-assigned",
        assignedNumber = "98765-NO-PUBLICAR";
      await pool.query(
        "UPDATE reservations SET reservation_code='RES-EJEMPLO-001',final_rate_per_night=100 WHERE id=$1",
        [id],
      );
      await pool.query(
        "UPDATE room_types SET name='Categoría reservada de prueba' WHERE id=$1",
        [id],
      );
      await pool.query(
        "INSERT INTO room_types(id,code,name) VALUES($1::text,$1::text,'Categoría física diferente')",
        [assigned],
      );
      await pool.query(
        "UPDATE rooms SET room_number=$2,room_type_id=$3 WHERE id=$1",
        [id, assignedNumber, assigned],
      );
      await configure({
        confirmationBody:
          "Hola {nombre_huesped},\nTe esperamos el {fecha_checkin} en la habitación {numero_habitacion}.\nHabitaciones: {numero_habitacion}\nTexto personalizado.\n{link_webcheckin}",
        confirmationSubject:
          "Reserva {codigo_reserva} · Hab. {numero_habitacion}",
      });
      const rendered = vi.spyOn(PDFDocument.prototype, "text");
      try {
        await confirm(id);
        expect(smtp.sendMail).toHaveBeenCalledTimes(1);
        const message = smtp.sendMail.mock.calls[0][0];
        expect(message.text).toContain("Texto personalizado.");
        for (const value of [message.subject, message.text, message.html]) {
          expect(value).not.toContain(assignedNumber);
          expect(value).not.toContain("{numero_habitacion}");
        }
        expect(message.subject).toContain("Categoría reservada de prueba");
        const text = rendered.mock.calls
          .map(([value]) => String(value))
          .join("\n");
        expect(text).toContain("Categoría reservada de prueba");
        expect(text).not.toContain("Categoría física diferente");
        expect(text).not.toContain(assignedNumber);
        expect(message.attachments[0].content.subarray(0, 5).toString()).toBe(
          "%PDF-",
        );
        if (process.env.CONFIRMATION_PDF_ARTIFACT) {
          fs.mkdirSync(path.dirname(process.env.CONFIRMATION_PDF_ARTIFACT), {
            recursive: true,
          });
          fs.writeFileSync(
            process.env.CONFIRMATION_PDF_ARTIFACT,
            message.attachments[0].content,
          );
        }
      } finally {
        await pool.query("UPDATE rooms SET room_type_id=$1 WHERE id=$1", [id]);
        await pool.query("DELETE FROM room_types WHERE id=$1", [assigned]);
      }
    });
    it("creates a valid PDF for a reserved category without a physical room record", async () => {
      const id = await fixture();
      await pool.query("UPDATE reservations SET room_id=$2 WHERE id=$1", [
        id,
        "synthetic-unassigned",
      ]);
      const { generateReservationConfirmationPdf } = await import(
        "../reservationConfirmationPdf"
      );
      const pdf = await generateReservationConfirmationPdf(id);
      expect(pdf?.roomTypeName).toBe("Synthetic type");
      expect(pdf?.content.subarray(0, 5).toString()).toBe("%PDF-");
    });
    it("records a failed confirmation instead of sending a message without its required PDF", async () => {
      const id = await fixture(),
        pdf = await import("../reservationConfirmationPdf");
      vi.spyOn(pdf, "generateReservationConfirmationPdf").mockRejectedValueOnce(
        new Error("Synthetic PDF failure"),
      );
      await confirm(id);
      expect(smtp.sendMail).not.toHaveBeenCalled();
      const logs = (
        await pool.query(
          "SELECT status,error_message FROM email_logs WHERE reservation_id=$1 AND type='confirmation'",
          [id],
        )
      ).rows;
      expect(logs).toEqual([
        { status: "failed", error_message: "Synthetic PDF failure" },
      ]);
    });

    it("uses the same personal link with the Resend provider, without a network delivery", async () => {
      const id = await fixture();
      await configure({ provider: "resend", apiKey: "synthetic-not-a-key" });
      const fetcher = vi
        .fn()
        .mockResolvedValue(new Response('{"id":"synthetic"}', { status: 200 }));
      vi.stubGlobal("fetch", fetcher);
      await confirm(id);
      expect(fetcher).toHaveBeenCalledTimes(1);
      const message = JSON.parse(fetcher.mock.calls[0][1].body);
      expect(message.to).toEqual(["guest@example.invalid"]);
      expect(message.attachments).toHaveLength(1);
      const content = Buffer.from(message.attachments[0].content, "base64");
      expect(content.subarray(0, 5).toString()).toBe("%PDF-");
      expect(message.attachments[0].filename).toBe(`Confirmacion-${id}.pdf`);
      expect(message.text).toContain(
        `/web-checkin/${(await getOrCreate(id)).token}`,
      );
    });

    it("preserves ordinary confirmation for a historical arrival without issuing an expired link", async () => {
      const id = await fixture("2026-11-01");
      await configure({
        confirmationBody: "Reserva confirmada. {link_webcheckin}",
      });
      await confirm(id);
      expect(smtp.sendMail).toHaveBeenCalledTimes(1);
      expect(smtp.sendMail.mock.calls[0][0].text).toContain(
        "contactá a recepción",
      );
      expect(
        (
          await pool.query(
            "SELECT id FROM web_checkins WHERE reservation_id=$1",
            [id],
          )
        ).rows,
      ).toHaveLength(0);
    });
  },
);

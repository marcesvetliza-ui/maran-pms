import { randomUUID } from "node:crypto";
import express from "express";
import type { Server } from "node:http";
import pg from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
vi.mock("../auth", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    const role = req.headers["x-test-role"];
    if (!role) return res.sendStatus(401);
    req.user = { username: "test-operator", role };
    next();
  },
  requirePermission: (key: string) => (req: any, res: any, next: any) => {
    if (
      req.user.role === "admin" ||
      (req.user.role === "reception" && key !== "api:reviews:configure")
    )
      return next();
    res.sendStatus(403);
  },
}));
import { ensureReviewsSchema } from "../reviews/schema";
import { registerReviewRoutes } from "../reviews/routes";
import { registerEmailRoutes } from "../routes/emails";
import { loadRolePermissionsCache } from "../permissions";
import {
  runSurveyScheduler,
  requestSurveyInvitation,
  surveyDispatchForReservation,
} from "../reviews/dispatch";
import {
  submitSurvey,
  backfillSurveyReviews,
  publicSurvey,
} from "../reviews/service";
const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL })
  : null;
const ids: string[] = [],
  guestIds: string[] = [],
  roomIds: string[] = [];
const roomType = randomUUID();
let server: Server, base: string;
let previousConfig: any;
async function stay(
  options: {
    email?: string | null;
    guestId?: string;
    closed?: boolean;
    legacyClosed?: boolean;
  } = {},
) {
  const id = randomUUID(),
    guestId = options.guestId || randomUUID();
  ids.push(id);
  if (!options.guestId) {
    guestIds.push(guestId);
    await pool!.query(
      "INSERT INTO guests(id,first_name,last_name,email) VALUES($1,$2,$3,$4)",
      [
        guestId,
        "Prueba",
        "Encuesta",
        options.email === undefined ? "survey@example.invalid" : options.email,
      ],
    );
  }
  const roomId = randomUUID();
  roomIds.push(roomId);
  await pool!.query(
    "INSERT INTO rooms(id,room_number,room_type_id,status) VALUES($1::text,$1::text,$2,'available')",
    [roomId, roomType],
  );
  await pool!.query(
    `INSERT INTO reservations(id,reservation_code,guest_id,room_id,room_type_id,check_in_date,check_out_date,status,nights,total_room_amount,created_at)
    VALUES($1::text,$1::text,$2,$3,$4,'2026-11-17','2026-11-19',$5,2,0,now())`,
    [
      id,
      guestId,
      roomId,
      roomType,
      options.legacyClosed ? "checked_out" : "checked_in",
    ],
  );
  if (options.closed !== false && !options.legacyClosed)
    await pool!.query(
      "UPDATE reservations SET status='checked_out' WHERE id=$1",
      [id],
    );
  return { id, guestId };
}
async function due(id: string) {
  await pool!.query(
    "UPDATE survey_dispatches SET scheduled_for=now()-interval '1 minute' WHERE reservation_id=$1",
    [id],
  );
}
async function tokenFor(id: string) {
  return (
    await pool!.query(
      "SELECT * FROM survey_tokens WHERE reservation_id=$1 ORDER BY created_at DESC LIMIT 1",
      [id],
    )
  ).rows[0];
}
async function api(
  path: string,
  method = "GET",
  body?: any,
  role: string | null = "admin",
) {
  return fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(role ? { "x-test-role": role } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
suite(
  "Encuestas posestadía y Reseñas · PostgreSQL descartable, proveedor simulado",
  () => {
    beforeAll(async () => {
      const target = new URL(process.env.DATABASE_URL!);
      if (!["localhost", "127.0.0.1"].includes(target.hostname))
        throw Error("Local test DB required");
      await ensureReviewsSchema();
      await ensureReviewsSchema();
      await loadRolePermissionsCache();
      previousConfig = (
        await pool!.query(
          "SELECT global_enabled,checkout_enabled,checkout_delay_days,checkout_send_time FROM email_config WHERE id=1",
        )
      ).rows[0];
      await pool!.query(
        "INSERT INTO room_types(id,code,name) VALUES($1::text,$1::text,'Encuestas test')",
        [roomType],
      );
      await pool!.query(
        "INSERT INTO email_config(id,global_enabled,checkout_enabled) VALUES(1,true,true) ON CONFLICT(id) DO UPDATE SET global_enabled=true,checkout_enabled=true,checkout_delay_days=1,checkout_send_time='10:00'",
      );
      const app = express();
      app.use(express.json());
      registerEmailRoutes(app);
      registerReviewRoutes(app);
      server = await new Promise<Server>((resolve) => {
        const s = app.listen(0, "127.0.0.1", () => resolve(s));
      });
      base = `http://127.0.0.1:${(server.address() as any).port}`;
    });
    afterEach(async () => {
      if (!pool) return;
      await pool.query(
        "DELETE FROM system_notifications WHERE related_entity_type='review' AND related_entity_id IN(SELECT id FROM guest_reviews WHERE reservation_id=ANY($1::varchar[]))",
        [ids],
      );
      await pool.query(
        "DELETE FROM guest_reviews WHERE reservation_id=ANY($1::varchar[])",
        [ids],
      );
      await pool.query(
        "DELETE FROM survey_responses WHERE survey_token_id IN(SELECT id FROM survey_tokens WHERE reservation_id=ANY($1::varchar[]))",
        [ids],
      );
      await pool.query(
        "DELETE FROM survey_tokens WHERE reservation_id=ANY($1::varchar[])",
        [ids],
      );
      await pool.query(
        "DELETE FROM email_logs WHERE reservation_id=ANY($1::varchar[])",
        [ids],
      );
      await pool.query(
        "DELETE FROM audit_logs WHERE entity_id=ANY($1::varchar[])",
        [ids],
      );
      await pool.query("DELETE FROM reservations WHERE id=ANY($1::varchar[])", [
        ids,
      ]);
      await pool.query("DELETE FROM rooms WHERE id=ANY($1::varchar[])", [
        roomIds,
      ]);
      await pool.query("DELETE FROM guests WHERE id=ANY($1::varchar[])", [
        guestIds,
      ]);
      ids.length = 0;
      guestIds.length = 0;
      roomIds.length = 0;
      await pool.query(
        "UPDATE email_config SET global_enabled=true,checkout_enabled=true,checkout_delay_days=1,checkout_send_time='10:00' WHERE id=1",
      );
    });
    afterAll(async () => {
      if (server) await new Promise<void>((r) => server.close(() => r()));
      if (pool) {
        await pool.query("DELETE FROM room_types WHERE id=$1", [roomType]);
        if (previousConfig)
          await pool.query(
            "UPDATE email_config SET global_enabled=$1,checkout_enabled=$2,checkout_delay_days=$3,checkout_send_time=$4 WHERE id=1",
            [
              previousConfig.global_enabled,
              previousConfig.checkout_enabled,
              previousConfig.checkout_delay_days,
              previousConfig.checkout_send_time,
            ],
          );
      }
      await pool?.end();
    });
    it("programa por salida efectiva en Argentina y no importa salidas históricas", async () => {
      expect(
        (
          await pool!.query(
            "SELECT survey_scheduled_time('2026-11-18T23:30:00Z'::timestamptz) AS due",
          )
        ).rows[0].due.toISOString(),
      ).toBe("2026-11-19T13:00:00.000Z");
      const r = await stay();
      const dispatch = await surveyDispatchForReservation(r.id);
      expect(dispatch.status).toBe("queued");
      expect(
        (
          await pool!.query(
            "SELECT count(*)::int n FROM survey_tokens WHERE reservation_id=$1",
            [r.id],
          )
        ).rows[0].n,
      ).toBe(0);
      const historical = await stay({ legacyClosed: true });
      expect(await surveyDispatchForReservation(historical.id)).toBeNull();
      const sender = vi.fn().mockResolvedValue({ status: "sent" });
      await runSurveyScheduler(sender);
      expect(sender).not.toHaveBeenCalled();
      await pool!.query(
        "UPDATE email_config SET checkout_delay_days=0 WHERE id=1",
      );
      expect(
        (
          await pool!.query(
            "SELECT survey_scheduled_time('2026-11-18T15:30:00Z'::timestamptz) AS due",
          )
        ).rows[0].due.toISOString(),
      ).toBe("2026-11-18T15:30:00.000Z");
    });
    it("dos workers y una reapertura generan un solo envío y un token", async () => {
      const r = await stay();
      await pool!.query(
        "UPDATE reservations SET status='checked_in' WHERE id=$1",
        [r.id],
      );
      await pool!.query(
        "UPDATE reservations SET status='checked_out' WHERE id=$1",
        [r.id],
      );
      await due(r.id);
      const sender = vi
        .fn()
        .mockResolvedValue({ status: "sent", providerId: "synthetic" });
      await Promise.all([
        runSurveyScheduler(sender),
        runSurveyScheduler(sender),
      ]);
      expect(sender).toHaveBeenCalledTimes(1);
      expect((await tokenFor(r.id)).token).toBe(sender.mock.calls[0][1]);
      await pool!.query(
        "UPDATE reservations SET status='checked_in' WHERE id=$1",
        [r.id],
      );
      await pool!.query(
        "UPDATE reservations SET status='checked_out' WHERE id=$1",
        [r.id],
      );
      await runSurveyScheduler(sender);
      expect(sender).toHaveBeenCalledTimes(1);
    });
    it("extender una estadía reabierta no bloquea su cierre ni duplica la invitación", async () => {
      const r = await stay();
      await pool!.query(
        "UPDATE reservations SET status='checked_in',check_out_date='2026-11-21' WHERE id=$1",
        [r.id],
      );
      await pool!.query(
        "UPDATE reservations SET status='checked_out' WHERE id=$1",
        [r.id],
      );
      expect((await surveyDispatchForReservation(r.id)).status).toBe("queued");
      expect(
        (
          await pool!.query(
            "SELECT count(*)::int n FROM survey_dispatches WHERE reservation_id=$1",
            [r.id],
          )
        ).rows[0].n,
      ).toBe(1);
    });
    it("una salida grupal del mismo huésped y estadía espera el último cierre y manda una sola encuesta", async () => {
      const a = await stay(),
        b = await stay({ guestId: a.guestId, closed: false });
      await due(a.id);
      const sender = vi.fn().mockResolvedValue({ status: "sent" });
      await runSurveyScheduler(sender);
      expect(sender).not.toHaveBeenCalled();
      await pool!.query(
        "UPDATE reservations SET status='checked_out' WHERE id=$1",
        [b.id],
      );
      await due(a.id);
      await runSurveyScheduler(sender);
      expect(sender).toHaveBeenCalledTimes(1);
    });
    it("respeta las pausas y omite estadías canceladas, no-show o reabiertas", async () => {
      const r = await stay();
      await due(r.id);
      const sender = vi.fn().mockResolvedValue({ status: "sent" });
      await pool!.query(
        "UPDATE email_config SET checkout_enabled=false WHERE id=1",
      );
      await runSurveyScheduler(sender);
      expect(sender).not.toHaveBeenCalled();
      await pool!.query(
        "UPDATE email_config SET checkout_enabled=true WHERE id=1",
      );
      for (const status of ["cancelled", "no_show", "checked_in"]) {
        await pool!.query("UPDATE reservations SET status=$2 WHERE id=$1", [
          r.id,
          status,
        ]);
        await runSurveyScheduler(sender);
      }
      expect(sender).not.toHaveBeenCalled();
    });
    it("deja visible un huésped sin email y lo retoma al completar sus datos", async () => {
      const r = await stay({ email: null });
      await due(r.id);
      const sender = vi.fn().mockResolvedValue({ status: "sent" });
      await runSurveyScheduler(sender);
      expect((await surveyDispatchForReservation(r.id)).status).toBe(
        "no_email",
      );
      expect(sender).not.toHaveBeenCalled();
      await pool!.query(
        "UPDATE guests SET email='completed@example.invalid' WHERE id=$1",
        [r.guestId],
      );
      await runSurveyScheduler(sender);
      expect(sender).toHaveBeenCalledTimes(1);
    });
    it("no reenvía automáticamente un resultado incierto; el reenvío explícito conserva la encuesta", async () => {
      const r = await stay();
      await due(r.id);
      const sender = vi
        .fn()
        .mockResolvedValueOnce({ status: "unknown", error: "simulated" })
        .mockResolvedValue({ status: "sent" });
      await runSurveyScheduler(sender);
      const token = await tokenFor(r.id);
      await runSurveyScheduler(sender);
      expect(sender).toHaveBeenCalledTimes(1);
      await expect(
        requestSurveyInvitation(r.id, false, "operador"),
      ).rejects.toMatchObject({ status: 409 });
      await requestSurveyInvitation(r.id, true, "operador");
      await runSurveyScheduler(sender);
      expect(sender).toHaveBeenCalledTimes(2);
      expect((await tokenFor(r.id)).id).toBe(token.id);
      expect(sender.mock.calls[0][3]).not.toBe(sender.mock.calls[1][3]);
    });
    it("un reinicio durante SMTP queda pendiente de revisión y no repite el envío", async () => {
      const r = await stay();
      await pool!.query(
        "UPDATE survey_dispatches SET status='sending',claimed_at=now()-interval '20 minutes' WHERE reservation_id=$1",
        [r.id],
      );
      const sender = vi.fn();
      await runSurveyScheduler(sender);
      expect((await surveyDispatchForReservation(r.id)).status).toBe("unknown");
      expect(sender).not.toHaveBeenCalled();
    });
    it("dos respuestas simultáneas a tokens de la misma reserva crean una sola opinión", async () => {
      const r = await stay();
      await due(r.id);
      await runSurveyScheduler(async () => ({ status: "sent" }));
      const token = await tokenFor(r.id),
        other = randomUUID();
      await pool!.query(
        "INSERT INTO survey_tokens(reservation_id,token,expires_at) VALUES($1,$2,now()+interval '1 day')",
        [r.id, other],
      );
      const replies = await Promise.all([
        submitSurvey(token.token, {
          ratingOverall: 2,
          areaRatings: { room: 1, spa: null },
          nps: 0,
          contactRequested: true,
          comment: "Texto original",
        }),
        submitSurvey(other, { ratingOverall: 5 }),
      ]);
      expect(replies.filter((r) => !r.alreadyCompleted)).toHaveLength(1);
      expect(
        (
          await pool!.query(
            "SELECT count(*)::int n FROM guest_reviews WHERE reservation_id=$1",
            [r.id],
          )
        ).rows[0].n,
      ).toBe(1);
      expect(
        (
          await pool!.query(
            "SELECT count(*)::int n FROM survey_responses WHERE survey_token_id IN(SELECT id FROM survey_tokens WHERE reservation_id=$1)",
            [r.id],
          )
        ).rows[0].n,
      ).toBe(1);
      expect(
        (
          await pool!.query(
            "SELECT bool_and(completed) done FROM survey_tokens WHERE reservation_id=$1",
            [r.id],
          )
        ).rows[0].done,
      ).toBe(true);
    });
    it("valida el token y puntajes sin aceptar notas fuera de escala", async () => {
      const r = await stay();
      await due(r.id);
      await runSurveyScheduler(async () => ({ status: "sent" }));
      const token = await tokenFor(r.id);
      for (const ratingOverall of [0, 6, 1.5, "5"])
        expect(
          (
            await api(
              "/api/survey/" + token.token,
              "POST",
              { ratingOverall },
              null,
            )
          ).status,
        ).toBe(400);
      expect(
        (
          await api(
            "/api/survey/" + token.token,
            "POST",
            { ratingOverall: 4, areaRatings: { inventada: 3 } },
            null,
          )
        ).status,
      ).toBe(400);
      await pool!.query(
        "UPDATE survey_tokens SET expires_at=now()-interval '1 day' WHERE id=$1",
        [token.id],
      );
      await expect(publicSurvey(token.token)).rejects.toMatchObject({
        status: 410,
      });
    });
    it("la respuesta, la reseña y el completado se confirman juntos o se revierten juntos", async () => {
      const r = await stay();
      await due(r.id);
      await runSurveyScheduler(async () => ({ status: "sent" }));
      const token = await tokenFor(r.id);
      await pool!
        .query(`CREATE OR REPLACE FUNCTION reviews_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reservation_id='${r.id}' THEN RAISE EXCEPTION 'synthetic failure'; END IF;RETURN NEW;END $$;
      CREATE TRIGGER reviews_test_failure BEFORE INSERT ON guest_reviews FOR EACH ROW EXECUTE FUNCTION reviews_test_failure()`);
      try {
        await expect(
          submitSurvey(token.token, { ratingOverall: 1 }),
        ).rejects.toThrow();
        expect(
          (
            await pool!.query(
              "SELECT count(*)::int n FROM survey_responses WHERE survey_token_id=$1",
              [token.id],
            )
          ).rows[0].n,
        ).toBe(0);
        expect((await tokenFor(r.id)).completed).toBe(false);
      } finally {
        await pool!.query(
          "DROP TRIGGER reviews_test_failure ON guest_reviews;DROP FUNCTION reviews_test_failure()",
        );
      }
    });
    it("migra respuestas anteriores de forma idempotente y preserva las opiniones manuales", async () => {
      const r = await stay();
      const token = randomUUID();
      await pool!.query(
        "INSERT INTO survey_tokens(id,reservation_id,token,completed) VALUES($1::text,$2,$1::text,true)",
        [token, r.id],
      );
      await pool!.query(
        "INSERT INTO survey_responses(survey_token_id,rating_overall,rating_room,rating_cleanliness,rating_service,comment) VALUES($1,4,3,5,4,'Histórica')",
        [token],
      );
      const manual = await api("/api/reviews", "POST", {
        reservationId: r.id,
        source: "direct",
        rating: 5,
        reviewDate: "2026-11-18",
        content: "Manual intacta",
      });
      expect(manual.status).toBe(201);
      await backfillSurveyReviews();
      await backfillSurveyReviews();
      const rows = (
        await pool!.query(
          "SELECT source,content,area_ratings FROM guest_reviews WHERE reservation_id=$1 ORDER BY source",
          [r.id],
        )
      ).rows;
      expect(rows).toHaveLength(2);
      expect(rows.find((r) => r.source === "direct").content).toBe(
        "Manual intacta",
      );
      expect(rows.find((r) => r.source === "survey").area_ratings).toEqual({
        room: 3,
        cleanliness: 5,
        service: 4,
      });
    });
    it("asigna a la fecha argentina una respuesta recibida después de medianoche UTC", async () => {
      const r = await stay(),
        token = randomUUID();
      await pool!.query(
        "INSERT INTO survey_tokens(id,reservation_id,token,completed) VALUES($1::text,$2,$1::text,true)",
        [token, r.id],
      );
      await pool!.query(
        "INSERT INTO survey_responses(survey_token_id,rating_overall,submitted_at) VALUES($1,4,'2026-11-19 01:30:00')",
        [token],
      );
      await backfillSurveyReviews();
      expect(
        (
          await pool!.query(
            "SELECT review_date::text FROM guest_reviews WHERE reservation_id=$1",
            [r.id],
          )
        ).rows[0].review_date,
      ).toBe("2026-11-18");
    });
    it("el seguimiento y sus notas no sobrescriben el comentario ni las puntuaciones del huésped", async () => {
      const r = await stay();
      await due(r.id);
      await runSurveyScheduler(async () => ({ status: "sent" }));
      const token = await tokenFor(r.id);
      await submitSurvey(token.token, {
        ratingOverall: 1,
        areaRatings: { room: 2 },
        comment: "Original que se conserva",
      });
      const before = (
        await pool!.query(
          "SELECT * FROM guest_reviews WHERE reservation_id=$1",
          [r.id],
        )
      ).rows[0];
      const response = await api(
        `/api/reviews/${before.id}/followup`,
        "PATCH",
        {
          status: "resolved",
          assignedTo: "Mantenimiento",
          actionAreas: ["maintenance"],
          note: "Se revisó la instalación",
          content: "NO DEBE GUARDARSE",
        },
      );
      expect(response.status).toBe(200);
      const after = (
        await pool!.query("SELECT * FROM guest_reviews WHERE id=$1", [
          before.id,
        ])
      ).rows[0];
      expect(after.content).toBe(before.content);
      expect(after.area_ratings).toEqual(before.area_ratings);
      expect(after.area_questions).toEqual(before.area_questions);
      expect(
        (
          await pool!.query(
            "SELECT count(*)::int n FROM review_events WHERE review_id=$1",
            [before.id],
          )
        ).rows[0].n,
      ).toBe(2);
      expect(
        (
          await (await api("/api/reviews?actionArea=maintenance")).json()
        ).items.map((r: any) => r.id),
      ).toContain(before.id);
      expect(
        (
          await pool!.query(
            "SELECT bool_and(status='completado') closed FROM system_notifications WHERE related_entity_id=$1",
            [before.id],
          )
        ).rows[0].closed,
      ).toBe(true);
    });
    it("filtra en el servidor y protege los resultados y la configuración por permisos", async () => {
      const r = await stay();
      expect((await api("/api/reviews", "GET", undefined, null)).status).toBe(
        401,
      );
      expect(
        (await api("/api/reviews", "GET", undefined, "restaurant")).status,
      ).toBe(200); // Sector access is now explicit and filtered; unrelated Hotel reviews remain hidden.
      expect((await (await api("/api/reviews", "GET", undefined, "restaurant")).json()).items).toEqual([]);
      expect(
        (await api("/api/reviews/areas", "POST", {}, "reception")).status,
      ).toBe(403);
      const made = await api("/api/reviews", "POST", {
        reservationId: r.id,
        source: "booking",
        rating: 3,
        reviewDate: "2026-11-18",
        content: "Prueba filtrable",
        areaRatings: { spa: 4 },
      });
      expect(made.status).toBe(201);
      const found = await (
        await api(
          "/api/reviews?source=booking&area=spa&rating=3&from=2026-11-18&to=2026-11-18&search=filtrable",
        )
      ).json();
      expect(found.items).toHaveLength(1);
      expect(
        (
          await (
            await api("/api/reviews?source=google&search=filtrable")
          ).json()
        ).total,
      ).toBe(0);
      expect((await api("/api/reviews?from=2026-02-30")).status).toBe(400);
    });
    it("mantiene los denominadores de encuestas separados de la carga manual y admite NPS cero", async () => {
      const r = await stay();
      await due(r.id);
      await runSurveyScheduler(async () => ({ status: "sent" }));
      const token = await tokenFor(r.id);
      await submitSurvey(token.token, {
        ratingOverall: 4,
        areaRatings: { spa: 5 },
        nps: 0,
      });
      await api("/api/reviews", "POST", {
        reservationId: r.id,
        source: "direct",
        rating: 5,
        reviewDate: "2026-11-18",
        content: "Opinión manual",
      });
      const stats = await (
        await api("/api/reviews/analytics?source=survey")
      ).json();
      expect(stats).toMatchObject({
        nps: -100,
        npsCount: 1,
        areas: { spa: { average: 5, count: 1 } },
        invitations: { sent: 1, responded: 1, responseRate: 100 },
      });
    });
    it("valida el cambio de horario y actualiza los pendientes sin tocar sus respuestas", async () => {
      const r = await stay();
      expect(
        (
          await api(
            "/api/email/config",
            "PATCH",
            { checkoutDelayDays: 2, checkoutSendTime: "11:30" },
            "reception",
          )
        ).status,
      ).toBe(403);
      expect(
        (await api("/api/email/config", "PATCH", { checkoutDelayDays: 3 }))
          .status,
      ).toBe(400);
      expect(
        (await api("/api/email/config", "PATCH", { checkoutSendTime: "25:30" }))
          .status,
      ).toBe(400);
      expect(
        (
          await api("/api/email/config", "PATCH", {
            checkoutDelayDays: 2,
            checkoutSendTime: "11:30",
          })
        ).status,
      ).toBe(200);
      const [row] = (
        await pool!.query(
          "SELECT scheduled_for=survey_scheduled_time(checked_out_at) AS matches FROM survey_dispatches WHERE reservation_id=$1",
          [r.id],
        )
      ).rows;
      expect(row.matches).toBe(true);
    });
    it("configura el horario desde Reseñas sin exponer credenciales del correo", async () => {
      const visible = await (
        await api("/api/reviews/schedule", "GET", undefined, "reception")
      ).json();
      expect(visible).toMatchObject({
        checkoutDelayDays: 1,
        checkoutSendTime: "10:00",
      });
      expect(visible).not.toHaveProperty("apiKey");
      expect(visible).not.toHaveProperty("smtpPass");
      expect(
        (
          await api(
            "/api/reviews/schedule",
            "PATCH",
            { checkoutDelayDays: 0, checkoutSendTime: "12:00" },
            "reception",
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await api("/api/reviews/schedule", "PATCH", {
            checkoutDelayDays: 0,
            checkoutSendTime: "12:00",
          })
        ).status,
      ).toBe(200);
    });
    it("conserva el texto de las preguntas y pide actualizar si cambiaron con la encuesta abierta", async () => {
      const r = await stay();
      await due(r.id);
      await runSurveyScheduler(async () => ({ status: "sent" }));
      const token = await tokenFor(r.id);
      const survey = await publicSurvey(token.token),
        room = survey.areas.find((a) => a.key === "room")!;
      expect(survey.areas.some((a) => a.key === "maintenance")).toBe(false);
      try {
        await pool!.query(
          "UPDATE review_areas SET question='Una pregunta distinta' WHERE key='room'",
        );
        await expect(
          submitSurvey(token.token, {
            ratingOverall: 4,
            areaRatings: { room: 4 },
            areaQuestions: { room: room.question },
          }),
        ).rejects.toMatchObject({ status: 409 });
        await pool!.query(
          "UPDATE review_areas SET question=$1 WHERE key='room'",
          [room.question],
        );
        await submitSurvey(token.token, {
          ratingOverall: 4,
          areaRatings: { room: 4 },
          areaQuestions: { room: room.question },
        });
        await pool!.query(
          "UPDATE review_areas SET question='Nueva pregunta futura' WHERE key='room'",
        );
        expect(
          (
            await pool!.query(
              "SELECT area_questions FROM guest_reviews WHERE reservation_id=$1",
              [r.id],
            )
          ).rows[0].area_questions.room,
        ).toBe(room.question);
      } finally {
        await pool!.query(
          "UPDATE review_areas SET question=$1 WHERE key='room'",
          [room.question],
        );
      }
    });
    it("permite registrar una opinión externa sin crear huéspedes ni exigir una reserva", async () => {
      const count = (await pool!.query("SELECT count(*)::int n FROM guests"))
        .rows[0].n;
      const result = await api("/api/reviews", "POST", {
        source: "google",
        guestName: "Huésped externo de prueba",
        rating: 4,
        reviewDate: "2026-11-18",
        content: "Opinión pública cargada manualmente",
      });
      expect(result.status).toBe(201);
      const { id } = await result.json();
      try {
        const detail = await (await api("/api/reviews/" + id)).json();
        expect(detail.review).toMatchObject({
          guestName: "Huésped externo de prueba",
          reservationId: null,
          source: "google",
        });
        expect(
          (await pool!.query("SELECT count(*)::int n FROM guests")).rows[0].n,
        ).toBe(count);
      } finally {
        await pool!.query("DELETE FROM guest_reviews WHERE id=$1", [id]);
      }
    });
    it("reconoce una invitación del sistema anterior y solo la reenvía con confirmación explícita", async () => {
      const r = await stay({ legacyClosed: true }),
        token = randomUUID();
      await pool!.query(
        "INSERT INTO survey_tokens(reservation_id,token,expires_at) VALUES($1,$2,now()+interval '1 day')",
        [r.id, token],
      );
      await pool!.query(
        "INSERT INTO email_logs(reservation_id,type,status) VALUES($1,'checkout','sent')",
        [r.id],
      );
      expect((await surveyDispatchForReservation(r.id)).status).toBe("sent");
      await expect(
        requestSurveyInvitation(r.id, false, "operador"),
      ).rejects.toMatchObject({ status: 409 });
      await requestSurveyInvitation(r.id, true, "operador");
      const sender = vi.fn().mockResolvedValue({ status: "sent" });
      await runSurveyScheduler(sender);
      expect(sender).toHaveBeenCalledTimes(1);
      expect(sender.mock.calls[0][1]).toBe(token);
    });
  },
);

import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import express from "express";
import pg from "pg";
import {
  beforeAll,
  afterAll,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { ensureReviewsSchema } from "../reviews/schema";
import { loadRolePermissionsCache } from "../permissions";
import { runSurveyScheduler } from "../reviews/dispatch";

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL })
  : null;
let server: Server, base: string;
const typeId = randomUUID();
const keys: string[] = [],
  stays: string[] = [],
  guestIds: string[] = [],
  roomIds: string[] = [];
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  role?: string,
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(role ? { "x-role": role } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: r.status,
    body: r.headers.get("content-type")?.includes("application/json")
      ? await r.json()
      : await r.arrayBuffer(),
  };
}
async function form(sector = "hotel") {
  const r = await call(`/api/survey/general/${sector}`);
  expect(r.status).toBe(200);
  keys.push(
    JSON.parse(
      Buffer.from(r.body.challenge.split(".")[0], "base64url").toString(),
    ).id,
  );
  return r.body;
}
function answer(f: any, extra: object = {}) {
  return {
    challenge: f.challenge,
    ratingOverall: 5,
    areaRatings: {},
    ...extra,
  };
}
async function stay(email: string | null = null, legacy = false) {
  const id = randomUUID(),
    g = randomUUID(),
    room = randomUUID();
  stays.push(id);
  guestIds.push(g);
  roomIds.push(room);
  await pool!.query(
    "INSERT INTO guests(id,first_name,last_name,email) VALUES($1,'Prueba','Sectores',$2)",
    [g, email],
  );
  await pool!.query(
    "INSERT INTO rooms(id,room_number,room_type_id,status) VALUES($1::text,$1::text,$2,'available')",
    [room, typeId],
  );
  await pool!.query(
    "INSERT INTO reservations(id,reservation_code,guest_id,room_id,room_type_id,check_in_date,check_out_date,status,created_at) VALUES($1::text,$1::text,$2,$3,$4,'2026-11-17','2026-11-19',$5,now())",
    [id, g, room, typeId, legacy ? "checked_out" : "confirmed"],
  );
  if (!legacy)
    await pool!.query(
      "UPDATE reservations SET status='checked_out' WHERE id=$1",
      [id],
    );
  return id;
}
suite("Sector surveys, personal sharing and enforced sector access", () => {
  beforeAll(async () => {
    if (
      process.env.NODE_ENV === "production" ||
      !["127.0.0.1", "localhost"].includes(
        new URL(process.env.DATABASE_URL!).hostname,
      )
    )
      throw Error("Disposable local database required");
    vi.stubEnv("SITE_BASE_URL", "https://survey.example.invalid");
    await ensureReviewsSchema();
    await loadRolePermissionsCache();
    await pool!.query(
      "INSERT INTO room_types(id,code,name) VALUES($1::text,$1::text,'Prueba encuestas')",
      [typeId],
    );
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      const role = req.headers["x-role"];
      req.isAuthenticated = () => !!role;
      req.session = {};
      if (role) req.user = { id: "sector-test", username: "sector-test", role };
      next();
    });
    server = createServer(app);
    await (await import("../routes")).registerRoutes(server, app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  }, 60000);
  afterEach(async () => {
    const q = `SELECT id FROM guest_reviews WHERE reservation_id=ANY($1::varchar[]) OR generic_response_id IN(SELECT id FROM survey_public_responses WHERE submission_key=ANY($2::uuid[]))`;
    await pool!.query(
      `DELETE FROM system_notifications WHERE related_entity_type='review' AND related_entity_id IN(${q})`,
      [stays, keys],
    );
    await pool!.query(`DELETE FROM guest_reviews WHERE id IN(${q})`, [
      stays,
      keys,
    ]);
    await pool!.query(
      "DELETE FROM survey_public_responses WHERE submission_key=ANY($1::uuid[])",
      [keys],
    );
    await pool!.query(
      "DELETE FROM survey_manual_deliveries WHERE reservation_id=ANY($1::varchar[])",
      [stays],
    );
    await pool!.query(
      "DELETE FROM survey_responses WHERE survey_token_id IN(SELECT id FROM survey_tokens WHERE reservation_id=ANY($1::varchar[]))",
      [stays],
    );
    await pool!.query(
      "DELETE FROM survey_dispatches WHERE reservation_id=ANY($1::varchar[])",
      [stays],
    );
    await pool!.query(
      "DELETE FROM survey_tokens WHERE reservation_id=ANY($1::varchar[])",
      [stays],
    );
    await pool!.query(
      "DELETE FROM email_logs WHERE reservation_id=ANY($1::varchar[])",
      [stays],
    );
    await pool!.query("DELETE FROM audit_logs WHERE user_name='sector-test'");
    await pool!.query("DELETE FROM reservations WHERE id=ANY($1::varchar[])", [
      stays,
    ]);
    await pool!.query("DELETE FROM rooms WHERE id=ANY($1::varchar[])", [
      roomIds,
    ]);
    await pool!.query("DELETE FROM guests WHERE id=ANY($1::varchar[])", [
      guestIds,
    ]);
    keys.length = stays.length = guestIds.length = roomIds.length = 0;
  });
  afterAll(async () => {
    if (server) await new Promise<void>((r) => server.close(() => r()));
    await pool!.query("DELETE FROM room_types WHERE id=$1", [typeId]);
    await pool!.end();
    await (await import("../db")).pool.end();
    vi.unstubAllEnvs();
  });
  it.each(["hotel", "spa", "events", "restaurant"])(
    "opens %s anonymously with its questions and no other visitor data",
    async (sector) => {
      const f = await form(sector);
      expect(f.kind).toBe("generic");
      expect(f.sector).toBe(sector);
      expect(f.areas.length).toBeGreaterThan(0);
      expect(f).not.toHaveProperty("guestName");
      expect(f).not.toHaveProperty("roomNumber");
      expect(f).not.toHaveProperty("reservationId");
      expect(f.areas.some((a: any) => a.key === "room")).toBe(
        sector === "hotel",
      );
      expect(f.areas.every((a: any) => a.sectors.includes(sector))).toBe(true);
    },
  );

  it("configures a sector-specific open question and persists text and explicit N/A without numeric scores", async () => {
    const key = "test_text_" + randomUUID().replaceAll("-", "");
    try {
      expect(
        (
          await call(
            "/api/reviews/areas",
            "POST",
            {
              key,
              name: "Sugerencias",
              question: "¿Qué mejorarías?",
              questionType: "text",
              active: true,
              inSurvey: true,
              sortOrder: 20,
              notificationArea: "spa",
              sectors: ["spa"],
            },
            "admin",
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await call(
            "/api/reviews",
            "POST",
            {
              guestName: "Prueba",
              sector: "spa",
              source: "direct",
              rating: 5,
              reviewDate: "2026-11-19",
              content: "Carga manual",
              areaRatings: { [key]: 5 },
            },
            "admin",
          )
        ).status,
      ).toBe(400);
      const f = await form("spa");
      expect(f.areas.find((a: any) => a.key === key)?.questionType).toBe(
        "text",
      );
      expect((await form("hotel")).areas.some((a: any) => a.key === key)).toBe(
        false,
      );
      const body = answer(f, {
        areaTextAnswers: { [key]: "Más horarios" },
        notApplicable: ["spa"],
        areaQuestions: {
          [key]: "¿Qué mejorarías?",
          spa: f.areas.find((a: any) => a.key === "spa").question,
        },
      });
      expect((await call("/api/survey/general/spa", "POST", body)).status).toBe(
        200,
      );
      const review = (
        await pool!.query(
          "SELECT * FROM guest_reviews WHERE generic_response_id IN(SELECT id FROM survey_public_responses WHERE submission_key=$1::uuid)",
          [keys[0]],
        )
      ).rows[0];
      expect(review.area_ratings).toEqual({});
      expect(review.area_text_answers).toEqual({ [key]: "Más horarios" });
      expect(review.not_applicable).toEqual(["spa"]);
      await ensureReviewsSchema();
      const detail = await call(
        "/api/reviews/" + review.id,
        "GET",
        undefined,
        "admin",
      );
      expect(detail.body.review || detail.body).toMatchObject({
        areaTextAnswers: { [key]: "Más horarios" },
        notApplicable: ["spa"],
      });
      const duplicate = await call("/api/survey/general/spa", "POST", body);
      expect(duplicate.body.alreadyCompleted).toBe(true);
      const wrongType = await form("spa");
      expect(
        (
          await call(
            "/api/survey/general/spa",
            "POST",
            answer(wrongType, { areaRatings: { [key]: 5 } }),
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await call(
            "/api/survey/general/spa",
            "POST",
            answer(wrongType, { areaTextAnswers: { room: "texto ajeno" } }),
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await call(
            "/api/survey/general/spa",
            "POST",
            answer(wrongType, {
              areaRatings: { spa: 5 },
              notApplicable: ["spa"],
            }),
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await call(
            "/api/survey/general/spa",
            "POST",
            answer(wrongType, {
              areaTextAnswers: { [key]: "Texto" },
              areaQuestions: { [key]: "Texto viejo" },
            }),
          )
        ).status,
      ).toBe(409);
    } finally {
      await pool!.query("DELETE FROM review_areas WHERE key=$1", [key]);
    }
  });
  it("stores open answers and N/A on personal stay surveys as well as their review", async () => {
    const key = "test_open_" + randomUUID().replaceAll("-", "");
    try {
      await pool!.query(
        "INSERT INTO review_areas(key,name,question,question_type,sectors) VALUES($1,'Sugerencias','¿Cómo mejorar?', 'text',ARRAY['hotel'])",
        [key],
      );
      const id = await stay();
      const shared = await call(
        `/api/reservations/${id}/survey-link`,
        "POST",
        {},
        "reception",
      );
      const token = shared.body.url.split("/").pop();
      expect(
        (
          await call("/api/survey/" + token, "POST", {
            ratingOverall: 4,
            areaTextAnswers: { [key]: "Más almohadas" },
            notApplicable: ["spa"],
          })
        ).status,
      ).toBe(200);
      const row = (
        await pool!.query(
          "SELECT s.area_text_answers,s.not_applicable,g.area_text_answers AS review_text FROM survey_responses s JOIN survey_tokens t ON t.id=s.survey_token_id JOIN guest_reviews g ON g.survey_response_id=s.id WHERE t.token=$1",
          [token],
        )
      ).rows[0];
      expect(row.area_text_answers).toEqual({ [key]: "Más almohadas" });
      expect(row.review_text).toEqual(row.area_text_answers);
      expect(row.not_applicable).toEqual(["spa"]);
    } finally {
      await pool!.query("DELETE FROM review_areas WHERE key=$1", [key]);
    }
  });

  it("removes a shared question from one survey with configuration permission and preserves history", async () => {
    const key = "test_remove_" + randomUUID().replaceAll("-", "");
    const area = {
      key,
      name: "Pregunta compartida",
      question: "¿Cómo evaluás el servicio?",
      questionType: "rating",
      active: true,
      inSurvey: true,
      sectors: ["hotel", "spa"],
      sortOrder: 10,
      notificationArea: "reception",
    };
    try {
      expect(
        (await call("/api/reviews/areas", "POST", area, "admin")).status,
      ).toBe(200);
      const f = await form("hotel");
      const stale = await form("hotel");
      expect(
        (
          await call(
            "/api/survey/general/hotel",
            "POST",
            answer(f, {
              areaRatings: { [key]: 2 },
              areaQuestions: { [key]: area.question },
            }),
          )
        ).status,
      ).toBe(200);
      const review = (
        await pool!.query(
          "SELECT id,area_ratings,area_questions,followup_status FROM guest_reviews WHERE generic_response_id IN(SELECT id FROM survey_public_responses WHERE submission_key=$1::uuid)",
          [keys[0]],
        )
      ).rows[0];
      const reservationId = await stay();
      const invitation = await call(
        `/api/reservations/${reservationId}/survey-link`,
        "POST",
        {},
        "reception",
      );
      const token = invitation.body.url.split("/").pop();
      expect(
        (await call(`/api/survey/${token}`)).body.areas.some(
          (a: any) => a.key === key,
        ),
      ).toBe(true);
      const endpoint = `/api/reviews/areas/${key}/surveys/hotel`;
      expect((await call(endpoint, "DELETE")).status).toBe(401);
      expect((await call(endpoint, "DELETE", undefined, "spa")).status).toBe(
        403,
      );
      expect(
        (await call(endpoint, "DELETE", undefined, "admin")).body,
      ).toMatchObject({ ok: true, alreadyRemoved: false });
      expect((await form("hotel")).areas.some((a: any) => a.key === key)).toBe(
        false,
      );
      expect((await form("spa")).areas.some((a: any) => a.key === key)).toBe(
        true,
      );
      expect(
        (await call(`/api/survey/${token}`)).body.areas.some(
          (a: any) => a.key === key,
        ),
      ).toBe(false);

      expect(
        (await call(endpoint, "DELETE", undefined, "admin")).body
          .alreadyRemoved,
      ).toBe(true);
      expect(
        (
          await pool!.query(
            "SELECT count(*)::int AS n FROM audit_logs WHERE entity_id=$1 AND details::jsonb->>'operation'='remove_from_survey'",
            [key],
          )
        ).rows[0].n,
      ).toBe(1);
      expect(
        (
          await call(
            "/api/survey/general/hotel",
            "POST",
            answer(stale, { areaRatings: { [key]: 4 } }),
          )
        ).status,
      ).toBe(400);
      const after = (
        await pool!.query(
          "SELECT id,area_ratings,area_questions,followup_status FROM guest_reviews WHERE id=$1",
          [review.id],
        )
      ).rows[0];
      expect(after).toEqual(review);
      expect(
        (
          await call(
            `/api/reviews/areas/${key}/surveys/spa`,
            "DELETE",
            undefined,
            "admin",
          )
        ).body.alreadyRemoved,
      ).toBe(false);
      const stored = (
        await pool!.query(
          "SELECT name,question,question_type,active,in_survey,sectors FROM review_areas WHERE key=$1",
          [key],
        )
      ).rows[0];
      expect(stored).toMatchObject({
        name: area.name,
        question: area.question,
        question_type: "rating",
        active: true,
        in_survey: false,
        sectors: ["spa"],
      });
      await ensureReviewsSchema();
      expect((await form("spa")).areas.some((a: any) => a.key === key)).toBe(
        false,
      );
      expect(
        (
          await call(
            "/api/reviews/areas",
            "POST",
            { ...area, sectors: ["spa"] },
            "admin",
          )
        ).status,
      ).toBe(200);
      expect((await form("spa")).areas.some((a: any) => a.key === key)).toBe(
        true,
      );
      expect(
        (
          await pool!.query(
            "SELECT area_ratings,area_questions FROM survey_public_responses WHERE submission_key=$1::uuid",
            [keys[0]],
          )
        ).rows[0],
      ).toEqual({
        area_ratings: { [key]: 2 },
        area_questions: { [key]: area.question },
      });
      expect(
        (
          await call(
            `/api/reviews/areas/${key}/surveys/invalid`,
            "DELETE",
            undefined,
            "admin",
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await call(
            "/api/reviews/areas/unknown_question/surveys/hotel",
            "DELETE",
            undefined,
            "admin",
          )
        ).status,
      ).toBe(404);
    } finally {
      await pool!.query("DELETE FROM review_areas WHERE key=$1", [key]);
    }
  });
  it("grants sector-scoped access without granting the legacy unrestricted review resources", async () => {
    const rows = (
      await pool!.query(
        "SELECT resource_key FROM role_permissions WHERE role='spa'",
      )
    ).rows.map((r) => r.resource_key);
    expect(rows).toContain("api:reviews:sector:spa");
    expect(rows).not.toContain("sidebar:/reviews");
    expect(rows).not.toContain("api:reviews:manage");
  });
  it("reuses a permanent link across visitors and coalesces concurrent retries of one response", async () => {
    const f = await form("spa"),
      other = await form("spa");
    const results = await Promise.all([
      call("/api/survey/general/spa", "POST", answer(f)),
      call("/api/survey/general/spa", "POST", answer(f)),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(results.filter((r) => !r.body.alreadyCompleted)).toHaveLength(1);
    expect(
      (await call("/api/survey/general/spa", "POST", answer(other))).status,
    ).toBe(200);
    const rows = (
      await pool!.query(
        "SELECT id FROM guest_reviews WHERE generic_response_id IN(SELECT id FROM survey_public_responses WHERE submission_key=ANY($1::uuid[]))",
        [keys],
      )
    ).rows;
    expect(rows).toHaveLength(2);
    expect((await call("/api/survey/general/spa")).status).toBe(200);
  });
  it("validates contact requests, signed challenges, hidden field and sector questions", async () => {
    const f = await form("spa");
    expect(
      (
        await call(
          "/api/survey/general/spa",
          "POST",
          answer(f, { contactRequested: true }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          "/api/survey/general/spa",
          "POST",
          answer(f, { challenge: f.challenge + "x" }),
        )
      ).status,
    ).toBe(409);
    expect(
      (await call("/api/survey/general/restaurant", "POST", answer(f))).status,
    ).toBe(409);
    expect(
      (
        await call(
          "/api/survey/general/spa",
          "POST",
          answer(f, { website: "bot.invalid" }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          "/api/survey/general/spa",
          "POST",
          answer(f, { areaRatings: { room: 5 } }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          "/api/survey/general/spa",
          "POST",
          answer(f, {
            areaRatings: { spa: 5 },
            areaQuestions: { spa: "Pregunta reemplazada" },
          }),
        )
      ).status,
    ).toBe(409);
  });
  it("stores declared event/contact details without creating or matching a customer or stay", async () => {
    const before = (
      await pool!.query(
        "SELECT (SELECT count(*) FROM guests)::int AS guests,(SELECT count(*) FROM reservations)::int AS stays",
      )
    ).rows[0];
    const f = await form("events");
    expect(
      (
        await call(
          "/api/survey/general/events",
          "POST",
          answer(f, {
            guestName: "Cliente informado",
            visitDate: "2026-11-18",
            eventName: "Evento de prueba",
            contactRequested: true,
            contactEmail: "contacto@example.invalid",
            reservationId: randomUUID(),
            guestId: randomUUID(),
            comment: "Comentario eventos",
          }),
        )
      ).status,
    ).toBe(200);
    const review = (
      await call(
        "/api/reviews?source=survey&sector=events&sectorMode=origin&search=Comentario%20eventos",
        "GET",
        undefined,
        "admin",
      )
    ).body.items[0];
    expect(review).toMatchObject({
      guestName: "Cliente informado",
      reservationId: null,
      sector: "events",
      surveyKind: "generic",
      visitDate: "2026-11-18",
      eventName: "Evento de prueba",
      contactEmail: "contacto@example.invalid",
    });
    expect(
      (
        await pool!.query(
          "SELECT (SELECT count(*) FROM guests)::int AS guests,(SELECT count(*) FROM reservations)::int AS stays",
        )
      ).rows[0],
    ).toEqual(before);
    const publicAgain = await form("events");
    expect(publicAgain).not.toHaveProperty("contactEmail");
    expect(publicAgain).not.toHaveProperty("guestName");
  });
  it("keeps private management and unsupported public methods behind authentication", async () => {
    for (const path of [
      "/api/reviews",
      "/api/reviews/links",
      "/api/reviews/areas",
    ])
      expect((await call(path)).status).toBe(401);
    expect((await call("/api/survey/general/spa", "PUT", {})).status).toBe(401);
  });
  it("enforces sector scope for lists, details, followup, QR and hotel invitation actions", async () => {
    const f = await form("spa");
    await call(
      "/api/survey/general/spa",
      "POST",
      answer(f, { comment: "Scope SPA" }),
    );
    const own = (
      await call("/api/reviews?search=Scope%20SPA", "GET", undefined, "spa")
    ).body.items[0];
    expect(own.sector).toBe("spa");
    expect(
      (await call("/api/reviews/" + own.id, "GET", undefined, "restaurant"))
        .status,
    ).toBe(404);
    expect(
      (
        await call(
          "/api/reviews/" + own.id + "/followup",
          "PATCH",
          { status: "resolved", assignedTo: null, actionAreas: [] },
          "restaurant",
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await call(
          "/api/reviews?search=Scope%20SPA",
          "GET",
          undefined,
          "restaurant",
        )
      ).body.total,
    ).toBe(0);
    const links = (await call("/api/reviews/links", "GET", undefined, "spa"))
      .body;
    expect(links.map((l: any) => l.sector)).toEqual(["spa"]);
    expect(links[0].url).toBe(
      "https://survey.example.invalid/encuesta/general/spa",
    );
    expect(
      (await call("/api/reviews/links/restaurant/qr", "GET", undefined, "spa"))
        .status,
    ).toBe(403);
    expect(
      (await call("/api/reviews/links/spa/qr", "GET", undefined, "spa")).status,
    ).toBe(200);
    expect(
      (await call("/api/reservations/no-id/survey-link", "POST", {}, "spa"))
        .status,
    ).toBe(403);
    expect(
      (await call("/api/reviews/stays", "GET", undefined, "spa")).status,
    ).toBe(403);
  });
  it("derives a Hotel case to Restaurant without changing its origin or duplicating the review", async () => {
    const f = await form("hotel");
    await call(
      "/api/survey/general/hotel",
      "POST",
      answer(f, { comment: "Derivación hotel", areaRatings: { food: 1 } }),
    );
    const cases = (
      await call(
        "/api/reviews?search=Derivaci%C3%B3n%20hotel",
        "GET",
        undefined,
        "restaurant",
      )
    ).body;
    expect(cases.total).toBe(1);
    const review = cases.items[0];
    expect(review.sector).toBe("hotel");
    expect(
      (
        await call(
          "/api/reviews?sector=restaurant&sectorMode=assigned&search=Derivaci%C3%B3n%20hotel",
          "GET",
          undefined,
          "restaurant",
        )
      ).body.total,
    ).toBe(1);
    expect(
      (
        await call(
          "/api/reviews?sector=restaurant&sectorMode=origin&search=Derivaci%C3%B3n%20hotel",
          "GET",
          undefined,
          "restaurant",
        )
      ).body.total,
    ).toBe(0);
    expect(
      (
        await call(
          "/api/reviews/" + review.id + "/followup",
          "PATCH",
          {
            status: "in_progress",
            assignedTo: "Equipo Restaurant",
            actionAreas: ["food"],
            note: "Seguimiento de prueba",
          },
          "restaurant",
        )
      ).status,
    ).toBe(200);
    expect(
      (await call("/api/reviews/" + review.id, "GET", undefined, "admin")).body
        .review.sector,
    ).toBe("hotel");
  });
  it("pauses a generic link without discarding earlier responses, and keeps the pause across schema checks", async () => {
    const f = await form("spa");
    try {
      expect(
        (
          await call(
            "/api/reviews/links/spa",
            "PATCH",
            { active: false },
            "admin",
          )
        ).status,
      ).toBe(200);
      await ensureReviewsSchema();
      expect((await call("/api/survey/general/spa")).status).toBe(404);
      expect(
        (await call("/api/survey/general/spa", "POST", answer(f))).status,
      ).toBe(404);
    } finally {
      await call("/api/reviews/links/spa", "PATCH", { active: true }, "admin");
    }
  });
  it("prepares one personal link without email, preserves the mail queue and only counts an explicit manual delivery", async () => {
    const id = await stay();
    const before = (
      await pool!.query(
        "SELECT status,scheduled_for FROM survey_dispatches WHERE reservation_id=$1",
        [id],
      )
    ).rows[0];
    const links = await Promise.all(
      Array.from({ length: 3 }, () =>
        call(`/api/reservations/${id}/survey-link`, "POST", {}, "reception"),
      ),
    );
    expect(links.every((r) => r.status === 200)).toBe(true);
    expect(new Set(links.map((r) => r.body.url)).size).toBe(1);
    expect(
      (
        await pool!.query(
          "SELECT count(*)::int AS n FROM survey_tokens WHERE reservation_id=$1",
          [id],
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await pool!.query(
          "SELECT status,scheduled_for FROM survey_dispatches WHERE reservation_id=$1",
          [id],
        )
      ).rows[0],
    ).toEqual(before);
    expect(
      (
        await pool!.query(
          "SELECT count(*)::int AS n FROM survey_manual_deliveries WHERE reservation_id=$1",
          [id],
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (
        await call(
          `/api/reservations/${id}/survey-link`,
          "POST",
          { markSent: true },
          "reception",
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          `/api/reservations/${id}/survey-link`,
          "POST",
          { markSent: true },
          "reception",
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await pool!.query(
          "SELECT count(*)::int AS n FROM survey_manual_deliveries WHERE reservation_id=$1",
          [id],
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await pool!.query(
          "SELECT count(*)::int AS n FROM email_logs WHERE reservation_id=$1",
          [id],
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it("uses the same personal invitation for email and WhatsApp and excludes generic links from invitation rates", async () => {
    const id = await stay("encuesta@example.invalid");
    const shared = await call(
      `/api/reservations/${id}/survey-link`,
      "POST",
      { markSent: true },
      "reception",
    );
    const token = shared.body.url.split("/").pop();
    const old = (await pool!.query("SELECT * FROM email_config WHERE id=1"))
      .rows[0];
    try {
      await pool!.query(
        "INSERT INTO email_config(id,global_enabled,checkout_enabled) VALUES(1,true,true) ON CONFLICT(id) DO UPDATE SET global_enabled=true,checkout_enabled=true",
      );
      await pool!.query(
        "UPDATE survey_dispatches SET scheduled_for=now()-interval '1 minute' WHERE reservation_id=$1",
        [id],
      );
      const sender = vi.fn(async (_id: string, t: string) => {
        if (_id === id) expect(t).toBe(token);
        return { status: "sent" as const };
      });
      await runSurveyScheduler(sender);
      expect(sender.mock.calls.some((args) => args[0] === id)).toBe(true);
      expect(
        (
          await call("/api/survey/" + token, "POST", {
            ratingOverall: 5,
            areaRatings: {},
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await call(
            `/api/reservations/${id}/survey-link`,
            "POST",
            {},
            "reception",
          )
        ).status,
      ).toBe(409);
      const stats = (
        await call(
          "/api/reviews/analytics?surveyKind=generic",
          "GET",
          undefined,
          "admin",
        )
      ).body;
      expect(stats.invitations).toMatchObject({
        sent: 0,
        responded: 0,
        responseRate: null,
        applicable: false,
      });
      const count = (
        await pool!.query(
          "WITH i AS(SELECT reservation_id FROM survey_dispatches WHERE reservation_id=$1 AND sent_at IS NOT NULL UNION SELECT reservation_id FROM survey_manual_deliveries WHERE reservation_id=$1) SELECT count(*)::int AS n FROM i",
          [id],
        )
      ).rows[0].n;
      expect(count).toBe(1);
    } finally {
      if (old)
        await pool!.query(
          "UPDATE email_config SET global_enabled=$1,checkout_enabled=$2 WHERE id=1",
          [old.global_enabled, old.checkout_enabled],
        );
      else await pool!.query("DELETE FROM email_config WHERE id=1");
    }
  });
  it("renews an expired personal URL without changing the token or resetting completed answers", async () => {
    const id = await stay(null, true);
    const token = randomUUID();
    await pool!.query(
      "INSERT INTO survey_tokens(reservation_id,token,expires_at) VALUES($1,$2,(now() AT TIME ZONE 'UTC')-interval '1 day')",
      [id, token],
    );
    expect((await call("/api/survey/" + token)).status).toBe(410);
    const prepared = await call(
      `/api/reservations/${id}/survey-link`,
      "POST",
      {},
      "reception",
    );
    expect(prepared.body.url).toBe(
      "https://survey.example.invalid/encuesta/" + token,
    );
    expect((await call("/api/survey/" + token)).status).toBe(200);
    await call("/api/survey/" + token, "POST", {
      ratingOverall: 4,
      areaRatings: {},
    });
    expect(
      (
        await call(
          `/api/reservations/${id}/survey-link`,
          "POST",
          {},
          "reception",
        )
      ).status,
    ).toBe(409);
  });
  it("keeps later permission revocations and sector question settings across restarts", async () => {
    const grant = (
      await pool!.query(
        "SELECT role FROM role_permissions WHERE role='spa' AND resource_key='api:reviews:sector:spa'",
      )
    ).rows;
    const area = (
      await pool!.query("SELECT sectors FROM review_areas WHERE key='food'")
    ).rows[0];
    try {
      await pool!.query(
        "DELETE FROM role_permissions WHERE role='spa' AND resource_key='api:reviews:sector:spa'",
      );
      await pool!.query(
        "UPDATE review_areas SET sectors=ARRAY['hotel'] WHERE key='food'",
      );
      await ensureReviewsSchema();
      expect(
        (
          await pool!.query(
            "SELECT 1 FROM role_permissions WHERE role='spa' AND resource_key='api:reviews:sector:spa'",
          )
        ).rowCount,
      ).toBe(0);
      expect(
        (await pool!.query("SELECT sectors FROM review_areas WHERE key='food'"))
          .rows[0].sectors,
      ).toEqual(["hotel"]);
    } finally {
      if (grant.length)
        await pool!.query(
          "INSERT INTO role_permissions(role,resource_key)VALUES('spa','api:reviews:sector:spa') ON CONFLICT DO NOTHING",
        );
      await pool!.query(
        "UPDATE review_areas SET sectors=$1::text[] WHERE key='food'",
        [area.sectors],
      );
      await loadRolePermissionsCache();
    }
  });
  it("shares the canonical stay invitation across duplicate reservation references and waits for the full departure", async () => {
    const id = await stay("alias@example.invalid"),
      alias = randomUUID();
    stays.push(alias);
    await pool!.query(
      "INSERT INTO reservations(id,reservation_code,guest_id,room_id,room_type_id,check_in_date,check_out_date,status,created_at) SELECT $1::text,$1::text,guest_id,room_id,room_type_id,check_in_date,check_out_date,'checked_out',now() FROM reservations WHERE id=$2",
      [alias, id],
    );
    const original = await call(
      `/api/reservations/${id}/survey-link`,
      "POST",
      {},
      "reception",
    );
    const duplicate = await call(
      `/api/reservations/${alias}/survey-link`,
      "POST",
      {},
      "reception",
    );
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.url).toBe(original.body.url);
    expect(
      (
        await pool!.query(
          "SELECT count(*)::int AS n FROM survey_tokens WHERE reservation_id=ANY($1::varchar[])",
          [stays],
        )
      ).rows[0].n,
    ).toBe(1);
    await pool!.query(
      "UPDATE reservations SET status='checked_in' WHERE id=$1",
      [id],
    );
    expect(
      (
        await call(
          `/api/reservations/${alias}/survey-link`,
          "POST",
          {},
          "reception",
        )
      ).status,
    ).toBe(409);
  });

  it("derives data and edit scope from granted permissions, including a read-only global view", async () => {
    const f = await form("spa"),
      h = await form("hotel");
    await call(
      "/api/survey/general/spa",
      "POST",
      answer(f, { comment: "Dynamic rights SPA" }),
    );
    await call(
      "/api/survey/general/hotel",
      "POST",
      answer(h, { comment: "Dynamic rights Hotel" }),
    );
    const all = (
        await call(
          "/api/reviews?search=Dynamic%20rights",
          "GET",
          undefined,
          "admin",
        )
      ).body.items,
      spa = all.find((r: any) => r.sector === "spa"),
      hotel = all.find((r: any) => r.sector === "hotel");
    const changed = [
      "sidebar:/reviews",
      "api:reviews:manage",
      "api:reviews:sector:spa",
    ];
    const previous = (
      await pool!.query(
        "SELECT resource_key FROM role_permissions WHERE role='reception' AND resource_key=ANY($1::text[])",
        [changed],
      )
    ).rows.map((r) => r.resource_key);
    try {
      await pool!.query(
        "DELETE FROM role_permissions WHERE role='reception' AND resource_key=ANY($1::text[])",
        [changed],
      );
      await pool!.query(
        "INSERT INTO role_permissions(role,resource_key)VALUES('reception','api:reviews:sector:spa')",
      );
      await loadRolePermissionsCache();
      expect(
        (
          await call(
            "/api/reviews?search=Dynamic%20rights",
            "GET",
            undefined,
            "reception",
          )
        ).body.items.map((r: any) => r.id),
      ).toEqual([spa.id]);
      expect(
        (await call("/api/reviews/" + hotel.id, "GET", undefined, "reception"))
          .status,
      ).toBe(404);
      await pool!.query(
        "INSERT INTO role_permissions(role,resource_key)VALUES('reception','sidebar:/reviews')",
      );
      await loadRolePermissionsCache();
      expect(
        (
          await call(
            "/api/reviews?search=Dynamic%20rights",
            "GET",
            undefined,
            "reception",
          )
        ).body.total,
      ).toBe(2);
      const change = {
        status: "in_progress",
        assignedTo: null,
        actionAreas: [],
      };
      expect(
        (
          await call(
            "/api/reviews/" + hotel.id + "/followup",
            "PATCH",
            change,
            "reception",
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await call(
            "/api/reviews/" + spa.id + "/followup",
            "PATCH",
            change,
            "reception",
          )
        ).status,
      ).toBe(200);
      expect(
        (await call("/api/reviews/invitations", "GET", undefined, "reception"))
          .status,
      ).toBe(200);
      expect(
        (
          await call(
            "/api/reservations/no-id/survey-link",
            "POST",
            {},
            "reception",
          )
        ).status,
      ).toBe(403);
      await pool!.query(
        "DELETE FROM role_permissions WHERE role='reception' AND resource_key='api:reviews:sector:spa'",
      );
      await loadRolePermissionsCache();
      expect(
        (
          await call(
            "/api/reviews/" + spa.id + "/followup",
            "PATCH",
            change,
            "reception",
          )
        ).status,
      ).toBe(403);
    } finally {
      await pool!.query(
        "DELETE FROM role_permissions WHERE role='reception' AND resource_key=ANY($1::text[])",
        [changed],
      );
      for (const key of previous)
        await pool!.query(
          "INSERT INTO role_permissions(role,resource_key)VALUES('reception',$1)",
          [key],
        );
      await loadRolePermissionsCache();
    }
  });
});

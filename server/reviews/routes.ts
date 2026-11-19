import rateLimit from "express-rate-limit";
import QRCode from "qrcode";
import {
  surveySectorSchema,
  surveySectors,
  permittedReviewSectors,
} from "@shared/survey-sectors";
import {
  publicSectorSurvey,
  submitSectorSurvey,
  sectorSharingLinks,
} from "./sectorLinks";
import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db, withDatabaseTransaction } from "../db";
import { hasPermission } from "../permissions";
import { requireAuth, requirePermission } from "../auth";
import {
  rating,
  reviewDateKey,
  reviewFiltersSchema,
  needsReviewFollowup,
  summarizeReviews,
} from "@shared/reviews";
import {
  reviewAreas,
  notifyReviewFollowup,
  listReviews,
  reviewAnalyticsRows,
  publicSurvey,
  submitSurvey,
  ReviewError,
} from "./service";
import {
  surveyDispatchForReservation,
  requestSurveyInvitation,
  preparePersonalSurveyLink,
} from "./dispatch";

const followupSchema = z.object({
  status: z.enum(["new", "in_progress", "resolved"]),
  assignedTo: z.string().trim().max(160).nullable(),
  actionAreas: z.array(z.string().max(60)).max(20),
  note: z.string().trim().max(5000).default(""),
});
const areaSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,59}$/),
  name: z.string().trim().min(2).max(80),
  question: z.string().trim().min(3).max(250),
  questionType: z.enum(["rating", "text"]).optional(),
  active: z.boolean(),
  inSurvey: z.boolean(),
  sectors: z.array(surveySectorSchema).min(1).optional(),
  sortOrder: z.number().int().min(0).max(100),
  notificationArea: z.enum([
    "reception",
    "events",
    "housekeeping",
    "maintenance",
    "restaurant",
    "spa",
  ]),
});
const manualSchema = z
  .object({
    reservationId: z.string().min(1).max(80).nullable().optional(),
    guestName: z.string().trim().min(2).max(160).optional(),
    sector: surveySectorSchema.default("hotel"),
    source: z.enum(["direct", "google", "booking", "other"]),
    rating,
    reviewDate: reviewDateKey,
    title: z.string().trim().max(180).default(""),
    content: z.string().trim().min(1).max(5000),
    areaRatings: z.record(rating).default({}),
  })
  .refine((data) => Boolean(data.reservationId || data.guestName));
const wrap =
  (action: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, _next: NextFunction) => {
    res.setHeader("Cache-Control", "private, no-store");
    void action(req, res).catch((e) => {
      if (e instanceof z.ZodError)
        return res
          .status(400)
          .json({ error: "Revisá los campos y filtros ingresados." });
      if (e instanceof ReviewError)
        return res.status(e.status).json({
          error: e.message,
          completed: e.status === 410 && e.message.includes("completada"),
        });
      console.error("[reviews]", e?.message);
      res.status(503).json({
        error:
          "No se pudo completar la operación de Reseñas. Reintentá en unos instantes.",
      });
    });
  };
const actor = (req: Request) => req.user?.username || "operador";
const scopesFor = (req: Request, manage = false) => {
  const granted = (key: string) => hasPermission(req.user?.role || "", key);
  const sectors = permittedReviewSectors(granted);
  if (manage && !granted("api:reviews:manage")) return sectors;
  return granted("sidebar:/reviews") ? undefined : sectors;
};
const scopeFor = (req: Request) => scopesFor(req);
const reviewPermission =
  (manage = false) =>
  (req: Request, res: Response, next: NextFunction) => {
    const scopes = scopesFor(req, manage);
    if (!scopes || scopes.length) return next();
    return res
      .status(403)
      .json({ error: "Tu rol no tiene acceso a esta acción de Reseñas." });
  };
const read = [requireAuth, reviewPermission()];
const write = [...read, reviewPermission(true)];
const configure = [...read, requirePermission("api:reviews:configure")];
const hotelOnly = (req: Request, manage = false) => {
  const scope = scopesFor(req, manage);
  if (scope && !scope.includes("hotel"))
    throw new ReviewError("Esta acción corresponde a Recepción.", 403);
};

const genericReadLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error:
      "Recibimos muchas respuestas desde esta conexión. Reintentá más tarde.",
  },
});
const genericSubmitLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 240,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error:
      "Recibimos muchas respuestas desde esta conexión. Reintentá más tarde.",
  },
});

export function registerReviewRoutes(app: Express) {
  app.get(
    "/api/survey/general/:sector",
    genericReadLimit,
    wrap(async (req, res) =>
      res.json(await publicSectorSurvey(req.params.sector)),
    ),
  );
  app.post(
    "/api/survey/general/:sector",
    genericSubmitLimit,
    wrap(async (req, res) =>
      res.json(await submitSectorSurvey(req.params.sector, req.body)),
    ),
  );
  app.get(
    "/api/reviews/links",
    ...read,
    wrap(async (req, res) => res.json(await sectorSharingLinks(scopeFor(req)))),
  );
  app.patch(
    "/api/reviews/links/:sector",
    ...configure,
    wrap(async (req, res) => {
      const sector = surveySectorSchema.parse(req.params.sector),
        body = z.object({ active: z.boolean() }).parse(req.body);
      await withDatabaseTransaction(async () => {
        await db.execute(
          sql`UPDATE review_sector_links SET active=${body.active},updated_at=now() WHERE sector=${sector}`,
        );
        await db.execute(sql`INSERT INTO audit_logs(action,module,user_name,description,entity_type,entity_id,details,timestamp)
        VALUES('update','reviews',${actor(req)},'Disponibilidad de enlace de encuesta','survey_sector',${sector},${JSON.stringify(body)},now())`);
      });
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/reviews/links/:sector/qr",
    ...read,
    wrap(async (req, res) => {
      const sector = surveySectorSchema.parse(req.params.sector),
        links = await sectorSharingLinks(scopeFor(req)),
        link = links.find((l) => l.sector === sector);
      if (!link)
        throw new ReviewError("Enlace no disponible para tu sector.", 403);
      const png = await QRCode.toBuffer(link.url, {
        type: "png",
        width: 700,
        margin: 3,
      });
      res
        .type("png")
        .setHeader(
          "Content-Disposition",
          `attachment; filename="encuesta-${sector}.png"`,
        );
      res.send(png);
    }),
  );
  app.post(
    "/api/reservations/:id/survey-link",
    ...write,
    wrap(async (req, res) => {
      hotelOnly(req, true);
      const body = z
        .object({ markSent: z.boolean().default(false) })
        .parse(req.body || {});
      res.json(
        await preparePersonalSurveyLink(
          req.params.id,
          body.markSent,
          actor(req),
        ),
      );
    }),
  );
  app.get(
    "/api/reviews/schedule",
    ...read,
    wrap(async (_req, res) => {
      const [config] = (
        await db.execute(
          sql`SELECT checkout_delay_days AS "checkoutDelayDays",checkout_send_time AS "checkoutSendTime",global_enabled AS "globalEnabled",checkout_enabled AS "checkoutEnabled" FROM email_config WHERE id=1`,
        )
      ).rows;
      res.json(config || null);
    }),
  );
  app.patch(
    "/api/reviews/schedule",
    ...configure,
    wrap(async (req, res) => {
      const schedule = z
        .object({
          checkoutDelayDays: z.number().int().min(0).max(2),
          checkoutSendTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        })
        .parse(req.body);
      await withDatabaseTransaction(async () => {
        const changed = (
          await db.execute(
            sql`UPDATE email_config SET checkout_delay_days=${schedule.checkoutDelayDays},checkout_send_time=${schedule.checkoutSendTime},updated_at=now() WHERE id=1 RETURNING id`,
          )
        ).rows;
        if (!changed.length)
          throw new ReviewError(
            "Primero configurá el correo del hotel en Respuestas automáticas.",
            409,
          );
        await db.execute(
          sql`UPDATE survey_dispatches SET scheduled_for=survey_scheduled_time(checked_out_at),updated_at=now() WHERE status IN ('queued','no_email')`,
        );
        await db.execute(sql`INSERT INTO audit_logs(action,module,user_name,description,entity_type,entity_id,details,timestamp)
        VALUES('update','reviews',${actor(req)},'Horario de encuestas actualizado','email_config','1',${JSON.stringify(schedule)},now())`);
      });
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/survey/:token",
    wrap(async (req, res) => res.json(await publicSurvey(req.params.token))),
  );
  app.post(
    "/api/survey/:token",
    wrap(async (req, res) =>
      res.json(await submitSurvey(req.params.token, req.body)),
    ),
  );
  app.get(
    "/api/reviews/areas",
    ...read,
    wrap(async (_req, res) => res.json(await reviewAreas())),
  );
  app.post(
    "/api/reviews/areas",
    ...configure,
    wrap(async (req, res) => {
      const a = areaSchema.parse(req.body);
      await withDatabaseTransaction(async () => {
        await db.execute(sql`INSERT INTO review_areas(key,name,question,active,in_survey,sort_order,notification_area)
        VALUES(${a.key},${a.name},${a.question},${a.active},${a.inSurvey},${a.sortOrder},${a.notificationArea})
        ON CONFLICT(key) DO UPDATE SET name=EXCLUDED.name,question=EXCLUDED.question,active=EXCLUDED.active,in_survey=EXCLUDED.in_survey,sort_order=EXCLUDED.sort_order,notification_area=EXCLUDED.notification_area`);
        if (a.questionType)
          await db.execute(
            sql`UPDATE review_areas SET question_type=${a.questionType} WHERE key=${a.key}`,
          );
        if (a.sectors)
          await db.execute(
            sql`UPDATE review_areas SET sectors=ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(a.sectors)}::jsonb)) WHERE key=${a.key}`,
          );
        await db.execute(sql`INSERT INTO audit_logs(action,module,user_name,description,entity_type,entity_id,details,timestamp)
        VALUES('update','reviews',${actor(req)},'Configuración de área de encuesta','review_area',${a.key},${JSON.stringify(a)},now())`);
      });
      res.json({ ok: true });
    }),
  );
  app.delete(
    "/api/reviews/areas/:key/surveys/:sector",
    ...configure,
    wrap(async (req, res) => {
      const key = areaSchema.shape.key.parse(req.params.key);
      const sector = surveySectorSchema.parse(req.params.sector);
      const result = await withDatabaseTransaction(async () => {
        const [area] = (
          await db.execute(
            sql`SELECT key,sectors,in_survey FROM review_areas WHERE key=${key} FOR UPDATE`,
          )
        ).rows as { key: string; sectors: string[]; in_survey: boolean }[];
        if (!area) throw new ReviewError("Pregunta no encontrada.", 404);
        if (!area.in_survey || !area.sectors.includes(sector))
          return { ok: true, alreadyRemoved: true };
        const remaining = area.sectors.filter((value) => value !== sector);
        // Keep the last sector so the question can be restored through Edit.
        const sectors = remaining.length ? remaining : area.sectors;
        const inSurvey = remaining.length ? area.in_survey : false;
        await db.execute(
          sql`UPDATE review_areas SET sectors=ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(sectors)}::jsonb)),in_survey=${inSurvey} WHERE key=${key}`,
        );
        await db.execute(sql`INSERT INTO audit_logs(action,module,user_name,description,entity_type,entity_id,details,timestamp)
          VALUES('update','reviews',${actor(req)},${"Pregunta retirada de la encuesta de " + surveySectors[sector]},'review_area',${key},${JSON.stringify({ operation: "remove_from_survey", sector, before: { sectors: area.sectors, inSurvey: area.in_survey }, after: { sectors, inSurvey } })},now())`);
        return { ok: true, alreadyRemoved: false };
      });
      res.json(result);
    }),
  );
  app.get(
    "/api/reviews/options",
    ...read,
    wrap(async (req, res) => {
      const rooms = (
        await db.execute(
          sql`SELECT room_number AS number FROM rooms ORDER BY length(room_number),room_number`,
        )
      ).rows;
      const roomTypes = (
        await db.execute(sql`SELECT id,name FROM room_types ORDER BY name`)
      ).rows;
      const channels = (
        await db.execute(
          sql`SELECT DISTINCT source FROM reservations WHERE source IS NOT NULL ORDER BY source`,
        )
      ).rows;
      res.json({
        rooms: scopeFor(req) ? [] : rooms,
        roomTypes: scopeFor(req) ? [] : roomTypes,
        channels: scopeFor(req) ? [] : channels,
        scopes: scopeFor(req) || null,
      });
    }),
  );
  app.get(
    "/api/reviews/stays",
    ...read,
    wrap(async (req, res) => {
      hotelOnly(req);
      const search = z
        .string()
        .trim()
        .max(150)
        .parse(req.query.search || "");
      res.json(
        (
          await db.execute(sql`SELECT r.id,concat_ws(' ',g.last_name,g.first_name) AS "guestName",rm.room_number AS "roomNumber",r.check_in_date::text AS "checkIn",r.check_out_date::text AS "checkOut"
      FROM reservations r JOIN guests g ON g.id=r.guest_id LEFT JOIN rooms rm ON rm.id=r.room_id
      WHERE concat_ws(' ',g.last_name,g.first_name,r.reservation_code,rm.room_number) ILIKE ${"%" + search + "%"} ORDER BY r.check_out_date DESC,r.id LIMIT 25`)
        ).rows,
      );
    }),
  );
  app.get(
    "/api/reviews/analytics",
    ...read,
    wrap(async (req, res) => {
      const filters = reviewFiltersSchema.parse(req.query),
        rows = await reviewAnalyticsRows(filters, scopeFor(req));
      const applicable =
        (!scopeFor(req) || scopeFor(req)!.includes("hotel")) &&
        (!filters.sector || filters.sector === "hotel") &&
        filters.surveyKind !== "generic";
      const [mail] = (
        await db.execute(sql`WITH invitations AS (
        SELECT reservation_id,min(at) AS sent_at FROM (
          SELECT reservation_id,sent_at AS at FROM survey_dispatches WHERE sent_at IS NOT NULL
          UNION ALL SELECT reservation_id,shared_at AS at FROM survey_manual_deliveries
        ) deliveries GROUP BY reservation_id
      ) SELECT count(*)::int AS sent,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM survey_responses s JOIN survey_tokens t ON t.id=s.survey_token_id WHERE t.reservation_id=d.reservation_id))::int AS responded
      FROM invitations d WHERE ${applicable} AND (${filters.from || null}::date IS NULL OR (d.sent_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date>=${filters.from || null}::date)
      AND (${filters.to || null}::date IS NULL OR (d.sent_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date<=${filters.to || null}::date)`)
      ).rows as any[];
      res.json({
        ...summarizeReviews(rows),
        invitations: {
          applicable,
          ...mail,
          responseRate: mail.sent
            ? Number(((mail.responded * 100) / mail.sent).toFixed(1))
            : null,
        },
      });
    }),
  );
  app.get(
    "/api/reviews/invitations",
    ...read,
    wrap(async (req, res) => {
      hotelOnly(req);
      res.json(
        (
          await db.execute(sql`SELECT d.id,d.reservation_id AS "reservationId",d.status,d.scheduled_for AS "scheduledFor",d.sent_at AS "sentAt",d.last_error AS "lastError",d.attempts,(SELECT shared_at FROM survey_manual_deliveries m WHERE m.reservation_id=d.reservation_id) AS "sharedAt",
      concat_ws(' ',g.last_name,g.first_name) AS "guestName",rm.room_number AS "roomNumber",r.check_out_date::text AS "checkOut"
      FROM survey_dispatches d JOIN reservations r ON r.id=d.reservation_id LEFT JOIN guests g ON g.id=r.guest_id LEFT JOIN rooms rm ON rm.id=r.room_id
      ORDER BY d.created_at DESC,d.id LIMIT 200`)
        ).rows,
      );
    }),
  );
  app.get(
    "/api/reservations/:id/survey-invitation",
    ...read,
    wrap(async (req, res) => {
      hotelOnly(req);
      res.json(await surveyDispatchForReservation(req.params.id));
    }),
  );
  app.post(
    "/api/reservations/:id/survey-invitation",
    ...write,
    wrap(async (req, res) => {
      hotelOnly(req, true);
      const body = z
        .object({ acknowledge: z.boolean().default(false) })
        .parse(req.body || {});
      res.json(
        await requestSurveyInvitation(
          req.params.id,
          body.acknowledge,
          actor(req),
        ),
      );
    }),
  );
  app.get(
    "/api/reviews",
    ...read,
    wrap(async (req, res) => {
      const page = z.coerce
        .number()
        .int()
        .min(1)
        .max(100000)
        .default(1)
        .parse(req.query.page);
      res.json(
        await listReviews(
          reviewFiltersSchema.parse(req.query),
          page,
          undefined,
          scopeFor(req),
        ),
      );
    }),
  );
  app.post(
    "/api/reviews",
    ...write,
    wrap(async (req, res) => {
      const data = manualSchema.parse(req.body);
      if (scopesFor(req, true) && !scopesFor(req, true)!.includes(data.sector))
        throw new ReviewError("Elegí tu sector de origen.", 403);
      if (scopesFor(req, true) && data.reservationId) hotelOnly(req, true);
      const areas = new Set(
        (await reviewAreas())
          .filter((a) => a.active && a.questionType !== "text")
          .map((a) => a.key),
      );
      if (Object.keys(data.areaRatings).some((a) => !areas.has(a)))
        throw new ReviewError("Revisá las áreas seleccionadas.");
      const [owner] = data.reservationId
        ? ((
            await db.execute(
              sql`SELECT guest_id,room_id FROM reservations WHERE id=${data.reservationId}`,
            )
          ).rows as any[])
        : [];
      if (data.reservationId && !owner?.guest_id)
        throw new ReviewError("Seleccioná una estadía válida.");
      const [review] = await withDatabaseTransaction(async () => {
        const rows = (
          await db.execute(sql`INSERT INTO guest_reviews(reservation_id,guest_id,guest_display_name,room_id,review_date,source,rating,title,content,area_ratings,followup_status,sentiment,survey_sector)
        VALUES(${data.reservationId || null},${owner?.guest_id || "unlinked"},${data.guestName || null},${owner?.room_id || null},${data.reviewDate}::date,${data.source},${data.rating},${data.title || null},${data.content},${JSON.stringify(data.areaRatings)}::jsonb,
          ${needsReviewFollowup(data.rating, data.areaRatings, false) ? "new" : "resolved"},${data.rating <= 2 ? "negative" : data.rating >= 4 ? "positive" : "neutral"},${data.sector}) RETURNING id`)
        ).rows as any[];
        await db.execute(
          sql`INSERT INTO review_events(review_id,actor,kind,details) VALUES(${rows[0].id},${actor(req)},'created',${JSON.stringify({ source: data.source })}::jsonb)`,
        );
        if (needsReviewFollowup(data.rating, data.areaRatings, false))
          await notifyReviewFollowup(
            rows[0].id,
            data.areaRatings,
            false,
            data.sector,
          );
        return rows;
      });
      res.status(201).json(review);
    }),
  );
  app.get(
    "/api/reviews/:id",
    ...read,
    wrap(async (req, res) => {
      const { items } = await listReviews(
        reviewFiltersSchema.parse({}),
        1,
        req.params.id,
        scopeFor(req),
      );
      if (!items.length) throw new ReviewError("Reseña no encontrada", 404);
      const events = (
        await db.execute(
          sql`SELECT id,actor,kind,details,created_at AS "createdAt" FROM review_events WHERE review_id=${req.params.id} ORDER BY created_at,id`,
        )
      ).rows;
      res.json({ review: items[0], events });
    }),
  );
  app.patch(
    "/api/reviews/:id/followup",
    ...write,
    wrap(async (req, res) => {
      const data = followupSchema.parse(req.body);
      const allAreas = await reviewAreas(),
        keys = new Set(allAreas.map((a) => a.key));
      if (data.actionAreas.some((a) => !keys.has(a)))
        throw new ReviewError("Revisá las áreas responsables.");
      await withDatabaseTransaction(async () => {
        // Lock before checking access; a concurrent reassignment cannot bypass scope.
        await db.execute(
          sql`SELECT id FROM guest_reviews WHERE id=${req.params.id} FOR UPDATE`,
        );
        if (
          !(
            await listReviews(
              reviewFiltersSchema.parse({}),
              1,
              req.params.id,
              scopesFor(req, true),
            )
          ).items.length
        )
          throw new ReviewError("Reseña no encontrada", 404);
        const [before] = (
          await db.execute(
            sql`SELECT followup_status,assigned_to,action_areas FROM guest_reviews WHERE id=${req.params.id} FOR UPDATE`,
          )
        ).rows as any[];
        if (!before) throw new ReviewError("Reseña no encontrada", 404);
        await db.execute(
          sql`UPDATE guest_reviews SET followup_status=${data.status},assigned_to=${data.assignedTo || null},action_areas=ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(data.actionAreas)}::jsonb)) WHERE id=${req.params.id}`,
        );
        await db.execute(
          sql`INSERT INTO review_events(review_id,actor,kind,details) VALUES(${req.params.id},${actor(req)},'followup',${JSON.stringify({ before, status: data.status, assignedTo: data.assignedTo, actionAreas: data.actionAreas, note: data.note })}::jsonb)`,
        );
        if (data.status === "resolved")
          await db.execute(
            sql`UPDATE system_notifications SET status='completado',is_read=true,resolved_at=now(),resolved_by=${actor(req)} WHERE related_entity_type='review' AND related_entity_id=${req.params.id}`,
          );
        else
          for (const target of new Set([
            "reception",
            ...allAreas
              .filter((a) => data.actionAreas.includes(a.key))
              .map((a) => a.notificationArea),
          ])) {
            await db.execute(sql`INSERT INTO system_notifications(id,type,title,message,target_area,related_entity_type,related_entity_id,status,priority)
          VALUES(${"review-" + req.params.id + "-" + target},'review_followup','Reseña en seguimiento',${data.assignedTo ? "Responsable: " + data.assignedTo + ". Revisá el caso en Reseñas." : "Revisá el caso y sus áreas responsables en Reseñas."},
            ${target},'review',${req.params.id},${data.status === "in_progress" ? "en_proceso" : "pendiente"},'normal')
          ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,message=EXCLUDED.message,is_read=false,resolved_at=NULL,resolved_by=NULL
            WHERE system_notifications.status IS DISTINCT FROM EXCLUDED.status OR system_notifications.message IS DISTINCT FROM EXCLUDED.message`);
          }
      });
      res.json({ ok: true });
    }),
  );
}

import type { Express, Request, Response, NextFunction } from "express";
import { isDeepStrictEqual } from "node:util";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, withDatabaseTransaction } from "./db";
import { requireAuth } from "./auth";
import { hasPermission } from "./permissions";
import {
  allowedInclusionAreas,
  inclusionActionSchema,
  inclusionRulesSchema,
} from "@shared/hospitalityInclusions";

function fail(message: string, statusCode = 409): never {
  throw Object.assign(new Error(message), { statusCode });
}
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
const rows = async (query: ReturnType<typeof sql>) =>
  (await db.execute(query)).rows as any[];
const actor = (req: Request) => ({
  id: req.user!.id,
  name: req.user!.fullName || req.user!.username,
});
function access(req: Request, res: Response, next: NextFunction) {
  if (
    !hasPermission(req.user!.role, "sidebar:/hospitality") ||
    !allowedInclusionAreas(req.user!.role).length
  )
    return res
      .status(403)
      .json({ error: "No tenés acceso a servicios incluidos." });
  next();
}
function canCoordinate(req: Request) {
  return (
    allowedInclusionAreas(req.user!.role).length === 3 &&
    hasPermission(req.user!.role, "sidebar:/reservations")
  );
}
const wrap =
  (fn: (req: Request, res: Response) => Promise<any>) =>
  async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error: any) {
      if (!error.statusCode)
        console.error(
          "[hospitality-inclusions] No se pudo completar la operación",
        );
      res.status(error.statusCode || 500).json({
        error: error.statusCode
          ? error.message
          : "No se pudo completar la operación. Actualizá y volvé a intentar.",
      });
    }
  };
const contextJoins = sql`
  FROM hospitality_included_services b JOIN hospitality_included_sources s ON s.id=b.source_id
  LEFT JOIN reservations r ON s.kind IN ('reservation','supplement') AND r.id=s.entity_id
  LEFT JOIN guests g ON g.id=r.guest_id LEFT JOIN rooms room ON room.id=r.room_id
  LEFT JOIN spa_appointments a ON s.kind='spa_appointment' AND a.id=s.entity_id
  LEFT JOIN spa_treatment_sales sale ON s.kind='spa_sale' AND sale.id=s.entity_id
  LEFT JOIN LATERAL (
    SELECT min(p.appointment_date) AS next_date,
      coalesce(jsonb_agg(jsonb_build_object('person',concat_ws(' ',p.guest_last_name,p.guest_name),'date',p.appointment_date::text,'time',p.start_time,'status',p.status) ORDER BY p.appointment_date,p.start_time),'[]'::jsonb) AS appointments
    FROM (SELECT guest_name,guest_last_name,appointment_date,start_time,status FROM spa_appointments
      WHERE sold_treatment_sale_id=sale.id AND status NOT IN ('cancelled','no_show')
        AND appointment_date>=(CURRENT_TIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
      ORDER BY appointment_date,start_time,id LIMIT 20) p
  ) spa_context ON true`;
const fields = sql`b.id,b.source_id AS "sourceId",b.area,b.service,b.conditions,b.ready_when AS "readyWhen",
  b.service_date::text AS "serviceDate",spa_context.next_date::text AS "forecastDate",spa_context.appointments AS "linkedAppointments",b.valid_until::text AS "validUntil",b.quantity,b.used,b.quantity-b.used AS remaining,b.version,b.cancelled,
  b.needs_review AS "needsReview",b.scheduled_at AS "scheduledAt",b.acknowledged_at AS "acknowledgedAt",b.note,
  s.kind AS "sourceKind",s.title AS "sourceTitle",r.id AS "reservationId",room.room_number AS room,
  CASE WHEN r.id IS NOT NULL THEN concat_ws(' ',g.last_name,g.first_name) WHEN a.id IS NOT NULL THEN concat_ws(' ',a.guest_last_name,a.guest_name) ELSE sale.buyer_name END AS person,
  coalesce(r.status,a.status,sale.status) AS "sourceStatus",
  coalesce(r.status='checked_in',a.status IN ('in_progress','completed'),EXISTS(SELECT 1 FROM spa_appointments p WHERE p.sold_treatment_sale_id=sale.id AND p.status IN ('in_progress','completed'))) AS present,
  CASE WHEN b.ready_when='arrival' THEN coalesce(r.status='checked_in',a.status IN ('in_progress','completed'),false)
       WHEN b.ready_when='spa_completed' THEN (coalesce(a.status='completed',false) OR EXISTS(SELECT 1 FROM spa_appointments p WHERE p.status='completed' AND (p.sold_treatment_sale_id=sale.id OR p.reservation_id=r.id))) ELSE false END AS ready`;

export function registerHospitalityInclusions(app: Express) {
  const root = "/api/hospitality/included-services";
  app.get(
    root,
    requireAuth,
    access,
    wrap(async (req, res) => {
      const areas = allowedInclusionAreas(req.user!.role);
      const query = z
        .object({
          area: z.enum(["restaurant", "spa", "reception"]).optional(),
          view: z
            .enum(["today", "upcoming", "pending", "history"])
            .default("today"),
          reservationId: z.string().min(1).max(100).optional(),
          page: z.coerce.number().int().min(1).max(10000).default(1),
        })
        .strict()
        .safeParse(req.query);
      if (!query.success) fail("Revisá los filtros.", 400);
      const q = query.data;
      if (q.area && !areas.includes(q.area as never))
        fail("No tenés acceso a esa área.", 403);
      const areaFilter = q.area ? [q.area] : [...areas];
      const clauses = [
        sql`b.area IN (${sql.join(
          areaFilter.map((a) => sql`${a}`),
          sql`,`,
        )})`,
      ];
      if (q.reservationId) clauses.push(sql`r.id=${q.reservationId}`);
      if (q.view !== "history")
        clauses.push(sql`s.active AND NOT b.cancelled AND b.used<b.quantity`);
      const effectiveDate = sql`coalesce((b.scheduled_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,b.service_date,spa_context.next_date)`;
      if (q.view === "today")
        clauses.push(
          sql`${effectiveDate}<=${today()}::date AND coalesce(b.valid_until,${effectiveDate})>=${today()}::date`,
        );
      if (q.view === "upcoming")
        clauses.push(sql`${effectiveDate}>${today()}::date`);
      const where = sql.join(clauses, sql` AND `);
      const result = await rows(
        sql`SELECT ${fields} ${contextJoins} WHERE ${where} ORDER BY b.service_date NULLS LAST,s.created_at,b.id LIMIT 101 OFFSET ${(q.page - 1) * 100}`,
      );
      const countClauses = [
        sql`b.area IN (${sql.join(
          areaFilter.map((a) => sql`${a}`),
          sql`,`,
        )})`,
        sql`s.active AND NOT b.cancelled AND b.used<b.quantity`,
        sql`${effectiveDate}<=${today()}::date AND coalesce(b.valid_until,${effectiveDate})>=${today()}::date`,
      ];
      if (q.reservationId) countClauses.push(sql`r.id=${q.reservationId}`);
      const [count] = await rows(
        sql`SELECT count(*)::int AS n,count(*) FILTER(WHERE b.acknowledged_at IS NULL)::int AS unseen ${contextJoins} WHERE ${sql.join(countClauses, sql` AND `)}`,
      );
      res.json({
        items: result.slice(0, 100),
        hasMore: result.length > 100,
        page: q.page,
        pendingToday: count.n,
        unseenToday: count.unseen,
        canCoordinate: canCoordinate(req),
        areas,
      });
    }),
  );
  app.get(
    root + "/templates/:type/:id",
    requireAuth,
    access,
    wrap(async (req, res) => {
      const type = req.params.type;
      const permission =
        type === "package"
          ? "sidebar:/packages"
          : type === "treatment"
            ? "api:spa:write"
            : null;
      if (!permission || !hasPermission(req.user!.role, permission))
        fail("No tenés acceso a esta configuración.", 403);
      const [template] = await rows(
        sql`SELECT rules,revision FROM hospitality_inclusion_templates WHERE owner_type=${type} AND owner_id=${req.params.id}`,
      );
      res.json(template || { rules: [], revision: 0 });
    }),
  );
  app.put(
    root + "/templates/:type/:id",
    requireAuth,
    access,
    wrap(async (req, res) => {
      const type = req.params.type;
      const permission =
        type === "package"
          ? "sidebar:/packages"
          : type === "treatment"
            ? "api:spa:write"
            : null;
      if (!permission || !hasPermission(req.user!.role, permission))
        fail("No tenés permiso para configurar estos servicios.", 403);
      const input = z
        .object({
          rules: inclusionRulesSchema,
          revision: z.number().int().min(0),
        })
        .strict()
        .safeParse(req.body);
      if (!input.success)
        fail("Revisá servicio, cantidades y condiciones.", 400);
      if (
        type === "treatment" &&
        input.data.rules.some((r) => r.basis !== "stay")
      )
        fail(
          "En SPA los incluidos se definen por turno o unidad vendida; las personas y noches incluidas se indican en la cantidad y se coordinan con el área.",
          400,
        );
      const who = actor(req);
      await withDatabaseTransaction(async () => {
        await db.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${"hospitality-template:" + type + ":" + req.params.id}))`,
        );
        const entity = await rows(
          type === "package"
            ? sql`SELECT id FROM packages WHERE id=${req.params.id} FOR SHARE`
            : sql`SELECT id FROM spa_treatments WHERE id=${req.params.id} FOR SHARE`,
        );
        if (!entity.length)
          fail("No se encontró el paquete o tratamiento.", 404);
        const [before] = await rows(
          sql`SELECT revision FROM hospitality_inclusion_templates WHERE owner_type=${type} AND owner_id=${req.params.id} FOR UPDATE`,
        );
        if ((before?.revision || 0) !== input.data.revision)
          fail(
            "Otra persona modificó los incluidos. Volvé a cargar la configuración.",
          );
        await db.execute(
          sql`INSERT INTO hospitality_inclusion_templates(owner_type,owner_id,rules,updated_by) VALUES(${type},${req.params.id},${JSON.stringify(input.data.rules)}::jsonb,${who.name}) ON CONFLICT(owner_type,owner_id) DO UPDATE SET rules=excluded.rules,revision=hospitality_inclusion_templates.revision+1,updated_by=excluded.updated_by,updated_at=now()`,
        );
        await db.execute(
          sql`INSERT INTO audit_logs(user_id,user_name,action,module,entity_type,entity_id,description,details,timestamp) VALUES(${who.id},${who.name},'update','hospitality',${type},${req.params.id},'Configuración de servicios incluidos',${JSON.stringify(input.data)},now())`,
        );
      });
      res.json({ saved: true });
    }),
  );
  app.post(
    root + "/supplements",
    requireAuth,
    access,
    wrap(async (req, res) => {
      if (!canCoordinate(req))
        fail(
          "Solo coordinación puede registrar incluidos de una estadía.",
          403,
        );
      const input = z
        .object({
          reservationId: z.string().min(1).max(100),
          title: z.string().trim().min(3).max(160),
          reason: z.string().trim().min(10).max(600),
          rules: inclusionRulesSchema.refine((r) => r.length > 0),
          requestId: z.string().uuid(),
        })
        .strict()
        .safeParse(req.body);
      if (!input.success)
        fail("Elegí la reserva, los servicios y el motivo.", 400);
      const body = input.data,
        who = actor(req),
        id = "supplement:" + body.requestId;
      await withDatabaseTransaction(async () => {
        const [r] = await rows(
          sql`SELECT * FROM reservations WHERE id=${body.reservationId} FOR UPDATE`,
        );
        if (!r) fail("Reserva no encontrada.", 404);
        if (!["confirmed", "checked_in", "web_checkin"].includes(r.status))
          fail("La estadía no está activa.");
        const [prior] = await rows(
          sql`SELECT * FROM hospitality_included_sources WHERE id=${id}`,
        );
        if (prior) {
          const [event] = await rows(
            sql`SELECT request_payload FROM hospitality_included_events WHERE request_id=${body.requestId}::uuid`,
          );
          if (!event || !isDeepStrictEqual(event.request_payload, body))
            fail("El intento ya pertenece a otro registro.");
          if (
            prior.entity_id !== r.id ||
            prior.title !== body.title ||
            !isDeepStrictEqual(prior.rules_snapshot, body.rules)
          )
            fail("El identificador ya pertenece a otro registro.");
          return;
        }
        await db.execute(
          sql`INSERT INTO hospitality_included_sources(id,kind,entity_id,title,rules_snapshot,created_by) VALUES(${id},'supplement',${r.id},${body.title},${JSON.stringify(body.rules)}::jsonb,${who.name})`,
        );
        await db.execute(
          sql`SELECT hospitality_reconcile_source(${id},${r.check_in_date}::date,${r.check_out_date}::date,${r.number_of_guests},1,false)`,
        );
        await db.execute(
          sql`INSERT INTO hospitality_included_events(source_id,request_id,action,note,actor_id,actor_name,request_payload) VALUES(${id},${body.requestId}::uuid,'create',${body.reason},${who.id},${who.name},${JSON.stringify(body)}::jsonb)`,
        );
      });
      res.status(201).json({ sourceId: id });
    }),
  );
  app.post(
    root + "/supplements/:sourceId/cancel",
    requireAuth,
    access,
    wrap(async (req, res) => {
      if (!canCoordinate(req))
        fail("Solo coordinación puede retirar estos incluidos.", 403);
      const input = z
        .object({
          reason: z.string().trim().min(10).max(600),
          requestId: z.string().uuid(),
        })
        .strict()
        .safeParse(req.body);
      if (!input.success)
        fail("Ingresá el motivo de al menos 10 caracteres.", 400);
      const body = input.data,
        who = actor(req);
      await withDatabaseTransaction(async () => {
        const [source] = await rows(
          sql`SELECT * FROM hospitality_included_sources WHERE id=${req.params.sourceId} AND kind='supplement' FOR UPDATE`,
        );
        if (!source) fail("Propuesta no encontrada.", 404);
        const [prior] = await rows(
          sql`SELECT source_id,request_payload FROM hospitality_included_events WHERE request_id=${body.requestId}::uuid`,
        );
        if (prior) {
          if (
            prior.source_id !== source.id ||
            !isDeepStrictEqual(prior.request_payload, body)
          )
            fail("El intento ya corresponde a otra acción.");
          return;
        }
        if (source.manually_cancelled)
          fail("Los pendientes de esta propuesta ya se retiraron.");
        await db.execute(
          sql`UPDATE hospitality_included_sources SET active=false,manually_cancelled=true WHERE id=${source.id}`,
        );
        await db.execute(
          sql`UPDATE hospitality_included_services SET cancelled=true,needs_review=used>0,version=version+1 WHERE source_id=${source.id}`,
        );
        await db.execute(
          sql`INSERT INTO hospitality_included_events(source_id,request_id,action,note,actor_id,actor_name,request_payload) VALUES(${source.id},${body.requestId}::uuid,'cancel',${body.reason},${who.id},${who.name},${JSON.stringify(body)}::jsonb)`,
        );
      });
      res.json({ saved: true });
    }),
  );
  app.get(
    root + "/:id/events",
    requireAuth,
    access,
    wrap(async (req, res) => {
      if (!z.string().uuid().safeParse(req.params.id).success)
        fail("Servicio no válido.", 400);
      const [b] = await rows(
        sql`SELECT area FROM hospitality_included_services WHERE id=${req.params.id}::uuid`,
      );
      if (
        !b ||
        !allowedInclusionAreas(req.user!.role).includes(b.area as never)
      )
        fail("Servicio no disponible.", 404);
      res.json(
        await rows(
          sql`SELECT action,quantity,note,request_payload->>'date' AS "scheduledAt",actor_name AS "actorName",created_at AS "createdAt" FROM hospitality_included_events WHERE service_id=${req.params.id}::uuid OR (service_id IS NULL AND source_id=(SELECT source_id FROM hospitality_included_services WHERE id=${req.params.id}::uuid)) ORDER BY created_at,id LIMIT 100`,
        ),
      );
    }),
  );
  app.post(
    root + "/:id/actions",
    requireAuth,
    access,
    wrap(async (req, res) => {
      const input = inclusionActionSchema.safeParse(req.body);
      if (!input.success || !z.string().uuid().safeParse(req.params.id).success)
        fail("Revisá la acción y sus datos.", 400);
      const body = input.data,
        who = actor(req);
      await withDatabaseTransaction(async () => {
        const [initial] = await rows(
          sql`SELECT source_id FROM hospitality_included_services WHERE id=${req.params.id}::uuid`,
        );
        if (!initial) fail("Servicio no encontrado.", 404);
        await db.execute(
          sql`SELECT id FROM hospitality_included_sources WHERE id=${initial.source_id} FOR UPDATE`,
        );
        const [b] = await rows(
          sql`SELECT ${fields},s.active ${contextJoins} WHERE b.id=${req.params.id}::uuid FOR UPDATE OF b`,
        );
        if (
          !b ||
          !allowedInclusionAreas(req.user!.role).includes(b.area as never)
        )
          fail("Servicio no disponible.", 404);
        const [prior] = await rows(
          sql`SELECT service_id,request_payload FROM hospitality_included_events WHERE request_id=${body.requestId}::uuid`,
        );
        if (prior) {
          if (
            prior.service_id !== b.id ||
            !isDeepStrictEqual(prior.request_payload, body)
          )
            fail("Este intento ya se utilizó para otra acción.");
          return;
        }
        if (b.version !== body.version)
          fail("El servicio cambió. Actualizá y revisá el saldo disponible.");
        if (!b.active || b.cancelled || b.remaining <= 0)
          fail("Este incluido ya no está pendiente.");
        if (body.action === "schedule") {
          const date = new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Argentina/Buenos_Aires",
          }).format(new Date(body.date));
          if (
            date < today() ||
            (b.serviceDate && date < b.serviceDate) ||
            (b.validUntil && date > b.validUntil)
          )
            fail("El horario debe estar dentro de la vigencia del servicio.");
          await db.execute(
            sql`UPDATE hospitality_included_services SET scheduled_at=${body.date}::timestamptz,note=${body.note},version=version+1 WHERE id=${b.id}::uuid`,
          );
        } else if (body.action === "fulfill") {
          if (body.quantity > b.remaining)
            fail("La cantidad supera los incluidos disponibles.");
          const scheduledDate = b.scheduledAt
            ? new Intl.DateTimeFormat("en-CA", {
                timeZone: "America/Argentina/Buenos_Aires",
              }).format(new Date(b.scheduledAt))
            : null;
          if (
            (!b.serviceDate && !scheduledDate) ||
            (b.serviceDate && b.serviceDate > today()) ||
            (scheduledDate && scheduledDate > today()) ||
            (b.validUntil && b.validUntil < today())
          )
            fail("Coordiná una fecha vigente antes de registrar la atención.");
          await db.execute(
            sql`UPDATE hospitality_included_services SET used=used+${body.quantity},note=${body.note},version=version+1 WHERE id=${b.id}::uuid`,
          );
        } else {
          await db.execute(
            sql`UPDATE hospitality_included_services SET acknowledged_at=coalesce(acknowledged_at,now()),version=version+1 WHERE id=${b.id}::uuid`,
          );
        }
        await db.execute(
          sql`INSERT INTO hospitality_included_events(service_id,source_id,request_id,action,quantity,note,actor_id,actor_name,request_payload) VALUES(${b.id}::uuid,${b.sourceId},${body.requestId}::uuid,${body.action},${body.action === "fulfill" ? body.quantity : 0},${"note" in body ? body.note : ""},${who.id},${who.name},${JSON.stringify(body)}::jsonb)`,
        );
      });
      res.json({ saved: true });
    }),
  );
}

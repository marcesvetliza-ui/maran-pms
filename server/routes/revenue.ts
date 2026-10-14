import type { Express } from "express";
import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import { db } from "../db";
import { requirePermission } from "../auth";
import { audit } from "../audit";
import {
  revenueDemandEvents,
  competitorRates,
  revenueRateSuggestionConfig,
  revenueReferenceRatePlans,
  roomTypes,
  ratePlans,
  insertRevenueDemandEventSchema,
  insertCompetitorRateSchema,
  insertRevenueRateSuggestionConfigSchema,
} from "@shared/schema";
import { addCalendarDays } from "@shared/nightAuditDate";
import {
  computeRevenueBoard,
  getRevenueDayDetail,
  todayArgentina,
  ensureTodayPaceSnapshot,
  captureDailyPaceSnapshot,
  getPaceForStayDate,
  loadReferenceRatePlanRows,
  buildCompetitorComparisons,
} from "../revenue/metrics";
import { suggestRateAdjustment } from "../revenue/suggestions";

const REVENUE_READ = "api:revenue:read";
const REVENUE_EVENTS_WRITE = "api:revenue:events-write";
const REVENUE_COMPETITOR_WRITE = "api:revenue:competitor-write";
const REVENUE_CONFIGURE = "api:revenue:configure";

const DEFAULT_BOARD_HORIZON_DAYS = 90;

function parseRange(req: { query: any }): { from: string; to: string } {
  const today = todayArgentina();
  const from = typeof req.query.from === "string" && req.query.from ? req.query.from : today;
  const to = typeof req.query.to === "string" && req.query.to
    ? req.query.to
    : addCalendarDays(from, DEFAULT_BOARD_HORIZON_DAYS);
  return { from, to };
}

export function registerRevenueRoutes(app: Express) {
  // ── Tablero de 90 días: ocupación, ADR, RevPAR + drill-down ──────────────
  app.get("/api/revenue/board", requirePermission(REVENUE_READ), async (req, res) => {
    try {
      const { from, to } = parseRange(req);
      const days = await computeRevenueBoard(from, to);
      res.json({ from, to, days });
    } catch (e: any) {
      res.status(500).json({ error: "No se pudo calcular el tablero de Revenue Management" });
    }
  });

  app.get("/api/revenue/board/:date", requirePermission(REVENUE_READ), async (req, res) => {
    try {
      const detail = await getRevenueDayDetail(req.params.date);
      res.json(detail);
    } catch (e: any) {
      res.status(500).json({ error: "No se pudo calcular el detalle de ese día" });
    }
  });

  // ── Pace report ───────────────────────────────────────────────────────────
  app.get("/api/revenue/pace/:stayDate", requirePermission(REVENUE_READ), async (req, res) => {
    try {
      await ensureTodayPaceSnapshot();
      const report = await getPaceForStayDate(req.params.stayDate);
      res.json(report);
    } catch (e: any) {
      res.status(500).json({ error: "No se pudo calcular el pace report" });
    }
  });

  // Pensado para cablear a un cron real más adelante (hoy no existe
  // scheduler en este backend); mientras tanto el snapshot del día también
  // se captura solo con el primer GET al tablero/pace de ese día.
  app.post("/api/revenue/pace/capture-snapshot", requirePermission(REVENUE_CONFIGURE), async (req, res) => {
    try {
      const result = await captureDailyPaceSnapshot();
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: "No se pudo capturar el snapshot de pace" });
    }
  });

  // ── Calendario de demanda (carga manual) ──────────────────────────────────
  app.get("/api/revenue/demand-events", requirePermission(REVENUE_READ), async (req, res) => {
    try {
      const { from, to } = parseRange(req);
      const rows = await db.select().from(revenueDemandEvents)
        .where(and(lt(revenueDemandEvents.startDate, to), gte(revenueDemandEvents.endDate, from)))
        .orderBy(asc(revenueDemandEvents.startDate));
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: "No se pudieron consultar los eventos de demanda" });
    }
  });

  app.post("/api/revenue/demand-events", requirePermission(REVENUE_EVENTS_WRITE), async (req, res) => {
    try {
      const parsed = insertRevenueDemandEventSchema.parse({ ...req.body, createdBy: req.user?.id || null });
      const [row] = await db.insert(revenueDemandEvents).values(parsed).returning();
      await audit(req, "create", "revenue", `Evento de demanda cargado: ${row.name}`, { entityType: "revenue_demand_event", entityId: row.id });
      res.status(201).json(row);
    } catch (e: any) {
      res.status(400).json({ error: e?.issues ? "Revisá los datos del evento" : (e?.message || "No se pudo crear el evento de demanda") });
    }
  });

  app.patch("/api/revenue/demand-events/:id", requirePermission(REVENUE_EVENTS_WRITE), async (req, res) => {
    try {
      const parsed = insertRevenueDemandEventSchema.partial().parse(req.body);
      const [row] = await db.update(revenueDemandEvents)
        .set({ ...parsed, updatedAt: new Date() })
        .where(eq(revenueDemandEvents.id, req.params.id))
        .returning();
      if (!row) return res.status(404).json({ error: "Evento no encontrado" });
      await audit(req, "update", "revenue", `Evento de demanda actualizado: ${row.name}`, { entityType: "revenue_demand_event", entityId: row.id });
      res.json(row);
    } catch (e: any) {
      res.status(400).json({ error: e?.issues ? "Revisá los datos del evento" : (e?.message || "No se pudo actualizar el evento") });
    }
  });

  app.delete("/api/revenue/demand-events/:id", requirePermission(REVENUE_EVENTS_WRITE), async (req, res) => {
    try {
      const [row] = await db.delete(revenueDemandEvents).where(eq(revenueDemandEvents.id, req.params.id)).returning();
      if (!row) return res.status(404).json({ error: "Evento no encontrado" });
      await audit(req, "delete", "revenue", `Evento de demanda eliminado: ${row.name}`, { entityType: "revenue_demand_event", entityId: row.id });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: "No se pudo eliminar el evento" });
    }
  });

  // ── Tarifas de competencia (carga manual, sin scraping) ───────────────────
  app.get("/api/revenue/competitor-rates", requirePermission(REVENUE_READ), async (req, res) => {
    try {
      const { from, to } = parseRange(req);
      const rows = await db.select().from(competitorRates)
        .where(and(gte(competitorRates.stayDate, from), lt(competitorRates.stayDate, to)))
        .orderBy(desc(competitorRates.stayDate));
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: "No se pudieron consultar las tarifas de competencia" });
    }
  });

  app.post("/api/revenue/competitor-rates", requirePermission(REVENUE_COMPETITOR_WRITE), async (req, res) => {
    try {
      const parsed = insertCompetitorRateSchema.parse({ ...req.body, createdBy: req.user?.id || null });
      const [row] = await db.insert(competitorRates).values(parsed).returning();
      await audit(req, "create", "revenue", `Tarifa de competencia cargada: ${row.competitorName}`, { entityType: "competitor_rate", entityId: row.id });
      res.status(201).json(row);
    } catch (e: any) {
      res.status(400).json({ error: e?.issues ? "Revisá los datos de la tarifa" : (e?.message || "No se pudo cargar la tarifa") });
    }
  });

  app.delete("/api/revenue/competitor-rates/:id", requirePermission(REVENUE_COMPETITOR_WRITE), async (req, res) => {
    try {
      const [row] = await db.delete(competitorRates).where(eq(competitorRates.id, req.params.id)).returning();
      if (!row) return res.status(404).json({ error: "Tarifa no encontrada" });
      await audit(req, "delete", "revenue", `Tarifa de competencia eliminada: ${row.competitorName}`, { entityType: "competitor_rate", entityId: row.id });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: "No se pudo eliminar la tarifa" });
    }
  });

  // ── Motor de sugerencias (solo lectura, nunca escribe en rate_plans) ──────
  app.get("/api/revenue/suggestions", requirePermission(REVENUE_READ), async (req, res) => {
    try {
      const { from, to } = parseRange(req);
      const [days, events, rateRows, configRows, roomTypeRows] = await Promise.all([
        computeRevenueBoard(from, to),
        db.select().from(revenueDemandEvents).where(and(lt(revenueDemandEvents.startDate, to), gte(revenueDemandEvents.endDate, from))),
        db.select().from(competitorRates).where(and(gte(competitorRates.stayDate, from), lt(competitorRates.stayDate, to))),
        db.select().from(revenueRateSuggestionConfig).where(eq(revenueRateSuggestionConfig.id, 1)).limit(1),
        db.select({ id: roomTypes.id, name: roomTypes.name }).from(roomTypes),
      ]);
      const config = configRows[0];
      if (!config) return res.status(500).json({ error: "Falta la configuración del motor de sugerencias" });

      const roomTypeNameById = new Map(roomTypeRows.map(rt => [rt.id, rt.name]));
      const roomTypeIdsWithCompetitorData = [...new Set(rateRows.map(r => r.roomTypeId).filter((id): id is string => !!id))];
      const referenceRatePlanRowByRoomType = await loadReferenceRatePlanRows(roomTypeIdsWithCompetitorData);

      const suggestions = days.map(day => {
        const dayEvents = events
          .filter(ev => ev.startDate <= day.date && day.date <= ev.endDate)
          .map(ev => ({ name: ev.name, category: ev.category, impact: ev.impact }));
        const competitorComparisons = buildCompetitorComparisons(day.date, rateRows, roomTypeNameById, referenceRatePlanRowByRoomType);
        return suggestRateAdjustment({
          date: day.date,
          occupancyPct: day.occupancyPct,
          demandEvents: dayEvents,
          competitorComparisons,
          config,
        });
      });

      res.json({ from, to, suggestions });
    } catch (e: any) {
      res.status(500).json({ error: "No se pudieron calcular las sugerencias" });
    }
  });

  app.get("/api/revenue/suggestion-config", requirePermission(REVENUE_READ), async (req, res) => {
    try {
      const [config] = await db.select().from(revenueRateSuggestionConfig).where(eq(revenueRateSuggestionConfig.id, 1)).limit(1);
      res.json(config || null);
    } catch (e: any) {
      res.status(500).json({ error: "No se pudo consultar la configuración" });
    }
  });

  app.patch("/api/revenue/suggestion-config", requirePermission(REVENUE_CONFIGURE), async (req, res) => {
    try {
      const parsed = insertRevenueRateSuggestionConfigSchema.partial().parse(req.body);
      const [row] = await db.update(revenueRateSuggestionConfig)
        .set({ ...parsed, updatedAt: new Date(), updatedBy: req.user?.id || null })
        .where(eq(revenueRateSuggestionConfig.id, 1))
        .returning();
      await audit(req, "update", "revenue", "Configuración del motor de sugerencias actualizada", { entityType: "revenue_rate_suggestion_config", entityId: "1" });
      res.json(row);
    } catch (e: any) {
      res.status(400).json({ error: e?.issues ? "Revisá los valores de configuración" : (e?.message || "No se pudo actualizar la configuración") });
    }
  });

  // ── Plan tarifario de referencia por tipo de habitación ───────────────────
  // Reemplaza cualquier heurística automática: sin esta configuración, ese
  // tipo de habitación queda excluido de la comparación contra competencia
  // en el motor de sugerencias (ver buildCompetitorComparisons).
  app.get("/api/revenue/reference-rate-plans", requirePermission(REVENUE_READ), async (req, res) => {
    try {
      const [roomTypeRows, planRows, configRows] = await Promise.all([
        db.select({ id: roomTypes.id, name: roomTypes.name }).from(roomTypes),
        db.select({ id: ratePlans.id, roomTypeId: ratePlans.roomTypeId, name: ratePlans.name }).from(ratePlans),
        db.select().from(revenueReferenceRatePlans),
      ]);
      const configByRoomType = new Map(configRows.map(c => [c.roomTypeId, c]));
      const result = roomTypeRows.map(rt => ({
        roomTypeId: rt.id,
        roomTypeName: rt.name,
        configuredRatePlanId: configByRoomType.get(rt.id)?.ratePlanId ?? null,
        availablePlans: planRows.filter(p => p.roomTypeId === rt.id).map(p => ({ id: p.id, name: p.name })),
      }));
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: "No se pudo consultar la configuración de planes de referencia" });
    }
  });

  app.put("/api/revenue/reference-rate-plans/:roomTypeId", requirePermission(REVENUE_CONFIGURE), async (req, res) => {
    try {
      const { roomTypeId } = req.params;
      const { ratePlanId } = req.body as { ratePlanId: string | null };

      if (ratePlanId === null || ratePlanId === undefined || ratePlanId === "") {
        await db.delete(revenueReferenceRatePlans).where(eq(revenueReferenceRatePlans.roomTypeId, roomTypeId));
        await audit(req, "update", "revenue", `Plan de referencia desconfigurado para el tipo de habitación ${roomTypeId}`, { entityType: "revenue_reference_rate_plan", entityId: roomTypeId });
        return res.json({ roomTypeId, configuredRatePlanId: null });
      }

      const [plan] = await db.select({ id: ratePlans.id, roomTypeId: ratePlans.roomTypeId })
        .from(ratePlans).where(eq(ratePlans.id, ratePlanId)).limit(1);
      if (!plan || plan.roomTypeId !== roomTypeId) {
        return res.status(400).json({ error: "El plan tarifario elegido no corresponde a este tipo de habitación" });
      }

      await db.insert(revenueReferenceRatePlans).values({
        roomTypeId, ratePlanId, updatedBy: req.user?.id || null,
      }).onConflictDoUpdate({
        target: revenueReferenceRatePlans.roomTypeId,
        set: { ratePlanId, updatedAt: new Date(), updatedBy: req.user?.id || null },
      });
      await audit(req, "update", "revenue", `Plan de referencia configurado para el tipo de habitación ${roomTypeId}`, { entityType: "revenue_reference_rate_plan", entityId: roomTypeId, details: { ratePlanId } });
      res.json({ roomTypeId, configuredRatePlanId: ratePlanId });
    } catch (e: any) {
      res.status(400).json({ error: e?.message || "No se pudo guardar el plan de referencia" });
    }
  });
}

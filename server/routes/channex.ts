import type { Express } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { requireAuth, requireRole } from "../auth";
import {
  channexBookings,
  channexConnections,
  channexRatePlanMappings,
  channexRoomTypeMappings,
  insertChannexConnectionSchema,
  roomTypes,
  ratePlans,
  type ChannexConnectionPublic,
} from "@shared/schema";
import { ChannexApiError, fetchChannexProperties } from "../channex/client";
import { encryptChannexApiKey } from "../channex/credentials";
import { confirmBookings, importBooking, InvalidRevisionSelectionError, markForReview, recomputeMappedFlags, retryBooking, syncBookings, syncCatalog } from "../channex/sync";
import { z } from "zod";

/** Config de conexión y mapeo: solo quienes pueden decidir cómo se conecta el PMS a un canal real. */
const CHANNEX_CONFIG_ROLES = ["admin", "manager", "resp_administracion", "jefe_recepcion"];

function actorName(req: any): string {
  return req.user?.username ?? req.user?.fullName ?? "sistema";
}

function toPublicConnection(connection: any): ChannexConnectionPublic {
  const { apiKey, apiKeyEncrypted, ...rest } = connection;
  return rest;
}

function handleError(res: any, err: unknown, fallback: string) {
  if (err instanceof ChannexApiError) {
    console.error("[channex]", err.message, err.body);
    return res.status(502).json({ error: err.message, channexBody: err.body });
  }
  console.error("[channex]", err);
  return res.status(400).json({ error: (err as Error)?.message ?? fallback });
}

export function registerChannexRoutes(app: Express) {
  // --- Conexiones (config restringida) ---

  // Lectura de conexiones: cualquier usuario autenticado (la bandeja necesita
  // saber qué conexiones existen para elegir una). apiKey nunca se expone
  // (ver toPublicConnection). Crear/editar/borrar sigue restringido abajo.
  app.get("/api/channex/connections", requireAuth, async (_req, res) => {
    try {
      const rows = await db.select().from(channexConnections).orderBy(desc(channexConnections.createdAt));
      res.json(rows.map(toPublicConnection));
    } catch (err) {
      handleError(res, err, "Error al obtener las conexiones de Channex");
    }
  });

  app.post("/api/channex/connections", requireRole(CHANNEX_CONFIG_ROLES), async (req, res) => {
    try {
      const parsed = insertChannexConnectionSchema.parse(req.body);

      // Validamos la key/property_id contra Channex antes de guardar, así un
      // typo no queda guardado silenciosamente como "conexión activa".
      const baseUrl = parsed.baseUrl ?? "https://staging.channex.io/api/v1";
      const properties = await fetchChannexProperties({ apiKey: parsed.apiKey, baseUrl });
      const found = properties.some((p: any) => p.id === parsed.channexPropertyId);
      if (!found) {
        return res.status(400).json({
          error: "La API key no tiene acceso a ninguna propiedad con ese Property ID en Channex",
          propertiesFound: properties.map((p: any) => ({ id: p.id, title: p.attributes?.title })),
        });
      }

      const { apiKey, ...publicFields } = parsed;
      const [created] = await db
        .insert(channexConnections)
        .values({
          ...publicFields,
          baseUrl,
          apiKey: null,
          apiKeyEncrypted: encryptChannexApiKey(apiKey),
          createdAt: new Date(),
        })
        .returning();
      res.status(201).json(toPublicConnection(created));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
      handleError(res, err, "Error al crear la conexión de Channex");
    }
  });

  app.patch("/api/channex/connections/:id", requireRole(CHANNEX_CONFIG_ROLES), async (req, res) => {
    try {
      const parsed = insertChannexConnectionSchema.partial().parse(req.body);
      const { apiKey, ...fields } = parsed;
      const [updated] = await db
        .update(channexConnections)
        .set({
          ...fields,
          ...(apiKey
            ? { apiKey: null, apiKeyEncrypted: encryptChannexApiKey(apiKey) }
            : {}),
        })
        .where(eq(channexConnections.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Conexión no encontrada" });
      res.json(toPublicConnection(updated));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
      handleError(res, err, "Error al actualizar la conexión de Channex");
    }
  });

  app.delete("/api/channex/connections/:id", requireRole(CHANNEX_CONFIG_ROLES), async (req, res) => {
    try {
      const deleted = await db.delete(channexConnections).where(eq(channexConnections.id, req.params.id)).returning();
      if (deleted.length === 0) return res.status(404).json({ error: "Conexión no encontrada" });
      res.status(204).send();
    } catch (err) {
      handleError(res, err, "Error al eliminar la conexión de Channex");
    }
  });

  // --- Mapeo de catálogo (config restringida) ---

  app.post("/api/channex/connections/:id/sync-catalog", requireRole(CHANNEX_CONFIG_ROLES), async (req, res) => {
    try {
      const summary = await syncCatalog(req.params.id);
      res.json(summary);
    } catch (err) {
      handleError(res, err, "Error al sincronizar el catálogo de Channex");
    }
  });

  // Lectura del mapeo: cualquier usuario autenticado (Recepción la necesita
  // para ver el nombre de categoría/tarifa en la bandeja). Editar el mapeo
  // sigue restringido más abajo.
  app.get("/api/channex/connections/:id/room-type-mappings", requireAuth, async (req, res) => {
    try {
      const rows = await db
        .select({
          mapping: channexRoomTypeMappings,
          roomTypeName: roomTypes.name,
        })
        .from(channexRoomTypeMappings)
        .leftJoin(roomTypes, eq(roomTypes.id, channexRoomTypeMappings.roomTypeId))
        .where(eq(channexRoomTypeMappings.connectionId, req.params.id));
      res.json(rows.map((r) => ({ ...r.mapping, roomTypeName: r.roomTypeName })));
    } catch (err) {
      handleError(res, err, "Error al obtener el mapeo de habitaciones");
    }
  });

  app.patch("/api/channex/room-type-mappings/:id", requireRole(CHANNEX_CONFIG_ROLES), async (req, res) => {
    try {
      const { roomTypeId } = z.object({ roomTypeId: z.string().nullable() }).parse(req.body);
      const [updated] = await db
        .update(channexRoomTypeMappings)
        .set({ roomTypeId })
        .where(eq(channexRoomTypeMappings.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Mapeo no encontrado" });
      // Sin esto, una reserva ya previsualizada queda marcada "falta mapeo"
      // hasta la próxima previsualización aunque el mapeo ya esté completo.
      await recomputeMappedFlags(updated.connectionId);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
      handleError(res, err, "Error al actualizar el mapeo de habitación");
    }
  });

  app.get("/api/channex/connections/:id/rate-plan-mappings", requireAuth, async (req, res) => {
    try {
      const rows = await db
        .select({
          mapping: channexRatePlanMappings,
          ratePlanName: ratePlans.name,
        })
        .from(channexRatePlanMappings)
        .leftJoin(ratePlans, eq(ratePlans.id, channexRatePlanMappings.ratePlanId))
        .where(eq(channexRatePlanMappings.connectionId, req.params.id));
      res.json(rows.map((r) => ({ ...r.mapping, ratePlanName: r.ratePlanName })));
    } catch (err) {
      handleError(res, err, "Error al obtener el mapeo de tarifas");
    }
  });

  app.patch("/api/channex/rate-plan-mappings/:id", requireRole(CHANNEX_CONFIG_ROLES), async (req, res) => {
    try {
      const { ratePlanId } = z.object({ ratePlanId: z.string().nullable() }).parse(req.body);
      const [updated] = await db
        .update(channexRatePlanMappings)
        .set({ ratePlanId })
        .where(eq(channexRatePlanMappings.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Mapeo no encontrado" });
      await recomputeMappedFlags(updated.connectionId);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
      handleError(res, err, "Error al actualizar el mapeo de tarifa");
    }
  });

  // --- Bandeja de reservas (cualquier usuario autenticado, ej. Recepción) ---

  // "Previsualizar": trae el feed de Channex y lo guarda, sin confirmar nada.
  app.post("/api/channex/connections/:id/sync-bookings", requireAuth, async (req, res) => {
    try {
      const summary = await syncBookings(req.params.id);
      res.json(summary);
    } catch (err) {
      handleError(res, err, "Error al sincronizar reservas de Channex");
    }
  });

  // "Sincronizar y confirmar": ACK selectivo (#542) — solo sobre lo ya
  // previsualizado. `revisionIds` opcional: cuáles confirmar; sin eso,
  // confirma el lote completo de lo pendiente. Cualquier id que no esté
  // pendiente en esta conexión rechaza la llamada entera (ver sync.ts).
  app.post("/api/channex/connections/:id/confirm-bookings", requireAuth, async (req, res) => {
    try {
      const { revisionIds } = z.object({ revisionIds: z.array(z.string()).optional() }).parse(req.body ?? {});
      const summary = await confirmBookings(req.params.id, revisionIds);
      res.json(summary);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
      if (err instanceof InvalidRevisionSelectionError) {
        return res.status(400).json({ error: err.message, invalidRevisionIds: err.invalidRevisionIds });
      }
      handleError(res, err, "Error al confirmar reservas de Channex");
    }
  });

  app.get("/api/channex/bookings", requireAuth, async (req, res) => {
    try {
      const { connectionId, status } = req.query as Record<string, string | undefined>;
      const conditions = [
        connectionId ? eq(channexBookings.connectionId, connectionId) : undefined,
        status ? eq(channexBookings.status, status as any) : undefined,
      ].filter(Boolean) as any[];
      const rows = await db
        .select()
        .from(channexBookings)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(channexBookings.updatedAt));
      res.json(rows);
    } catch (err) {
      handleError(res, err, "Error al obtener la bandeja de reservas de Channex");
    }
  });

  app.get("/api/channex/bookings/:id", requireAuth, async (req, res) => {
    try {
      const [row] = await db.select().from(channexBookings).where(eq(channexBookings.id, req.params.id));
      if (!row) return res.status(404).json({ error: "Reserva no encontrada" });
      res.json(row);
    } catch (err) {
      handleError(res, err, "Error al obtener la reserva de Channex");
    }
  });

  app.post("/api/channex/bookings/:id/import", requireAuth, async (req, res) => {
    try {
      const preview = await importBooking(req.params.id, actorName(req));
      res.json(preview);
    } catch (err) {
      handleError(res, err, "Error al aceptar la reserva de Channex");
    }
  });

  app.post("/api/channex/bookings/:id/mark-review", requireAuth, async (req, res) => {
    try {
      const updated = await markForReview(req.params.id);
      res.json(updated);
    } catch (err) {
      handleError(res, err, "Error al marcar la reserva para revisión");
    }
  });

  app.post("/api/channex/bookings/:id/retry", requireAuth, async (req, res) => {
    try {
      const updated = await retryBooking(req.params.id);
      res.json(updated);
    } catch (err) {
      handleError(res, err, "Error al reintentar la reserva de Channex");
    }
  });
}

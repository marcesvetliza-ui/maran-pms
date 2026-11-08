import { updateRoomSelection } from "../channex/roomSelection";
import { requireChannex, registerChannexAccessRoutes } from '../channex/access';
import { connectionUrl, PRODUCTION_URL, DEMO_URL, productionEnabled } from '../channex/connectionPolicy';
import { registerChannexInboundRoutes } from "../channex/inboundRoutes";
import type { Express } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { requireAuth, requirePermission } from "../auth";
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
import { pool } from "../db";
import { registerChannexAriRoutes } from "../channex/ariRoutes";

/**
 * Config de conexión y mapeo: solo quienes pueden decidir cómo se conecta
 * el PMS a un canal real. Etapa 3 del ABM de usuarios: mismo array de roles
 * que tenía antes, ahora como resourceKey propio en role_permissions (ver
 * API_RESOURCE_PERMISSIONS en server/permissions.ts).
 */
const CHANNEX_CONFIG_RESOURCE_KEY = "api:channex:config";

function actorName(req: any): string {
  return req.user?.username ?? req.user?.fullName ?? "sistema";
}

function toPublicConnection(connection: any): ChannexConnectionPublic {
  const { apiKey, apiKeyEncrypted, ...rest } = connection;
  return rest;
}

function handleError(res: any, err: unknown, fallback: string) {
  if (err instanceof ChannexApiError) {
    console.error("[channex]", err.message);
    return res.status(502).json({ error: err.message });
  }
  console.error("[channex]", (err as Error)?.message);
  const message=(err as Error)?.message||fallback;
  const safe=message.includes('PAUSE_CHANNEX_INBOUND')?'Pausá la recepción de reservas antes de modificar esta conexión.':message.includes('CHANNEX_INBOUND_HISTORY')?'Esta conexión conserva reservas recibidas. Desactivala para conservar su historial.':message;
  return res.status(400).json({error:safe});
}

export function registerChannexRoutes(app: Express) {
  registerChannexAccessRoutes(app);
  app.get('/api/channex/runtime',requireChannex('config'),(_req,res)=>res.json({productionAriEnabled:productionEnabled('ari'),productionInboundEnabled:productionEnabled('inbound'),credentialsStorageReady:(process.env.CHANNEX_CREDENTIALS_ENCRYPTION_KEY?.length||0)>=32}));
  registerChannexAriRoutes(app, pool);
  registerChannexInboundRoutes(app, pool);
  // --- Conexiones (config restringida) ---

  // Lectura de conexiones: cualquier usuario autenticado (la bandeja necesita
  // saber qué conexiones existen para elegir una). apiKey nunca se expone
  // (ver toPublicConnection). Crear/editar/borrar sigue restringido abajo.
  app.get('/api/channex/connections/:id/room-options', requireChannex('config'), async (req,res) => {
    try {
      const rows = await pool.query(`SELECT r.id,r.room_number AS "roomNumber",r.room_type_id AS "roomTypeId",r.floor
        FROM rooms r JOIN channex_ari_settings s ON s.connection_id=$1
        WHERE r.is_active AND NOT COALESCE(r.is_virtual,false) AND r.room_number<>'REUB'
          AND ((s.floor IS NULL AND r.floor IS DISTINCT FROM 99) OR r.floor=s.floor)
        ORDER BY r.room_number::text`, [req.params.id]);
      res.json(rows.rows);
    } catch(error) { handleError(res,error,'No se pudieron consultar las habitaciones del alcance'); }
  });
  app.get("/api/channex/connections", requireChannex('read'), async (_req, res) => {
    try {
      const rows = await db.select().from(channexConnections).orderBy(desc(channexConnections.createdAt));
      res.json(rows.map(toPublicConnection));
    } catch (err) {
      handleError(res, err, "Error al obtener las conexiones de Channex");
    }
  });

  app.post("/api/channex/connections", requireChannex('config'), async (req, res) => {
    try {
      const parsed = insertChannexConnectionSchema.parse(req.body);

      // Validamos la key/property_id contra Channex antes de guardar, así un
      // typo no queda guardado silenciosamente como "conexión activa".
      const baseUrl = connectionUrl(parsed);
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
          isActive: parsed.environment === "real" ? false : parsed.isActive,
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

  app.patch("/api/channex/connections/:id", requireChannex('config'), async (req, res) => {
    try {
      const parsed = insertChannexConnectionSchema.partial().parse(req.body);
      const { apiKey, ...fields } = parsed;
      const current=(await db.select().from(channexConnections).where(eq(channexConnections.id,req.params.id)))[0];
      if(!current)return res.status(404).json({error:'Conexión no encontrada'});
      const validatedUrl=connectionUrl({...current,...fields});
      if(fields.baseUrl!==undefined)fields.baseUrl=validatedUrl;
      if((fields.environment??current.environment)==='real'&&fields.isActive===true&&(!productionEnabled('ari')||!productionEnabled('inbound')))return res.status(409).json({error:'La producción todavía no está habilitada en el servidor.'});
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

  app.delete("/api/channex/connections/:id", requireChannex('config'), async (req, res) => {
    try {
      const deleted = await db.delete(channexConnections).where(eq(channexConnections.id, req.params.id)).returning();
      if (deleted.length === 0) return res.status(404).json({ error: "Conexión no encontrada" });
      res.status(204).send();
    } catch (err) {
      handleError(res, err, "Error al eliminar la conexión de Channex");
    }
  });

  // --- Mapeo de catálogo (config restringida) ---

  app.post("/api/channex/connections/:id/sync-catalog", requireChannex('config'), async (req, res) => {
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
  app.get("/api/channex/connections/:id/room-type-mappings", requireChannex('config'), async (req, res) => {
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

  app.patch("/api/channex/room-type-mappings/:id", requireChannex('config'), async (req, res) => {
    try {
      const input = z.object({ roomTypeId: z.string().min(1).nullable(), roomIds: z.array(z.string().min(1)).min(1).max(1000).nullable().optional() }).strict().parse(req.body);
      const updated = await updateRoomSelection(pool, req.params.id, input);
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

  app.get("/api/channex/connections/:id/rate-plan-mappings", requireChannex('config'), async (req, res) => {
    try {
      const rows = await db
        .select({
          mapping: channexRatePlanMappings,
          ratePlanName: ratePlans.name,
        })
        .from(channexRatePlanMappings)
        .leftJoin(ratePlans, eq(ratePlans.id, channexRatePlanMappings.ratePlanId))
        .where(and(eq(channexRatePlanMappings.connectionId, req.params.id), eq(channexRatePlanMappings.remotePresent, true)));
      res.json(rows.map((r) => ({ ...r.mapping, ratePlanName: r.ratePlanName })));
    } catch (err) {
      handleError(res, err, "Error al obtener el mapeo de tarifas");
    }
  });

  app.patch("/api/channex/rate-plan-mappings/:id", requireChannex('config'), async (req, res) => {
    try {
      const { ratePlanId } = z.object({ ratePlanId: z.string().nullable() }).parse(req.body);
      const [updated] = await db
        .update(channexRatePlanMappings)
        .set({ ratePlanId })
        .where(and(eq(channexRatePlanMappings.id, req.params.id), eq(channexRatePlanMappings.remotePresent, true)))
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
  app.post("/api/channex/connections/:id/sync-bookings", requireChannex('bookings'), async (req, res) => {
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
  app.post("/api/channex/connections/:id/confirm-bookings", requireChannex('bookings'), async (req, res) => {
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

  app.get("/api/channex/bookings", requireChannex('read'), async (req, res) => {
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

  app.get("/api/channex/bookings/:id", requireChannex('read'), async (req, res) => {
    try {
      const [row] = await db.select().from(channexBookings).where(eq(channexBookings.id, req.params.id));
      if (!row) return res.status(404).json({ error: "Reserva no encontrada" });
      res.json(row);
    } catch (err) {
      handleError(res, err, "Error al obtener la reserva de Channex");
    }
  });

  app.post("/api/channex/bookings/:id/import", requireChannex('bookings'), async (req, res) => {
    try {
      const preview = await importBooking(req.params.id, actorName(req));
      res.json(preview);
    } catch (err) {
      handleError(res, err, "Error al aceptar la reserva de Channex");
    }
  });

  app.post("/api/channex/bookings/:id/mark-review", requireChannex('bookings'), async (req, res) => {
    try {
      const updated = await markForReview(req.params.id);
      res.json(updated);
    } catch (err) {
      handleError(res, err, "Error al marcar la reserva para revisión");
    }
  });

  app.post("/api/channex/bookings/:id/retry", requireChannex('bookings'), async (req, res) => {
    try {
      const updated = await retryBooking(req.params.id);
      res.json(updated);
    } catch (err) {
      handleError(res, err, "Error al reintentar la reserva de Channex");
    }
  });
}

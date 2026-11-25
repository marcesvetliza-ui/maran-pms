import type { Express } from "express";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, withDatabaseTransaction } from "../db";
import { requireAuth, requirePermission } from "../auth";
import { bookingConfigSchema } from "@shared/booking-engine";
import { readBookingImage } from "../bookingEngineImages";
import { bookingSalesEnabled } from "../bookingEngineSales";

const permission = "sidebar:/admin/booking-engine";
const photoPath = (id: string) => `/api/public/booking/photos/${id}`;
const photoId = /^\/api\/public\/booking\/photos\/([0-9a-f-]{36})$/;

export function registerBookingEngineAdminRoutes(app: Express) {
  const guards = [requireAuth, requirePermission(permission)];
  app.get("/api/admin/booking-engine/config", ...guards, async (_req, res) => {
    try {
      const types = await db.execute(sql`SELECT rt.*,c.rate_plan_id AS "bookingRatePlanId",
        COALESCE(c.discount_percent,0)::float AS "bookingDiscountPercent"
        FROM room_types rt LEFT JOIN booking_engine_configs c ON c.room_type_id=rt.id
        ORDER BY rt.sort_order,rt.name`);
      // ORM mapping preserves the existing client RoomType/RatePlan contract.
      const { roomTypes, ratePlans } = await import("@shared/schema");
      const [roomRows, planRows] = await Promise.all([db.select().from(roomTypes), db.select().from(ratePlans)]);
      const config = new Map(types.rows.map((r: any) => [r.id, r]));
      res.set("Cache-Control", "no-store").json({
        salesEnabled: await bookingSalesEnabled(),
        roomTypes: roomRows.map(rt => ({ ...rt, bookingRatePlanId: (config.get(rt.id) as any)?.bookingRatePlanId ?? null,
          bookingDiscountPercent: (config.get(rt.id) as any)?.bookingDiscountPercent ?? 0 }))
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)),
        ratePlans: planRows,
      });
    } catch { res.status(503).json({ error: "La configuración del motor no está disponible; verificá sus migraciones" }); }
  });

  app.patch("/api/admin/room-types/:id/booking-config", ...guards, async (req, res) => {
    const parsed = bookingConfigSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Revisá el plan, el descuento y los campos de configuración", details: parsed.error.flatten() });
    try {
      await withDatabaseTransaction(async () => {
        const { rows } = await db.execute(sql`SELECT id FROM room_types WHERE id=${req.params.id} FOR UPDATE`);
        if (!rows.length) throw Object.assign(new Error("Tipo de habitación inexistente"), { status: 404 });
        const v = parsed.data;
        if (v.ratePlanId) {
          const plan = await db.execute(sql`SELECT id FROM rate_plans WHERE id=${v.ratePlanId}
            AND room_type_id=${req.params.id} FOR SHARE`);
          if (!plan.rows.length) throw Object.assign(new Error("El plan debe pertenecer a esta categoría"), { status: 400 });
        }
        for (const photo of v.photos ?? []) {
          const match = photo.match(photoId);
          if (match) {
            if (!z.string().uuid().safeParse(match[1]).success)
              throw Object.assign(new Error("Identificador de foto inválido"), { status: 400 });
            const owned = await db.execute(sql`SELECT id FROM booking_engine_photos WHERE id=${match[1]}::uuid AND room_type_id=${req.params.id}`);
            if (!owned.rows.length) throw Object.assign(new Error("Una foto no pertenece a esta categoría"), { status: 400 });
          } else {
            let valid = false;
            try { const url = new URL(photo); valid = ["https:", "http:"].includes(url.protocol) && !url.username && !url.password; } catch {}
            if (!valid) throw Object.assign(new Error("Usá enlaces http/https o las fotos cargadas desde el dispositivo"), { status: 400 });
          }
        }
        const { roomTypes } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        await db.update(roomTypes).set({
          publicDescription: v.publicDescription, amenities: v.amenities, photos: v.photos,
          showInBooking: v.showInBooking, sortOrder: v.sortOrder,
        }).where(eq(roomTypes.id, req.params.id));
        await db.execute(sql`INSERT INTO booking_engine_configs(room_type_id,rate_plan_id,discount_percent)
          VALUES(${req.params.id},${v.ratePlanId},${v.discountPercent})
          ON CONFLICT(room_type_id) DO UPDATE SET rate_plan_id=excluded.rate_plan_id,
          discount_percent=excluded.discount_percent,updated_at=now()`);
        // Blobs removed from the gallery are no longer public. Keep unused drafts
        // briefly so another open editor does not lose its just-uploaded files.
        await db.execute(sql`DELETE FROM booking_engine_photos p WHERE room_type_id=${req.params.id}
          AND created_at<now()-interval '24 hours'
          AND NOT EXISTS(SELECT 1 FROM room_types rt WHERE rt.id=p.room_type_id
            AND ${"/api/public/booking/photos/"}||p.id::text=ANY(COALESCE(rt.photos,'{}'::text[])))`);
      });
      res.json({ success: true });
    } catch (error: any) {
      res.status(error.status ?? 500).json({ error: error.status ? error.message : "No se pudo guardar la configuración" });
    }
  });

  app.post("/api/admin/room-types/:id/booking-photos", ...guards, async (req, res) => {
    let bytes: Buffer;
    try { bytes = readBookingImage(req.body?.imageData); }
    catch (e: any) { return res.status(400).json({ error: e.message }); }
    try {
      const id = randomUUID();
      await withDatabaseTransaction(async () => {
        const types = await db.execute(sql`SELECT id FROM room_types WHERE id=${req.params.id} FOR UPDATE`);
        if (!types.rows.length) throw Object.assign(new Error("Tipo inexistente"), { status: 404 });
        await db.execute(sql`DELETE FROM booking_engine_photos p WHERE room_type_id=${req.params.id}
          AND created_at<now()-interval '24 hours'
          AND NOT EXISTS(SELECT 1 FROM room_types rt WHERE rt.id=p.room_type_id
            AND ${"/api/public/booking/photos/"}||p.id::text=ANY(COALESCE(rt.photos,'{}'::text[])))`);
        const count = await db.execute(sql`SELECT count(*)::int AS n FROM booking_engine_photos WHERE room_type_id=${req.params.id}`);
        if (Number((count.rows[0] as any).n) >= 20)
          throw Object.assign(new Error("Hay demasiadas fotos o cargas sin guardar; guardá la galería o reintentá mañana"), { status: 409 });
        await db.execute(sql`INSERT INTO booking_engine_photos(id,room_type_id,content_type,bytes)
          VALUES(${id}::uuid,${req.params.id},'image/jpeg',${bytes})`);
      });
      res.status(201).json({ url: photoPath(id) });
    } catch (e: any) { res.status(e.status ?? 500).json({ error: e.status ? e.message : "No se pudo guardar la foto" }); }
  });

  app.get("/api/public/booking/photos/:id", async (req, res) => {
    if (!z.string().uuid().safeParse(req.params.id).success) return res.sendStatus(404);
    try {
      const photo = await db.execute(sql`SELECT p.bytes FROM booking_engine_photos p JOIN room_types rt ON rt.id=p.room_type_id
        WHERE p.id=${req.params.id}::uuid AND rt.show_in_booking=true
        AND ${photoPath(req.params.id)}=ANY(COALESCE(rt.photos,'{}'::text[]))`);
      if (!photo.rows.length) return res.sendStatus(404);
      res.set({ "Content-Type": "image/jpeg", "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox", "Cache-Control": "no-store" })
        .send((photo.rows[0] as any).bytes);
    } catch { res.sendStatus(503); }
  });
}

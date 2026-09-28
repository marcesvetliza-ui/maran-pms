import type { Express } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { requireAuth } from "../auth";
import { calendarMonth, calendarMonthEnd } from "./roomPreventiveSchema";
import { getArgentinaOperationalDate } from "../utils/argentinaDateTime";

export function registerRoomPreventiveRoutes(app: Express) {
  app.post("/api/maintenance/preventive/rooms", requireAuth, async (req, res) => {
    const name = String(req.body?.name ?? "").trim();
    if (!name || name.length > 255) return res.status(400).json({ error: "Ingresá un nombre de hasta 255 caracteres" });
    try {
      const created = await db.transaction(async tx => {
        // Impide dos grupos idénticos creados simultáneamente.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${name.toLowerCase()}))`);
        const duplicate = await tx.execute(sql`
          SELECT p.id FROM preventive_tasks p WHERE p.active = true AND lower(p.name) = ${name.toLowerCase()}
          AND EXISTS (SELECT 1 FROM preventive_room_slots s WHERE s.task_id = p.id) LIMIT 1
        `);
        if (duplicate.rows.length) return null;
        const rooms = await tx.execute(sql`
          SELECT id FROM rooms WHERE is_active = true AND COALESCE(is_virtual, false) = false AND room_number <> 'REUB'
        `);
        if (!rooms.rows.length) throw new Error("No hay habitaciones activas para esta preventiva");
        const today = getArgentinaOperationalDate();
        const task = await tx.execute(sql`
          INSERT INTO preventive_tasks (name, description, frequency, frequency_days, next_due_at, assigned_to)
          VALUES (${name}, ${req.body?.description || null}, 'monthly', 30, ${calendarMonthEnd(today)}, ${req.body?.assignedTo || null}) RETURNING *
        `);
        const id = (task.rows[0] as any).id as string;
        await tx.execute(sql`
          INSERT INTO preventive_room_slots (task_id, room_id)
          SELECT ${id}, id FROM rooms WHERE is_active = true AND COALESCE(is_virtual, false) = false AND room_number <> 'REUB'
        `);
        return { ...task.rows[0], room_count: rooms.rows.length, completed_count: 0 };
      });
      if (!created) return res.status(409).json({ error: "Ya existe una preventiva por habitación con ese nombre" });
      res.status(201).json(created);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/maintenance/preventive/:id/rooms", requireAuth, async (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const description = req.body?.description;
    if (!name || name.length > 255 || (description != null && typeof description !== "string")) {
      return res.status(400).json({ error: "Ingresá un nombre válido y una descripción de texto" });
    }
    try {
      const outcome = await db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${name.toLowerCase()}))`);
        const existing = await tx.execute(sql`
          SELECT p.id FROM preventive_tasks p WHERE p.id = ${req.params.id} AND p.active = true
          AND EXISTS (SELECT 1 FROM preventive_room_slots s WHERE s.task_id = p.id) FOR UPDATE
        `);
        if (!existing.rows.length) return { status: "missing" };
        const duplicate = await tx.execute(sql`
          SELECT p.id FROM preventive_tasks p WHERE p.id <> ${req.params.id}
          AND p.active = true AND lower(p.name) = ${name.toLowerCase()}
          AND EXISTS (SELECT 1 FROM preventive_room_slots s WHERE s.task_id = p.id) LIMIT 1
        `);
        if (duplicate.rows.length) return { status: "duplicate" };
        const updated = await tx.execute(sql`
          UPDATE preventive_tasks SET name = ${name}, description = ${description?.trim() || null}, updated_at = now()
          WHERE id = ${req.params.id} RETURNING *
        `);
        return { status: "updated", task: updated.rows[0] };
      });
      if (outcome.status === "missing") return res.status(404).json({ error: "Preventiva no encontrada" });
      if (outcome.status === "duplicate") return res.status(409).json({ error: "Ya existe una preventiva por habitación con ese nombre" });
      res.json(outcome.task);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // "Eliminar" la quita de la lista y de las alertas sin destruir el historial.
  app.delete("/api/maintenance/preventive/:id/rooms", requireAuth, async (req, res) => {
    try {
      const archived = await db.execute(sql`
        UPDATE preventive_tasks p SET active = false, updated_at = now()
        WHERE p.id = ${req.params.id} AND p.active = true
        AND EXISTS (SELECT 1 FROM preventive_room_slots s WHERE s.task_id = p.id)
        RETURNING p.id
      `);
      if (!archived.rows.length) return res.status(404).json({ error: "Preventiva no encontrada o ya eliminada" });
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/maintenance/preventive/:id/rooms", requireAuth, async (req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT r.id AS room_id, r.room_number, r.floor,
          latest.performed_at AS last_done_at, latest.notes AS last_note,
          current_done.performed_at AS done_at_current_month
        FROM preventive_room_slots s JOIN rooms r ON r.id = s.room_id
        LEFT JOIN LATERAL (
          SELECT performed_at, notes FROM preventive_room_completions c
          WHERE c.task_id = s.task_id AND c.room_id = s.room_id ORDER BY performed_at DESC, created_at DESC LIMIT 1
        ) latest ON true
        LEFT JOIN preventive_room_completions current_done ON current_done.task_id = s.task_id
          AND current_done.room_id = s.room_id AND current_done.period = ${calendarMonth(getArgentinaOperationalDate())}::date
        WHERE s.task_id = ${req.params.id}
        ORDER BY length(r.room_number), r.room_number
      `);
      res.json(result.rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/maintenance/preventive/:id/rooms/:roomId/history", requireAuth, async (req, res) => {
    try {
      const history = await db.execute(sql`
        SELECT period, performed_at, performed_by, notes FROM preventive_room_completions
        WHERE task_id = ${req.params.id} AND room_id = ${req.params.roomId}
        ORDER BY period DESC
      `);
      res.json(history.rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/maintenance/preventive/:id/rooms/:roomId/done", requireAuth, async (req, res) => {
    try {
      const outcome = await db.transaction(async tx => {
        const parent = await tx.execute(sql`SELECT id, active FROM preventive_tasks WHERE id = ${req.params.id} FOR UPDATE`);
        if (!parent.rows.length || !(parent.rows[0] as any).active) return "missing";
        const slot = await tx.execute(sql`
          SELECT 1 FROM preventive_room_slots WHERE task_id = ${req.params.id} AND room_id = ${req.params.roomId}
        `);
        if (!slot.rows.length) return "missing";
        const today = getArgentinaOperationalDate();
        const period = calendarMonth(today);
        const inserted = await tx.execute(sql`
          INSERT INTO preventive_room_completions (task_id, room_id, period, performed_at, performed_by, notes)
          VALUES (${req.params.id}, ${req.params.roomId}, ${period}, ${today}, ${String((req.user as any)?.id ?? "") || null}, ${String(req.body?.notes ?? "").trim() || null})
          ON CONFLICT (task_id, room_id, period) DO NOTHING RETURNING id
        `);
        if (!inserted.rows.length) return "duplicate";
        const progress = await tx.execute(sql`
          SELECT count(*)::int AS total,
            count(c.id)::int AS completed FROM preventive_room_slots s
          LEFT JOIN preventive_room_completions c ON c.task_id = s.task_id AND c.room_id = s.room_id AND c.period = ${period}::date
          WHERE s.task_id = ${req.params.id}
        `);
        const { total, completed } = progress.rows[0] as any;
        if (total && total === completed) {
          await tx.execute(sql`
            UPDATE preventive_tasks SET last_done_at = ${today}, next_due_at = ${calendarMonthEnd(today, true)}, updated_at = now()
            WHERE id = ${req.params.id}
          `);
        }
        return { total, completed, completed_at: today };
      });
      if (outcome === "missing") return res.status(404).json({ error: "Habitación o preventiva inexistente" });
      if (outcome === "duplicate") return res.status(409).json({ error: "La habitación ya fue registrada este mes" });
      res.status(201).json(outcome);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
}

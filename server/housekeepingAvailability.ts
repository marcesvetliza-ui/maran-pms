import type { Express } from "express";
import { sql } from "drizzle-orm";
import { db, withDatabaseTransaction } from "./db";
import { requireAuth, requirePermission } from "./auth";
import { validCalendarDate } from "./stayEligibility";
import { availabilitySchema } from "@shared/housekeepingAvailability";
export function registerHousekeepingAvailability(app: Express) {
  const manage = [
    requireAuth,
    requirePermission("sidebar:/housekeeping"),
    requirePermission("api:housekeeping:supervisor-view"),
  ];
  app.get("/api/housekeeping/availability", ...manage, async (req, res) => {
    if (
      typeof req.query.date !== "string" ||
      !validCalendarDate(req.query.date)
    )
      return res.status(400).json({ error: "Fecha inválida." });
    try {
      const result = await db.execute(
        sql`SELECT u.id AS "userId",u.full_name AS "fullName",a.status,a.shift,a.start_time AS "startTime",a.end_time AS "endTime",a.notes,a.updated_at AS "updatedAt",(SELECT count(*)::integer FROM housekeeping_tasks t WHERE t.assigned_to=u.id AND t.scheduled_date=${req.query.date}) AS "taskCount" FROM system_users u LEFT JOIN housekeeping_staff_availability a ON a.user_id=u.id AND a.scheduled_date=${req.query.date} WHERE u.role='housekeeping' AND u.is_active='true' ORDER BY u.full_name,u.id`,
      );
      res.json(result.rows);
    } catch {
      res
        .status(500)
        .json({ error: "No se pudo consultar la disponibilidad." });
    }
  });
  app.put(
    "/api/housekeeping/availability/:userId/:date",
    ...manage,
    async (req, res) => {
      const parsed = availabilitySchema.safeParse(req.body);
      if (!validCalendarDate(req.params.date) || !parsed.success)
        return res
          .status(400)
          .json({
            error:
              "Revisá fecha, estado, horarios y observaciones (hasta 500 caracteres).",
          });
      try {
        const saved = await withDatabaseTransaction(async () => {
          const user = await db.execute(
            sql`SELECT id FROM system_users WHERE id=${req.params.userId} AND role='housekeeping' AND is_active='true' FOR UPDATE`,
          );
          if (!user.rows.length) return false;
          const v = parsed.data;
          const shift = v.status === "working" ? v.shift : null,
            start = v.status === "working" ? v.startTime : null,
            end = v.status === "working" ? v.endTime : null;
          const before =
            (
              await db.execute(
                sql`SELECT * FROM housekeeping_staff_availability WHERE user_id=${req.params.userId} AND scheduled_date=${req.params.date}`,
              )
            ).rows[0] || null;
          await db.execute(
            sql`INSERT INTO housekeeping_staff_availability(user_id,scheduled_date,status,shift,start_time,end_time,notes,updated_by) VALUES (${req.params.userId},${req.params.date},${v.status},${shift},${start},${end},${v.notes},${req.user!.id}) ON CONFLICT(user_id,scheduled_date) DO UPDATE SET status=EXCLUDED.status,shift=EXCLUDED.shift,start_time=EXCLUDED.start_time,end_time=EXCLUDED.end_time,notes=EXCLUDED.notes,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
          );
          await db.execute(
            sql`INSERT INTO audit_logs(user_id,user_name,action,module,entity_type,entity_id,description,details,timestamp) VALUES (${req.user!.id},${req.user!.username},'update','housekeeping','staff_availability',${req.params.userId},'Disponibilidad diaria del personal',${JSON.stringify({ date: req.params.date, before, after: { ...v, shift, startTime: start, endTime: end } })},NOW())`,
          );
          return true;
        });
        if (!saved)
          return res
            .status(404)
            .json({ error: "La persona ya no está activa en Housekeeping." });
        res.json({ ok: true });
      } catch {
        res
          .status(500)
          .json({ error: "No se pudo guardar la disponibilidad." });
      }
    },
  );
}

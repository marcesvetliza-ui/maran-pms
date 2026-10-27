import type { Express } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, withDatabaseTransaction } from "./db";
import { getArgentinaToday } from "./db-storage";
import { requireAuth, requirePermission } from "./auth";
import { validCalendarDate } from "./stayEligibility";
import { loadHousekeepingDailyReport } from "./housekeepingDailyReport";
import {
  compareBeds,
  physicalBedLabels,
  preparationIsCurrent,
  type BedPreparation,
  type HousekeepingPlanning,
  type PlanningRequest,
  type PlanningTask,
} from "@shared/housekeepingPlanning";
export async function loadHousekeepingPlanning(
  date: string,
): Promise<HousekeepingPlanning> {
  if (!validCalendarDate(date))
    throw Object.assign(new Error("Fecha inválida."), { statusCode: 400 });
  const today = getArgentinaToday(),
    mode = date < today ? "past" : date > today ? "future" : "today";
  const [roomRows, requestRows, taskRows, report] = await Promise.all([
    db.execute(
      sql`SELECT id,room_number,floor,status,housekeeping_service_date,bed_config,bed_config_revision,allowed_bed_configs,is_active FROM rooms WHERE COALESCE(is_virtual,false)=false AND room_number<>'REUB' ORDER BY floor,room_number`,
    ),
    db.execute(sql`SELECT r.id,r.room_id,r.reservation_code,r.check_in_date,r.check_out_date,r.late_check_out,r.late_check_out_time,r.status,r.bed_type_id,r.bed_type_notes,r.number_of_guests,r.housekeeping_bed_preparation,r.housekeeping_preparation,b.code AS bed_code,b.name AS bed_name,concat(g.last_name,' ',g.first_name) AS guest_name
    FROM reservations r LEFT JOIN bed_types b ON b.id=r.bed_type_id LEFT JOIN guests g ON g.id=r.guest_id
    WHERE r.check_in_date<=${date} AND r.check_out_date>=${date} AND r.status IN ('confirmed','web_checkin','checked_in','checked_out') AND (${mode}='past' OR r.status<>'checked_out')
    AND NOT EXISTS(SELECT 1 FROM rooms v WHERE v.id=r.room_id AND (v.is_virtual=true OR v.room_number='REUB')) ORDER BY r.check_in_date,r.id`),
    db.execute(sql`SELECT t.id,t.room_id,t.task_type,t.status,t.priority,t.assigned_to,t.notes,t.scheduled_date,t.started_at AT TIME ZONE 'UTC' AS started_at,t.completed_at AT TIME ZONE 'UTC' AS completed_at,t.inspected_at AT TIME ZONE 'UTC' AS inspected_at,u.full_name AS staff_name,rm.room_number
    FROM housekeeping_tasks t LEFT JOIN system_users u ON u.id=t.assigned_to LEFT JOIN rooms rm ON rm.id=t.room_id WHERE t.scheduled_date=${date} AND NOT EXISTS(SELECT 1 FROM rooms v WHERE v.id=t.room_id AND (v.is_virtual=true OR v.room_number='REUB')) ORDER BY t.created_at,t.id`),
    loadHousekeepingDailyReport(date),
  ]);
  const rooms = roomRows.rows as any[],
    byRoom = new Map(rooms.map((r) => [r.id, r]));
  const reportRows = [...report.checkIns, ...report.checkOuts];
  const requests: PlanningRequest[] = (requestRows.rows as any[]).map((r) => ({
    id: r.id,
    roomId: r.room_id || null,
    reservationCode: r.reservation_code,
    guestName: r.guest_name.trim() || "Sin asignar",
    checkIn: r.check_in_date,
    checkOut: r.check_out_date,
    lateCheckOut: r.late_check_out === true,
    lateCheckOutTime: r.late_check_out_time || null,
    status: r.status,
    bedTypeId: r.bed_type_id || null,
    bedTypeCode: r.bed_code || null,
    bedTypeName: r.bed_name || null,
    bedTypeNotes: r.bed_type_notes || null,
    numberOfGuests: r.number_of_guests,
    comparison: compareBeds(
      byRoom.get(r.room_id)?.bed_config || null,
      r.bed_code || null,
      r.bed_type_notes || null,
    ),
    bedPreparation: r.housekeeping_bed_preparation || null,
    preparationCurrent: preparationIsCurrent(
      r.housekeeping_bed_preparation,
      r.room_id,
      byRoom.get(r.room_id)?.bed_config || null,
      r.bed_type_id,
      r.bed_type_notes,
      byRoom.get(r.room_id)?.bed_config_revision || 0,
    ),
    noMove:
      r.housekeeping_preparation?.roomId === r.room_id
        ? r.housekeeping_preparation
        : null,
    observations:
      reportRows.find((row) => row.reservationId === r.id)?.observations || [],
  }));
  const tasks: PlanningTask[] = (taskRows.rows as any[]).map((t) => ({
    id: t.id,
    roomId: t.room_id,
    roomNumber: t.room_number,
    taskType: t.task_type,
    status: t.status,
    priority: t.priority,
    assignedTo: t.assigned_to,
    staffName: t.staff_name,
    notes: t.notes,
    scheduledDate: t.scheduled_date,
    startedAt: t.started_at ? new Date(t.started_at).toISOString() : null,
    completedAt: t.completed_at ? new Date(t.completed_at).toISOString() : null,
    inspectedAt: t.inspected_at ? new Date(t.inspected_at).toISOString() : null,
  }));
  const visible = rooms.filter(
    (r) =>
      r.is_active !== false ||
      (mode === "past" && tasks.some((t) => t.roomId === r.id)),
  );
  // A removed room still has real task history; never silently drop those times.
  for (const t of tasks)
    if (!visible.some((r) => r.id === t.roomId))
      visible.push({
        id: t.roomId,
        room_number: t.roomNumber || "Habitación retirada",
        floor: null,
        is_active: false,
        status: null,
        bed_config: null,
        allowed_bed_configs: null,
      });
  return {
    date,
    today,
    asOf: new Date().toISOString(),
    mode,
    rooms: visible
      .map((r) => ({
        id: r.id,
        roomNumber: r.room_number,
        floor: r.floor,
        active: r.is_active !== false,
        currentStatus: r.status,
        lastServiceDate: r.housekeeping_service_date,
        currentBed: r.bed_config,
        currentBedRevision: r.bed_config_revision || 0,
        allowedBeds: r.allowed_bed_configs,
        requests: requests.filter((q) => q.roomId === r.id),
        tasks: tasks.filter((t) => t.roomId === r.id),
      }))
      .sort(
        (a, b) =>
          (a.floor ?? 999) - (b.floor ?? 999) ||
          a.roomNumber.localeCompare(b.roomNumber, "es", { numeric: true }),
      ),
    unassigned: requests.filter((q) => !visible.some((r) => r.id === q.roomId)),
    totals: {
      arrivals: requests.filter((r) => r.checkIn === date).length,
      departures: requests.filter((r) => r.checkOut === date).length,
      stays: requests.filter((r) => r.checkIn < date && r.checkOut > date)
        .length,
      tasks: tasks.length,
      completed: tasks.filter((t) =>
        ["completed", "inspected"].includes(t.status),
      ).length,
    },
  };
}
const confirmation = z
  .object({
    acknowledgeRequest: z.literal(true),
    roomId: z.string().min(1),
    bedConfig: z.enum([
      "MAT",
      "TWIN",
      "MAT_CC",
      "TWIN_CC",
      "MAT_EXTRA",
      "MAT_CC_EXTRA",
    ]),
    expectedCurrentBedConfig: z.string().nullable(),
    expectedBedConfigRevision: z.number().int().nonnegative(),
    expectedBedTypeId: z.string().nullable(),
    expectedBedTypeNotes: z.string().nullable(),
  })
  .strict();
export function registerHousekeepingPlanning(app: Express) {
  const access = [
    requireAuth,
    requirePermission("sidebar:/housekeeping"),
    requirePermission("api:housekeeping:supervisor-view"),
  ];
  app.get("/api/housekeeping/planning", ...access, async (req, res) => {
    try {
      if (
        typeof req.query.date !== "string" ||
        !validCalendarDate(req.query.date)
      )
        return res.status(400).json({ error: "Elegí una fecha válida." });
      res.json(await loadHousekeepingPlanning(req.query.date));
    } catch {
      res
        .status(500)
        .json({ error: "No se pudo cargar la planificación de Housekeeping." });
    }
  });
  app.post(
    "/api/housekeeping/planning/:id/bed-preparation",
    ...access,
    async (req, res) => {
      try {
        const data = confirmation.parse(req.body);
        const result = await withDatabaseTransaction(async () => {
          const r = (
            await db.execute(
              sql`SELECT id,room_id,status,bed_type_id,bed_type_notes,housekeeping_bed_preparation FROM reservations WHERE id=${req.params.id} FOR UPDATE`,
            )
          ).rows[0] as any;
          if (
            !r ||
            r.room_id !== data.roomId ||
            ["cancelled", "no_show", "checked_out"].includes(r.status)
          )
            throw Object.assign(
              new Error(
                "La reserva cambió de habitación o está cerrada. Actualizá la planificación.",
              ),
              { statusCode: 409 },
            );
          const room = (
            await db.execute(
              sql`SELECT id,bed_config,bed_config_revision,allowed_bed_configs,is_virtual,is_active,room_number FROM rooms WHERE id=${data.roomId} FOR UPDATE`,
            )
          ).rows[0] as any;
          if (
            !room ||
            room.is_virtual ||
            room.is_active === false ||
            room.room_number === "REUB"
          )
            throw Object.assign(
              new Error("La habitación no está disponible."),
              { statusCode: 409 },
            );
          if (
            room.bed_config_revision !== data.expectedBedConfigRevision ||
            (room.bed_config || null) !== data.expectedCurrentBedConfig ||
            (r.bed_type_id || null) !== data.expectedBedTypeId ||
            (r.bed_type_notes || null) !== data.expectedBedTypeNotes
          )
            throw Object.assign(
              new Error(
                "El camaje o el pedido cambiaron. Actualizá antes de confirmar.",
              ),
              { statusCode: 409 },
            );
          if (
            room.allowed_bed_configs?.length &&
            !room.allowed_bed_configs.includes(data.bedConfig)
          )
            throw Object.assign(
              new Error("Ese camaje no está permitido para la habitación."),
              { statusCode: 400 },
            );
          const other = (
            await db.execute(
              sql`SELECT id FROM reservations WHERE room_id=${room.id} AND status='checked_in' AND id<>${r.id} LIMIT 1`,
            )
          ).rows.length;
          if (other)
            throw Object.assign(
              new Error(
                "Hay otro huésped alojado. Confirmá esta preparación cuando la habitación quede libre.",
              ),
              { statusCode: 409 },
            );
          const requested = (
            await db.execute(
              sql`SELECT code FROM bed_types WHERE id=${r.bed_type_id}`,
            )
          ).rows[0] as any;
          if (
            compareBeds(
              data.bedConfig,
              requested?.code || null,
              r.bed_type_notes || null,
            ) === "different"
          )
            throw Object.assign(
              new Error(
                "El camaje elegido no coincide con el pedido de la reserva. Revisá el pedido antes de confirmar.",
              ),
              { statusCode: 400 },
            );
          const value: BedPreparation = {
            roomId: room.id,
            bedConfig: data.bedConfig,
            bedRevision:
              room.bed_config_revision +
              (room.bed_config === data.bedConfig ? 0 : 1),
            bedTypeId: r.bed_type_id || null,
            bedTypeNotes: r.bed_type_notes || null,
            confirmedAt: new Date().toISOString(),
            confirmedBy: req.user!.id,
          };
          await db.execute(
            sql`UPDATE rooms SET bed_config=${data.bedConfig},bed_config_revision=${value.bedRevision} WHERE id=${room.id}`,
          );
          await db.execute(
            sql`UPDATE reservations SET housekeeping_bed_preparation=${JSON.stringify(value)}::jsonb WHERE id=${r.id}`,
          );
          await db.execute(
            sql`INSERT INTO reservation_changelog(reservation_id,operador,tipo,descripcion) VALUES (${r.id},${req.user!.username},'housekeeping',${`Camaje confirmado físicamente: ${physicalBedLabels[data.bedConfig]}. Habitación ${room.room_number}. No modifica Limpia — No mover.`})`,
          );
          await db.execute(
            sql`INSERT INTO audit_logs(user_id,user_name,action,module,entity_type,entity_id,description,details,timestamp) VALUES (${req.user!.id},${req.user!.username},'bed_preparation','housekeeping','reservation',${r.id},'Confirmación física de camaje',${JSON.stringify({ before: { bedConfig: room.bed_config, confirmation: r.housekeeping_bed_preparation }, after: value })},NOW())`,
          );
          return value;
        });
        res.json(result);
      } catch (e: any) {
        res
          .status(e instanceof z.ZodError ? 400 : e.statusCode || 500)
          .json({
            error:
              e instanceof z.ZodError
                ? "Revisá los datos del camaje."
                : e.statusCode
                  ? e.message
                  : "No se pudo confirmar la preparación.",
          });
      }
    },
  );
}

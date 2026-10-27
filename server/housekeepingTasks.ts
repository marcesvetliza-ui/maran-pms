import type { Express, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, withDatabaseTransaction } from "./db";
import { storage, getArgentinaToday } from "./db-storage";
import { requireAuth, requirePermission } from "./auth";
import { hasPermission } from "./permissions";
import { validCalendarDate } from "./stayEligibility";

const supervisor = (req: Request) =>
  hasPermission(req.user!.role, "api:housekeeping:supervisor-view");
const fields = {
  taskType: z.enum([
    "checkout_clean",
    "stayover_clean",
    "deep_clean",
    "inspection",
    "turndown",
    "maintenance_prep",
  ]),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  scheduledDate: z.string().refine(validCalendarDate, "Fecha inválida"),
  assignedTo: z.string().min(1).nullable().optional(),
  notes: z.string().max(2000).optional(),
};
const creation = z.object({
  ...fields,
  taskType: fields.taskType.default("checkout_clean"),
  priority: fields.priority.default("normal"),
});
const patchSchema = z.object(fields).partial().strict();
function fail(message: string, statusCode = 409): never {
  throw Object.assign(new Error(message), { statusCode });
}
const cleanTask = (type: string) =>
  ["checkout_clean", "stayover_clean", "deep_clean", "turndown"].includes(type);
function error(res: Response, e: any) {
  res.status(e instanceof z.ZodError ? 400 : e.statusCode || 500).json({
    error:
      e instanceof z.ZodError
        ? "Revisá fecha, habitaciones y datos de la tarea."
        : e.statusCode
          ? e.message
          : "No se pudo guardar la operación de Housekeeping.",
  });
}
async function assignee(id: string | null | undefined) {
  if (!id) return;
  const found = await db.execute(
    sql`SELECT id FROM system_users WHERE id=${id} AND role='housekeeping' AND is_active='true'`,
  );
  if (!found.rows.length) fail("Elegí una mucama activa.", 400);
}
async function audit(req: Request, id: string, action: string, details: any) {
  await db.execute(sql`INSERT INTO audit_logs(user_id,user_name,action,module,entity_type,entity_id,description,details,timestamp)
    VALUES (${req.user!.id},${req.user!.username},${action},'housekeeping','housekeeping_task',${id},'Gestión de tarea de Housekeeping',${JSON.stringify(details)},NOW())`);
}
async function lockRoom(id: string) {
  const room = (
    await db.execute(
      sql`SELECT id,status,is_virtual,is_active,room_number,housekeeping_service_date FROM rooms WHERE id=${id} FOR UPDATE`,
    )
  ).rows[0] as any;
  if (
    !room ||
    room.is_virtual ||
    room.is_active === false ||
    room.room_number === "REUB"
  )
    fail("Habitación no disponible para tareas.", 400);
  return room;
}
async function lockTask(req: Request, id: string) {
  const initial = await storage.getHousekeepingTask(id);
  if (!initial) fail("Tarea no encontrada.", 404);
  // Always room -> task, same order as creation/assignment, to avoid deadlocks.
  const room = await lockRoom(initial.roomId);
  const task = (
    await db.execute(
      sql`SELECT * FROM housekeeping_tasks WHERE id=${id} FOR UPDATE`,
    )
  ).rows[0] as any;
  if (!task) fail("Tarea no encontrada.", 404);
  if (!supervisor(req) && task.assigned_to !== req.user!.id)
    fail("Sólo podés trabajar en tus tareas asignadas.", 403);
  return { task, room };
}
async function createTasks(
  req: Request,
  ids: string[],
  data: z.infer<typeof creation>,
) {
  return withDatabaseTransaction(async () => {
    await assignee(data.assignedTo);
    for (const id of [...ids].sort()) await lockRoom(id);
    // Reject the whole selection, never partially create a batch.
    const duplicate =
      await db.execute(sql`SELECT id FROM housekeeping_tasks WHERE room_id IN (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`,`,
      )})
      AND scheduled_date=${data.scheduledDate} AND task_type=${data.taskType} AND status IN ('pending','in_progress') LIMIT 1`);
    if (duplicate.rows.length)
      fail(
        "Ya existe una tarea pendiente de ese tipo y fecha en la selección. Revisá las asignaciones.",
      );
    const result = [];
    for (const roomId of ids) {
      const task = await storage.createHousekeepingTask({
        ...data,
        roomId,
        assignedTo: data.assignedTo || null,
        status: "pending",
        createdAt: new Date(),
      });
      await audit(req, task.id, "create", { after: task });
      result.push(task);
    }
    return result;
  });
}
export function registerHousekeepingTaskRoutes(app: Express) {
  const access = [requireAuth, requirePermission("sidebar:/housekeeping")];
  const manage = [
    ...access,
    requirePermission("api:housekeeping:supervisor-view"),
  ];
  app.get("/api/housekeeping", ...access, async (req, res) => {
    try {
      if (
        req.query.date !== undefined &&
        (typeof req.query.date !== "string" ||
          !validCalendarDate(req.query.date))
      )
        fail("Fecha inválida.", 400);
      const assigned = supervisor(req)
        ? typeof req.query.assignedTo === "string"
          ? req.query.assignedTo
          : undefined
        : req.user!.id;
      res.json(
        await storage.getHousekeepingTasks(
          req.query.date as string | undefined,
          assigned,
        ),
      );
    } catch (e) {
      error(res, e);
    }
  });
  app.get("/api/housekeeping/staff", ...manage, async (_req, res) => {
    try {
      res.json(
        (await storage.getSystemUsers())
          .filter((u) => u.role === "housekeeping" && u.isActive === "true")
          .map(({ id, fullName, role, username }) => ({
            id,
            fullName,
            role,
            username,
          })),
      );
    } catch (e) {
      error(res, e);
    }
  });
  app.post("/api/housekeeping/bulk", ...manage, async (req, res) => {
    try {
      const { roomIds, ...data } = creation
        .extend({
          roomIds: z
            .array(z.string().min(1))
            .min(1)
            .max(200)
            .refine((ids) => new Set(ids).size === ids.length),
        })
        .strict()
        .parse(req.body);
      res.status(201).json(await createTasks(req, roomIds, data));
    } catch (e) {
      error(res, e);
    }
  });
  app.post("/api/housekeeping", ...manage, async (req, res) => {
    try {
      const { roomId, ...data } = creation
        .extend({ roomId: z.string().min(1) })
        .strict()
        .parse(req.body);
      res.status(201).json((await createTasks(req, [roomId], data))[0]);
    } catch (e) {
      error(res, e);
    }
  });
  app.post("/api/housekeeping/assign", ...manage, async (req, res) => {
    try {
      const data = z
        .object({
          roomId: z.string().min(1),
          date: fields.scheduledDate,
          assignedTo: fields.assignedTo,
        })
        .strict()
        .parse(req.body);
      const result = await withDatabaseTransaction(async () => {
        await lockRoom(data.roomId);
        await assignee(data.assignedTo);
        const tasks = await storage.getHousekeepingTasks(data.date);
        const pending = tasks.filter(
          (t) => t.roomId === data.roomId && t.status === "pending",
        );
        if (
          tasks.some(
            (t) => t.roomId === data.roomId && t.status === "in_progress",
          )
        )
          fail("La limpieza ya comenzó. No se reasigna desde este acceso.");
        if (pending.length > 1)
          fail(
            "Hay varias tareas pendientes. Reasignalas desde la lista de tareas.",
          );
        if (pending.length) {
          const updated = await storage.updateHousekeepingTask(pending[0].id, {
            assignedTo: data.assignedTo || null,
          });
          await audit(req, pending[0].id, "assign", {
            before: pending[0],
            after: updated,
          });
          return updated;
        }
        return (
          await createTasks(req, [data.roomId], {
            taskType: "checkout_clean",
            priority: "normal",
            scheduledDate: data.date,
            assignedTo: data.assignedTo,
          })
        )[0];
      });
      res.json(result);
    } catch (e) {
      error(res, e);
    }
  });
  app.get("/api/housekeeping/:id", ...access, async (req, res) => {
    try {
      const task = await storage.getHousekeepingTask(req.params.id);
      if (!task) fail("Tarea no encontrada.", 404);
      if (!supervisor(req) && task.assignedTo !== req.user!.id)
        fail("Sólo podés consultar tus tareas.", 403);
      res.json(task);
    } catch (e) {
      error(res, e);
    }
  });
  app.patch("/api/housekeeping/:id", ...manage, async (req, res) => {
    try {
      const patch = patchSchema.parse(req.body);
      const result = await withDatabaseTransaction(async () => {
        const { task } = await lockTask(req, req.params.id);
        if (task.status !== "pending")
          fail("Sólo se editan tareas pendientes.");
        await assignee(patch.assignedTo);
        const date = patch.scheduledDate || task.scheduled_date,
          type = patch.taskType || task.task_type;
        const duplicate = await db.execute(
          sql`SELECT id FROM housekeeping_tasks WHERE room_id=${task.room_id} AND scheduled_date=${date} AND task_type=${type} AND status IN ('pending','in_progress') AND id<>${task.id} LIMIT 1`,
        );
        if (duplicate.rows.length)
          fail("Ya existe una tarea pendiente de ese tipo y fecha.");
        const saved = await storage.updateHousekeepingTask(task.id, patch);
        await audit(req, task.id, "update", { before: task, after: saved });
        return saved;
      });
      res.json(result);
    } catch (e) {
      error(res, e);
    }
  });
  app.delete("/api/housekeeping/:id", ...manage, async (req, res) => {
    try {
      await withDatabaseTransaction(async () => {
        const { task } = await lockTask(req, req.params.id);
        if (task.status !== "pending")
          fail("No se elimina una tarea que ya comenzó.");
        await storage.deleteHousekeepingTask(task.id);
        await audit(req, task.id, "delete", { before: task });
      });
      res.sendStatus(204);
    } catch (e) {
      error(res, e);
    }
  });
  app.patch(
    "/api/housekeeping/room/:roomId/status",
    ...manage,
    async (req, res) => {
      try {
        const status = z
          .enum([
            "available",
            "occupied",
            "dirty",
            "cleaning",
            "maintenance",
            "oos",
            "limpia_ocupada",
            "no_molestar",
            "inspected",
          ])
          .parse(req.body?.status);
        const reason = z.string().trim().min(1, "Indicá el motivo de la corrección.").max(500).safeParse(req.body?.reason);
        if (!reason.success) return res.status(400).json({error:"Indicá un motivo de entre 1 y 500 caracteres."});
        const saved = await withDatabaseTransaction(async () => {
          const before = await lockRoom(req.params.roomId);
          if (req.body.expectedStatus !== undefined && req.body.expectedStatus !== before.status)
            fail("El estado de la habitación cambió. Actualizá antes de corregirlo.");
          const occupied =
            (
              await db.execute(
                sql`SELECT id FROM reservations WHERE room_id=${before.id} AND status='checked_in' LIMIT 1`,
              )
            ).rows.length > 0;
          if (!occupied && ["occupied", "limpia_ocupada", "no_molestar"].includes(status))
            fail("No hay una estadía ingresada. Esta corrección no registra un check-in.");
          const finalStatus =
            occupied && ["available", "inspected"].includes(status)
              ? "limpia_ocupada"
              : occupied && status === "dirty" ? "occupied" : status;
          if (
            ["available", "inspected", "limpia_ocupada"].includes(finalStatus)
          ) {
            const active = await db.execute(
              sql`SELECT id FROM housekeeping_tasks WHERE room_id=${before.id} AND status='in_progress' LIMIT 1`,
            );
            if (active.rows.length)
              fail(
                "Hay una tarea en curso. Finalizala para registrar el tiempo y la limpieza.",
              );
          }
          const room = await storage.updateRoom(before.id, {
            status: finalStatus,
          });
          await audit(req, before.id, "room_status", {
            before: before.status,
            after: finalStatus,
            reason: reason.data,
          });
          return room;
        });
        res.json(saved);
      } catch (e) {
        error(res, e);
      }
    },
  );
  for (const action of ["start", "complete", "inspect"] as const)
    app.post(`/api/housekeeping/:id/${action}`, ...access, async (req, res) => {
      try {
        if (action === "inspect" && !supervisor(req))
          fail("La verificación corresponde a supervisión.", 403);
        const saved = await withDatabaseTransaction(async () => {
          const { task, room } = await lockTask(req, req.params.id);
          if (
            task.scheduled_date > getArgentinaToday() ||
            (action === "start" && task.scheduled_date !== getArgentinaToday())
          )
            fail(
              "Sólo se inician tareas de hoy. Las tareas futuras no se ejecutan.",
            );
          const wanted = {
            start: "in_progress",
            complete: "completed",
            inspect: "inspected",
          }[action];
          if (task.status === wanted)
            return storage.getHousekeepingTask(task.id);
          const previous = {
            start: "pending",
            complete: "in_progress",
            inspect: "completed",
          }[action];
          if (task.status !== previous)
            fail("La tarea cambió de estado. Actualizá la lista.");
          if (["maintenance", "oos"].includes(room.status))
            fail(
              "La habitación está bloqueada. Revisá el bloqueo antes de continuar.",
            );
          if (action === "inspect") {
            const active = await db.execute(
              sql`SELECT id FROM housekeeping_tasks WHERE room_id=${room.id} AND status='in_progress' LIMIT 1`,
            );
            if (active.rows.length)
              fail(
                "Hay otra tarea en curso. Verificá la habitación al finalizarla.",
              );
          }
          if (action === "start") {
            if (room.status === "no_molestar")
              fail(
                "La habitación tiene No molestar. Consultá con supervisión.",
              );
            const active = await db.execute(
              sql`SELECT id FROM housekeeping_tasks WHERE room_id=${room.id} AND status='in_progress' AND id<>${task.id} LIMIT 1`,
            );
            if (active.rows.length)
              fail("Ya hay otra tarea en curso en esta habitación.");
          }
          const patch: any = { status: wanted };
          if (action === "start") patch.startedAt = new Date();
          if (action === "complete") patch.completedAt = new Date();
          if (action === "inspect") {
            patch.inspectedAt = new Date();
            patch.inspectedBy = req.user!.id;
          }
          const updated = await storage.updateHousekeepingTask(task.id, patch);
          if (cleanTask(task.task_type) && room.status !== "no_molestar") {
            const occupied =
              (
                await db.execute(
                  sql`SELECT id FROM reservations WHERE room_id=${room.id} AND status='checked_in' LIMIT 1`,
                )
              ).rows.length > 0;
            // Verifying yesterday's work must not renew today's occupied-room service.
            if (action !== "inspect" || !occupied || room.housekeeping_service_date === getArgentinaToday())
            await storage.updateRoom(room.id, {
              status:
                action === "start"
                  ? "cleaning"
                  : occupied
                    ? "limpia_ocupada"
                    : action === "inspect"
                      ? "inspected"
                      : "available",
            });
          }
          await audit(req, task.id, action, { before: task, after: updated });
          return updated;
        });
        res.json(saved);
      } catch (e) {
        error(res, e);
      }
    });
}

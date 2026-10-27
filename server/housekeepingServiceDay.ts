import { sql } from "drizzle-orm";
import { db, withDatabaseTransaction } from "./db";

export function housekeepingServiceDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// Run independently of night-audit: manual reports must never reset a service day.
// UPDATE's predicate is rechecked after row locks, including a concurrent cleaning.
export async function renewOccupiedHousekeepingDay(now = new Date()) {
  const today = housekeepingServiceDay(now);
  return withDatabaseTransaction(async () => {
    const changed = await db.execute(sql`UPDATE rooms AS r SET status='occupied'
      WHERE r.status='limpia_ocupada' AND r.housekeeping_service_date < ${today}
      AND r.is_active=true AND r.is_virtual=false AND r.room_number<>'REUB'
      AND EXISTS(SELECT 1 FROM reservations b WHERE b.room_id=r.id AND b.status='checked_in')
      AND NOT EXISTS(SELECT 1 FROM housekeeping_tasks t WHERE t.room_id=r.id AND t.status='in_progress')
      RETURNING r.id,r.room_number,r.housekeeping_service_date`);
    for (const row of changed.rows as any[]) {
      await db.execute(sql`INSERT INTO audit_logs(user_name,action,module,entity_type,entity_id,description,details,timestamp)
        VALUES ('Sistema','daily_service_pending','housekeeping','room',${row.id},'Nueva jornada: habitación ocupada con limpieza pendiente',${JSON.stringify({ serviceDay: today, lastServiceDay: row.housekeeping_service_date, before: "limpia_ocupada", after: "occupied" })},NOW())`);
    }
    return changed.rows.length;
  });
}

export function setupHousekeepingServiceDayScheduler() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await renewOccupiedHousekeepingDay();
    } catch (e) {
      console.error(
        "[housekeeping] No se pudo renovar la jornada de limpieza",
        e instanceof Error ? e.message : "error",
      );
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), 60_000);
  timer.unref();
  return () => clearInterval(timer);
}

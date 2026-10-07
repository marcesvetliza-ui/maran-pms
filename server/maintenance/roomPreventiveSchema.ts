import { db } from "../db";
import { sql } from "drizzle-orm";

// Migración aditiva: la preventiva principal sigue siendo una sola fila.
export async function ensureRoomPreventiveSchema() {
  await db.execute(sql`ALTER TABLE preventive_tasks ADD COLUMN IF NOT EXISTS room_interval_months integer NOT NULL DEFAULT 1 CHECK (room_interval_months IN (1, 2, 3, 6, 12))`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS preventive_room_slots (
      task_id varchar NOT NULL REFERENCES preventive_tasks(id) ON DELETE RESTRICT,
      room_id varchar NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (task_id, room_id)
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS preventive_room_completions (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id varchar NOT NULL,
      room_id varchar NOT NULL,
      period date NOT NULL,
      performed_at date NOT NULL,
      performed_by varchar,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (task_id, room_id, period),
      FOREIGN KEY (task_id, room_id) REFERENCES preventive_room_slots(task_id, room_id) ON DELETE RESTRICT
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS preventive_room_completions_room_date_idx ON preventive_room_completions (task_id, room_id, performed_at DESC)`);
}

export function calendarMonth(date: string) {
  return `${date.slice(0, 7)}-01`;
}

export function calendarMonthEnd(date: string, next = false) {
  const [year, month] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month + (next ? 1 : 0), 0)).toISOString().slice(0, 10);
}

export const roomIntervals = [1, 2, 3, 6, 12] as const;

export function calendarPeriod(date: string, months = 1, next = false) {
  const [year, month] = date.split("-").map(Number);
  const startMonth = Math.floor((month - 1) / months) * months + (next ? months : 0);
  return {
    start: new Date(Date.UTC(year, startMonth, 1)).toISOString().slice(0, 10),
    end: new Date(Date.UTC(year, startMonth + months, 0)).toISOString().slice(0, 10),
  };
}

// EXISTS counts each room once even after changing to a longer interval.
export function completedInPeriod(taskId: any, roomId: any, today: string, months: any) {
  return sql`EXISTS (SELECT 1 FROM preventive_room_completions c
    WHERE c.task_id = ${taskId} AND c.room_id = ${roomId}
    AND c.performed_at >= make_date(extract(year from ${today}::date)::int,
      (floor((extract(month from ${today}::date)::int - 1) / ${months}::numeric) * ${months} + 1)::int, 1)
    AND c.performed_at <= ${today}::date)`;
}

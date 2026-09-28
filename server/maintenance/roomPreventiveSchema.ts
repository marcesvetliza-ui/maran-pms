import { db } from "../db";
import { sql } from "drizzle-orm";

// Migración aditiva: la preventiva principal sigue siendo una sola fila.
export async function ensureRoomPreventiveSchema() {
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

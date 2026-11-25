import { sql } from "drizzle-orm";
import { db } from "./db";

export class BookingSalesDisabledError extends Error {
  statusCode = 503;
  response = { code: "BOOKING_SALES_DISABLED", error: "Las reservas online todavía no están habilitadas. Comunicate con el hotel para reservar." };
  constructor() { super("Las reservas online no están habilitadas"); }
}

// Deliberately no activation endpoint or UI switch. Configuration, selected
// plans, migrations and OTA settings cannot enable public sales.
export async function bookingSalesEnabled(lock = false): Promise<boolean> {
  const result = await db.execute(lock
    ? sql`SELECT enabled FROM booking_engine_sales WHERE singleton=true FOR SHARE`
    : sql`SELECT enabled FROM booking_engine_sales WHERE singleton=true`);
  return result.rows[0]?.enabled === true;
}

export async function assertBookingSalesEnabled(lock = false) {
  if (!await bookingSalesEnabled(lock)) throw new BookingSalesDisabledError();
}

import type { Express, Request, Response } from "express";
import { and, asc, eq, lt } from "drizzle-orm";
import { db } from "../db";
import { getArgentinaToday } from "../db-storage";
import { insertReservationWaitlistSchema, reservationWaitlist } from "@shared/schema";
import { requireAuth } from "../auth";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function cleanOptional(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parseWaitlistPayload(body: any, existing?: typeof reservationWaitlist.$inferSelect) {
  const firstName = typeof body.firstName === "string" ? body.firstName.trim() : existing?.firstName || "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim() : existing?.lastName || "";
  const checkInDate = typeof body.checkInDate === "string" ? body.checkInDate : existing?.checkInDate || "";
  const checkOutDate = typeof body.checkOutDate === "string" ? body.checkOutDate : existing?.checkOutDate || "";
  const numberOfGuests = body.numberOfGuests === undefined
    ? existing?.numberOfGuests ?? 1
    : Number(body.numberOfGuests);
  const data = {
    firstName,
    lastName,
    checkInDate,
    checkOutDate,
    phone: body.phone === undefined ? existing?.phone ?? null : cleanOptional(body.phone),
    numberOfGuests,
    notes: body.notes === undefined ? existing?.notes ?? null : cleanOptional(body.notes),
  };

  if (!data.firstName || !data.lastName) {
    return { error: "El nombre y el apellido son obligatorios." as const };
  }
  if (!DATE_PATTERN.test(data.checkInDate) || !DATE_PATTERN.test(data.checkOutDate)) {
    return { error: "Las fechas de ingreso y salida son obligatorias y deben ser válidas." as const };
  }
  if (data.checkOutDate <= data.checkInDate) {
    return { error: "La fecha de salida debe ser posterior a la fecha de ingreso." as const };
  }
  if (!Number.isInteger(data.numberOfGuests) || data.numberOfGuests < 1 || data.numberOfGuests > 99) {
    return { error: "La cantidad de personas debe ser un número entero entre 1 y 99." as const };
  }

  const parsed = insertReservationWaitlistSchema.safeParse(data);
  return parsed.success ? { data: parsed.data } : { error: "Los datos de la lista de espera no son válidos." as const };
}

async function removeExpiredWaitlistEntries(): Promise<void> {
  await db.delete(reservationWaitlist).where(lt(reservationWaitlist.checkOutDate, getArgentinaToday()));
}

function handleError(res: Response, error: unknown, fallback: string) {
  console.error(`[reservation-waitlist] ${fallback}:`, error);
  return res.status(500).json({ error: fallback });
}

export function registerReservationWaitlistRoutes(app: Express) {
  app.get("/api/reservation-waitlist", requireAuth, async (_req, res) => {
    try {
      await removeExpiredWaitlistEntries();
      const rows = await db.select().from(reservationWaitlist)
        .orderBy(asc(reservationWaitlist.checkInDate), asc(reservationWaitlist.createdAt));
      res.json(rows);
    } catch (error) {
      return handleError(res, error, "No se pudo cargar la lista de espera.");
    }
  });

  app.post("/api/reservation-waitlist", requireAuth, async (req, res) => {
    try {
      const parsed = parseWaitlistPayload(req.body);
      if ("error" in parsed) return res.status(400).json({ error: parsed.error });
      const [created] = await db.insert(reservationWaitlist).values(parsed.data).returning();
      res.status(201).json(created);
    } catch (error) {
      return handleError(res, error, "No se pudo guardar la consulta.");
    }
  });

  app.patch("/api/reservation-waitlist/:id", requireAuth, async (req, res) => {
    try {
      const [existing] = await db.select().from(reservationWaitlist)
        .where(eq(reservationWaitlist.id, req.params.id)).limit(1);
      if (!existing) return res.status(404).json({ error: "La consulta de espera no existe." });
      const parsed = parseWaitlistPayload(req.body, existing);
      if ("error" in parsed) return res.status(400).json({ error: parsed.error });
      const [updated] = await db.update(reservationWaitlist)
        .set(parsed.data)
        .where(eq(reservationWaitlist.id, req.params.id))
        .returning();
      res.json(updated);
    } catch (error) {
      return handleError(res, error, "No se pudo actualizar la consulta.");
    }
  });

  app.delete("/api/reservation-waitlist/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await db.delete(reservationWaitlist)
        .where(eq(reservationWaitlist.id, req.params.id))
        .returning({ id: reservationWaitlist.id });
      if (deleted.length === 0) return res.status(404).json({ error: "La consulta de espera no existe." });
      res.json({ success: true });
    } catch (error) {
      return handleError(res, error, "No se pudo eliminar la consulta.");
    }
  });
}
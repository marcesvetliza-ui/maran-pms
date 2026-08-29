import type { Express } from "express";
import { storage } from "../db-storage";
import { db, pool } from "../db";
import {
  spaPayments,
  spaProfessionals,
  spaClients,
  inventoryItems,
  guests,
  salesInvoices,
  spaAccounts,
  spaAccountItems,
  spaAppointments,
  spaTreatments,
  spaTreatmentResources,
  spaAppointmentResources,
  spaCabins,
  reservations,
  charges,
  cashMovements,
  folios,
} from "@shared/schema";
import { requireAuth, requireRole } from "../auth";
import { eq, desc, inArray, and, sql } from "drizzle-orm";
import { folioMovements } from "@shared/schema";
import { generateConfirmacionTurnoSpaPdf, generateSpaAccountReceiptPdf } from "../spaPdfs";
import { emitirFactura } from "../billing/invoiceService";
import { sendEmailWithPdfAttachment } from "../email-service";

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

type SpaResourceBookingInput = {
  templateResourceId: string;
  cabinId: string;
  startTime: string;
};

type NormalizedSpaResourceBooking = SpaResourceBookingInput & {
  endTime: string;
  durationMinutes: number;
  sortOrder: number;
  cabinName: string;
};

const ACTIVE_SPA_STATUSES = ["pending", "confirmed", "in_progress"] as const;
const ALL_SPA_STATUSES = ["pending", "confirmed", "in_progress", "completed", "cancelled", "no_show"] as const;
const SPA_OPEN_MINUTES = 8 * 60;
const SPA_CLOSE_MINUTES = 22 * 60;
const SPA_ACCESS_ROLES = ["admin", "manager", "ama_de_llaves", "spa", "reception", "jefe_recepcion", "comercial"] as [string, ...string[]];
const SPA_DIRECT_PAYMENT_METHODS = ["cash", "debit_card", "credit_card", "transfer", "mercadopago"] as const;
const INVOICE_TO_SPA_PAYMENT_METHOD: Record<string, string> = {
  efectivo: "cash",
  tarjeta_debito: "debit_card",
  tarjeta_credito: "credit_card",
  transferencia: "transfer",
  mercadopago: "mercadopago",
  cuenta_corriente: "cuenta_corriente",
};

async function withSpaInvoiceAuthorizationLock<T>(accountId: string, action: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  const lockKey = `spa-invoice:${accountId}`;
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [lockKey]);
    return await action();
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]).catch(() => undefined);
    client.release();
  }
}

function isValidSpaTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutesPart = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutesPart) || hours > 23 || minutesPart > 59) return false;
  const minutes = hours * 60 + minutesPart;
  return minutes >= SPA_OPEN_MINUTES && minutes <= SPA_CLOSE_MINUTES;
}

function isValidSpaDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function isValidSpaStatus(value: unknown): value is typeof ALL_SPA_STATUSES[number] {
  return typeof value === "string" && (ALL_SPA_STATUSES as readonly string[]).includes(value);
}

function assertNoInternalSpaResourceOverlap(
  bookings: Array<{ cabinId: string; startTime: string; endTime: string; label: string }>,
) {
  for (let i = 0; i < bookings.length; i++) {
    for (let j = i + 1; j < bookings.length; j++) {
      const current = bookings[i];
      const other = bookings[j];
      if (
        current.cabinId === other.cabinId
        && current.startTime < other.endTime
        && current.endTime > other.startTime
      ) {
        throw Object.assign(
          new Error(`El recurso ${current.label} quedó reservado en horarios superpuestos dentro del mismo circuito.`),
          { statusCode: 409 },
        );
      }
    }
  }
}

async function normalizeSpaResourceBookings(
  tx: any,
  treatmentId: string,
  rawBookings: unknown,
): Promise<NormalizedSpaResourceBooking[]> {
  const templates = await tx
    .select()
    .from(spaTreatmentResources)
    .where(eq(spaTreatmentResources.treatmentId, treatmentId))
    .orderBy(spaTreatmentResources.sortOrder);

  if (templates.length === 0) return [];
  if (!Array.isArray(rawBookings)) {
    throw Object.assign(new Error("Este circuito requiere seleccionar los recursos y horarios incluidos."), { statusCode: 400 });
  }

  const inputs = rawBookings as SpaResourceBookingInput[];
  if (inputs.length !== templates.length) {
    throw Object.assign(new Error("Debés completar todos los recursos configurados para el circuito."), { statusCode: 400 });
  }

  const templateMap = new Map<string, any>(templates.map((template: any) => [template.id, template]));
  const usedTemplateIds = new Set<string>();
  const cabinIds = [...new Set(inputs.map((input) => input?.cabinId).filter(Boolean))];
  const resourceCabins = cabinIds.length > 0
    ? await tx.select().from(spaCabins).where(inArray(spaCabins.id, cabinIds))
    : [];
  const cabinMap = new Map<string, any>(resourceCabins.map((cabin: any) => [cabin.id, cabin]));

  return inputs.map((input) => {
    const template = templateMap.get(input?.templateResourceId);
    if (!template || usedTemplateIds.has(template.id)) {
      throw Object.assign(new Error("La configuración de recursos del circuito no es válida."), { statusCode: 400 });
    }
    usedTemplateIds.add(template.id);

    const cabin = cabinMap.get(input.cabinId);
    if (!cabin || cabin.isActive !== "true" || !cabin.resourceType) {
      throw Object.assign(new Error("El recurso seleccionado no está disponible para circuitos."), { statusCode: 400 });
    }
    if (!isValidSpaTime(input.startTime)) {
      throw Object.assign(new Error(`El horario seleccionado para ${cabin.name} no es válido.`), { statusCode: 400 });
    }

    const startMinutes = timeToMinutes(input.startTime);
    const endMinutes = startMinutes + Number(template.durationMinutes);
    if (endMinutes > SPA_CLOSE_MINUTES) {
      throw Object.assign(new Error(`${cabin.name} debe finalizar antes de las 22:00.`), { statusCode: 400 });
    }

    return {
      templateResourceId: template.id,
      cabinId: cabin.id,
      startTime: input.startTime,
      endTime: minutesToTime(endMinutes),
      durationMinutes: Number(template.durationMinutes),
      sortOrder: Number(template.sortOrder),
      cabinName: cabin.name,
    };
  });
}

async function lockAndAssertSpaAvailability(
  tx: any,
  appointmentDate: string,
  bookings: Array<{ cabinId: string; startTime: string; endTime: string; label: string }>,
  excludeAppointmentId?: string,
) {
  assertNoInternalSpaResourceOverlap(bookings);
  const cabinIds = [...new Set(bookings.map((booking) => booking.cabinId))].sort();

  // Serialize reservations per date/cabin. The final conflict query still runs
  // inside the transaction, closing the race between availability and insert.
  for (const cabinId of cabinIds) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"spa:" + appointmentDate + ":" + cabinId}))`);
  }

  const excludedId = excludeAppointmentId ?? "";
  for (const booking of bookings) {
    const conflict = await tx.execute(sql`
      SELECT occupied.guest_name, occupied.start_time, occupied.end_time
      FROM (
        SELECT a.id AS appointment_id, a.guest_name, a.start_time, a.end_time
        FROM spa_appointments a
        WHERE a.cabin_id = ${booking.cabinId}
          AND a.appointment_date = ${appointmentDate}
          AND a.status IN ('pending', 'confirmed', 'in_progress')
          AND a.id <> ${excludedId}

        UNION ALL

        SELECT a.id AS appointment_id, a.guest_name, r.start_time, r.end_time
        FROM spa_appointment_resources r
        INNER JOIN spa_appointments a ON a.id = r.appointment_id
        WHERE r.cabin_id = ${booking.cabinId}
          AND a.appointment_date = ${appointmentDate}
          AND a.status IN ('pending', 'confirmed', 'in_progress')
          AND a.id <> ${excludedId}
      ) occupied
      WHERE ${booking.startTime} < occupied.end_time
        AND ${booking.endTime} > occupied.start_time
      LIMIT 1
    `);

    if (conflict.rows.length > 0) {
      const row = conflict.rows[0] as any;
      throw Object.assign(
        new Error(`${booking.label} ya está reservado de ${row.start_time} a ${row.end_time} para ${row.guest_name}.`),
        { statusCode: 409 },
      );
    }
  }
}

export function registerSpaRoutes(app: Express) {
  // SPA Cabins
  app.get("/api/spa/cabins", requireAuth, async (req, res) => {
    try {
      const cabins = await storage.getSpaCabins();
      res.json(cabins);
    } catch (error) {
      res.status(500).json({ error: "Error fetching spa cabins" });
    }
  });

  app.get("/api/spa/cabins/:id", requireAuth, async (req, res) => {
    try {
      const cabin = await storage.getSpaCabin(req.params.id);
      if (!cabin) return res.status(404).json({ error: "Cabin not found" });
      res.json(cabin);
    } catch (error) {
      res.status(500).json({ error: "Error fetching spa cabin" });
    }
  });

  app.post("/api/spa/cabins", requireAuth, async (req, res) => {
    try {
      const cabin = await storage.createSpaCabin(req.body);
      res.status(201).json(cabin);
    } catch (error) {
      res.status(500).json({ error: "Error creating spa cabin" });
    }
  });

  app.patch("/api/spa/cabins/:id", requireAuth, async (req, res) => {
    try {
      const cabin = await storage.updateSpaCabin(req.params.id, req.body);
      if (!cabin) return res.status(404).json({ error: "Cabin not found" });
      res.json(cabin);
    } catch (error) {
      res.status(500).json({ error: "Error updating spa cabin" });
    }
  });

  app.delete("/api/spa/cabins/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteSpaCabin(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting spa cabin" });
    }
  });

  // SPA Treatment Categories
  app.get("/api/spa/treatment-categories", requireAuth, async (req, res) => {
    try {
      const categories = await storage.getSpaTreatmentCategories();
      res.json(categories);
    } catch (error) {
      res.status(500).json({ error: "Error fetching treatment categories" });
    }
  });

  app.get("/api/spa/treatment-categories/:id", requireAuth, async (req, res) => {
    try {
      const category = await storage.getSpaTreatmentCategory(req.params.id);
      if (!category) return res.status(404).json({ error: "Category not found" });
      res.json(category);
    } catch (error) {
      res.status(500).json({ error: "Error fetching treatment category" });
    }
  });

  app.post("/api/spa/treatment-categories", requireAuth, async (req, res) => {
    try {
      const category = await storage.createSpaTreatmentCategory(req.body);
      res.status(201).json(category);
    } catch (error) {
      res.status(500).json({ error: "Error creating treatment category" });
    }
  });

  app.patch("/api/spa/treatment-categories/:id", requireAuth, async (req, res) => {
    try {
      const category = await storage.updateSpaTreatmentCategory(req.params.id, req.body);
      if (!category) return res.status(404).json({ error: "Category not found" });
      res.json(category);
    } catch (error) {
      res.status(500).json({ error: "Error updating treatment category" });
    }
  });

  app.delete("/api/spa/treatment-categories/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteSpaTreatmentCategory(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting treatment category" });
    }
  });

  // SPA Treatments
  app.get("/api/spa/treatments", requireAuth, async (req, res) => {
    try {
      const treatments = await storage.getSpaTreatments();
      res.json(treatments);
    } catch (error) {
      res.status(500).json({ error: "Error fetching treatments" });
    }
  });

  app.get("/api/spa/treatments/:id", requireAuth, async (req, res) => {
    try {
      const treatment = await storage.getSpaTreatment(req.params.id);
      if (!treatment) return res.status(404).json({ error: "Treatment not found" });
      res.json(treatment);
    } catch (error) {
      res.status(500).json({ error: "Error fetching treatment" });
    }
  });

  app.get("/api/spa/treatments/by-category/:categoryId", requireAuth, async (req, res) => {
    try {
      const treatments = await storage.getSpaTreatmentsByCategory(req.params.categoryId);
      res.json(treatments);
    } catch (error) {
      res.status(500).json({ error: "Error fetching treatments by category" });
    }
  });

  app.post("/api/spa/treatments", requireAuth, async (req, res) => {
    try {
      const treatment = await storage.createSpaTreatment(req.body);
      res.status(201).json(treatment);
    } catch (error) {
      res.status(500).json({ error: "Error creating treatment" });
    }
  });

  app.patch("/api/spa/treatments/:id", requireAuth, async (req, res) => {
    try {
      const treatment = await storage.updateSpaTreatment(req.params.id, req.body);
      if (!treatment) return res.status(404).json({ error: "Treatment not found" });
      res.json(treatment);
    } catch (error) {
      res.status(500).json({ error: "Error updating treatment" });
    }
  });

  app.delete("/api/spa/treatments/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteSpaTreatment(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting treatment" });
    }
  });

  // Circuit resource templates
  app.get("/api/spa/treatments/:id/resources", requireAuth, async (req, res) => {
    try {
      const resources = await db
        .select({
          id: spaTreatmentResources.id,
          treatmentId: spaTreatmentResources.treatmentId,
          defaultCabinId: spaTreatmentResources.defaultCabinId,
          durationMinutes: spaTreatmentResources.durationMinutes,
          sortOrder: spaTreatmentResources.sortOrder,
          cabinName: spaCabins.name,
          cabinResourceType: spaCabins.resourceType,
        })
        .from(spaTreatmentResources)
        .leftJoin(spaCabins, eq(spaCabins.id, spaTreatmentResources.defaultCabinId))
        .where(eq(spaTreatmentResources.treatmentId, req.params.id))
        .orderBy(spaTreatmentResources.sortOrder);
      res.json(resources);
    } catch (error) {
      res.status(500).json({ error: "Error fetching circuit resources" });
    }
  });

  app.put("/api/spa/treatments/:id/resources", requireAuth, async (req, res) => {
    try {
      const rawResources = Array.isArray(req.body?.resources) ? req.body.resources : [];
      if (rawResources.length > 6) {
        return res.status(400).json({ error: "Un circuito no puede tener más de 6 recursos configurados" });
      }

      const cabinIds = [...new Set(rawResources.map((row: any) => row?.defaultCabinId).filter(Boolean))] as string[];
      const cabins = cabinIds.length > 0
        ? await db.select().from(spaCabins).where(inArray(spaCabins.id, cabinIds))
        : [];
      const cabinMap = new Map(cabins.map((cabin) => [cabin.id, cabin]));

      const normalized = rawResources.map((row: any, index: number) => {
        const cabin = cabinMap.get(row?.defaultCabinId);
        const durationMinutes = Number(row?.durationMinutes);
        if (!cabin || cabin.isActive !== "true" || !cabin.resourceType) {
          throw Object.assign(new Error("Seleccioná un recurso SPA activo (Sauna o Hidromasaje)."), { statusCode: 400 });
        }
        if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 240) {
          throw Object.assign(new Error("La duración de cada recurso debe estar entre 15 y 240 minutos."), { statusCode: 400 });
        }
        return {
          treatmentId: req.params.id,
          defaultCabinId: cabin.id,
          durationMinutes,
          sortOrder: index,
        };
      });

      const saved = await db.transaction(async (tx) => {
        const [treatment] = await tx.select().from(spaTreatments).where(eq(spaTreatments.id, req.params.id));
        if (!treatment) {
          throw Object.assign(new Error("Tratamiento no encontrado"), { statusCode: 404 });
        }
        if (!treatment.isCircuit) {
          throw Object.assign(new Error("Sólo los circuitos pueden tener recursos adicionales."), { statusCode: 400 });
        }
        await tx.delete(spaTreatmentResources).where(eq(spaTreatmentResources.treatmentId, req.params.id));
        if (normalized.length === 0) return [];
        return tx.insert(spaTreatmentResources).values(normalized).returning();
      });

      res.json(saved);
    } catch (error: any) {
      res.status(error?.statusCode || 500).json({ error: error?.message || "Error saving circuit resources" });
    }
  });

  app.get("/api/spa/resource-availability", requireAuth, async (req, res) => {
    try {
      const appointmentDate = String(req.query.date || "");
      const cabinId = String(req.query.cabinId || "");
      const durationMinutes = Number(req.query.durationMinutes);
      const excludeAppointmentId = String(req.query.excludeAppointmentId || "");

      if (!isValidSpaDate(appointmentDate) || !cabinId) {
        return res.status(400).json({ error: "Fecha y recurso son requeridos" });
      }
      if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 240) {
        return res.status(400).json({ error: "Duración inválida" });
      }

      const [cabin] = await db.select().from(spaCabins).where(eq(spaCabins.id, cabinId));
      if (!cabin || cabin.isActive !== "true" || !cabin.resourceType) {
        return res.status(400).json({ error: "Recurso SPA inválido" });
      }

      const occupiedResult = await db.execute(sql`
        SELECT occupied.start_time, occupied.end_time
        FROM (
          SELECT a.start_time, a.end_time
          FROM spa_appointments a
          WHERE a.cabin_id = ${cabinId}
            AND a.appointment_date = ${appointmentDate}
            AND a.status IN ('pending', 'confirmed', 'in_progress')
            AND a.id <> ${excludeAppointmentId}

          UNION ALL

          SELECT r.start_time, r.end_time
          FROM spa_appointment_resources r
          INNER JOIN spa_appointments a ON a.id = r.appointment_id
          WHERE r.cabin_id = ${cabinId}
            AND a.appointment_date = ${appointmentDate}
            AND a.status IN ('pending', 'confirmed', 'in_progress')
            AND a.id <> ${excludeAppointmentId}
        ) occupied
        ORDER BY occupied.start_time
      `);
      const occupied = occupiedResult.rows as Array<{ start_time: string; end_time: string }>;
      const slots: string[] = [];
      for (let start = SPA_OPEN_MINUTES; start + durationMinutes <= SPA_CLOSE_MINUTES; start += 30) {
        const startTime = minutesToTime(start);
        const endTime = minutesToTime(start + durationMinutes);
        const overlaps = occupied.some((entry) => startTime < entry.end_time && endTime > entry.start_time);
        if (!overlaps) slots.push(startTime);
      }

      res.json({ cabinId, date: appointmentDate, durationMinutes, slots });
    } catch (error) {
      res.status(500).json({ error: "Error fetching resource availability" });
    }
  });

  // SPA Appointments
  app.get("/api/spa/appointments", requireAuth, async (req, res) => {
    try {
      const date = req.query.date as string | undefined;
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;

      if (startDate && endDate) {
        const appointments = await storage.getSpaAppointmentsByDateRange(startDate, endDate);
        // Enrich with account billing status (invoiceId / ncId) so the agenda
        // card can show an NC badge without a per-card API call.
        if (appointments.length > 0) {
          const aptIds = appointments.map((a) => a.id);
          const accounts = await db
            .select({
              appointmentId: spaAccounts.appointmentId,
              invoiceId: spaAccounts.invoiceId,
              ncId: spaAccounts.ncId,
            })
            .from(spaAccounts)
            .where(inArray(spaAccounts.appointmentId, aptIds));
          const accountMap = new Map(accounts.map((acc) => [acc.appointmentId, acc]));
          const enriched = appointments.map((a) => {
            const acc = accountMap.get(a.id);
            return acc ? { ...a, invoiceId: acc.invoiceId, ncId: acc.ncId } : a;
          });
          return res.json(enriched);
        }
        return res.json(appointments);
      }

      const appointments = await storage.getSpaAppointments(date);
      res.json(appointments);
    } catch (error) {
      res.status(500).json({ error: "Error fetching appointments" });
    }
  });

  app.get("/api/spa/appointments/weekly-summary", requireAuth, async (req, res) => {
    try {
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      if (!startDate || !endDate) {
        return res.status(400).json({ error: "startDate and endDate are required" });
      }
      const appointments = await storage.getSpaAppointmentsByDateRange(startDate, endDate);
      const activeStatuses = ["pending", "confirmed", "in_progress"];
      const summaryMap = new Map<string, { cabinId: string; date: string; count: number; invoicedCount: number; ncCount: number }>();

      // Enrich with billing status from accounts for all appointments in range
      let accountMap = new Map<string, { invoiceId: number | null; ncId: number | null }>();
      if (appointments.length > 0) {
        const aptIds = appointments.map((a) => a.id);
        const accounts = await db
          .select({ appointmentId: spaAccounts.appointmentId, invoiceId: spaAccounts.invoiceId, ncId: spaAccounts.ncId })
          .from(spaAccounts)
          .where(inArray(spaAccounts.appointmentId, aptIds));
        accountMap = new Map(accounts.map((acc) => [acc.appointmentId, acc]));
      }

      for (const apt of appointments) {
        const acc = accountMap.get(apt.id);
        const occupiedCabinIds = [...new Set([
          apt.cabinId,
          ...(apt.resourceReservations ?? []).map((resource) => resource.cabinId),
        ])];
        for (const cabinId of occupiedCabinIds) {
          const key = `${cabinId}_${apt.appointmentDate}`;
          if (!summaryMap.has(key)) {
            summaryMap.set(key, { cabinId, date: apt.appointmentDate, count: 0, invoicedCount: 0, ncCount: 0 });
          }
          const cell = summaryMap.get(key)!;
          if (activeStatuses.includes(apt.status)) {
            cell.count++;
          }
          if (acc?.ncId) {
            cell.ncCount++;
          } else if (acc?.invoiceId) {
            cell.invoicedCount++;
          }
        }
      }

      res.json(Array.from(summaryMap.values()));
    } catch (error) {
      res.status(500).json({ error: "Error fetching weekly summary" });
    }
  });

  app.get("/api/spa/appointments/:id", requireAuth, async (req, res) => {
    try {
      const appointment = await storage.getSpaAppointment(req.params.id);
      if (!appointment) return res.status(404).json({ error: "Appointment not found" });
      res.json(appointment);
    } catch (error) {
      res.status(500).json({ error: "Error fetching appointment" });
    }
  });

  app.post("/api/spa/appointments", requireAuth, requireRole(SPA_ACCESS_ROLES), async (req, res) => {
    try {
      const {
        cabinId,
        treatmentId,
        professionalId,
        guestId,
        guestName,
        guestLastName,
        guestPhone,
        guestEmail,
        reservationId,
        appointmentDate,
        startTime,
        endTime,
        status,
        notes,
        resourceReservations,
        settlement,
      } = req.body;

      if (!cabinId || !treatmentId || !guestName || !appointmentDate || !startTime || !endTime) {
        return res.status(400).json({ error: "cabinId, treatmentId, guestName, appointmentDate, startTime, and endTime are required" });
      }
      if (!isValidSpaDate(appointmentDate)) {
        return res.status(400).json({ error: "La fecha del turno no es válida" });
      }
      const appointmentStatus = status || "pending";
      if (!isValidSpaStatus(appointmentStatus)) {
        return res.status(400).json({ error: "El estado del turno no es válido" });
      }
      if (!isValidSpaTime(startTime) || !isValidSpaTime(endTime) || startTime >= endTime) {
        return res.status(400).json({ error: "El horario del turno no es válido" });
      }
      if (settlement !== undefined && !["room_charge", "voucher"].includes(settlement?.type)) {
        return res.status(400).json({ error: "La modalidad de cobro no es válida" });
      }
      if (settlement?.type === "room_charge" && !settlement.reservationId) {
        return res.status(400).json({ error: "Seleccione una habitación ocupada" });
      }
      if (
        settlement?.type === "voucher"
        && !(SPA_DIRECT_PAYMENT_METHODS as readonly string[]).includes(settlement.paymentMethod)
      ) {
        return res.status(400).json({ error: "Seleccione una forma de pago válida para el voucher" });
      }

      const voucherCashShift = settlement?.type === "voucher"
        ? await storage.getOrCreateActiveTurno("spa")
        : null;

      const appointment = await db.transaction(async (tx) => {
        const [treatment] = await tx.select().from(spaTreatments).where(eq(spaTreatments.id, treatmentId));
        if (!treatment) {
          throw Object.assign(new Error("Tratamiento no encontrado"), { statusCode: 400 });
        }
        const [mainCabin] = await tx.select().from(spaCabins).where(eq(spaCabins.id, cabinId));
        if (!mainCabin || mainCabin.isActive !== "true") {
          throw Object.assign(new Error("El gabinete principal no está disponible."), { statusCode: 400 });
        }
        if (!treatment.isCircuit && Array.isArray(resourceReservations) && resourceReservations.length > 0) {
          throw Object.assign(new Error("Los recursos adicionales sólo pueden reservarse para circuitos."), { statusCode: 400 });
        }

        const normalizedResources = treatment.isCircuit
          ? await normalizeSpaResourceBookings(tx, treatmentId, resourceReservations)
          : [];
        await lockAndAssertSpaAvailability(tx, appointmentDate, [
          { cabinId, startTime, endTime, label: mainCabin.name },
          ...normalizedResources.map((resource) => ({
            cabinId: resource.cabinId,
            startTime: resource.startTime,
            endTime: resource.endTime,
            label: resource.cabinName,
          })),
        ]);

        const [createdAppointment] = await tx.insert(spaAppointments).values({
          cabinId,
          treatmentId,
          professionalId: professionalId || null,
          guestId: guestId || null,
          guestName,
          guestLastName: guestLastName || null,
          guestPhone: guestPhone || null,
          guestEmail: guestEmail || null,
          reservationId: reservationId || null,
          appointmentDate,
          startTime,
          endTime,
          status: appointmentStatus,
          notes: notes || null,
          createdAt: new Date(),
        }).returning();

        const fullName = guestLastName ? `${guestName} ${guestLastName}` : guestName;
        const treatmentPrice = treatment.price || "0";
        const [account] = await tx.insert(spaAccounts).values({
          appointmentId: createdAppointment.id,
          guestName: fullName,
          reservationId: reservationId || null,
          status: "open",
          subtotal: treatmentPrice,
          total: treatmentPrice,
          notes: null,
          openedAt: new Date(),
          closedAt: null,
          closedBy: null,
          chargedTo: null,
        }).returning();

        const [accountItem] = await tx.insert(spaAccountItems).values({
          accountId: account.id,
          description: treatment.name,
          quantity: 1,
          unitPrice: treatmentPrice,
          subtotal: treatmentPrice,
          itemType: "treatment",
          notes: null,
          createdAt: new Date(),
        }).returning();
        const [spaFolio] = await tx.insert(folios).values({
          codigo: `SP-${account.id}`,
          entityType: "spa_account",
          entityId: account.id,
          status: "open",
          totalCharges: treatmentPrice,
          totalPayments: "0",
          balance: treatmentPrice,
        }).returning();
        await tx.insert(folioMovements).values({
          folioId: spaFolio.id,
          type: "charge",
          amount: treatmentPrice,
          description: treatment.name,
          sourceType: "spa_account_item",
          sourceId: accountItem.id,
          registeredBy: (req as any).user?.username || null,
        });

        if (normalizedResources.length > 0) {
          await tx.insert(spaAppointmentResources).values(normalizedResources.map((resource) => ({
            appointmentId: createdAppointment.id,
            cabinId: resource.cabinId,
            startTime: resource.startTime,
            endTime: resource.endTime,
            durationMinutes: resource.durationMinutes,
            sortOrder: resource.sortOrder,
          })));
        }

        let settlementPaymentId: string | null = null;
        let settlementCashMovementId: string | null = null;
        if (settlement?.type === "room_charge" || settlement?.type === "voucher") {
          const settlementReservationId = settlement.type === "room_charge" ? String(settlement.reservationId) : null;
          if (settlementReservationId) {
            await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"reservation-finance:" + settlementReservationId}))`);
            const lockedReservation = await tx.execute(sql`
              SELECT id, status
              FROM reservations
              WHERE id = ${settlementReservationId}
              FOR UPDATE
            `);
            const occupiedReservation = lockedReservation.rows[0] as { id: string; status: string } | undefined;
            if (!occupiedReservation || occupiedReservation.status !== "checked_in") {
              throw Object.assign(new Error("La habitación seleccionada ya no está ocupada."), { statusCode: 409 });
            }
          }

          const paymentMethod = settlement.type === "room_charge"
            ? "room_charge"
            : String(settlement.paymentMethod);
          const [payment] = await tx.insert(spaPayments).values({
            accountId: account.id,
            amount: treatmentPrice,
            method: paymentMethod as any,
            isAdvance: "false",
            appointmentId: createdAppointment.id,
            reservationId: settlementReservationId,
            notes: settlement.type === "room_charge"
              ? "Transferido al folio de habitación al crear el turno"
              : "Voucher SPA cobrado al crear el turno",
            createdAt: new Date(),
          }).returning();
          settlementPaymentId = payment.id;

          if (settlement.type === "room_charge" && settlementReservationId) {
            await tx.insert(charges).values({
              reservationId: settlementReservationId,
              category: "spa",
              description: `SPA - ${treatment.name}`,
              amount: treatmentPrice,
              date: new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }),
              createdBy: (req as any).user?.id || null,
            } as any);
          } else if (settlement.type === "voucher" && voucherCashShift) {
            const [cashMovement] = await tx.insert(cashMovements).values({
              shiftId: voucherCashShift.id,
              area: "spa",
              sourceType: "spa_account",
              sourceId: account.id,
              sourceLabel: `Voucher SPA — ${fullName}`,
              paymentMethod,
              amount: treatmentPrice,
              movementType: "income",
              receiptType: "cierre_spa",
              registeredBy: (req as any).user?.fullName || (req as any).user?.username || null,
              paymentId: payment.id,
            }).returning();
            settlementCashMovementId = cashMovement.id;
          }

          await tx.insert(folioMovements).values({
            folioId: spaFolio.id,
            type: "payment",
            amount: treatmentPrice,
            description: settlement.type === "room_charge" ? "SPA - Cargo a habitación" : "SPA - Voucher",
            sourceType: "spa_payment",
            sourceId: payment.id,
            paymentMethod,
            cashMovementId: settlementCashMovementId,
            registeredBy: (req as any).user?.username || null,
            receiptType: "cierre_spa",
          });
          await tx.update(folios).set({
            status: "closed",
            totalCharges: treatmentPrice,
            totalPayments: treatmentPrice,
            balance: "0.00",
            closedAt: new Date(),
            closedBy: (req as any).user?.username || null,
          }).where(eq(folios.id, spaFolio.id));

          await tx.update(spaAccounts).set({
            status: "closed",
            subtotal: treatmentPrice,
            total: treatmentPrice,
            totalPaid: treatmentPrice,
            receiptType: "cierre_spa",
            chargedTo: settlement.type === "room_charge" ? `room:${settlementReservationId}` : "direct",
            closedAt: new Date(),
            closedBy: (req as any).user?.fullName || (req as any).user?.username || null,
          }).where(eq(spaAccounts.id, account.id));
        }

        return {
          ...createdAppointment,
          accountId: account.id,
          accountItems: [{
            id: accountItem.id,
            description: accountItem.description,
            amount: accountItem.subtotal,
          }],
          settlementType: settlement?.type ?? null,
          settlementPaymentId,
          settlementCashMovementId,
        };
      });

      if (appointment.settlementPaymentId) {
        storage.deductStockFromSpaAccount(appointment.accountId).catch((error: any) =>
          console.warn("[SPA] Error deducting stock after initial settlement:", error)
        );
      }

      res.status(201).json(appointment);
    } catch (error: any) {
      console.error("[SPA] Error creating appointment:", error);
      const msg = error instanceof Error ? error.message : String(error);
      res.status(error?.statusCode || 500).json({ error: "Error creating appointment", detail: msg });
    }
  });

  app.patch("/api/spa/appointments/:id", requireAuth, async (req, res) => {
    try {
      if (req.body.status !== undefined && !isValidSpaStatus(req.body.status)) {
        return res.status(400).json({ error: "El estado del turno no es válido" });
      }
      const resourceReservationsProvided = Object.prototype.hasOwnProperty.call(req.body, "resourceReservations");
      const scheduleChanged = ["cabinId", "treatmentId", "appointmentDate", "startTime", "endTime"]
        .some((field) => req.body[field] !== undefined)
        || resourceReservationsProvided;

      const appointment = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM spa_appointments WHERE id = ${req.params.id} FOR UPDATE`);
        const [current] = await tx.select().from(spaAppointments).where(eq(spaAppointments.id, req.params.id));
        if (!current) {
          throw Object.assign(new Error("Turno no encontrado"), { statusCode: 404 });
        }

        const cabinId = req.body.cabinId ?? current.cabinId;
        const treatmentId = req.body.treatmentId ?? current.treatmentId;
        const appointmentDate = req.body.appointmentDate ?? current.appointmentDate;
        const startTime = req.body.startTime ?? current.startTime;
        const endTime = req.body.endTime ?? current.endTime;
        const status = req.body.status ?? current.status;
        const enteringActiveStatus = (ACTIVE_SPA_STATUSES as readonly string[]).includes(status)
          && !(ACTIVE_SPA_STATUSES as readonly string[]).includes(current.status);

        if (scheduleChanged || enteringActiveStatus) {
          if (!isValidSpaDate(appointmentDate)) {
            throw Object.assign(new Error("La fecha del turno no es válida"), { statusCode: 400 });
          }
          if (!isValidSpaTime(startTime) || !isValidSpaTime(endTime) || startTime >= endTime) {
            throw Object.assign(new Error("El horario del turno no es válido"), { statusCode: 400 });
          }

          const [treatment] = await tx.select().from(spaTreatments).where(eq(spaTreatments.id, treatmentId));
          const [mainCabin] = await tx.select().from(spaCabins).where(eq(spaCabins.id, cabinId));
          if (!treatment) {
            throw Object.assign(new Error("Tratamiento no encontrado"), { statusCode: 400 });
          }
          if (!mainCabin || mainCabin.isActive !== "true") {
            throw Object.assign(new Error("El gabinete principal no está disponible."), { statusCode: 400 });
          }

          let normalizedResources: NormalizedSpaResourceBooking[] = [];
          if (treatment.isCircuit && resourceReservationsProvided) {
            normalizedResources = await normalizeSpaResourceBookings(tx, treatmentId, req.body.resourceReservations);
          } else if (treatment.isCircuit && !resourceReservationsProvided && treatmentId === current.treatmentId) {
            const existingResources = await tx
              .select({
                id: spaAppointmentResources.id,
                cabinId: spaAppointmentResources.cabinId,
                startTime: spaAppointmentResources.startTime,
                endTime: spaAppointmentResources.endTime,
                durationMinutes: spaAppointmentResources.durationMinutes,
                sortOrder: spaAppointmentResources.sortOrder,
                cabinName: spaCabins.name,
              })
              .from(spaAppointmentResources)
              .leftJoin(spaCabins, eq(spaCabins.id, spaAppointmentResources.cabinId))
              .where(eq(spaAppointmentResources.appointmentId, current.id));
            normalizedResources = existingResources.map((resource) => ({
              templateResourceId: resource.id,
              cabinId: resource.cabinId,
              startTime: resource.startTime,
              endTime: resource.endTime,
              durationMinutes: resource.durationMinutes,
              sortOrder: resource.sortOrder,
              cabinName: resource.cabinName || "Recurso SPA",
            }));
          } else if (treatment.isCircuit) {
            normalizedResources = await normalizeSpaResourceBookings(tx, treatmentId, req.body.resourceReservations);
          }

          if ((ACTIVE_SPA_STATUSES as readonly string[]).includes(status)) {
            await lockAndAssertSpaAvailability(tx, appointmentDate, [
              { cabinId, startTime, endTime, label: mainCabin.name },
              ...normalizedResources.map((resource) => ({
                cabinId: resource.cabinId,
                startTime: resource.startTime,
                endTime: resource.endTime,
                label: resource.cabinName,
              })),
            ], current.id);
          }

          if (resourceReservationsProvided || treatmentId !== current.treatmentId) {
            await tx.delete(spaAppointmentResources).where(eq(spaAppointmentResources.appointmentId, current.id));
            if (normalizedResources.length > 0) {
              await tx.insert(spaAppointmentResources).values(normalizedResources.map((resource) => ({
                appointmentId: current.id,
                cabinId: resource.cabinId,
                startTime: resource.startTime,
                endTime: resource.endTime,
                durationMinutes: resource.durationMinutes,
                sortOrder: resource.sortOrder,
              })));
            }
          }
        }

        const allowedUpdates = {
          ...(req.body.cabinId !== undefined && { cabinId: req.body.cabinId }),
          ...(req.body.treatmentId !== undefined && { treatmentId: req.body.treatmentId }),
          ...(req.body.professionalId !== undefined && { professionalId: req.body.professionalId }),
          ...(req.body.guestId !== undefined && { guestId: req.body.guestId }),
          ...(req.body.guestName !== undefined && { guestName: req.body.guestName }),
          ...(req.body.guestLastName !== undefined && { guestLastName: req.body.guestLastName }),
          ...(req.body.guestPhone !== undefined && { guestPhone: req.body.guestPhone }),
          ...(req.body.guestEmail !== undefined && { guestEmail: req.body.guestEmail }),
          ...(req.body.reservationId !== undefined && { reservationId: req.body.reservationId }),
          ...(req.body.appointmentDate !== undefined && { appointmentDate: req.body.appointmentDate }),
          ...(req.body.startTime !== undefined && { startTime: req.body.startTime }),
          ...(req.body.endTime !== undefined && { endTime: req.body.endTime }),
          ...(req.body.status !== undefined && { status: req.body.status }),
          ...(req.body.notes !== undefined && { notes: req.body.notes }),
        };
        const [updated] = await tx
          .update(spaAppointments)
          .set(allowedUpdates)
          .where(eq(spaAppointments.id, current.id))
          .returning();
        return updated;
      });

      res.json(appointment);
    } catch (error: any) {
      res.status(error?.statusCode || 500).json({
        error: "Error updating appointment",
        message: error?.message || "Error al actualizar el turno",
      });
    }
  });

  app.delete("/api/spa/appointments/:id", requireAuth, async (req, res) => {
    try {
      await db.transaction(async (tx) => {
        await tx.delete(spaAppointmentResources).where(eq(spaAppointmentResources.appointmentId, req.params.id));
        await tx.delete(spaAppointments).where(eq(spaAppointments.id, req.params.id));
      });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting appointment" });
    }
  });

  // SPA Accounts
  app.get("/api/spa/accounts", requireAuth, async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const accounts = await storage.getSpaAccounts(status as "open" | "closed" | "cancelled" | undefined);
      res.json(accounts);
    } catch (error) {
      res.status(500).json({ error: "Error fetching spa accounts" });
    }
  });

  app.get("/api/spa/accounts/:id", requireAuth, async (req, res) => {
    try {
      const account = await storage.getSpaAccount(req.params.id);
      if (!account) return res.status(404).json({ error: "Account not found" });
      const [pendingInvoice] = account.status === "open"
        ? await db.select({
            id: salesInvoices.id,
            tipoComprobante: salesInvoices.tipoComprobante,
            puntoVenta: salesInvoices.puntoVenta,
            numero: salesInvoices.numero,
            montoTotal: salesInvoices.montoTotal,
            cashFormaPago: salesInvoices.cashFormaPago,
          })
            .from(salesInvoices)
            .where(and(
              eq(salesInvoices.spaAccountId, account.id),
              eq(salesInvoices.estado, "emitida"),
            ))
            .orderBy(desc(salesInvoices.createdAt))
            .limit(1)
        : [];
      const [pendingAuthorization] = account.status === "open"
        ? await db.select({
            id: salesInvoices.id,
            tipoComprobante: salesInvoices.tipoComprobante,
            puntoVenta: salesInvoices.puntoVenta,
            numero: salesInvoices.numero,
            montoTotal: salesInvoices.montoTotal,
            cashFormaPago: salesInvoices.cashFormaPago,
            reconciliationError: salesInvoices.reconciliationError,
          })
            .from(salesInvoices)
            .where(and(
              eq(salesInvoices.spaAccountId, account.id),
              eq(salesInvoices.estado, "autorizacion_pendiente"),
            ))
            .orderBy(desc(salesInvoices.createdAt))
            .limit(1)
        : [];
      res.json({
        ...account,
        pendingInvoice: pendingInvoice || null,
        pendingAuthorization: pendingAuthorization || null,
      });
    } catch (error) {
      res.status(500).json({ error: "Error fetching spa account" });
    }
  });

  app.get("/api/spa/accounts/by-appointment/:appointmentId", requireAuth, async (req, res) => {
    try {
      const account = await storage.getSpaAccountByAppointment(req.params.appointmentId);
      if (!account) return res.status(404).json({ error: "Account not found" });
      const [pendingInvoice] = account.status === "open"
        ? await db.select({
            id: salesInvoices.id,
            tipoComprobante: salesInvoices.tipoComprobante,
            puntoVenta: salesInvoices.puntoVenta,
            numero: salesInvoices.numero,
            montoTotal: salesInvoices.montoTotal,
            cashFormaPago: salesInvoices.cashFormaPago,
          })
            .from(salesInvoices)
            .where(and(
              eq(salesInvoices.spaAccountId, account.id),
              eq(salesInvoices.estado, "emitida"),
            ))
            .orderBy(desc(salesInvoices.createdAt))
            .limit(1)
        : [];
      const [pendingAuthorization] = account.status === "open"
        ? await db.select({
            id: salesInvoices.id,
            tipoComprobante: salesInvoices.tipoComprobante,
            puntoVenta: salesInvoices.puntoVenta,
            numero: salesInvoices.numero,
            montoTotal: salesInvoices.montoTotal,
            cashFormaPago: salesInvoices.cashFormaPago,
            reconciliationError: salesInvoices.reconciliationError,
          })
            .from(salesInvoices)
            .where(and(
              eq(salesInvoices.spaAccountId, account.id),
              eq(salesInvoices.estado, "autorizacion_pendiente"),
            ))
            .orderBy(desc(salesInvoices.createdAt))
            .limit(1)
        : [];
      res.json({
        ...account,
        pendingInvoice: pendingInvoice || null,
        pendingAuthorization: pendingAuthorization || null,
      });
    } catch (error) {
      res.status(500).json({ error: "Error fetching spa account" });
    }
  });

  app.post("/api/spa/accounts", requireAuth, async (req, res) => {
    try {
      const { appointmentId, guestName, reservationId, notes } = req.body;

      if (!appointmentId || !guestName) {
        return res.status(400).json({ error: "appointmentId and guestName are required" });
      }

      const account = await storage.createSpaAccount({
        appointmentId,
        guestName,
        reservationId: reservationId || null,
        status: "open",
        subtotal: "0",
        total: "0",
        notes: notes || null,
        openedAt: new Date(),
        closedAt: null,
        closedBy: null,
        chargedTo: null,
      });
      res.status(201).json(account);
    } catch (error) {
      res.status(500).json({ error: "Error creating spa account" });
    }
  });

  app.patch("/api/spa/accounts/:id", requireAuth, async (req, res) => {
    try {
      const account = await storage.updateSpaAccount(req.params.id, req.body);
      if (!account) return res.status(404).json({ error: "Account not found" });
      res.json(account);
    } catch (error) {
      res.status(500).json({ error: "Error updating spa account" });
    }
  });

  app.post("/api/spa/accounts/:id/close", requireAuth, requireRole(SPA_ACCESS_ROLES), async (req, res) => {
    try {
      const { chargedTo, receiptType, customerRazonSocial, customerCuit, customerDni, vatCondition, pvOverride } = req.body;

      if (!chargedTo || !receiptType) {
        return res.status(400).json({ error: "chargedTo and receiptType are required" });
      }
      if (["factura_a", "factura_b", "factura_c"].includes(receiptType)) {
        return res.status(409).json({
          error: "Las facturas SPA deben emitirse con el diálogo fiscal y vincularse al folio",
        });
      }

      if (["factura_a", "factura_c"].includes(receiptType) && !customerCuit?.trim()) {
        return res.status(400).json({ error: "El CUIT es obligatorio para Factura A/C" });
      }

      const accountData = await storage.getSpaAccount(req.params.id);
      if (!accountData) return res.status(404).json({ error: "Account not found" });

      const totalAmount = accountData.items.reduce((sum: number, item: any) => sum + parseFloat(item.subtotal), 0);
      const totalPaid = accountData.payments.reduce((sum: number, p: any) => sum + parseFloat(p.amount), 0);

      if (totalPaid < totalAmount) {
        return res.status(400).json({
          error: "Saldo pendiente",
          message: `Faltan $${(totalAmount - totalPaid).toFixed(2)} por cobrar antes de cerrar el folio.`,
        });
      }

      const account = await storage.closeSpaAccount(req.params.id, chargedTo, receiptType);
      if (!account) return res.status(404).json({ error: "Account not found" });

      // Descontar insumos del inventario (nunca bloquea el cierre)
      storage.deductStockFromSpaAccount(req.params.id).catch((err: any) =>
        console.warn("[SPA] Error deducting stock:", err)
      );

      res.json(account);
    } catch (error) {
      res.status(500).json({ error: "Error closing spa account" });
    }
  });

  app.post("/api/spa/accounts/:id/link-invoice", requireAuth, requireRole(SPA_ACCESS_ROLES), async (req, res) => {
    try {
      const invoiceId = Number(req.body.invoiceId);
      if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
        return res.status(400).json({ error: "Factura inválida" });
      }
      const [claimedInvoice] = await db.select({
        spaAccountId: salesInvoices.spaAccountId,
        cashFormaPago: salesInvoices.cashFormaPago,
      }).from(salesInvoices).where(eq(salesInvoices.id, invoiceId));
      if (!claimedInvoice || claimedInvoice.spaAccountId !== req.params.id) {
        return res.status(409).json({ error: "La factura no fue emitida para este folio SPA" });
      }
      const invoicePaymentMethod = String(claimedInvoice.cashFormaPago || "");
      const spaPaymentMethod = INVOICE_TO_SPA_PAYMENT_METHOD[invoicePaymentMethod];
      if (!spaPaymentMethod) {
        return res.status(409).json({ error: "La factura no tiene una forma de pago SPA válida" });
      }
      const invoiceCashShift = spaPaymentMethod === "cuenta_corriente"
        ? null
        : await storage.getOrCreateActiveTurno("spa");

      const linked = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM sales_invoices WHERE id = ${invoiceId} FOR UPDATE`);
        await tx.execute(sql`SELECT id FROM spa_accounts WHERE id = ${req.params.id} FOR UPDATE`);
        const [invoice] = await tx.select().from(salesInvoices).where(eq(salesInvoices.id, invoiceId));
        const [account] = await tx.select().from(spaAccounts).where(eq(spaAccounts.id, req.params.id));
        if (!invoice) throw Object.assign(new Error("Factura no encontrada"), { statusCode: 404 });
        if (!account) throw Object.assign(new Error("Folio SPA no encontrado"), { statusCode: 404 });
        if (invoice.spaAccountId !== account.id || invoice.cashFormaPago !== invoicePaymentMethod) {
          throw Object.assign(new Error("La factura no pertenece a este folio SPA"), { statusCode: 409 });
        }
        if (!["FA", "FB"].includes(invoice.tipoComprobante)) {
          throw Object.assign(new Error("El comprobante no es una Factura A/B válida"), { statusCode: 400 });
        }
        if (invoice.estado !== "emitida") {
          throw Object.assign(new Error("La factura todavía no está autorizada para vincular"), { statusCode: 409 });
        }
        if (account.invoiceId === invoiceId && account.status === "closed") {
          const [existingPayment] = await tx
            .select()
            .from(spaPayments)
            .where(and(eq(spaPayments.accountId, account.id), eq(spaPayments.status, "active")))
            .limit(1);
          const [existingCashMovement] = await tx
            .select({ id: cashMovements.id })
            .from(cashMovements)
            .where(and(
              eq(cashMovements.area, "spa"),
              eq(cashMovements.sourceType, "comprobante"),
              eq(cashMovements.sourceId, String(invoice.id)),
              eq(cashMovements.anulado, false),
            ))
            .limit(1);
          return {
            account,
            payment: existingPayment,
            cashMovementId: existingCashMovement?.id || null,
            alreadyLinked: true,
          };
        }
        if (account.status !== "open") {
          throw Object.assign(new Error("El folio SPA ya está cerrado"), { statusCode: 409 });
        }
        if (account.invoiceId) {
          throw Object.assign(new Error("El folio SPA ya tiene otra factura vinculada"), { statusCode: 409 });
        }
        const [usedInvoice] = await tx
          .select({ id: spaAccounts.id })
          .from(spaAccounts)
          .where(eq(spaAccounts.invoiceId, invoiceId))
          .limit(1);
        if (usedInvoice) {
          throw Object.assign(new Error("La factura ya está vinculada a otro folio SPA"), { statusCode: 409 });
        }

        const items = await tx.select().from(spaAccountItems).where(eq(spaAccountItems.accountId, account.id));
        const total = items.reduce((sum, item) => sum + parseFloat(item.subtotal), 0);
        const invoiceTotal = parseFloat(String(invoice.montoTotal || "0"));
        if (Math.abs(total - invoiceTotal) > 0.02) {
          throw Object.assign(new Error("El total de la factura no coincide con el folio SPA"), { statusCode: 409 });
        }
        const existingPayments = await tx
          .select()
          .from(spaPayments)
          .where(and(eq(spaPayments.accountId, account.id), eq(spaPayments.status, "active")));
        if (existingPayments.some((payment) => parseFloat(payment.amount) > 0.001)) {
          throw Object.assign(new Error("El folio SPA ya tiene pagos registrados"), { statusCode: 409 });
        }

        const [payment] = await tx.insert(spaPayments).values({
          accountId: account.id,
          amount: total.toFixed(2),
          method: spaPaymentMethod as any,
          isAdvance: "false",
          appointmentId: account.appointmentId,
          reservationId: account.reservationId,
          notes: `${invoice.tipoComprobante} ${String(invoice.puntoVenta).padStart(4, "0")}-${String(invoice.numero).padStart(8, "0")}`,
          createdAt: new Date(),
        }).returning();

        let cashMovementId: string | null = null;
        if (invoiceCashShift) {
          const [existingCashMovement] = await tx
            .select()
            .from(cashMovements)
            .where(and(
              eq(cashMovements.area, "spa"),
              eq(cashMovements.sourceType, "comprobante"),
              eq(cashMovements.sourceId, String(invoice.id)),
              eq(cashMovements.anulado, false),
            ))
            .limit(1);
          if (existingCashMovement) {
            cashMovementId = existingCashMovement.id;
            await tx.update(cashMovements)
              .set({ paymentId: payment.id })
              .where(eq(cashMovements.id, existingCashMovement.id));
          } else {
            const [cashMovement] = await tx.insert(cashMovements).values({
              shiftId: invoiceCashShift.id,
              area: "spa",
              sourceType: "comprobante",
              sourceId: String(invoice.id),
              sourceLabel: `${invoice.tipoComprobante} ${String(invoice.puntoVenta).padStart(4, "0")}-${String(invoice.numero).padStart(8, "0")} — ${account.guestName}`,
              paymentMethod: invoicePaymentMethod,
              amount: total.toFixed(2),
              movementType: "income",
              receiptType: invoice.tipoComprobante,
              registeredBy: (req as any).user?.fullName || (req as any).user?.username || null,
              paymentId: payment.id,
            }).returning();
            cashMovementId = cashMovement.id;
          }
        }

        let [spaFolio] = await tx
          .select()
          .from(folios)
          .where(and(eq(folios.entityType, "spa_account"), eq(folios.entityId, account.id)))
          .limit(1);
        if (!spaFolio) {
          [spaFolio] = await tx.insert(folios).values({
            codigo: `SP-${account.id}`,
            entityType: "spa_account",
            entityId: account.id,
            status: "open",
            totalCharges: total.toFixed(2),
            totalPayments: "0",
            balance: total.toFixed(2),
          }).returning();
          if (items.length > 0) {
            await tx.insert(folioMovements).values(items.map((item) => ({
              folioId: spaFolio.id,
              type: "charge" as const,
              amount: item.subtotal,
              description: item.description,
              sourceType: "spa_account_item",
              sourceId: item.id,
              registeredBy: (req as any).user?.username || null,
            })));
          }
        }
        await tx.insert(folioMovements).values({
          folioId: spaFolio.id,
          type: "payment",
          amount: total.toFixed(2),
          description: "SPA - Factura cobrada",
          sourceType: "spa_payment",
          sourceId: payment.id,
          paymentMethod: spaPaymentMethod,
          cashMovementId,
          registeredBy: (req as any).user?.username || null,
          receiptType: invoice.tipoComprobante === "FA" ? "factura_a" : "factura_b",
        });
        await tx.update(folios).set({
          status: "closed",
          totalCharges: total.toFixed(2),
          totalPayments: total.toFixed(2),
          balance: "0.00",
          closedAt: new Date(),
          closedBy: (req as any).user?.username || null,
        }).where(eq(folios.id, spaFolio.id));

        const receiptType = invoice.tipoComprobante === "FA" ? "factura_a" : "factura_b";
        const [closedAccount] = await tx.update(spaAccounts).set({
          status: "closed",
          subtotal: total.toFixed(2),
          total: total.toFixed(2),
          totalPaid: total.toFixed(2),
          receiptType,
          chargedTo: "direct",
          invoiceId: invoice.id,
          closedAt: new Date(),
          closedBy: (req as any).user?.fullName || (req as any).user?.username || null,
        }).where(eq(spaAccounts.id, account.id)).returning();

        return { account: closedAccount, payment, cashMovementId, alreadyLinked: false };
      });

      if (!linked.alreadyLinked) {
        storage.deductStockFromSpaAccount(req.params.id).catch((error: any) =>
          console.warn("[SPA] Error deducting stock after invoice:", error)
        );
      }

      res.json(linked);
    } catch (error: any) {
      res.status(error?.statusCode || 500).json({ error: error?.message || "Error vinculando factura al folio SPA" });
    }
  });

  app.post("/api/spa/accounts/:id/resume-invoice", requireAuth, requireRole(SPA_ACCESS_ROLES), async (req, res) => {
    try {
      const invoice = await withSpaInvoiceAuthorizationLock(req.params.id, async () => {
        const [account] = await db.select().from(spaAccounts).where(eq(spaAccounts.id, req.params.id));
        if (!account) throw Object.assign(new Error("Folio SPA no encontrado"), { statusCode: 404 });
        if (account.status !== "open" || account.invoiceId) {
          throw Object.assign(new Error("El folio SPA ya está cerrado o facturado"), { statusCode: 409 });
        }

        const [pending] = await db.select().from(salesInvoices).where(and(
          eq(salesInvoices.spaAccountId, account.id),
          eq(salesInvoices.estado, "autorizacion_pendiente"),
        )).orderBy(desc(salesInvoices.createdAt)).limit(1);
        if (!pending) {
          throw Object.assign(new Error("No hay una autorización ARCA pendiente para este folio"), { statusCode: 404 });
        }
        if (!pending.cashFormaPago || !INVOICE_TO_SPA_PAYMENT_METHOD[pending.cashFormaPago]) {
          throw Object.assign(new Error("La factura pendiente no tiene una forma de pago válida"), { statusCode: 409 });
        }
        if (!Array.isArray(pending.items) || pending.items.length === 0) {
          throw Object.assign(new Error("La factura pendiente no conserva sus conceptos"), { statusCode: 409 });
        }

        const accountItems = await db.select().from(spaAccountItems).where(eq(spaAccountItems.accountId, account.id));
        const accountTotal = accountItems.reduce((sum, item) => sum + parseFloat(item.subtotal), 0);
        if (Math.abs(accountTotal - parseFloat(pending.montoTotal)) > 0.02) {
          throw Object.assign(new Error("El folio SPA ya no coincide con la factura pendiente"), { statusCode: 409 });
        }

        const finalized = await emitirFactura({
          tipoComprobante: pending.tipoComprobante as any,
          cliente: {
            razonSocial: pending.clienteRazonSocial,
            cuit: pending.clienteCuit || undefined,
            dni: pending.clienteDni || undefined,
            condicionIva: pending.clienteCondicionIva,
            domicilio: pending.clienteDomicilio || undefined,
          },
          items: pending.items as any,
          puntoVentaOverride: pending.puntoVenta,
          operador: pending.operador || (req as any).user?.fullName || (req as any).user?.username,
          cashFormaPago: pending.cashFormaPago,
          spaAccountId: account.id,
          recoveryInvoiceId: pending.id,
          observaciones: pending.observaciones || undefined,
        });

        return finalized;
      });
      res.json({ invoice });
    } catch (error: any) {
      res.status(error?.statusCode || 500).json({ error: error?.message || "No se pudo reanudar la autorización ARCA" });
    }
  });

  app.get("/api/spa/accounts/:id/payments", requireAuth, async (req, res) => {
    try {
      const payments = await storage.getSpaPayments(req.params.id);
      res.json(payments);
    } catch (error) {
      res.status(500).json({ error: "Error fetching payments" });
    }
  });

  app.post("/api/spa/accounts/:id/payments", requireAuth, requireRole(SPA_ACCESS_ROLES), async (req, res) => {
    try {
      const { amount, method, isAdvance, appointmentId, reservationId, notes } = req.body;

      if (!amount || !method) {
        return res.status(400).json({ error: "amount and method are required" });
      }

      const payment = await storage.createSpaPayment({
        accountId: req.params.id,
        amount,
        method,
        isAdvance: isAdvance ? "true" : "false",
        appointmentId: appointmentId || null,
        reservationId: reservationId || null,
        notes: notes || null,
        createdAt: new Date(),
      });

      if (method === "room_charge" && reservationId) {
        await storage.createCharge({
          reservationId,
          category: "spa" as const,
          description: `SPA - Pago ${isAdvance ? "(Seña)" : ""}`,
          amount: amount,
          date: new Date().toISOString().split("T")[0],
          createdBy: null,
        });
      }

      try {
        if (method !== "room_charge") {
          const label = `SPA - Pago ${isAdvance ? "(Seña)" : ""} - Cuenta ${req.params.id}`;
          await storage.registerCashMovement(
            "spa", "spa_account", req.params.id, label,
            method, String(amount), "income"
          );
        }
      } catch (e) {
        console.error("Error registrando movimiento de caja:", e);
      }

      // Motor financiero: escribir al folio de la cuenta SPA
      storage.addFolioPayment(
        "spa_account", req.params.id,
        parseFloat(String(amount)),
        `SPA - Pago${isAdvance ? " (Seña)" : ""}`,
        method, "spa_payment", payment.id,
        undefined, (req as any).user?.username,
      ).catch(e => console.error("[Folio] Error SPA pago:", e));

      res.status(201).json(payment);
    } catch (error) {
      res.status(500).json({ error: "Error creating payment" });
    }
  });

  app.patch("/api/spa/payments/:id/anular", requireAuth, requireRole(SPA_ACCESS_ROLES), async (req, res) => {
    try {
      const { motivoAnulacion } = req.body;
      if (!motivoAnulacion?.trim()) return res.status(400).json({ error: "El motivo de anulación es requerido" });
      const [pay] = await db.select().from(spaPayments).where(eq(spaPayments.id, req.params.id));
      if (!pay) return res.status(404).json({ error: "Pago no encontrado" });
      if (pay.status === "anulado") return res.status(400).json({ error: "El pago ya está anulado" });
      const account = await storage.getSpaAccount(pay.accountId);
      if (account?.status === "closed") return res.status(403).json({ error: "No se puede anular pagos de una cuenta cerrada" });
      const [updated] = await db.update(spaPayments)
        .set({ status: "anulado", motivoAnulacion, anuladoAt: new Date() })
        .where(eq(spaPayments.id, req.params.id))
        .returning();
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/spa/payments/:id", requireAuth, requireRole(SPA_ACCESS_ROLES), async (req, res) => {
    console.warn(`[DEPRECADO] DELETE /api/spa/payments/${req.params.id} — usar PATCH /anular`);
    try {
      await storage.deleteSpaPayment(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting payment" });
    }
  });

  // SPA Account Items
  app.get("/api/spa/accounts/:accountId/items", requireAuth, async (req, res) => {
    try {
      const items = await storage.getSpaAccountItems(req.params.accountId);
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Error fetching account items" });
    }
  });

  app.post("/api/spa/accounts/:accountId/items", requireAuth, async (req, res) => {
    try {
      const { description, quantity, unitPrice, itemType, notes } = req.body;

      if (!description || !unitPrice) {
        return res.status(400).json({ error: "description and unitPrice are required" });
      }

      const qty = quantity || 1;
      const subtotal = (parseFloat(unitPrice) * qty).toFixed(2);

      const item = await storage.createSpaAccountItem({
        accountId: req.params.accountId,
        description,
        quantity: qty,
        unitPrice,
        subtotal,
        itemType: itemType || "treatment",
        notes: notes || null,
        createdAt: new Date(),
      });

      // Motor financiero: escribir cargo al folio de la cuenta SPA
      storage.addFolioCharge(
        "spa_account", req.params.accountId,
        parseFloat(subtotal),
        description,
        "spa_item", item.id,
        (req as any).user?.username,
      ).catch(e => console.error("[Folio] Error SPA cargo:", e));

      res.status(201).json(item);
    } catch (error) {
      res.status(500).json({ error: "Error creating account item" });
    }
  });

  app.patch("/api/spa/account-items/:id", requireAuth, async (req, res) => {
    try {
      const item = await storage.updateSpaAccountItem(req.params.id, req.body);
      if (!item) return res.status(404).json({ error: "Item not found" });
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: "Error updating account item" });
    }
  });

  app.delete("/api/spa/account-items/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteSpaAccountItem(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting account item" });
    }
  });

  // SPA Professionals
  app.get("/api/spa/professionals", requireAuth, async (req, res) => {
    try {
      const professionals = await db.select().from(spaProfessionals);
      res.json(professionals);
    } catch (error) {
      res.status(500).json({ error: "Error fetching professionals" });
    }
  });

  app.post("/api/spa/professionals", requireAuth, async (req, res) => {
    try {
      const [created] = await db.insert(spaProfessionals).values(req.body).returning();
      res.json(created);
    } catch (error) {
      res.status(500).json({ error: "Error creating professional" });
    }
  });

  app.patch("/api/spa/professionals/:id", requireAuth, async (req, res) => {
    try {
      const [updated] = await db.update(spaProfessionals)
        .set(req.body)
        .where(eq(spaProfessionals.id, req.params.id))
        .returning();
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Error updating professional" });
    }
  });

  // SPA Clients — unified: uses guests table so all modules share the same client base
  app.get("/api/spa/clients", requireAuth, async (req, res) => {
    try {
      const { search } = req.query;
      const allGuests = await db.select().from(guests).orderBy(desc(guests.fechaAlta));
      if (search) {
        const s = (search as string).toLowerCase();
        return res.json(allGuests.filter((c: any) =>
          (c.firstName || "").toLowerCase().includes(s) ||
          (c.lastName || "").toLowerCase().includes(s) ||
          (c.phone || "").includes(s) ||
          (c.email || "").toLowerCase().includes(s) ||
          (c.documentNumber || "").includes(s)
        ));
      }
      res.json(allGuests);
    } catch (error) {
      res.status(500).json({ error: "Error fetching clients" });
    }
  });

  app.post("/api/spa/clients", requireAuth, async (req, res) => {
    try {
      const [created] = await db.insert(guests).values(req.body).returning();
      res.json(created);
    } catch (error) {
      res.status(500).json({ error: "Error creating client" });
    }
  });

  app.patch("/api/spa/clients/:id", requireAuth, async (req, res) => {
    try {
      const ALLOWED = ["firstName","lastName","email","phone","notes","documentType",
        "documentNumber","vatCondition","cuilCuit","estadoCivil","direccion",
        "localidad","provincia","codigoPostal","fechaNacimiento","sexo","tipoPersona"];
      const patch: Record<string, any> = {};
      for (const f of ALLOWED) { if (req.body[f] !== undefined) patch[f] = req.body[f]; }
      const [updated] = await db.update(guests).set(patch).where(eq(guests.id, req.params.id)).returning();
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Error updating client" });
    }
  });

  app.delete("/api/spa/clients/:id", requireAuth, async (req, res) => {
    try {
      await db.delete(guests).where(eq(guests.id, req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Error deleting client" });
    }
  });

  // ==================== TREATMENT SUPPLIES ====================
  app.get("/api/spa/treatments/:id/supplies", requireAuth, async (req, res) => {
    try {
      const supplies = await storage.getTreatmentSupplies(req.params.id);
      // Enrich with inventory item info
      const enriched = await Promise.all(supplies.map(async (s) => {
        const [item] = await db.select({ name: inventoryItems.name, unit: inventoryItems.unit })
          .from(inventoryItems).where(eq(inventoryItems.id, s.inventoryItemId));
        return { ...s, inventoryItemName: item?.name ?? "—", inventoryItemUnit: item?.unit ?? s.unit };
      }));
      res.json(enriched);
    } catch (error) {
      res.status(500).json({ error: "Error fetching treatment supplies" });
    }
  });

  app.post("/api/spa/treatments/:id/supplies", requireAuth, async (req, res) => {
    try {
      const { inventoryItemId, quantity, unit, notes } = req.body;
      if (!inventoryItemId || !quantity) {
        return res.status(400).json({ error: "inventoryItemId and quantity are required" });
      }
      const supply = await storage.createTreatmentSupply({
        treatmentId: req.params.id,
        inventoryItemId,
        quantity: String(quantity),
        unit: unit || "",
        notes: notes || null,
      });
      res.json(supply);
    } catch (error) {
      res.status(500).json({ error: "Error creating treatment supply" });
    }
  });

  app.delete("/api/spa/treatments/supplies/:supplyId", requireAuth, async (req, res) => {
    try {
      const ok = await storage.deleteTreatmentSupply(req.params.supplyId);
      res.json({ success: ok });
    } catch (error) {
      res.status(500).json({ error: "Error deleting treatment supply" });
    }
  });

  // ── PDF: Confirmación de turno SPA ────────────────────────────────────────
  app.get("/api/spa/appointments/:id/pdf/confirmacion", requireAuth, async (req, res) => {
    try {
      const appointment = await storage.getSpaAppointment(req.params.id);
      if (!appointment) return res.status(404).json({ error: "Turno no encontrado" });

      const account = await storage.getSpaAccountByAppointment(req.params.id);

      let professional = undefined;
      if (appointment.professionalId) {
        const [prof] = await db.select().from(spaProfessionals).where(eq(spaProfessionals.id, appointment.professionalId));
        professional = prof;
      }

      const pdfBuffer = await generateConfirmacionTurnoSpaPdf(appointment, account, professional);
      const guestName = `${appointment.guestName}_${appointment.guestLastName || ""}`.replace(/\s+/g, "_");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Confirmacion_SPA_${guestName}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating SPA confirmation PDF:", error);
      res.status(500).json({ error: "Error generando PDF de confirmación" });
    }
  });

  // ── PDF: Comprobante de cuenta SPA ────────────────────────────────────────
  app.get("/api/spa/accounts/:id/receipt-pdf", requireAuth, async (req, res) => {
    try {
      const account = await storage.getSpaAccount(req.params.id);
      if (!account) return res.status(404).json({ error: "Cuenta no encontrada" });
      const appointment = await storage.getSpaAppointment(account.appointmentId);

      const treatment = appointment?.treatmentId
        ? await storage.getSpaTreatment(appointment.treatmentId)
        : null;

      const pdfBuffer = await generateSpaAccountReceiptPdf({
        accountId: account.id,
        guestName: account.guestName,
        appointmentDate: appointment?.appointmentDate ?? new Date().toISOString().split("T")[0],
        startTime: appointment?.startTime ?? "",
        treatmentName: treatment?.name ?? "Servicio SPA",
        receiptType: account.receiptType,
        closedAt: account.closedAt ? String(account.closedAt) : null,
        items: account.items.map((i: any) => ({
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          subtotal: i.subtotal,
        })),
        payments: account.payments.map((p: any) => ({ method: p.method, amount: p.amount })),
        total: account.items.reduce((s: number, i: any) => s + parseFloat(i.subtotal), 0),
      });

      const guestSlug = account.guestName.replace(/\s+/g, "_");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Recibo_SPA_${guestSlug}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating SPA receipt PDF:", error);
      res.status(500).json({ error: "Error generando comprobante PDF" });
    }
  });

  // ── Email: Enviar comprobante SPA por email ────────────────────────────────
  app.post("/api/spa/accounts/:id/receipt-email", requireAuth, async (req, res) => {
    try {
      const { to } = req.body;
      if (!to?.trim()) return res.status(400).json({ error: "El destinatario (to) es requerido" });

      const account = await storage.getSpaAccount(req.params.id);
      if (!account) return res.status(404).json({ error: "Cuenta no encontrada" });
      const appointment = await storage.getSpaAppointment(account.appointmentId);

      const treatment = appointment?.treatmentId
        ? await storage.getSpaTreatment(appointment.treatmentId)
        : null;

      const pdfBuffer = await generateSpaAccountReceiptPdf({
        accountId: account.id,
        guestName: account.guestName,
        appointmentDate: appointment?.appointmentDate ?? new Date().toISOString().split("T")[0],
        startTime: appointment?.startTime ?? "",
        treatmentName: treatment?.name ?? "Servicio SPA",
        receiptType: account.receiptType,
        closedAt: account.closedAt ? String(account.closedAt) : null,
        items: account.items.map((i: any) => ({
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          subtotal: i.subtotal,
        })),
        payments: account.payments.map((p: any) => ({ method: p.method, amount: p.amount })),
        total: account.items.reduce((s: number, i: any) => s + parseFloat(i.subtotal), 0),
      });

      const guestSlug = account.guestName.replace(/\s+/g, "_");
      const subject = `Comprobante SPA — ${account.guestName}`;
      const body = `Estimado/a,\n\nAdjunto encontrará el comprobante de su sesión de SPA en Maran Suites & Towers.\n\nGracias por elegirnos.\n\nMaran Suites & Towers\nSPA & Wellness — Paraná, Entre Ríos`;

      const result = await sendEmailWithPdfAttachment({
        to: to.trim(),
        subject,
        body,
        attachmentFilename: `Recibo_SPA_${guestSlug}.pdf`,
        attachmentBuffer: pdfBuffer,
      });

      if (!result.ok) {
        return res.status(502).json({ error: result.error || "Error al enviar el email" });
      }

      res.json({ ok: true });
    } catch (error: any) {
      console.error("Error sending SPA receipt email:", error);
      res.status(500).json({ error: "Error al enviar el email" });
    }
  });

  // Emit NC (Nota de Crédito) against a closed SPA account invoice
  app.post("/api/spa/accounts/:accountId/nc", requireAuth, async (req, res) => {
    try {
      const account = await storage.getSpaAccount(req.params.accountId);
      if (!account) return res.status(404).json({ error: "Cuenta SPA no encontrada" });
      if (!(account as any).invoiceId) {
        return res.status(400).json({ error: "La cuenta no tiene una factura AFIP emitida" });
      }
      if ((account as any).ncId) {
        return res.status(400).json({ error: "Esta cuenta ya tiene una Nota de Crédito emitida" });
      }

      const [originalInvoice] = await db.select().from(salesInvoices).where(eq(salesInvoices.id, (account as any).invoiceId));
      if (!originalInvoice) return res.status(404).json({ error: "Factura original no encontrada" });

      const ncTipo: "NCA" | "NCB" = originalInvoice.tipoComprobante === "FA" ? "NCA" : "NCB";

      const originalItems = (originalInvoice.items as any[]) || [];
      let ncItems: { descripcion: string; cantidad: number; precioUnitario: number; alicuotaIva: "21" | "10.5" | "exento" | "no_gravado"; subtotalNeto: number; subtotal: number }[];
      if (originalItems.length > 0) {
        ncItems = originalItems.map((item: any) => ({
          descripcion: item.descripcion || "Anulación",
          cantidad: item.cantidad || 1,
          precioUnitario: item.precioUnitario || 0,
          alicuotaIva: (item.alicuotaIva || "21") as "21" | "10.5" | "exento" | "no_gravado",
          subtotalNeto: item.subtotalNeto || 0,
          subtotal: item.subtotal || 0,
        }));
      } else {
        const gross = parseFloat(originalInvoice.montoTotal || "0");
        const net = parseFloat((gross / 1.21).toFixed(4));
        ncItems = [{ descripcion: `NC SPA ${account.guestName}`, cantidad: 1, precioUnitario: net, alicuotaIva: "21" as const, subtotalNeto: net, subtotal: gross }];
      }

      const nc = await emitirFactura({
        tipoComprobante: ncTipo,
        cliente: {
          razonSocial: originalInvoice.clienteRazonSocial || "CONSUMIDOR FINAL",
          cuit: originalInvoice.clienteCuit || undefined,
          dni: originalInvoice.clienteDni || undefined,
          condicionIva: originalInvoice.clienteCondicionIva || "consumidor_final",
        },
        items: ncItems,
        facturaOriginalId: originalInvoice.id,
        operador: (req as any).user?.fullName || (req as any).user?.username,
      });

      await storage.updateSpaAccount(req.params.accountId, { ncId: nc.id } as any);

      // Write void folio_movements for each payment so the folio balance
      // correctly reflects the reversal (balance goes back to non-zero).
      try {
        const folio = await (storage as any).getFolioByEntity("spa_account", req.params.accountId);
        if (folio) {
          const payments: any[] = account.payments || [];
          for (const payment of payments) {
            const amt = parseFloat(payment.amount);
            if (amt > 0) {
              await (storage as any).addFolioAdjustment(
                folio.id,
                "void",
                amt,
                `NC SPA - Anulación pago ${payment.method}`,
                (req as any).user?.username,
                payment.id,
                `NC emitida id=${nc.id}`,
              );
            }
          }
        }
      } catch (voidErr) {
        console.error("[Folio] Error escribiendo movimientos void para NC SPA:", voidErr);
      }

      res.json({ ncId: nc.id, nc });
    } catch (e: any) {
      console.error("[Billing] Error emitiendo NC SPA:", e);
      res.status(500).json({ error: e?.message || "Error al emitir la Nota de Crédito" });
    }
  });

  // Admin-only: reset ncId on a SPA account so a new NC can be emitted after the previous one was voided
  app.patch("/api/spa/accounts/:accountId/reset-nc", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user || user.role !== "admin") {
        return res.status(403).json({ error: "Solo un administrador puede restablecer el estado de NC" });
      }
      const account = await storage.getSpaAccount(req.params.accountId);
      if (!account) return res.status(404).json({ error: "Cuenta SPA no encontrada" });
      const ncId = (account as any).ncId;
      if (!ncId) {
        return res.status(400).json({ error: "Esta cuenta no tiene una NC emitida" });
      }

      // Reverse the void folio movements written during NC emission so the
      // folio balance is consistent when a new NC is emitted later.
      try {
        const folio = await (storage as any).getFolioByEntity("spa_account", req.params.accountId);
        if (folio) {
          const voidMovements = await db
            .select()
            .from(folioMovements)
            .where(
              and(
                eq(folioMovements.folioId, folio.id),
                eq(folioMovements.type, "void"),
                eq(folioMovements.voidReason, `NC emitida id=${ncId}`),
              ),
            );
          for (const mov of voidMovements) {
            await db.delete(folioMovements).where(eq(folioMovements.id, mov.id));
          }
          if (voidMovements.length > 0) {
            await (storage as any).recalcFolioBalance(folio.id);
          }
        }
      } catch (folioErr) {
        console.error("[Folio] Error revirtiendo movimientos void para reset-nc SPA:", folioErr);
        // Non-fatal: we still clear ncId so the account isn't permanently blocked.
      }

      await storage.updateSpaAccount(req.params.accountId, { ncId: null } as any);
      const updated = await storage.getSpaAccount(req.params.accountId);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Error al restablecer el estado de NC" });
    }
  });
}

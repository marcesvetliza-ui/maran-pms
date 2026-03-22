import { db } from "./db";
import { randomUUID } from "crypto";
import { eq, and, inArray, sql, lte, gt } from "drizzle-orm";
import {
  reservations,
  charges,
  payments,
  rooms,
  nightAuditLogs,
  systemNotifications,
} from "@shared/schema";

function naLog(message: string) {
  const t = new Date().toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  });
  console.log(`${t} [night-audit] ${message}`);
}

function getArgentinaDateStr(offsetDays = 0): string {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  return now.toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

export async function nightAuditAlreadyRan(auditDate: string): Promise<boolean> {
  const existing = await db
    .select({ id: nightAuditLogs.id })
    .from(nightAuditLogs)
    .where(eq(nightAuditLogs.auditDate, auditDate))
    .limit(1);
  return existing.length > 0;
}

export async function runNightAudit(options: {
  executedBy?: string;
  isManual?: boolean;
  forceDate?: string;
}): Promise<{ success: boolean; message: string; data?: any }> {
  const auditDate = options.forceDate || getArgentinaDateStr(-1);
  const tomorrow = getArgentinaDateStr(1);
  const executedBy = options.executedBy || "sistema";
  const isManual = options.isManual ?? false;

  naLog(`Iniciando audit para fecha: ${auditDate}`);

  if (!isManual) {
    const alreadyRan = await nightAuditAlreadyRan(auditDate);
    if (alreadyRan) {
      naLog(`Ya se ejecutó para ${auditDate}, saltando`);
      return { success: true, message: `Night audit ya ejecutado para ${auditDate}` };
    }
  }

  const detail: any[] = [];
  let reservationsProcessed = 0;
  let reservationsSkipped = 0;
  let totalPosted = 0;
  let auditStatus: "success" | "partial" | "failed" = "success";
  const errors: string[] = [];

  try {
    // PASO 1 — Postear cargo de alojamiento por cada habitación ocupada
    const activeReservations = await db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.status, "checked_in"),
          lte(reservations.checkInDate, auditDate),
          gt(reservations.checkOutDate, auditDate),
        ),
      );

    naLog(`Reservas activas encontradas: ${activeReservations.length}`);

    for (const reservation of activeReservations) {
      try {
        const existingCharge = await db
          .select({ id: charges.id })
          .from(charges)
          .where(
            and(
              eq(charges.reservationId, reservation.id),
              eq(charges.date, auditDate),
              eq(charges.category, "room"),
              sql`${charges.description} LIKE '%Night Audit%'`,
            ),
          )
          .limit(1);

        if (existingCharge.length > 0) {
          detail.push({
            reservationId: reservation.id,
            reservationCode: reservation.reservationCode,
            action: "skipped",
            reason: "Cargo ya posteado para esta noche",
          });
          reservationsSkipped++;
          continue;
        }

        const ratePerNight = parseFloat(
          reservation.finalRatePerNight || reservation.baseRatePerNight || "0",
        );

        if (ratePerNight <= 0) {
          detail.push({
            reservationId: reservation.id,
            reservationCode: reservation.reservationCode,
            action: "skipped",
            reason: "Tarifa cero o no configurada",
            rate: ratePerNight,
          });
          reservationsSkipped++;
          continue;
        }

        const room = reservation.roomId
          ? await db
              .select({ roomNumber: rooms.roomNumber })
              .from(rooms)
              .where(eq(rooms.id, reservation.roomId))
              .limit(1)
          : [];

        const roomNumber = room[0]?.roomNumber ?? "?";

        await db.insert(charges).values({
          id: randomUUID(),
          reservationId: reservation.id,
          description: `Alojamiento Hab. ${roomNumber} — ${auditDate} (Night Audit)`,
          amount: ratePerNight.toFixed(2),
          date: auditDate,
          category: "room",
          createdBy: "night_audit",
        });

        totalPosted += ratePerNight;
        reservationsProcessed++;

        detail.push({
          reservationId: reservation.id,
          reservationCode: reservation.reservationCode,
          roomNumber,
          action: "posted",
          amount: ratePerNight,
          date: auditDate,
        });

        naLog(`✓ Cargo posteado: ${reservation.reservationCode} - Hab ${roomNumber} - $${ratePerNight}`);
      } catch (err: any) {
        errors.push(`Error en reserva ${reservation.reservationCode}: ${err.message}`);
        auditStatus = "partial";
        detail.push({
          reservationId: reservation.id,
          reservationCode: reservation.reservationCode,
          action: "error",
          error: err.message,
        });
      }
    }

    // PASO 2 — Verificar prepagos/garantías del día siguiente (con JOIN, sin N+1)
    const arrivalsNextDay = await db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.checkInDate, tomorrow),
          inArray(reservations.status, ["confirmed", "pending", "tentative"] as any),
        ),
      );

    const arrivalsDetail: any[] = [];
    let arrivalsWithPrepago = 0;
    let arrivalsWithoutPrepago = 0;

    if (arrivalsNextDay.length > 0) {
      const reservationIds = arrivalsNextDay.map((r) => r.id);
      const paymentSums = await db
        .select({
          reservationId: payments.reservationId,
          total: sql<number>`COALESCE(SUM(${payments.amount}::numeric), 0)`,
        })
        .from(payments)
        .where(inArray(payments.reservationId, reservationIds))
        .groupBy(payments.reservationId);

      const paymentMap = new Map(paymentSums.map((p) => [p.reservationId, Number(p.total)]));

      for (const arrival of arrivalsNextDay) {
        const totalPaid = paymentMap.get(arrival.id) ?? 0;
        const hasPrepago = totalPaid > 0;
        if (hasPrepago) arrivalsWithPrepago++;
        else arrivalsWithoutPrepago++;

        arrivalsDetail.push({
          reservationId: arrival.id,
          reservationCode: arrival.reservationCode,
          checkInDate: arrival.checkInDate,
          totalPaid,
          hasPrepago,
          rate: arrival.finalRatePerNight || arrival.baseRatePerNight,
        });
      }
    }

    // PASO 3 — Guardar registro del audit
    const [auditLog] = await db
      .insert(nightAuditLogs)
      .values({
        id: randomUUID(),
        auditDate,
        executedAt: new Date(),
        executedBy,
        isManual,
        reservationsProcessed,
        reservationsSkipped,
        totalPosted: totalPosted.toFixed(2),
        arrivalsNextDay: arrivalsNextDay.length,
        arrivalsWithPrepago,
        arrivalsWithoutPrepago,
        status: auditStatus,
        notes: errors.length > 0 ? errors.join(" | ") : null,
        detail: JSON.stringify({ charges: detail, arrivals: arrivalsDetail }),
      })
      .returning();

    // PASO 4 — Notificación interna
    try {
      await db.insert(systemNotifications).values({
        id: randomUUID(),
        type: "hospitality_alert" as any,
        title: `Night Audit ${auditDate} — ${auditStatus === "success" ? "✓ Completado" : "⚠ Parcial"}`,
        message: `Se postearon ${reservationsProcessed} cargos por $${totalPosted.toFixed(2)}. ${arrivalsNextDay.length} llegadas mañana (${arrivalsWithoutPrepago} sin prepago).`,
        area: "all" as any,
        priority: auditStatus === "success" ? "normal" : ("high" as any),
        isRead: false,
        createdAt: new Date(),
      });
    } catch {
      // No fallar por error en notificación
    }

    const result = {
      auditDate,
      executedAt: new Date().toISOString(),
      executedBy,
      isManual,
      reservationsProcessed,
      reservationsSkipped,
      totalPosted: totalPosted.toFixed(2),
      arrivals: {
        total: arrivalsNextDay.length,
        withPrepago: arrivalsWithPrepago,
        withoutPrepago: arrivalsWithoutPrepago,
      },
      status: auditStatus,
      errors,
      auditLogId: auditLog.id,
    };

    naLog(`✓ Completado: ${reservationsProcessed} cargos, $${totalPosted.toFixed(2)}`);
    return { success: true, message: "Night audit completado", data: result };
  } catch (err: any) {
    naLog(`✗ Error crítico: ${err.message}`);
    try {
      await db.insert(nightAuditLogs).values({
        id: randomUUID(),
        auditDate,
        executedAt: new Date(),
        executedBy,
        isManual,
        reservationsProcessed,
        reservationsSkipped,
        totalPosted: "0",
        arrivalsNextDay: 0,
        arrivalsWithPrepago: 0,
        arrivalsWithoutPrepago: 0,
        status: "failed",
        notes: err.message,
        detail: JSON.stringify({ error: err.message }),
      });
    } catch {
      // ignorar
    }
    return { success: false, message: `Error en night audit: ${err.message}` };
  }
}

// Scheduler — verifica cada 60s si es hora de correr (00:05 Argentina)
export function setupNightAuditScheduler(): void {
  naLog("Scheduler iniciado");

  // Startup recovery: si el audit de ayer no se ejecutó, correrlo ahora
  (async () => {
    try {
      const yesterday = getArgentinaDateStr(-1);
      const alreadyRan = await nightAuditAlreadyRan(yesterday);
      if (!alreadyRan) {
        naLog(`Startup recovery: audit de ${yesterday} no se ejecutó, corriendo ahora...`);
        await runNightAudit({ executedBy: "sistema (startup recovery)", isManual: false, forceDate: yesterday });
      }
    } catch (err: any) {
      naLog(`Error en startup recovery: ${err.message}`);
    }
  })();

  setInterval(async () => {
    try {
      const now = new Date();
      const argTime = new Date(
        now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }),
      );
      const hour = argTime.getHours();
      const minute = argTime.getMinutes();

      if (hour === 0 && minute === 5) {
        naLog("Hora de ejecución alcanzada, corriendo audit automático...");
        await runNightAudit({ executedBy: "sistema", isManual: false });
      }
    } catch (err: any) {
      naLog(`Error en scheduler: ${err.message}`);
    }
  }, 60_000);
}

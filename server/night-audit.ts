import { db } from "./db";
import { randomUUID } from "crypto";
import { eq, and, inArray, sql, lte, gt } from "drizzle-orm";
import {
  reservations,
  charges,
  payments,
  rooms,
  guests,
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

  let auditStatus: "success" | "partial" | "failed" = "success";
  const errors: string[] = [];

  try {
    // ============================================================
    // PASO 1 — Snapshot de habitaciones ocupadas esa noche
    // (solo conteo/reporte, sin postear cargos)
    // ============================================================
    const inHouseReservations = await db
      .select({
        id: reservations.id,
        reservationCode: reservations.reservationCode,
        roomId: reservations.roomId,
        checkInDate: reservations.checkInDate,
        checkOutDate: reservations.checkOutDate,
        guestId: reservations.guestId,
        finalRatePerNight: reservations.finalRatePerNight,
        baseRatePerNight: reservations.baseRatePerNight,
      })
      .from(reservations)
      .where(
        and(
          eq(reservations.status, "checked_in"),
          lte(reservations.checkInDate, auditDate),
          gt(reservations.checkOutDate, auditDate),
        ),
      );

    naLog(`Habitaciones ocupadas: ${inHouseReservations.length}`);

    // Calcular saldo pendiente por folio (cargos - pagos) — un solo JOIN cada uno
    const inHouseIds = inHouseReservations.map((r) => r.id);
    let folioDetail: any[] = [];

    if (inHouseIds.length > 0) {
      const chargesSums = await db
        .select({
          reservationId: charges.reservationId,
          total: sql<number>`COALESCE(SUM(${charges.amount}::numeric), 0)`,
        })
        .from(charges)
        .where(inArray(charges.reservationId, inHouseIds))
        .groupBy(charges.reservationId);

      const paymentsSums = await db
        .select({
          reservationId: payments.reservationId,
          total: sql<number>`COALESCE(SUM(${payments.amount}::numeric), 0)`,
        })
        .from(payments)
        .where(inArray(payments.reservationId, inHouseIds))
        .groupBy(payments.reservationId);

      const chargesMap = new Map(chargesSums.map((c) => [c.reservationId, Number(c.total)]));
      const paymentsMap = new Map(paymentsSums.map((p) => [p.reservationId, Number(p.total)]));

      // Obtener números de habitación
      const roomIds = inHouseReservations.map((r) => r.roomId).filter(Boolean) as string[];
      const roomNumbers = roomIds.length > 0
        ? await db
            .select({ id: rooms.id, roomNumber: rooms.roomNumber })
            .from(rooms)
            .where(inArray(rooms.id, roomIds))
        : [];
      const roomMap = new Map(roomNumbers.map((r) => [r.id, r.roomNumber]));

      folioDetail = inHouseReservations.map((r) => {
        const totalCharges = chargesMap.get(r.id) ?? 0;
        const totalPaid = paymentsMap.get(r.id) ?? 0;
        const balance = totalCharges - totalPaid;
        return {
          reservationId: r.id,
          reservationCode: r.reservationCode,
          roomNumber: r.roomId ? roomMap.get(r.roomId) ?? "?" : "?",
          checkOutDate: r.checkOutDate,
          totalCharges,
          totalPaid,
          balance,
          hasBalance: balance > 0,
        };
      });
    }

    const foliosConSaldo = folioDetail.filter((f) => f.hasBalance);

    // ============================================================
    // PASO 2 — Verificar prepagos/garantías del día siguiente (JOIN, sin N+1)
    // ============================================================
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
      const ids = arrivalsNextDay.map((r) => r.id);
      const paymentSums = await db
        .select({
          reservationId: payments.reservationId,
          total: sql<number>`COALESCE(SUM(${payments.amount}::numeric), 0)`,
        })
        .from(payments)
        .where(inArray(payments.reservationId, ids))
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
          totalPaid,
          hasPrepago,
        });
      }
    }

    // ============================================================
    // PASO 3 — Guardar registro del audit
    // ============================================================
    const [auditLog] = await db
      .insert(nightAuditLogs)
      .values({
        id: randomUUID(),
        auditDate,
        executedAt: new Date(),
        executedBy,
        isManual,
        reservationsProcessed: inHouseReservations.length, // habitaciones ocupadas
        reservationsSkipped: foliosConSaldo.length,         // folios con saldo
        totalPosted: "0",                                   // no se postean cargos
        arrivalsNextDay: arrivalsNextDay.length,
        arrivalsWithPrepago,
        arrivalsWithoutPrepago,
        status: auditStatus,
        notes: errors.length > 0 ? errors.join(" | ") : null,
        detail: JSON.stringify({
          inHouse: folioDetail,
          arrivals: arrivalsDetail,
        }),
      })
      .returning();

    // ============================================================
    // PASO 4 — Notificación interna
    // ============================================================
    try {
      await db.insert(systemNotifications).values({
        id: randomUUID(),
        type: "hospitality_alert" as any,
        title: `Night Audit ${auditDate} — ✓ Completado`,
        message: `${inHouseReservations.length} hab. ocupadas (${foliosConSaldo.length} con saldo). ${arrivalsNextDay.length} llegadas mañana (${arrivalsWithoutPrepago} sin prepago).`,
        area: "all" as any,
        priority: arrivalsWithoutPrepago > 0 ? ("high" as any) : "normal",
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
      inHouse: {
        total: inHouseReservations.length,
        conSaldo: foliosConSaldo.length,
        folios: folioDetail,
      },
      arrivals: {
        total: arrivalsNextDay.length,
        withPrepago: arrivalsWithPrepago,
        withoutPrepago: arrivalsWithoutPrepago,
      },
      status: auditStatus,
      errors,
      auditLogId: auditLog.id,
    };

    naLog(`✓ Completado: ${inHouseReservations.length} in-house, ${arrivalsNextDay.length} llegadas mañana`);
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
        reservationsProcessed: 0,
        reservationsSkipped: 0,
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

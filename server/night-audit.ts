import { db } from "./db";
import { randomUUID } from "crypto";
import { eq, and, inArray, sql, lte, gt } from "drizzle-orm";
import { runReminderScheduler } from "./email-service";
import {
  reservations,
  charges,
  payments,
  rooms,
  guests,
  nightAuditLogs,
  systemNotifications,
  guestPreferences,
  hospitalityAlerts,
} from "@shared/schema";
import { loadReservationOperationalSummaries } from "./reservation-operational-balances";

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
         totalRoomAmount: reservations.totalRoomAmount,
         nights: reservations.nights,
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

    // Calcular saldos operativos con cargas masivas, incluyendo alojamiento.
    let folioDetail: any[] = [];

    if (inHouseReservations.length > 0) {
      const summaries = await loadReservationOperationalSummaries(inHouseReservations);
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
        const summary = summaries.get(r.id)!;
        return {
          reservationId: r.id,
          reservationCode: r.reservationCode,
          roomNumber: r.roomId ? roomMap.get(r.roomId) ?? "?" : "?",
          checkOutDate: r.checkOutDate,
          totalCharges: summary.operationalServices,
          totalPaid: summary.activeHistoricalSettlements,
          balance: summary.operationalFolioBalance,
          hasBalance: summary.operationalFolioBalance > 0.01,
        };
      });
    }

    const foliosConSaldo = folioDetail.filter((f) => f.hasBalance);

    // ============================================================
    // PASO 1.5 — Auto-cierre de reservas vencidas
    // checked_in con checkOutDate <= ayer y saldo = 0 → checked_out automático
    // confirmed/pending/tentative con checkOutDate < ayer → no-show → cancelado
    // ============================================================
    let autoCerradasCount = 0;
    let autoNoShowCount = 0;
    try {
      // Buscar checked_in con checkout vencido
      const overdueCheckedIn = await db
        .select({
          id: reservations.id,
          roomId: reservations.roomId,
          reservationCode: reservations.reservationCode,
          totalRoomAmount: reservations.totalRoomAmount,
          finalRatePerNight: reservations.finalRatePerNight,
          nights: reservations.nights,
        })
        .from(reservations)
        .where(and(
          eq(reservations.status, "checked_in"),
          lte(reservations.checkOutDate, auditDate),
        ));

      if (overdueCheckedIn.length > 0) {
        const overdueSummaries = await loadReservationOperationalSummaries(overdueCheckedIn);

        for (const r of overdueCheckedIn) {
          const balance = overdueSummaries.get(r.id)?.operationalFolioBalance ?? 0;
          if (balance <= 0.01) {
            await db.update(reservations).set({ status: "checked_out" } as any).where(eq(reservations.id, r.id));
            if (r.roomId) {
              await db.update(rooms).set({ status: "dirty" } as any).where(eq(rooms.id, r.roomId));
            }
            autoCerradasCount++;
          }
        }
        naLog(`Auto-cierre: ${autoCerradasCount} reservas checked_in vencidas cerradas (${overdueCheckedIn.length - autoCerradasCount} con saldo pendiente)`);
      }

      // No-shows: confirmed/pending/tentative con checkout vencido (más de 1 día)
      // Se marcan como "no_show" para distinguirlas de cancelaciones voluntarias.
      // Reservas ya marcadas manualmente como no_show se saltean.
      const noShows = await db
        .select({ id: reservations.id, reservationCode: reservations.reservationCode })
        .from(reservations)
        .where(and(
          inArray(reservations.status, ["confirmed", "pending", "tentative"] as any),
          lte(reservations.checkOutDate, auditDate),
        ));

      if (noShows.length > 0) {
        for (const r of noShows) {
          await db.update(reservations).set({ status: "no_show" } as any).where(eq(reservations.id, r.id));
          autoNoShowCount++;
        }
        naLog(`Auto no-show: ${autoNoShowCount} reservas marcadas como no_show`);
      }
    } catch (autoErr: any) {
      naLog(`Error en auto-cierre de vencidas: ${autoErr.message}`);
      errors.push(`Auto-cierre: ${autoErr.message}`);
    }

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
    // PASO 2.5 — Alertas anticipadas de hospitalidad
    // Para cada llegada de mañana, crea alertas para huéspedes con preferencias
    // si todavía no existen alertas para esa reserva
    // ============================================================
    let advanceAlertsCreated = 0;
    try {
      if (arrivalsNextDay.length > 0) {
        const guestIds = arrivalsNextDay.map((r) => r.guestId).filter(Boolean) as string[];
        if (guestIds.length > 0) {
          const activePrefs = await db
            .select()
            .from(guestPreferences)
            .where(and(eq(guestPreferences.isActive, true), inArray(guestPreferences.guestId, guestIds)));

          // Obtener habitaciones para los arrivals
          const arrivalRoomIds = arrivalsNextDay.map((r) => r.roomId).filter(Boolean) as string[];
          const arrivalRooms = arrivalRoomIds.length > 0
            ? await db.select({ id: rooms.id, roomNumber: rooms.roomNumber }).from(rooms).where(inArray(rooms.id, arrivalRoomIds))
            : [];
          const arrivalRoomMap = new Map(arrivalRooms.map((r) => [r.id, r.roomNumber]));

          // Obtener alertas ya existentes para estas reservas (para evitar duplicados)
          const arrivalResIds = arrivalsNextDay.map((r) => r.id);
          const existingAlerts = await db
            .select({ reservationId: hospitalityAlerts.reservationId, preferenceId: hospitalityAlerts.preferenceId })
            .from(hospitalityAlerts)
            .where(inArray(hospitalityAlerts.reservationId, arrivalResIds));
          const existingKeys = new Set(existingAlerts.map((a) => `${a.reservationId}|${a.preferenceId}`));

          const prefsByGuest = new Map<string, typeof activePrefs>();
          for (const p of activePrefs) {
            if (!prefsByGuest.has(p.guestId)) prefsByGuest.set(p.guestId, []);
            prefsByGuest.get(p.guestId)!.push(p);
          }

          const areaMap: Record<string, string[]> = {
            alimentacion: ["restaurant", "reception"],
            habitacion: ["housekeeping", "reception"],
            amenities: ["housekeeping"],
            servicio: ["reception"],
            fecha_especial: ["reception"],
            motivo_viaje: ["reception"],
            nota_interna: ["reception"],
            otro: ["reception"],
          };

          for (const arrival of arrivalsNextDay) {
            if (!arrival.guestId) continue;
            const prefs = prefsByGuest.get(arrival.guestId) || [];
            if (prefs.length === 0) continue;

            const roomNumber = arrival.roomId ? arrivalRoomMap.get(arrival.roomId) : null;
            const roomLabel = roomNumber ? ` — Hab. ${roomNumber}` : " — llegada mañana";

            for (const pref of prefs) {
              const targetAreas = areaMap[pref.category] || ["reception"];
              for (const area of targetAreas) {
                const key = `${arrival.id}|${pref.id}`;
                if (existingKeys.has(key)) continue; // ya existe
                await db.insert(hospitalityAlerts).values({
                  id: randomUUID(),
                  reservationId: arrival.id,
                  guestId: arrival.guestId,
                  preferenceId: pref.id,
                  alertMessage: `[Llegada mañana${roomLabel}] ${pref.title}: ${pref.description || pref.title}`,
                  targetArea: area,
                  priority: pref.priority as any,
                  status: "pending",
                  isAcknowledged: false,
                  createdAt: new Date(),
                });
                existingKeys.add(key);
                advanceAlertsCreated++;
              }
            }
          }
          naLog(`Alertas anticipadas creadas: ${advanceAlertsCreated}`);
        }
      }
    } catch (advErr: any) {
      naLog(`Error generando alertas anticipadas: ${advErr.message}`);
      errors.push(`Alertas anticipadas: ${advErr.message}`);
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
        targetArea: "all",
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
      // Email reminders at 09:00 Argentina time
      if (hour === 9 && minute === 0) {
        naLog("Ejecutando scheduler de recordatorios de email...");
        const baseUrl = process.env.BASE_URL || "https://hotelier-pro--marcesvetliza.replit.app";
        runReminderScheduler(baseUrl)
          .then(stats => naLog(`Recordatorios email: ${stats.sent} enviados, ${stats.skipped} omitidos, ${stats.failed} fallidos`))
          .catch(err => naLog(`Error en scheduler de recordatorios: ${err.message}`));
      }
    } catch (err: any) {
      naLog(`Error en scheduler: ${err.message}`);
    }
  }, 60_000);
}

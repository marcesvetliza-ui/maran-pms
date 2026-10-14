import { afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool, withDatabaseTransaction } from "../db";
import { addCalendarDays } from "@shared/nightAuditDate";
import {
  computeRevenueBoard,
  getRevenueDayDetail,
  todayArgentina,
  captureDailyPaceSnapshot,
  ensureTodayPaceSnapshot,
  getPaceForStayDate,
} from "../revenue/metrics";

afterAll(() => pool.end());

const today = todayArgentina();
const rollback = () => new Error("rollback revenue metrics fixture");

async function seedRoomType(prefix: string) {
  const roomTypeId = prefix + "-type";
  await db.execute(sql`INSERT INTO room_types(id, code, name) VALUES (${roomTypeId}, ${prefix}, 'Prueba Revenue')`);
  return roomTypeId;
}

async function seedRoom(prefix: string, roomTypeId: string, suffix = "-101", opts: { isVirtual?: boolean; isActive?: boolean } = {}) {
  const roomId = prefix + suffix;
  await db.execute(sql`INSERT INTO rooms(id, room_number, room_type_id, is_virtual, is_active, status)
    VALUES (${roomId}, ${prefix + suffix}, ${roomTypeId}, ${opts.isVirtual ?? false}, ${opts.isActive ?? true}, 'available')`);
  return roomId;
}

async function seedGuest(prefix: string) {
  const guestId = prefix + "-guest";
  await db.execute(sql`INSERT INTO guests(id, first_name, last_name) VALUES (${guestId}, 'Prueba', 'Revenue')`);
  return guestId;
}

async function seedReservation(input: {
  id: string; guestId: string; roomTypeId: string; roomId: string;
  checkIn: string; checkOut: string; status: string; nights: number;
  finalRatePerNight: number | null; totalRoomAmount: number | null;
  specialRateReason?: string | null;
}) {
  await db.execute(sql`INSERT INTO reservations(
    id, reservation_code, guest_id, room_type_id, room_id, check_in_date, check_out_date,
    nights, status, number_of_guests, final_rate_per_night, total_room_amount, special_rate_reason, created_at
  ) VALUES (
    ${input.id}, ${input.id}, ${input.guestId}, ${input.roomTypeId}, ${input.roomId},
    ${input.checkIn}, ${input.checkOut}, ${input.nights}, ${input.status}, 1,
    ${input.finalRatePerNight}, ${input.totalRoomAmount}, ${input.specialRateReason ?? null}, now()
  )`);
}

async function seedGroup(prefix: string) {
  const groupId = prefix + "-group";
  await db.execute(sql`INSERT INTO groups(id, group_code, name, check_in_date, check_out_date, status, created_at)
    VALUES (${groupId}, ${prefix}, 'Grupo Prueba', '2000-01-01', '2000-01-02', 'confirmed', now())`);
  return groupId;
}

async function linkReservationToGroup(groupId: string, reservationId: string) {
  await db.execute(sql`INSERT INTO group_reservation_links(group_id, reservation_id) VALUES (${groupId}, ${reservationId})`);
}

async function seedGroupRoomBlock(input: {
  groupId: string; roomTypeId: string; quantity: number; agreedRate: number | null;
  blockCheckInDate: string | null; blockCheckOutDate: string | null;
}) {
  await db.execute(sql`INSERT INTO group_room_blocks(id, group_id, room_type_id, quantity, agreed_rate, block_check_in_date, block_check_out_date)
    VALUES (${randomUUID()}, ${input.groupId}, ${input.roomTypeId}, ${input.quantity}, ${input.agreedRate}, ${input.blockCheckInDate}, ${input.blockCheckOutDate})`);
}

async function seedGroupCharge(input: { groupId: string; amount: number; date: string; category: string; description?: string }) {
  await db.execute(sql`INSERT INTO group_charges(id, group_id, description, amount, date, category)
    VALUES (${randomUUID()}, ${input.groupId}, ${input.description ?? "Cargo de prueba"}, ${input.amount}, ${input.date}, ${input.category})`);
}

describe("computeRevenueBoard", () => {
  it("cuenta una reserva futura confirmada como vendida y calcula ADR/RevPAR sobre su tarifa", async () => {
    const prefix = randomUUID();
    const stayDate = addCalendarDays(today, 10);
    const toExclusive = addCalendarDays(stayDate, 1);
    await expect(withDatabaseTransaction(async () => {
      const roomTypeId = await seedRoomType(prefix);
      const roomId = await seedRoom(prefix, roomTypeId);
      const guestId = await seedGuest(prefix);
      await seedReservation({
        id: prefix + "-res", guestId, roomTypeId, roomId,
        checkIn: stayDate, checkOut: toExclusive, status: "confirmed", nights: 1,
        finalRatePerNight: 15000, totalRoomAmount: 15000,
      });

      const days = await computeRevenueBoard(stayDate, toExclusive);
      const day = days.find(d => d.date === stayDate)!;
      expect(day.isForecast).toBe(true);
      expect(day.roomsSold).toBeGreaterThanOrEqual(1);
      expect(day.ratedRoomNights).toBeGreaterThanOrEqual(1);
      expect(day.roomsWithMissingRate).toBe(0);
      expect(day.directRoomRevenue).toBeGreaterThanOrEqual(15000);
      expect(day.adr).toBeGreaterThan(0);
      expect(day.revpar).toBeGreaterThan(0);

      throw rollback();
    })).rejects.toThrow("rollback");
  });

  it("en una fecha pasada, una reserva solo 'confirmed' (nunca llegó) no cuenta como vendida", async () => {
    const prefix = randomUUID();
    const stayDate = addCalendarDays(today, -30);
    const toExclusive = addCalendarDays(stayDate, 1);
    await expect(withDatabaseTransaction(async () => {
      const roomTypeId = await seedRoomType(prefix);
      const roomId = await seedRoom(prefix, roomTypeId);
      const guestId = await seedGuest(prefix);
      await seedReservation({
        id: prefix + "-res", guestId, roomTypeId, roomId,
        checkIn: stayDate, checkOut: toExclusive, status: "confirmed", nights: 1,
        finalRatePerNight: 15000, totalRoomAmount: 15000,
      });

      const detail = await getRevenueDayDetail(stayDate);
      expect(detail.isForecast).toBe(false);
      expect(detail.reservations.find(r => r.reservationId === prefix + "-res")).toBeUndefined();

      throw rollback();
    })).rejects.toThrow("rollback");
  });

  it("en una fecha pasada, una reserva checked_out sí cuenta como ingreso real", async () => {
    const prefix = randomUUID();
    const stayDate = addCalendarDays(today, -30);
    const toExclusive = addCalendarDays(stayDate, 1);
    await expect(withDatabaseTransaction(async () => {
      const roomTypeId = await seedRoomType(prefix);
      const roomId = await seedRoom(prefix, roomTypeId);
      const guestId = await seedGuest(prefix);
      await seedReservation({
        id: prefix + "-res", guestId, roomTypeId, roomId,
        checkIn: stayDate, checkOut: toExclusive, status: "checked_out", nights: 1,
        finalRatePerNight: 20000, totalRoomAmount: 20000,
      });

      const detail = await getRevenueDayDetail(stayDate);
      const line = detail.reservations.find(r => r.reservationId === prefix + "-res");
      expect(line).toBeDefined();
      expect(line!.nightlyRate).toBe(20000);
      expect(line!.rateSource).toBe("final_rate_per_night");
      expect(line!.countsForAdr).toBe(true);

      throw rollback();
    })).rejects.toThrow("rollback");
  });

  it("prorratea total_room_amount por noche cuando final_rate_per_night está en 0 (evidencia exacta: nights es conocido)", async () => {
    const prefix = randomUUID();
    const checkIn = addCalendarDays(today, 5);
    const checkOut = addCalendarDays(today, 8); // 3 noches
    await expect(withDatabaseTransaction(async () => {
      const roomTypeId = await seedRoomType(prefix);
      const roomId = await seedRoom(prefix, roomTypeId);
      const guestId = await seedGuest(prefix);
      await seedReservation({
        id: prefix + "-res", guestId, roomTypeId, roomId,
        checkIn, checkOut, status: "confirmed", nights: 3,
        finalRatePerNight: 0, totalRoomAmount: 9000,
      });

      const middleNight = addCalendarDays(checkIn, 1);
      const detail = await getRevenueDayDetail(middleNight);
      const line = detail.reservations.find(r => r.reservationId === prefix + "-res");
      expect(line).toBeDefined();
      expect(line!.rateSource).toBe("total_room_amount_prorated");
      expect(line!.nightlyRate).toBe(3000);
      expect(line!.countsForAdr).toBe(true);

      throw rollback();
    })).rejects.toThrow("rollback");
  });

  it("un bloqueo de mantenimiento reduce las habitaciones disponibles ese día", async () => {
    const prefix = randomUUID();
    const stayDate = addCalendarDays(today, 20);
    await expect(withDatabaseTransaction(async () => {
      const roomTypeId = await seedRoomType(prefix);
      const roomId = await seedRoom(prefix, roomTypeId);
      const before = await getRevenueDayDetail(stayDate);
      const availableBefore = before.roomsAvailable;

      await db.execute(sql`INSERT INTO maintenance_blocks(id, room_id, block_from, block_to, blocked_by)
        VALUES (${prefix + "-block"}, ${roomId}, ${stayDate}, ${addCalendarDays(stayDate, 1)}, 'test')`);

      const after = await getRevenueDayDetail(stayDate);
      expect(after.roomsAvailable).toBe(availableBefore - 1);

      throw rollback();
    })).rejects.toThrow("rollback");
  });

  // ── Punto 1: separar alojamiento de otros cargos de grupo ──────────────────

  it("un cargo de grupo de categoría 'restaurant' NUNCA se suma al ingreso de alojamiento, se reporta aparte", async () => {
    const prefix = randomUUID();
    const stayDate = addCalendarDays(today, 15);
    const toExclusive = addCalendarDays(stayDate, 1);
    await expect(withDatabaseTransaction(async () => {
      const roomTypeId = await seedRoomType(prefix);
      const roomId = await seedRoom(prefix, roomTypeId);
      const guestId = await seedGuest(prefix);
      const groupId = await seedGroup(prefix);
      await seedReservation({
        id: prefix + "-res", guestId, roomTypeId, roomId,
        checkIn: stayDate, checkOut: toExclusive, status: "confirmed", nights: 1,
        finalRatePerNight: 18000, totalRoomAmount: 18000,
      });
      await linkReservationToGroup(groupId, prefix + "-res");
      // Categoría real de la única UI que carga esto (client/src/pages/group-detail.tsx):
      // nunca hay opción "alojamiento", solo extras.
      await seedGroupCharge({ groupId, amount: 25000, date: stayDate, category: "alimentos", description: "Cena de bienvenida" });

      const detail = await getRevenueDayDetail(stayDate);
      // El ingreso de alojamiento es SOLO el de la reserva; el cargo de restaurant
      // queda completamente afuera de directRoomRevenue/totalRevenue/ADR/RevPAR.
      expect(detail.directRoomRevenue).toBe(18000);
      expect(detail.totalRevenue).toBe(18000);
      expect(detail.adr).toBe(18000);
      // Se expone aparte, nunca mezclado.
      expect(detail.otherGroupChargesRevenue).toBe(25000);
      expect(detail.groupCharges).toHaveLength(1);
      expect(detail.groupCharges[0].category).toBe("alimentos");

      throw rollback();
    })).rejects.toThrow("rollback");
  });

  it("una reserva de grupo en $0 sin motivo y SIN bloque de habitaciones queda como 'missing_rate', excluida del ADR", async () => {
    const prefix = randomUUID();
    const stayDate = addCalendarDays(today, 16);
    const toExclusive = addCalendarDays(stayDate, 1);
    await expect(withDatabaseTransaction(async () => {
      const roomTypeId = await seedRoomType(prefix);
      const roomId = await seedRoom(prefix, roomTypeId);
      const guestId = await seedGuest(prefix);
      const groupId = await seedGroup(prefix);
      await seedReservation({
        id: prefix + "-res", guestId, roomTypeId, roomId,
        checkIn: stayDate, checkOut: toExclusive, status: "confirmed", nights: 1,
        finalRatePerNight: 0, totalRoomAmount: 0,
      });
      await linkReservationToGroup(groupId, prefix + "-res");
      // Cargo de grupo existe pero es de otra categoría (no alojamiento) — no debe
      // "rescatar" la tarifa de la habitación.
      await seedGroupCharge({ groupId, amount: 10000, date: stayDate, category: "eventos" });

      const detail = await getRevenueDayDetail(stayDate);
      const line = detail.reservations.find(r => r.reservationId === prefix + "-res");
      expect(line).toBeDefined();
      expect(line!.rateSource).toBe("missing_rate");
      expect(line!.countsForAdr).toBe(false);
      expect(detail.roomsSold).toBeGreaterThanOrEqual(1); // sigue contando para ocupación
      expect(detail.roomsWithMissingRate).toBeGreaterThanOrEqual(1);
      expect(detail.directRoomRevenue).toBe(0);
      expect(detail.otherGroupChargesRevenue).toBe(10000); // el cargo de eventos, aparte

      throw rollback();
    })).rejects.toThrow("rollback");
  });

  it("una reserva de grupo en $0 CON motivo confirmado cuenta como 'zero_with_reason', incluida en el ADR a $0", async () => {
    const prefix = randomUUID();
    const stayDate = addCalendarDays(today, 17);
    const toExclusive = addCalendarDays(stayDate, 1);
    await expect(withDatabaseTransaction(async () => {
      const roomTypeId = await seedRoomType(prefix);
      const roomId = await seedRoom(prefix, roomTypeId);
      const guestId = await seedGuest(prefix);
      await seedReservation({
        id: prefix + "-res", guestId, roomTypeId, roomId,
        checkIn: stayDate, checkOut: toExclusive, status: "confirmed", nights: 1,
        finalRatePerNight: 0, totalRoomAmount: 0, specialRateReason: "Cortesía por conformidad",
      });

      const detail = await getRevenueDayDetail(stayDate);
      const line = detail.reservations.find(r => r.reservationId === prefix + "-res");
      expect(line).toBeDefined();
      expect(line!.rateSource).toBe("zero_with_reason");
      expect(line!.countsForAdr).toBe(true);
      expect(detail.roomsWithMissingRate).toBe(0);

      throw rollback();
    })).rejects.toThrow("rollback");
  });

  it("grupo de varias noches con agreedRate en group_room_blocks distribuye la tarifa por noche a las reservas en $0 del mismo tipo de habitación", async () => {
    const prefix = randomUUID();
    const checkIn = addCalendarDays(today, 25);
    const checkOut = addCalendarDays(today, 28); // 3 noches
    await expect(withDatabaseTransaction(async () => {
      const roomTypeId = await seedRoomType(prefix);
      const roomA = await seedRoom(prefix, roomTypeId, "-A");
      const roomB = await seedRoom(prefix, roomTypeId, "-B");
      const guestA = prefix + "-guestA";
      const guestB = prefix + "-guestB";
      await db.execute(sql`INSERT INTO guests(id, first_name, last_name) VALUES (${guestA}, 'A', 'Grupo'), (${guestB}, 'B', 'Grupo')`);
      const groupId = await seedGroup(prefix);
      await seedGroupRoomBlock({
        groupId, roomTypeId, quantity: 2, agreedRate: 12000,
        blockCheckInDate: checkIn, blockCheckOutDate: checkOut,
      });

      for (const [resId, guestId, roomId] of [[prefix + "-resA", guestA, roomA], [prefix + "-resB", guestB, roomB]] as const) {
        await seedReservation({
          id: resId, guestId, roomTypeId, roomId,
          checkIn, checkOut, status: "confirmed", nights: 3,
          finalRatePerNight: 0, totalRoomAmount: 0,
        });
        await linkReservationToGroup(groupId, resId);
      }

      // Revisamos cada una de las 3 noches del bloque.
      for (const night of [checkIn, addCalendarDays(checkIn, 1), addCalendarDays(checkIn, 2)]) {
        const detail = await getRevenueDayDetail(night);
        const lineA = detail.reservations.find(r => r.reservationId === prefix + "-resA");
        const lineB = detail.reservations.find(r => r.reservationId === prefix + "-resB");
        expect(lineA?.rateSource).toBe("group_block_agreed_rate");
        expect(lineA?.nightlyRate).toBe(12000);
        expect(lineA?.countsForAdr).toBe(true);
        expect(lineB?.rateSource).toBe("group_block_agreed_rate");
        expect(lineB?.nightlyRate).toBe(12000);
        // Dos habitaciones del bloque, cada una a 12000 esa noche.
        expect(detail.directRoomRevenue).toBe(24000);
        expect(detail.roomsWithMissingRate).toBe(0);
      }

      throw rollback();
    })).rejects.toThrow("rollback");
  });

  it("agreedRate de un bloque NO se aplica a reservas de otro tipo de habitación (verificación de vínculo)", async () => {
    const prefix = randomUUID();
    const stayDate = addCalendarDays(today, 30);
    const toExclusive = addCalendarDays(stayDate, 1);
    await expect(withDatabaseTransaction(async () => {
      const blockedType = await seedRoomType(prefix + "a");
      const otherType = await seedRoomType(prefix + "b");
      const roomOther = await seedRoom(prefix, otherType);
      const guestId = await seedGuest(prefix);
      const groupId = await seedGroup(prefix);
      await seedGroupRoomBlock({
        groupId, roomTypeId: blockedType, quantity: 1, agreedRate: 30000,
        blockCheckInDate: stayDate, blockCheckOutDate: toExclusive,
      });
      await seedReservation({
        id: prefix + "-res", guestId, roomTypeId: otherType, roomId: roomOther,
        checkIn: stayDate, checkOut: toExclusive, status: "confirmed", nights: 1,
        finalRatePerNight: 0, totalRoomAmount: 0,
      });
      await linkReservationToGroup(groupId, prefix + "-res");

      const detail = await getRevenueDayDetail(stayDate);
      const line = detail.reservations.find(r => r.reservationId === prefix + "-res");
      expect(line?.rateSource).toBe("missing_rate");
      expect(line?.nightlyRate).toBe(0);

      throw rollback();
    })).rejects.toThrow("rollback");
  });

  // ── Punto 3: mismo universo de habitaciones operativas ──────────────────────

  it("una reserva sobre una habitación virtual no cuenta ni en roomsSold ni en roomsAvailable", async () => {
    const prefix = randomUUID();
    const stayDate = addCalendarDays(today, 22);
    const toExclusive = addCalendarDays(stayDate, 1);
    await expect(withDatabaseTransaction(async () => {
      const roomTypeId = await seedRoomType(prefix);
      const realRoom = await seedRoom(prefix, roomTypeId, "-real");
      const virtualRoom = await seedRoom(prefix, roomTypeId, "-virtual", { isVirtual: true });
      const guestId = await seedGuest(prefix);

      const beforeDetail = await getRevenueDayDetail(stayDate);
      const availableBefore = beforeDetail.roomsAvailable;

      await seedReservation({
        id: prefix + "-res-virtual", guestId, roomTypeId, roomId: virtualRoom,
        checkIn: stayDate, checkOut: toExclusive, status: "confirmed", nights: 1,
        finalRatePerNight: 99999, totalRoomAmount: 99999,
      });

      const afterDetail = await getRevenueDayDetail(stayDate);
      // La habitación virtual nunca entró al denominador (no cambia roomsAvailable)...
      expect(afterDetail.roomsAvailable).toBe(availableBefore);
      // ...y la reserva sobre ella tampoco entra al numerador: mismo universo.
      expect(afterDetail.reservations.find(r => r.reservationId === prefix + "-res-virtual")).toBeUndefined();
      expect(afterDetail.directRoomRevenue).toBe(0);

      throw rollback();
    })).rejects.toThrow("rollback");
  });

  it("una reserva sobre una habitación inactiva no cuenta ni en roomsSold ni en roomsAvailable", async () => {
    const prefix = randomUUID();
    const stayDate = addCalendarDays(today, 23);
    const toExclusive = addCalendarDays(stayDate, 1);
    await expect(withDatabaseTransaction(async () => {
      const roomTypeId = await seedRoomType(prefix);
      const inactiveRoom = await seedRoom(prefix, roomTypeId, "-inactive", { isActive: false });
      const guestId = await seedGuest(prefix);

      await seedReservation({
        id: prefix + "-res-inactive", guestId, roomTypeId, roomId: inactiveRoom,
        checkIn: stayDate, checkOut: toExclusive, status: "confirmed", nights: 1,
        finalRatePerNight: 50000, totalRoomAmount: 50000,
      });

      const detail = await getRevenueDayDetail(stayDate);
      expect(detail.reservations.find(r => r.reservationId === prefix + "-res-inactive")).toBeUndefined();

      throw rollback();
    })).rejects.toThrow("rollback");
  });
});

describe("pace snapshots", () => {
  it("captureDailyPaceSnapshot es idempotente: correrlo dos veces no duplica filas", async () => {
    const prefix = randomUUID();
    await expect(withDatabaseTransaction(async () => {
      const roomTypeId = await seedRoomType(prefix);
      await seedRoom(prefix, roomTypeId);

      await captureDailyPaceSnapshot(5);
      const [{ count: firstCount }] = (await db.execute(
        sql`SELECT count(*)::int AS count FROM revenue_pace_snapshots WHERE snapshot_date = ${today}`,
      )).rows as any[];

      await captureDailyPaceSnapshot(5);
      const [{ count: secondCount }] = (await db.execute(
        sql`SELECT count(*)::int AS count FROM revenue_pace_snapshots WHERE snapshot_date = ${today}`,
      )).rows as any[];

      expect(secondCount).toBe(firstCount);

      throw rollback();
    })).rejects.toThrow("rollback");
  });

  it("ensureTodayPaceSnapshot no vuelve a insertar si ya existe el run del día", async () => {
    await expect(withDatabaseTransaction(async () => {
      await captureDailyPaceSnapshot(3);
      const [{ count: afterFirst }] = (await db.execute(
        sql`SELECT count(*)::int AS count FROM revenue_pace_snapshots WHERE snapshot_date = ${today}`,
      )).rows as any[];

      await ensureTodayPaceSnapshot();
      const [{ count: afterSecond }] = (await db.execute(
        sql`SELECT count(*)::int AS count FROM revenue_pace_snapshots WHERE snapshot_date = ${today}`,
      )).rows as any[];

      expect(afterSecond).toBe(afterFirst);

      throw rollback();
    })).rejects.toThrow("rollback");
  });

  it("getPaceForStayDate señala yoyAvailable=false cuando no hay snapshot de hace un año", async () => {
    const stayDate = addCalendarDays(today, 40);
    await expect(withDatabaseTransaction(async () => {
      await db.execute(sql`DELETE FROM revenue_pace_snapshots WHERE stay_date = ${stayDate} OR stay_date = ${addCalendarDays(stayDate, -365)}`);
      await db.execute(sql`INSERT INTO revenue_pace_snapshots(snapshot_date, stay_date, rooms_sold, room_revenue)
        VALUES (${today}, ${stayDate}, 3, 30000)`);

      const report = await getPaceForStayDate(stayDate);
      expect(report.yoyAvailable).toBe(false);
      expect(report.message).not.toBeNull();
      expect(report.currentYear.length).toBeGreaterThanOrEqual(1);
      expect(report.previousYear.length).toBe(0);

      throw rollback();
    })).rejects.toThrow("rollback");
  });

  it("getPaceForStayDate compara contra el mismo lead time de hace un año cuando existe ese snapshot", async () => {
    const stayDate = addCalendarDays(today, 40);
    const lastYearStayDate = addCalendarDays(stayDate, -365);
    const lastYearSnapshotDate = addCalendarDays(today, -365);
    await expect(withDatabaseTransaction(async () => {
      await db.execute(sql`DELETE FROM revenue_pace_snapshots WHERE stay_date = ${stayDate} OR stay_date = ${lastYearStayDate}`);
      await db.execute(sql`INSERT INTO revenue_pace_snapshots(snapshot_date, stay_date, rooms_sold, room_revenue)
        VALUES (${today}, ${stayDate}, 4, 40000)`);
      await db.execute(sql`INSERT INTO revenue_pace_snapshots(snapshot_date, stay_date, rooms_sold, room_revenue)
        VALUES (${lastYearSnapshotDate}, ${lastYearStayDate}, 2, 18000)`);

      const report = await getPaceForStayDate(stayDate);
      expect(report.yoyAvailable).toBe(true);
      expect(report.message).toBeNull();
      expect(report.currentYear[0].leadDays).toBe(40);
      expect(report.previousYear[0].leadDays).toBe(40);
      expect(report.previousYear[0].roomsSold).toBe(2);

      throw rollback();
    })).rejects.toThrow("rollback");
  });

  // ── Punto 4: captura transaccional, completa y sin huecos silenciosos ──────

  it("una captura interrumpida a mitad de camino no deja filas parciales (todo o nada)", async () => {
    // Este escenario necesita COMMIT/ROLLBACK reales (no el savepoint
    // compartido del resto del archivo), así que corre fuera del wrapper de
    // limpieza automática y se limpia a mano al final.
    const prefix = randomUUID();
    const roomTypeId = prefix + "-type";
    const roomId = prefix + "-101";
    const snapshotDate = today;
    try {
      await db.execute(sql`INSERT INTO room_types(id, code, name) VALUES (${roomTypeId}, ${prefix}, 'Prueba Interrupcion')`);
      await db.execute(sql`INSERT INTO rooms(id, room_number, room_type_id, is_virtual, is_active, status)
        VALUES (${roomId}, ${roomId}, ${roomTypeId}, false, true, 'available')`);

      // Se interrumpe deliberadamente después de upsertear 2 de los 10 días del horizonte.
      await expect(captureDailyPaceSnapshot(10, 2)).rejects.toThrow("interrumpida");

      const snapshotRows = (await db.execute(
        sql`SELECT count(*)::int AS count FROM revenue_pace_snapshots WHERE snapshot_date = ${snapshotDate}`,
      )).rows as any[];
      const runRows = (await db.execute(
        sql`SELECT count(*)::int AS count FROM revenue_pace_snapshot_runs WHERE snapshot_date = ${snapshotDate}`,
      )).rows as any[];

      // Ni las 2 filas que alcanzó a upsertear antes del throw, ni el
      // registro de corrida: la transacción entera se descartó.
      expect(snapshotRows[0].count).toBe(0);
      expect(runRows[0].count).toBe(0);
    } finally {
      await db.execute(sql`DELETE FROM reservations WHERE room_id = ${roomId}`);
      await db.execute(sql`DELETE FROM rooms WHERE id = ${roomId}`);
      await db.execute(sql`DELETE FROM room_types WHERE id = ${roomTypeId}`);
      await db.execute(sql`DELETE FROM revenue_pace_snapshots WHERE snapshot_date = ${snapshotDate}`);
      await db.execute(sql`DELETE FROM revenue_pace_snapshot_runs WHERE snapshot_date = ${snapshotDate}`);
    }
  });

  it("una captura completa SÍ deja el run log y todas las filas del horizonte, de forma consistente", async () => {
    const prefix = randomUUID();
    const roomTypeId = prefix + "-type";
    const roomId = prefix + "-101";
    const snapshotDate = today;
    try {
      await db.execute(sql`INSERT INTO room_types(id, code, name) VALUES (${roomTypeId}, ${prefix}, 'Prueba Completa')`);
      await db.execute(sql`INSERT INTO rooms(id, room_number, room_type_id, is_virtual, is_active, status)
        VALUES (${roomId}, ${roomId}, ${roomTypeId}, false, true, 'available')`);

      const result = await captureDailyPaceSnapshot(7);
      expect(result.daysCaptured).toBe(7);

      const snapshotRows = (await db.execute(
        sql`SELECT count(*)::int AS count FROM revenue_pace_snapshots WHERE snapshot_date = ${snapshotDate}`,
      )).rows as any[];
      const runRows = (await db.execute(
        sql`SELECT days_captured, horizon_days FROM revenue_pace_snapshot_runs WHERE snapshot_date = ${snapshotDate}`,
      )).rows as any[];

      expect(snapshotRows[0].count).toBeGreaterThanOrEqual(7);
      expect(runRows).toHaveLength(1);
      expect(runRows[0].days_captured).toBe(7);
      expect(runRows[0].horizon_days).toBe(7);
    } finally {
      await db.execute(sql`DELETE FROM reservations WHERE room_id = ${roomId}`);
      await db.execute(sql`DELETE FROM rooms WHERE id = ${roomId}`);
      await db.execute(sql`DELETE FROM room_types WHERE id = ${roomTypeId}`);
      await db.execute(sql`DELETE FROM revenue_pace_snapshots WHERE snapshot_date = ${snapshotDate}`);
      await db.execute(sql`DELETE FROM revenue_pace_snapshot_runs WHERE snapshot_date = ${snapshotDate}`);
    }
  });

  it("getPaceForStayDate expone huecos reales de historial cuando faltan días de captura", async () => {
    const stayDate = addCalendarDays(today, 50);
    const gapDate = addCalendarDays(today, -2);
    const trackedDate = addCalendarDays(today, -3);
    await expect(withDatabaseTransaction(async () => {
      await db.execute(sql`DELETE FROM revenue_pace_snapshot_runs WHERE snapshot_date >= ${trackedDate}`);
      // Hay captura hace 3 días y hoy, pero falta la de hace 2 días: un hueco real.
      await db.execute(sql`INSERT INTO revenue_pace_snapshot_runs(snapshot_date, days_captured, horizon_days) VALUES (${trackedDate}, 1, 1)`);
      await db.execute(sql`INSERT INTO revenue_pace_snapshot_runs(snapshot_date, days_captured, horizon_days) VALUES (${today}, 1, 1)
        ON CONFLICT (snapshot_date) DO NOTHING`);

      const report = await getPaceForStayDate(stayDate);
      expect(report.trackingStartDate).toBe(trackedDate);
      expect(report.missingSnapshotDates).toContain(gapDate);

      throw rollback();
    })).rejects.toThrow("rollback");
  });
});

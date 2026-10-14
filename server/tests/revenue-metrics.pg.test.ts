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

async function seedRoom(prefix: string, roomTypeId: string, suffix = "-101") {
  const roomId = prefix + suffix;
  await db.execute(sql`INSERT INTO rooms(id, room_number, room_type_id, is_virtual, is_active, status)
    VALUES (${roomId}, ${prefix + suffix}, ${roomTypeId}, false, true, 'available')`);
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
}) {
  await db.execute(sql`INSERT INTO reservations(
    id, reservation_code, guest_id, room_type_id, room_id, check_in_date, check_out_date,
    nights, status, number_of_guests, final_rate_per_night, total_room_amount, created_at
  ) VALUES (
    ${input.id}, ${input.id}, ${input.guestId}, ${input.roomTypeId}, ${input.roomId},
    ${input.checkIn}, ${input.checkOut}, ${input.nights}, ${input.status}, 1,
    ${input.finalRatePerNight}, ${input.totalRoomAmount}, now()
  )`);
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

      throw rollback();
    })).rejects.toThrow("rollback");
  });

  it("prorratea total_room_amount por noche cuando final_rate_per_night está en 0", async () => {
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

      throw rollback();
    })).rejects.toThrow("rollback");
  });

  it("suma group_charges del día como ingreso de grupo sin tratar la habitación como regalada", async () => {
    const prefix = randomUUID();
    const stayDate = addCalendarDays(today, 15);
    const toExclusive = addCalendarDays(stayDate, 1);
    const groupId = prefix + "-group";
    await expect(withDatabaseTransaction(async () => {
      const roomTypeId = await seedRoomType(prefix);
      const roomId = await seedRoom(prefix, roomTypeId);
      const guestId = await seedGuest(prefix);
      await seedReservation({
        id: prefix + "-res", guestId, roomTypeId, roomId,
        checkIn: stayDate, checkOut: toExclusive, status: "confirmed", nights: 1,
        finalRatePerNight: 0, totalRoomAmount: 0,
      });
      await db.execute(sql`INSERT INTO group_charges(id, group_id, description, amount, date, category)
        VALUES (${prefix + "-charge"}, ${groupId}, 'Tarifa pactada de grupo', 50000, ${stayDate}, 'alojamiento')`);

      const detail = await getRevenueDayDetail(stayDate);
      const line = detail.reservations.find(r => r.reservationId === prefix + "-res");
      expect(line).toBeDefined();
      expect(line!.nightlyRate).toBe(0);
      expect(detail.roomsSold).toBeGreaterThanOrEqual(1);
      expect(detail.groupChargesRevenue).toBeGreaterThanOrEqual(50000);
      expect(detail.totalRevenue).toBeGreaterThanOrEqual(50000);

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

  it("ensureTodayPaceSnapshot no vuelve a insertar si ya existe el snapshot del día", async () => {
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
});

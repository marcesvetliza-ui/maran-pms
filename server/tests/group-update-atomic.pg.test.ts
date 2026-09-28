import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../db";
import { storage } from "../db-storage";
import {
  groups,
  guests,
  roomTypes,
  rooms,
  reservations,
  groupReservationLinks,
} from "@shared/schema";
import { randomUUID } from "node:crypto";

const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabaseIsConfigured("reprogramación atómica de grupos", () => {
  const ids = {
    group: randomUUID(),
    type: randomUUID(),
    guest: randomUUID(),
    room1: randomUUID(),
    room2: randomUUID(),
    reservation1: randomUUID(),
    reservation2: randomUUID(),
    link1: randomUUID(),
    link2: randomUUID(),
  };

  afterEach(async () => {
    await db.delete(groupReservationLinks).where(inArray(groupReservationLinks.id, [ids.link1, ids.link2]));
    await db.delete(reservations).where(inArray(reservations.id, [ids.reservation1, ids.reservation2]));
    await db.delete(groups).where(eq(groups.id, ids.group));
    await db.delete(rooms).where(inArray(rooms.id, [ids.room1, ids.room2]));
    await db.delete(guests).where(eq(guests.id, ids.guest));
    await db.delete(roomTypes).where(eq(roomTypes.id, ids.type));
  });

  it("revierte grupo, reservas y habitaciones si falla después del primer write", async () => {
    await db.insert(roomTypes).values({ id: ids.type, code: `AT-${ids.type.slice(0, 8)}`, name: "Atomic test" });
    await db.insert(guests).values({ id: ids.guest, firstName: "Atomic", lastName: "Test" });
    await db.insert(rooms).values([
      { id: ids.room1, roomNumber: `AT1-${ids.room1.slice(0, 8)}`, roomTypeId: ids.type, status: "available" },
      { id: ids.room2, roomNumber: `AT2-${ids.room2.slice(0, 8)}`, roomTypeId: ids.type, status: "available" },
    ]);
    await db.insert(groups).values({
      id: ids.group,
      groupCode: `ATG-${ids.group.slice(0, 8)}`,
      name: "Atomic group",
      checkInDate: "2030-01-10",
      checkOutDate: "2030-01-12",
      status: "tentative",
      createdAt: new Date(),
    });
    await db.insert(reservations).values([
      {
        id: ids.reservation1, reservationCode: `ATR1-${ids.reservation1.slice(0, 8)}`,
        guestId: ids.guest, roomTypeId: ids.type, roomId: ids.room1,
        checkInDate: "2030-01-10", checkOutDate: "2030-01-12", status: "confirmed", createdAt: new Date(),
      },
      {
        id: ids.reservation2, reservationCode: `ATR2-${ids.reservation2.slice(0, 8)}`,
        guestId: ids.guest, roomTypeId: ids.type, roomId: ids.room2,
        checkInDate: "2030-01-10", checkOutDate: "2030-01-12", status: "confirmed", createdAt: new Date(),
      },
    ]);
    await db.insert(groupReservationLinks).values([
      { id: ids.link1, groupId: ids.group, reservationId: ids.reservation1 },
      { id: ids.link2, groupId: ids.group, reservationId: ids.reservation2 },
    ]);

    const before = {
      group: (await db.select().from(groups).where(eq(groups.id, ids.group)))[0],
      reservations: await db.select().from(reservations).where(inArray(reservations.id, [ids.reservation1, ids.reservation2])),
      rooms: await db.select().from(rooms).where(inArray(rooms.id, [ids.room1, ids.room2])),
    };
    await expect(storage.updateGroupAtomic(ids.group, {
      patch: { checkInDate: "2030-02-10", checkOutDate: "2030-02-12" },
      failAfterFirstWrite: true,
    })).rejects.toThrow("test-only atomic group failure");

    const after = {
      group: (await db.select().from(groups).where(eq(groups.id, ids.group)))[0],
      reservations: await db.select().from(reservations).where(inArray(reservations.id, [ids.reservation1, ids.reservation2])),
      rooms: await db.select().from(rooms).where(inArray(rooms.id, [ids.room1, ids.room2])),
    };
    expect(after).toEqual(before);
  });
});

afterEach(async () => {
  // Keep the shared pool from retaining a checked-out client when this file is
  // skipped or when a fixture cleanup itself fails.
  await pool.query("SELECT 1");
});
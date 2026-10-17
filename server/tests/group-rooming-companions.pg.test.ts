/**
 * storage.getGroup (buildGroupWithDetails) must attach each reservation's
 * real, named companions from reservation_companions — the Rooming List
 * print/preview in group-detail.tsx reads group.reservations[].companions
 * directly, with no other enrichment step populating it (see db-storage.ts).
 *
 * Covers: titular + companions, a reservation with none, no mixing across
 * rooms/reservations, and a defensive guard against a companion row whose
 * guestId accidentally matches its own reservation's titular.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prefix = "rooming-comp-" + randomUUID();

const roomTypeId = prefix;
const roomAId = prefix + "-room-a";
const roomBId = prefix + "-room-b";
const guestTitularAId = prefix + "-guest-a";
const guestTitularBId = prefix + "-guest-b";
const groupId = prefix;
let reservationAId: string;
let reservationBId: string;

suite("storage.getGroup — acompañantes reales por habitación", () => {
  beforeAll(async () => {
    await pool.query(
      "INSERT INTO room_types(id,code,name) VALUES ($1,$2,'Rooming companions test')",
      [roomTypeId, roomTypeId],
    );
    await pool.query(
      "INSERT INTO rooms(id,room_number,room_type_id,status) VALUES ($1,'101',$2,'available'),($3,'102',$2,'available')",
      [roomAId, roomTypeId, roomBId],
    );
    await pool.query(
      "INSERT INTO guests(id,first_name,last_name,document_number) VALUES ($1,'Gustavo','Holgado',$2),($3,'Nicolas','Abreu',$4)",
      [guestTitularAId, guestTitularAId, guestTitularBId, guestTitularBId],
    );
    await pool.query(
      "INSERT INTO groups(id,group_code,name,check_in_date,check_out_date,created_at) VALUES ($1,$2,'Rooming companions test','2027-02-01','2027-02-03',now())",
      [groupId, groupId],
    );
    reservationAId = (await pool.query(
      "INSERT INTO reservations(reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,nights,status,number_of_guests,created_at,final_rate_per_night) VALUES ($1,$2,$3,$4,'2027-02-01','2027-02-03',2,'confirmed',3,now(),10000) RETURNING id",
      [prefix + "-res-a", guestTitularAId, roomTypeId, roomAId],
    )).rows[0].id;
    reservationBId = (await pool.query(
      "INSERT INTO reservations(reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,nights,status,number_of_guests,created_at,final_rate_per_night) VALUES ($1,$2,$3,$4,'2027-02-01','2027-02-03',2,'confirmed',1,now(),10000) RETURNING id",
      [prefix + "-res-b", guestTitularBId, roomTypeId, roomBId],
    )).rows[0].id;
    await pool.query(
      "INSERT INTO group_reservation_links(group_id,reservation_id) VALUES ($1,$2),($1,$3)",
      [groupId, reservationAId, reservationBId],
    );
    // Room A: titular Holgado + two real companions.
    await pool.query(
      "INSERT INTO reservation_companions(id,reservation_id,first_name,last_name,document_type,document_number) VALUES ($1,$2,'Lara','DeHolgado','DNI','11111111'),($3,$2,'Juan','DeHolgado','DNI','22222222')",
      [randomUUID(), reservationAId, randomUUID()],
    );
    // Defensive case: a companion row on reservation A whose guestId matches
    // its own titular — must never be returned as a companion (no duplicating
    // the titular into their own companion list).
    await pool.query(
      "INSERT INTO reservation_companions(id,reservation_id,first_name,last_name,document_type,document_number,guest_id) VALUES ($1,$2,'Gustavo','Holgado','DNI',$3,$4)",
      [randomUUID(), reservationAId, "33333333", guestTitularAId],
    );
    // Room B: titular Abreu, no companions at all.
  });

  afterAll(async () => {
    await pool.query("DELETE FROM reservation_companions WHERE reservation_id = ANY($1::varchar[])", [[reservationAId, reservationBId]]);
    await pool.query("DELETE FROM group_reservation_links WHERE group_id=$1", [groupId]);
    await pool.query("DELETE FROM reservations WHERE id = ANY($1::varchar[])", [[reservationAId, reservationBId]]);
    await pool.query("DELETE FROM groups WHERE id=$1", [groupId]);
    await pool.query("DELETE FROM rooms WHERE id = ANY($1::varchar[])", [[roomAId, roomBId]]);
    await pool.query("DELETE FROM room_types WHERE id=$1", [roomTypeId]);
    await pool.query("DELETE FROM guests WHERE id = ANY($1::varchar[])", [[guestTitularAId, guestTitularBId]]);
    await pool.end();
  });

  it("trae al titular con sus acompañantes reales, nombre completo, sin inventar datos", async () => {
    const { storage } = await import("../db-storage");
    const group = await storage.getGroup(groupId);
    const resA = group!.reservations.find(r => r.id === reservationAId)!;
    expect(resA.guest.lastName).toBe("Holgado");
    const names = (resA.companions ?? []).map(c => `${c.lastName} ${c.firstName}`).sort();
    expect(names).toEqual(["DeHolgado Juan", "DeHolgado Lara"]);
  });

  it("una reserva sin acompañantes trae una lista vacía, no indefinida", async () => {
    const { storage } = await import("../db-storage");
    const group = await storage.getGroup(groupId);
    const resB = group!.reservations.find(r => r.id === reservationBId)!;
    expect(resB.companions).toEqual([]);
  });

  it("no mezcla acompañantes entre habitaciones/reservas distintas", async () => {
    const { storage } = await import("../db-storage");
    const group = await storage.getGroup(groupId);
    const resA = group!.reservations.find(r => r.id === reservationAId)!;
    const resB = group!.reservations.find(r => r.id === reservationBId)!;
    const namesInA = (resA.companions ?? []).map(c => c.lastName);
    expect(namesInA.every(n => n === "DeHolgado")).toBe(true);
    expect(resB.companions).toEqual([]);
  });

  it("nunca duplica al titular como su propio acompañante", async () => {
    const { storage } = await import("../db-storage");
    const group = await storage.getGroup(groupId);
    const resA = group!.reservations.find(r => r.id === reservationAId)!;
    const selfDuplicates = (resA.companions ?? []).filter(c => c.guestId === resA.guestId);
    expect(selfDuplicates).toEqual([]);
    expect((resA.companions ?? []).length).toBe(2);
  });
});

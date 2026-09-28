import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { storage } from "../db-storage";

const configured = Boolean(process.env.DATABASE_URL);
const suite = configured ? describe : describe.skip;
const pool = configured ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 }) : null;

async function makeVoucher(valueAmount = "1000.00") {
  const code = await storage.generateVoucherCode();
  return storage.createGiftVoucher({
    voucherCode: code, area: "alojamiento", description: "Voucher de prueba", valueType: "monetario",
    valueAmount, buyerName: "Comprador Test", status: "activo",
  } as any);
}

function baseReservationData(overrides: Record<string, any> = {}) {
  const id = randomUUID();
  return {
    reservationCode: `RES-TEST-${id}`,
    guestId: `guest-${id}`,
    roomTypeId: `type-${id}`,
    roomId: `room-${id}`,
    checkInDate: "2026-11-01",
    checkOutDate: "2026-11-02",
    nights: 1,
    status: "confirmed" as const,
    createdAt: new Date(),
    ...overrides,
  };
}

async function createReservationFixture(overrides: Record<string, any> = {}) {
  const data = baseReservationData(overrides);
  await pool!.query(
    `INSERT INTO room_types (id, code, name)
     VALUES ($1, $2, 'Voucher alojamiento test')`,
    [data.roomTypeId, `VCH-${randomUUID().slice(0, 8)}`],
  );
  await pool!.query(
    `INSERT INTO rooms (id, room_number, room_type_id, status)
     VALUES ($1, $2, $3, 'available')`,
    [data.roomId, `VCH-${randomUUID().slice(0, 8)}`, data.roomTypeId],
  );
  return data;
}

async function cleanupReservationFixture(data: ReturnType<typeof baseReservationData>) {
  await pool?.query("DELETE FROM rooms WHERE id = $1", [data.roomId]);
  await pool?.query("DELETE FROM room_types WHERE id = $1", [data.roomTypeId]);
}

async function cleanupVoucher(voucherId: string) {
  await pool?.query("DELETE FROM gift_voucher_events WHERE voucher_id = $1", [voucherId]);
  await pool?.query("DELETE FROM gift_voucher_applications WHERE voucher_id = $1", [voucherId]);
  await pool?.query("DELETE FROM gift_vouchers WHERE id = $1", [voucherId]);
}

suite("PostgreSQL: voucher de regalo aplicado a una reserva de alojamiento", () => {
  afterAll(async () => { await pool?.end(); });

  it("crear con voucher aplica y reserva el voucher; cancelar la reserva lo libera", async () => {
    const voucher = await makeVoucher();
    const reservationData = await createReservationFixture({
      voucherId: voucher.id, voucherAppliedAmount: "1000.00",
    });
    let reservationId: string | null = null;
    try {
      const reservation = await storage.createReservation(reservationData as any);
      reservationId = reservation.id;

      const afterCreate = await storage.getGiftVoucher(voucher.id);
      expect(afterCreate?.status).toBe("reservado");

      await storage.updateReservation(reservationId, { status: "cancelled" } as any);

      const afterCancel = await storage.getGiftVoucher(voucher.id);
      expect(afterCancel?.status).toBe("activo");

      const reservationAfter = await storage.getReservation(reservationId);
      expect(reservationAfter?.voucherId).toBeNull();
    } finally {
      if (reservationId) await pool?.query("DELETE FROM reservations WHERE id = $1", [reservationId]);
      await cleanupVoucher(voucher.id);
      await cleanupReservationFixture(reservationData);
    }
  });

  it("checked_out consume el voucher aplicado", async () => {
    const voucher = await makeVoucher();
    const reservationData = await createReservationFixture({
      voucherId: voucher.id, voucherAppliedAmount: "1000.00",
    });
    let reservationId: string | null = null;
    try {
      const reservation = await storage.createReservation(reservationData as any);
      reservationId = reservation.id;

      await storage.updateReservation(reservationId, { status: "checked_in" } as any);
      await storage.updateReservation(reservationId, { status: "checked_out" } as any);

      const afterCheckout = await storage.getGiftVoucher(voucher.id);
      expect(afterCheckout?.status).toBe("utilizado");
    } finally {
      if (reservationId) await pool?.query("DELETE FROM reservations WHERE id = $1", [reservationId]);
      await cleanupVoucher(voucher.id);
      await cleanupReservationFixture(reservationData);
    }
  });

  it("no crea la reserva si el voucher ya no está disponible", async () => {
    const voucher = await makeVoucher();
    const firstReservationData = await createReservationFixture({
      voucherId: voucher.id, voucherAppliedAmount: "1000.00",
    });
    const secondReservationData = await createReservationFixture({
      voucherId: voucher.id, voucherAppliedAmount: "1000.00",
    });
    let firstReservationId: string | null = null;
    try {
      const first = await storage.createReservation(firstReservationData as any);
      firstReservationId = first.id;

      await expect(
        storage.createReservation(secondReservationData as any),
      ).rejects.toThrow();

      const reservationsWithVoucher = await pool!.query(
        "SELECT id FROM reservations WHERE voucher_id = $1", [voucher.id],
      );
      expect(reservationsWithVoucher.rows).toHaveLength(1);
    } finally {
      if (firstReservationId) await pool?.query("DELETE FROM reservations WHERE id = $1", [firstReservationId]);
      await cleanupVoucher(voucher.id);
      await cleanupReservationFixture(firstReservationData);
      await cleanupReservationFixture(secondReservationData);
    }
  });
});

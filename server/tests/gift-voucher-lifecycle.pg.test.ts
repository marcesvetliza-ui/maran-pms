import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { storage } from "../db-storage";

const configured = Boolean(process.env.DATABASE_URL);
const suite = configured ? describe : describe.skip;
const pool = configured ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 }) : null;

async function makeVoucher(area: "alojamiento" | "restaurant" = "alojamiento", valueAmount = "1000.00") {
  const code = await storage.generateVoucherCode();
  return storage.createGiftVoucher({
    voucherCode: code,
    area,
    description: "Voucher de prueba",
    valueType: "monetario",
    valueAmount,
    buyerName: "Comprador Test",
    status: "activo",
  } as any);
}

suite("PostgreSQL: ciclo de vida de vouchers de regalo", () => {
  afterAll(async () => { await pool?.end(); });

  it("aplicar → liberar deja el voucher activo de nuevo", async () => {
    const voucher = await makeVoucher();
    const targetId = `res-${randomUUID()}`;
    try {
      const { application, voucher: afterApply } = await storage.applyGiftVoucher(
        voucher.id, "reservation", targetId, 1000, "tester",
      );
      expect(afterApply.status).toBe("reservado");
      expect(application.status).toBe("reservado");

      const released = await storage.releaseGiftVoucherApplication(application.id, "tester", "test release");
      expect(released?.status).toBe("liberado");

      const afterRelease = await storage.getGiftVoucher(voucher.id);
      expect(afterRelease?.status).toBe("activo");

      const events = await storage.getGiftVoucherEvents(voucher.id);
      expect(events.map(e => e.eventType)).toEqual(
        expect.arrayContaining(["emitido", "reservado", "liberado"]),
      );
    } finally {
      await pool?.query("DELETE FROM gift_voucher_events WHERE voucher_id = $1", [voucher.id]);
      await pool?.query("DELETE FROM gift_voucher_applications WHERE voucher_id = $1", [voucher.id]);
      await pool?.query("DELETE FROM gift_vouchers WHERE id = $1", [voucher.id]);
    }
  });

  it("aplicar → consumir deja el voucher utilizado", async () => {
    const voucher = await makeVoucher();
    const targetId = `order-${randomUUID()}`;
    try {
      const { application } = await storage.applyGiftVoucher(voucher.id, "restaurant_order", targetId, 500, "tester");
      const consumed = await storage.consumeGiftVoucherApplication(application.id, "tester");
      expect(consumed?.status).toBe("utilizado");

      const afterConsume = await storage.getGiftVoucher(voucher.id);
      expect(afterConsume?.status).toBe("utilizado");
      expect(afterConsume?.usedBy).toBe("tester");
    } finally {
      await pool?.query("DELETE FROM gift_voucher_events WHERE voucher_id = $1", [voucher.id]);
      await pool?.query("DELETE FROM gift_voucher_applications WHERE voucher_id = $1", [voucher.id]);
      await pool?.query("DELETE FROM gift_vouchers WHERE id = $1", [voucher.id]);
    }
  });

  it("no permite aplicar un voucher que ya tiene una aplicación viva", async () => {
    const voucher = await makeVoucher();
    try {
      await storage.applyGiftVoucher(voucher.id, "reservation", `res-${randomUUID()}`, 1000, "tester");
      await expect(
        storage.applyGiftVoucher(voucher.id, "reservation", `res-${randomUUID()}`, 1000, "tester"),
      ).rejects.toThrow(/no está disponible/);
    } finally {
      await pool?.query("DELETE FROM gift_voucher_events WHERE voucher_id = $1", [voucher.id]);
      await pool?.query("DELETE FROM gift_voucher_applications WHERE voucher_id = $1", [voucher.id]);
      await pool?.query("DELETE FROM gift_vouchers WHERE id = $1", [voucher.id]);
    }
  });

  it("bajo aplicaciones concurrentes, solo una gana — la otra falla en vez de duplicar el uso", async () => {
    const voucher = await makeVoucher();
    try {
      const results = await Promise.allSettled([
        storage.applyGiftVoucher(voucher.id, "reservation", `res-a-${randomUUID()}`, 1000, "tester-a"),
        storage.applyGiftVoucher(voucher.id, "reservation", `res-b-${randomUUID()}`, 1000, "tester-b"),
      ]);
      const fulfilled = results.filter(r => r.status === "fulfilled");
      const rejected = results.filter(r => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const applications = await storage.getGiftVoucherApplications(voucher.id);
      const live = applications.filter(a => a.status !== "liberado");
      expect(live).toHaveLength(1);
    } finally {
      await pool?.query("DELETE FROM gift_voucher_events WHERE voucher_id = $1", [voucher.id]);
      await pool?.query("DELETE FROM gift_voucher_applications WHERE voucher_id = $1", [voucher.id]);
      await pool?.query("DELETE FROM gift_vouchers WHERE id = $1", [voucher.id]);
    }
  });

  it("un voucher vencido no se puede aplicar", async () => {
    const code = await storage.generateVoucherCode();
    const voucher = await storage.createGiftVoucher({
      voucherCode: code, area: "alojamiento", description: "Vencido", valueType: "monetario",
      valueAmount: "500.00", buyerName: "Comprador", status: "activo", expiresAt: "2020-01-01",
    } as any);
    try {
      await expect(
        storage.applyGiftVoucher(voucher.id, "reservation", `res-${randomUUID()}`, 500, "tester"),
      ).rejects.toThrow(/vencido/);
    } finally {
      await pool?.query("DELETE FROM gift_voucher_events WHERE voucher_id = $1", [voucher.id]);
      await pool?.query("DELETE FROM gift_vouchers WHERE id = $1", [voucher.id]);
    }
  });

  it("cancelar (soft) no borra el registro y bloquea si hay una aplicación reservada", async () => {
    const voucher = await makeVoucher();
    try {
      const { application } = await storage.applyGiftVoucher(voucher.id, "reservation", `res-${randomUUID()}`, 1000, "tester");
      await expect(
        storage.cancelGiftVoucher(voucher.id, "tester", "motivo de prueba"),
      ).rejects.toThrow(/aplicación reservada activa/);

      await storage.releaseGiftVoucherApplication(application.id, "tester");
      const cancelled = await storage.cancelGiftVoucher(voucher.id, "tester", "motivo de prueba");
      expect(cancelled?.status).toBe("cancelado");
      expect(cancelled?.cancelReason).toBe("motivo de prueba");

      const stillThere = await storage.getGiftVoucher(voucher.id);
      expect(stillThere).toBeDefined();
    } finally {
      await pool?.query("DELETE FROM gift_voucher_events WHERE voucher_id = $1", [voucher.id]);
      await pool?.query("DELETE FROM gift_voucher_applications WHERE voucher_id = $1", [voucher.id]);
      await pool?.query("DELETE FROM gift_vouchers WHERE id = $1", [voucher.id]);
    }
  });

  it("no permite editar campos inmutables (importe, comprador, medio de pago)", async () => {
    const voucher = await makeVoucher();
    try {
      await expect(
        storage.updateGiftVoucher(voucher.id, { valueAmount: "9999.00" } as any, "tester"),
      ).rejects.toThrow(/no se pueden modificar/);
    } finally {
      await pool?.query("DELETE FROM gift_voucher_events WHERE voucher_id = $1", [voucher.id]);
      await pool?.query("DELETE FROM gift_vouchers WHERE id = $1", [voucher.id]);
    }
  });

  it("permite editar el beneficiario mientras está activo, y lo audita", async () => {
    const voucher = await makeVoucher();
    try {
      const updated = await storage.updateGiftVoucher(voucher.id, { beneficiaryName: "Nuevo Beneficiario" } as any, "tester");
      expect(updated?.beneficiaryName).toBe("Nuevo Beneficiario");

      const events = await storage.getGiftVoucherEvents(voucher.id);
      const editEvent = events.find(e => e.eventType === "editado");
      expect(editEvent?.fieldChanged).toBe("beneficiaryName");
      expect(editEvent?.newValue).toBe("Nuevo Beneficiario");
    } finally {
      await pool?.query("DELETE FROM gift_voucher_events WHERE voucher_id = $1", [voucher.id]);
      await pool?.query("DELETE FROM gift_vouchers WHERE id = $1", [voucher.id]);
    }
  });

  it("no permite editar el beneficiario una vez reservado", async () => {
    const voucher = await makeVoucher();
    try {
      const { application } = await storage.applyGiftVoucher(voucher.id, "reservation", `res-${randomUUID()}`, 1000, "tester");
      await expect(
        storage.updateGiftVoucher(voucher.id, { beneficiaryName: "Otro" } as any, "tester"),
      ).rejects.toThrow(/No se puede editar/);
      await storage.releaseGiftVoucherApplication(application.id, "tester");
    } finally {
      await pool?.query("DELETE FROM gift_voucher_events WHERE voucher_id = $1", [voucher.id]);
      await pool?.query("DELETE FROM gift_voucher_applications WHERE voucher_id = $1", [voucher.id]);
      await pool?.query("DELETE FROM gift_vouchers WHERE id = $1", [voucher.id]);
    }
  });

  it("getAvailableGiftVouchers excluye vencidos y de otra área", async () => {
    const alojamiento = await makeVoucher("alojamiento");
    const restaurant = await makeVoucher("restaurant");
    const code = await storage.generateVoucherCode();
    const expired = await storage.createGiftVoucher({
      voucherCode: code, area: "alojamiento", description: "Vencido", valueType: "monetario",
      valueAmount: "500.00", buyerName: "Comprador", status: "activo", expiresAt: "2020-01-01",
    } as any);
    try {
      const available = await storage.getAvailableGiftVouchers("alojamiento");
      const ids = available.map(v => v.id);
      expect(ids).toContain(alojamiento.id);
      expect(ids).not.toContain(restaurant.id);
      expect(ids).not.toContain(expired.id);
    } finally {
      for (const v of [alojamiento, restaurant, expired]) {
        await pool?.query("DELETE FROM gift_voucher_events WHERE voucher_id = $1", [v.id]);
        await pool?.query("DELETE FROM gift_vouchers WHERE id = $1", [v.id]);
      }
    }
  });
});

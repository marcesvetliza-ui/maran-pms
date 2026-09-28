/**
 * inventory_items.ivaRate (alícuota de IVA habitual del artículo) fue
 * agregado para que la carga de facturas de compra pueda precargar la
 * alícuota del renglón a partir del artículo elegido, en vez de pedirla a
 * mano cada vez (ver purchase-invoices.tsx). Se guarda en el artículo —no
 * en la categoría— porque una misma categoría puede mezclar tasas distintas.
 * Esta suite cubre que el campo persiste de punta a punta a través de storage.
 */

import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { storage } from "../db-storage";

const configured = Boolean(process.env.DATABASE_URL);
const suite = configured ? describe : describe.skip;
const pool = configured ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 }) : null;

suite("inventory_items.ivaRate — alícuota de IVA por artículo", () => {
  afterAll(async () => { await pool?.end(); });

  it("persiste ivaRate al crear un artículo y lo devuelve en getInventoryItems", async () => {
    if (!pool) return;
    const item = await storage.createInventoryItem({
      name: `Artículo de prueba ${randomUUID().slice(0, 8)}`,
      unit: "unidad",
      ivaRate: "10.5",
    } as any);

    try {
      expect(item.ivaRate).toBe("10.5");

      const all = await storage.getInventoryItems();
      const found = all.find((i) => i.id === item.id);
      expect(found?.ivaRate).toBe("10.5");
    } finally {
      await pool.query("DELETE FROM inventory_items WHERE id = $1", [item.id]);
    }
  });

  it("queda null cuando no se define alícuota", async () => {
    if (!pool) return;
    const item = await storage.createInventoryItem({
      name: `Artículo sin IVA ${randomUUID().slice(0, 8)}`,
      unit: "unidad",
    } as any);

    try {
      expect(item.ivaRate).toBeNull();
    } finally {
      await pool.query("DELETE FROM inventory_items WHERE id = $1", [item.id]);
    }
  });

  it("permite actualizar la alícuota de un artículo existente", async () => {
    if (!pool) return;
    const item = await storage.createInventoryItem({
      name: `Artículo a actualizar ${randomUUID().slice(0, 8)}`,
      unit: "unidad",
      ivaRate: "21",
    } as any);

    try {
      const updated = await storage.updateInventoryItem(item.id, { ivaRate: "27" } as any);
      expect(updated?.ivaRate).toBe("27");
    } finally {
      await pool.query("DELETE FROM inventory_items WHERE id = $1", [item.id]);
    }
  });
});

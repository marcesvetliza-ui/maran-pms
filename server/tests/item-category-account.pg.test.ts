/**
 * item_categories.accountId (Cuenta Contable de Gasto sugerida) fue agregado
 * para que la carga de facturas de compra pueda auto-completar la Cuenta
 * Contable a partir de la categoría del artículo, en vez de pedirla a mano
 * (ver purchase-invoices.tsx). Esta suite cubre que el campo persiste de
 * punta a punta a través de storage y que respeta la FK real contra
 * accounting_accounts.
 */

import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { storage } from "../db-storage";

const configured = Boolean(process.env.DATABASE_URL);
const suite = configured ? describe : describe.skip;
const pool = configured ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 }) : null;

suite("item_categories.accountId — sugerencia de Cuenta Contable por categoría", () => {
  afterAll(async () => { await pool?.end(); });

  it("persiste accountId al crear una categoría y lo devuelve en getItemCategories", async () => {
    if (!pool) return;
    const accountCode = `TEST-${randomUUID().slice(0, 8)}`;
    const accountRes = await pool.query(
      `INSERT INTO accounting_accounts (codigo, nombre, tipo) VALUES ($1, 'Cuenta de prueba', 'egreso') RETURNING id`,
      [accountCode],
    );
    const accountId = accountRes.rows[0].id as number;

    const category = await storage.createItemCategory({
      name: `Categoría de prueba ${randomUUID().slice(0, 8)}`,
      area: "housekeeping",
      isGroup: false,
      accountId,
    } as any);

    try {
      expect(category.accountId).toBe(accountId);

      const all = await storage.getItemCategories();
      const found = all.find((c) => c.id === category.id);
      expect(found?.accountId).toBe(accountId);
    } finally {
      await pool.query("DELETE FROM item_categories WHERE id = $1", [category.id]);
      await pool.query("DELETE FROM accounting_accounts WHERE id = $1", [accountId]);
    }
  });

  it("permite actualizar accountId de una categoría existente", async () => {
    if (!pool) return;
    const accountCode = `TEST-${randomUUID().slice(0, 8)}`;
    const accountRes = await pool.query(
      `INSERT INTO accounting_accounts (codigo, nombre, tipo) VALUES ($1, 'Cuenta de prueba 2', 'egreso') RETURNING id`,
      [accountCode],
    );
    const accountId = accountRes.rows[0].id as number;

    const category = await storage.createItemCategory({
      name: `Categoría sin cuenta ${randomUUID().slice(0, 8)}`,
      area: "admin",
      isGroup: false,
    } as any);

    try {
      expect(category.accountId).toBeNull();

      const updated = await storage.updateItemCategory(category.id, { accountId } as any);
      expect(updated?.accountId).toBe(accountId);
    } finally {
      await pool.query("DELETE FROM item_categories WHERE id = $1", [category.id]);
      await pool.query("DELETE FROM accounting_accounts WHERE id = $1", [accountId]);
    }
  });

  it("rechaza un accountId que no existe en accounting_accounts (FK real)", async () => {
    if (!pool) return;
    await expect(
      storage.createItemCategory({
        name: `Categoría con cuenta inexistente ${randomUUID().slice(0, 8)}`,
        area: "general",
        isGroup: false,
        accountId: -999999,
      } as any),
    ).rejects.toThrow();
  });
});

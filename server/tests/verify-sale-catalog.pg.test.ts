import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const runWithPg = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 }) : null;
const { verifySaleCatalog } = await import("../billing/verifySaleCatalog");
const CHARGE_NAME = "Cargo catálogo prueba de revisión";
const NAME = "Tratamiento catálogo prueba de revisión";

runWithPg("Centro de Comprobantes: concepto real en PostgreSQL", () => {
  beforeAll(async () => { await pool!.query("SELECT 1"); });
  afterEach(async () => { await pool!.query("DELETE FROM spa_treatments WHERE name = $1", [NAME]); await pool!.query("DELETE FROM charge_types WHERE label = $1", [CHARGE_NAME]); });
  afterAll(async () => {
    await pool!.query("DELETE FROM spa_treatments WHERE name = $1", [NAME]);
    await pool!.end();
  });

  it("acepta un cargo activo por su descripción real y rechaza cambios, bajas y vínculos falsos", async () => {
    const created = await pool!.query("INSERT INTO charge_types (label, description, default_amount, category, active) VALUES ($1, 'Cochera por día', '7500.00', 'otros', true) RETURNING id", [CHARGE_NAME]);
    const id: string = created.rows[0].id;
    const item = { descripcion: "Cochera por día", catalogItem: { source: "charge_type", id } };
    expect(await verifySaleCatalog([item])).toBeNull();
    expect(await verifySaleCatalog([{ ...item, descripcion: CHARGE_NAME }])).toMatch(/no coincide/);
    expect(await verifySaleCatalog([{ ...item, spaTreatmentId: id }])).toMatch(/no coincide/);
    expect(await verifySaleCatalog([{ ...item, catalogItem: { source: "charge_type", id: "inexistente" } }])).toMatch(/no está disponible/);
    await pool!.query("UPDATE charge_types SET active = false WHERE id = $1", [id]);
    expect(await verifySaleCatalog([item])).toMatch(/no está disponible/);
    await pool!.query("DELETE FROM charge_types WHERE id = $1", [id]);
    expect(await verifySaleCatalog([item])).toMatch(/no está disponible/);
  });

  it("acepta un tratamiento activo y rechaza uno inventado o desactivado", async () => {
    const created = await pool!.query("INSERT INTO spa_treatments (name, price, is_active) VALUES ($1, '1234.00', 'true') RETURNING id", [NAME]);
    const id: string = created.rows[0].id;
    const item = { descripcion: NAME, spaTreatmentId: id, catalogItem: { source: "spa", id } };

    expect(await verifySaleCatalog([item])).toBeNull();
    expect(await verifySaleCatalog([{ ...item, descripcion: "Otro tratamiento" }])).toMatch(/no coincide/);
    expect(await verifySaleCatalog([{ ...item, catalogItem: { source: "spa", id: "inexistente" } }])).toMatch(/no está disponible/);
    await pool!.query("UPDATE spa_treatments SET is_active = 'false' WHERE id = $1", [id]);
    expect(await verifySaleCatalog([item])).toMatch(/no está disponible/);
  });
});

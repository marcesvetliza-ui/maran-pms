import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
  : null;

runIfDatabaseIsConfigured("presupuesto recipient fields persistence", () => {
  it("stores and retrieves CUIT, address and contact with the budget", async () => {
    if (!pool) throw new Error("DATABASE_URL no está configurado");
    const id = randomUUID();
    try {
      const result = await pool.query(
        `INSERT INTO presupuestos (id, numero, para, cuit, direccion, contacto, fecha_emision)
         VALUES ($1, $2, $3, $4, $5, $6, '2026-08-28')
         RETURNING cuit, direccion, contacto`,
        [id, `TEST-${id}`, "Destinatario de prueba", "30-71234567-8", "San Martín 123", "Ana Test"],
      );

      expect(result.rows[0]).toEqual({
        cuit: "30-71234567-8",
        direccion: "San Martín 123",
        contacto: "Ana Test",
      });
    } finally {
      await pool.query("DELETE FROM presupuestos WHERE id = $1", [id]);
    }
  });
});

afterAll(async () => {
  await pool?.end();
});
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pool } from "./db";

export async function ensureHospitalityInclusionsSchema() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('hospitality-inclusions-schema-v1'))",
    );
    const path =
      process.env.NODE_ENV === "production"
        ? "dist/hospitality-inclusions.sql"
        : "migrations/20261124_hospitality_inclusions.sql";
    await client.query(readFileSync(resolve(path), "utf8"));
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

import type pg from "pg";
import type { XeniaPmsConfig } from "./config";

export async function assertXeniaPmsBinding(
  pool: pg.Pool | pg.PoolClient,
  config: XeniaPmsConfig,
) {
  const exists = await pool.query(
    "SELECT to_regclass('xenia_pms.installation') AS binding",
  );
  if (!exists.rows[0].binding)
    throw new Error(
      "La base no está preparada para el PMS de Xenia; ejecutá su preparación explícita.",
    );
  const row = (
    await pool.query(
      "SELECT property_id,client_id,template FROM xenia_pms.installation WHERE singleton=true",
    )
  ).rows[0];
  if (
    !row ||
    row.property_id !== config.propertyId ||
    row.client_id !== config.clientId ||
    row.template !== config.template
  )
    throw new Error(
      "La identidad de esta base no corresponde a la instalación configurada.",
    );
  if (config.template === "custom") {
    const instance = (await pool.query("SELECT database_instance_id FROM xenia_pms.installation WHERE singleton=true")).rows[0];
    if (!instance?.database_instance_id) throw new Error("Falta la identidad propia de la base de este PMS independiente.");
  }
}

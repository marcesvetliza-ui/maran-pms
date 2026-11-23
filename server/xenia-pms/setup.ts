import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { readXeniaPmsConfig, type XeniaPmsConfig } from "./config";
import {
  XENIA_QA_READ_RESOURCES,
  XENIA_QA_WRITE_RESOURCES,
  XENIA_QA_OPERATIONS_RESOURCES,
  XENIA_QA_OPERATE_STAY,
} from "../../shared/xeniaPms";
import { assertXeniaPmsBinding } from "./binding";
import { ACCOMMODATION_PERMISSION } from "../../shared/accommodationPermission";
import { prepareQaOperationsSchema } from "./operations-schema";

// Upgrade bound QA installations once. Later local revocations stay revoked.
async function seedAccommodationPermission(connection: pg.PoolClient) {
  const marker = await connection.query(
    "INSERT INTO resource_permission_seeds(resource_key) VALUES($1) ON CONFLICT DO NOTHING RETURNING resource_key",
    [ACCOMMODATION_PERMISSION],
  );
  if (marker.rows.length)
    await connection.query(
      `INSERT INTO role_permissions(role,resource_key)
       SELECT role,$1 FROM role_permissions
       WHERE resource_key='sidebar:/reservations' AND role IN ('admin','manager','reception')
       ON CONFLICT DO NOTHING`,
      [ACCOMMODATION_PERMISSION],
    );
}

async function seedQaOperations(connection: pg.PoolClient, config: XeniaPmsConfig) {
  if (!config.operationsEnabled) return;
  const marker = await connection.query(
    "INSERT INTO resource_permission_seeds(resource_key) VALUES('xenia-qa:operations:v1') ON CONFLICT DO NOTHING RETURNING resource_key",
  );
  if (!marker.rows.length) return;
  for (const role of ["admin", "manager", "reception", "xenia_viewer"])
    for (const resource of [...XENIA_QA_OPERATIONS_RESOURCES,
      ...(role === "xenia_viewer" ? [] : [XENIA_QA_OPERATE_STAY])])
      await connection.query(
        `INSERT INTO role_permissions(role,resource_key)
         SELECT $1,$2 WHERE EXISTS (SELECT 1 FROM role_permissions WHERE role=$1 AND resource_key='sidebar:/planning')
         ON CONFLICT DO NOTHING`, [role, resource],
      );
  await connection.query(`INSERT INTO cash_register_configs(id,area,area_label,shifts_per_day,is_active)
    VALUES('xenia-qa-reception','reception','Recepción de prueba',1,true) ON CONFLICT DO NOTHING`);
  await connection.query(`INSERT INTO charge_types(id,label,description,default_amount,category,active,allow_price_edit,allow_recurring)
    VALUES('xenia-qa-water','Agua de prueba','Agua de prueba',1000,'minibar',true,true,false) ON CONFLICT DO NOTHING`);
}

export const schemaDigest = (schema: string) =>
  createHash("sha256").update(schema).digest("hex");

export async function setupXeniaPms(config: XeniaPmsConfig, schema: string) {
  if (
    !schema.startsWith("CREATE ") ||
    !schema.includes('CREATE TABLE "reservations"')
  )
    throw new Error("El esquema compilado del PMS no es válido.");
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    connectionTimeoutMillis: 5000,
    max: 1,
  });
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    await connection.query("SELECT pg_advisory_xact_lock(87934230)");
    const existing = await connection.query(
      "SELECT to_regclass('xenia_pms.installation') AS binding",
    );
    if (existing.rows[0].binding) {
      await assertXeniaPmsBinding(connection, config);
      const row = (
        await connection.query(
          "SELECT schema_digest FROM xenia_pms.installation WHERE singleton=true",
        )
      ).rows[0];
      if (row.schema_digest !== schemaDigest(schema))
        throw new Error(
          "La versión del esquema cambió; prepará una migración explícita antes de actualizar esta base.",
        );
      await seedAccommodationPermission(connection);
      if (config.operationsEnabled) await prepareQaOperationsSchema(connection);
      await seedQaOperations(connection, config);
      await connection.query("COMMIT");
      return { alreadyInitialized: true };
    }
    const tables = await connection.query(
      "SELECT 1 FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') AND schemaname NOT LIKE 'pg_toast%' LIMIT 1",
    );
    if (tables.rows.length)
      throw new Error(
        "El PMS de pruebas requiere una base nueva y exclusiva; se conservaron los datos existentes.",
      );
    await connection.query(schema);
    await connection.query(`CREATE SCHEMA xenia_pms;
      CREATE TABLE xenia_pms.installation(singleton boolean PRIMARY KEY CHECK(singleton),property_id uuid NOT NULL,client_id uuid NOT NULL,template text NOT NULL,schema_digest text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE xenia_pms.principal_links(principal_id uuid PRIMARY KEY,user_id varchar UNIQUE NOT NULL REFERENCES public.system_users(id));
      CREATE TABLE xenia_pms.login_requests(state_hash text PRIMARY KEY,flow_hash text NOT NULL,verifier text NOT NULL,expires_at timestamptz NOT NULL);
      CREATE TABLE public.sessions(sid varchar PRIMARY KEY,sess json NOT NULL,expire timestamp(6) NOT NULL);
      CREATE INDEX sessions_expire_idx ON public.sessions(expire);`);
    await connection.query(
      "INSERT INTO xenia_pms.installation(singleton,property_id,client_id,template,schema_digest) VALUES(true,$1,$2,$3,$4)",
      [
        config.propertyId,
        config.clientId,
        config.template,
        schemaDigest(schema),
      ],
    );
    await connection.query(
      "INSERT INTO room_types(id,code,name,description,base_occupancy,max_occupancy) VALUES('xenia-qa-type','QA','Doble de prueba','Datos ficticios de '||$1,2,2)",
      [config.propertyName],
    );
    for (const number of ["101", "102", "103"])
      await connection.query(
        "INSERT INTO rooms(id,room_number,room_type_id,floor,status,max_occupancy) VALUES($1,$2,'xenia-qa-type',1,'available',2)",
        ["xenia-qa-room-" + number, number],
      );
    await connection.query(
      "INSERT INTO rate_plans(id,name,room_type_id,base_rate,rate_1pax,rate_2pax,currency) VALUES('xenia-qa-rate','Tarifa de prueba','xenia-qa-type',50000,50000,50000,'ARS')",
    );
    await connection.query(
      "INSERT INTO guests(id,first_name,last_name,nationality,active) VALUES('xenia-qa-guest-1',$1,'Prueba','Argentina',true)",
      [config.template === "aurora" ? "Aurora" : "Brisa"],
    );
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const plus = (days: number) =>
      new Date(new Date(today + "T12:00:00Z").getTime() + days * 86400000)
        .toISOString()
        .slice(0, 10);
    await connection.query(
      `INSERT INTO reservations(id,reservation_code,guest_id,room_type_id,room_id,rate_plan_id,check_in_date,check_out_date,nights,base_rate_per_night,final_rate_per_night,total_room_amount,status,number_of_guests,created_at)
      VALUES('xenia-qa-reservation-1','QA-001','xenia-qa-guest-1','xenia-qa-type','xenia-qa-room-101','xenia-qa-rate',$1,$2,2,50000,50000,100000,'confirmed',2,now())`,
      [plus(1), plus(3)],
    );
    for (const [key, value] of Object.entries({
      hotel_name: config.propertyName,
      hotel_email: "pruebas@xenia.invalid",
      hotel_phone: "",
      hotel_address: "Instalación ficticia",
      xenia_qa_mode: "true",
    }))
      await connection.query(
        "INSERT INTO system_settings(id,key,value,category,updated_at,updated_by) VALUES($1,$2,$3,'general',now(),'xenia-qa-setup')",
        ["xenia-qa-" + key, key, value],
      );
    for (const role of ["admin", "manager", "reception", "xenia_viewer"])
      for (const resource of role === "xenia_viewer"
        ? XENIA_QA_READ_RESOURCES
        : XENIA_QA_WRITE_RESOURCES)
        await connection.query(
          "INSERT INTO role_permissions(role,resource_key) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [role, resource],
        );
    await seedAccommodationPermission(connection);
    if (config.operationsEnabled) await prepareQaOperationsSchema(connection);
    await seedQaOperations(connection, config);
    await connection.query(
      "INSERT INTO bed_types(id,code,name,is_active,display_order) VALUES('xenia-qa-bed','matrimonial','Matrimonial de prueba',true,1)",
    );
    await connection.query("COMMIT");
    return { alreadyInitialized: false };
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const config = readXeniaPmsConfig();
  if (!config)
    throw new Error(
      "Esta preparación requiere XENIA_PMS_MODE=qa y la ficha completa de su instalación.",
    );
  const schema = await readFile(resolve("dist/xenia-pms/schema.sql"), "utf8");
  const result = await setupXeniaPms(config, schema);
  console.log(
    result.alreadyInitialized
      ? "PMS de pruebas ya preparado; se conservaron sus cuentas y datos."
      : "PMS de pruebas preparado con datos ficticios y una base exclusiva.",
  );
}

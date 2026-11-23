import { createHash } from "node:crypto";
import type pg from "pg";

// Applied only by setupControl, inside initializeCentral's transaction and lock.
const migration = `
  CREATE TABLE xenia_control.organization_administrators (
    organization_id uuid NOT NULL REFERENCES xenia_control.organizations(id),
    principal_id uuid NOT NULL REFERENCES xenia_control.principals(id),
    created_by uuid REFERENCES xenia_control.principals(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(organization_id,principal_id));
  CREATE TABLE xenia_control.organization_people (
    organization_id uuid NOT NULL REFERENCES xenia_control.organizations(id),
    principal_id uuid NOT NULL REFERENCES xenia_control.principals(id),
    active boolean NOT NULL DEFAULT true,
    creation_request uuid,creation_digest text,
    created_by uuid REFERENCES xenia_control.principals(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(organization_id,principal_id),
    UNIQUE(organization_id,creation_request));
  ALTER TABLE xenia_control.audit ADD COLUMN organization_id uuid REFERENCES xenia_control.organizations(id);
  ALTER TABLE xenia_control.audit ADD COLUMN details jsonb;
  ALTER TABLE xenia_control.properties ADD COLUMN storage_kind text NOT NULL DEFAULT 'demo'
    CHECK(storage_kind IN ('demo','pms'));
  ALTER TABLE xenia_control.properties ALTER COLUMN database_key DROP NOT NULL;
  ALTER TABLE xenia_control.properties ADD CONSTRAINT property_storage_binding CHECK (
    (storage_kind='demo' AND database_key IS NOT NULL) OR
    (storage_kind='pms' AND database_key IS NULL));
  ALTER TABLE xenia_control.properties ADD COLUMN creation_request uuid UNIQUE;
  ALTER TABLE xenia_control.properties ADD COLUMN creation_digest text;
  ALTER TABLE xenia_control.pms_installations ADD COLUMN template text;
  ALTER TABLE xenia_control.pms_installations ADD COLUMN verified_revision text;
  ALTER TABLE xenia_control.pms_installations ADD COLUMN database_binding_id uuid;
`;
export const CUSTOMER_SCHEMA_DIGEST = createHash("sha256").update(migration).digest("hex");
type Connection = Pick<pg.PoolClient, "query">;

export async function prepareCustomerSchema(connection: Connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS xenia_control.customer_schema_migrations (
    version integer PRIMARY KEY,digest text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())`);
  const row = (await connection.query("SELECT digest FROM xenia_control.customer_schema_migrations WHERE version=1")).rows[0];
  if (row) {
    if (row.digest !== CUSTOMER_SCHEMA_DIGEST) throw Error("El esquema de clientes requiere una migración explícita nueva.");
    return;
  }
  await connection.query(migration);
  await connection.query("INSERT INTO xenia_control.customer_schema_migrations(version,digest) VALUES(1,$1)", [CUSTOMER_SCHEMA_DIGEST]);
}

export async function assertCustomerSchema(connection: Connection) {
  const row = (await connection.query("SELECT digest FROM xenia_control.customer_schema_migrations WHERE version=1")).rows[0];
  if (row?.digest !== CUSTOMER_SCHEMA_DIGEST) throw Error("Ejecutá la preparación explícita de Xenia-Control para esta versión de clientes.");
}

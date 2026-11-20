import { randomUUID } from "node:crypto";
import pg from "pg";
import bcrypt from "bcryptjs";
import type { ControlConfig } from "./config";

export class ControlError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type Principal = {
  id: string;
  username: string;
  name: string;
  platformAdmin: boolean;
  active: boolean;
  sessionVersion: number;
};
export type PropertyRole = "manager" | "reception" | "viewer";
export type Property = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  modules: string[];
  status: string;
  role: string;
};
type PrivateProperty = Property & { databaseKey: string };

const principalColumns =
  'id, username, name, platform_admin AS "platformAdmin", active, session_version AS "sessionVersion"';
const propertyColumns =
  'p.id, p.organization_id AS "organizationId", p.name, p.slug, p.modules, p.status';

async function requireDedicatedDatabase(
  pool: pg.Pool | pg.PoolClient,
  ownSchema: string,
): Promise<void> {
  const { rows } = await pool.query<{ schema: string }>(
    `SELECT schemaname AS schema FROM pg_tables
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema', $1) AND schemaname NOT LIKE 'pg_toast%' LIMIT 1`,
    [ownSchema],
  );
  if (rows.length)
    throw new ControlError(
      409,
      "La instalación requiere una base exclusiva y vacía; no se modificó el esquema.",
    );
}

export class ControlStore {
  readonly central: pg.Pool;
  private propertyPools = new Map<string, pg.Pool>();
  private closing = false;
  constructor(readonly config: ControlConfig) {
    this.central = this.pool(config.controlUrl);
  }
  private pool(connectionString: string) {
    const pool = new pg.Pool({
      connectionString,
      max: 4,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
    });
    pool.on("error", () => {
      if (!this.closing)
        console.error(
          "[xenia-control] Conexión de base interrumpida; se renovará.",
        );
    });
    return pool;
  }
  async close() {
    this.closing = true;
    await Promise.all([
      this.central.end(),
      ...[...this.propertyPools.values()].map((pool) => pool.end()),
    ]);
  }

  async initializeCentral() {
    const connection = await this.central.connect();
    try {
      await connection.query("BEGIN");
      await connection.query("SELECT pg_advisory_xact_lock(87934210)");
      await requireDedicatedDatabase(connection, "xenia_control");
      await connection.query(`CREATE SCHEMA IF NOT EXISTS xenia_control;
      CREATE TABLE IF NOT EXISTS xenia_control.principals (
        id uuid PRIMARY KEY, username text UNIQUE NOT NULL, name text NOT NULL, password_hash text NOT NULL,
        platform_admin boolean NOT NULL DEFAULT false, active boolean NOT NULL DEFAULT true, session_version integer NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS xenia_control.organizations (id uuid PRIMARY KEY, name text NOT NULL);
      CREATE TABLE IF NOT EXISTS xenia_control.properties (
        id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES xenia_control.organizations(id), name text NOT NULL,
        slug text UNIQUE NOT NULL, modules text[] NOT NULL, database_key text UNIQUE NOT NULL,
        status text NOT NULL CHECK (status IN ('provisioning', 'active', 'failed')));
      CREATE TABLE IF NOT EXISTS xenia_control.memberships (
        principal_id uuid NOT NULL REFERENCES xenia_control.principals(id), property_id uuid NOT NULL REFERENCES xenia_control.properties(id),
        role text NOT NULL CHECK (role IN ('manager', 'reception', 'viewer')), PRIMARY KEY(principal_id,property_id));
      CREATE TABLE IF NOT EXISTS xenia_control.sessions (sid varchar PRIMARY KEY, sess json NOT NULL, expire timestamp(6) NOT NULL);
      CREATE INDEX IF NOT EXISTS sessions_expire ON xenia_control.sessions(expire);
      CREATE TABLE IF NOT EXISTS xenia_control.audit (
        id bigserial PRIMARY KEY, actor_id uuid, action text NOT NULL, property_id uuid, occurred_at timestamptz NOT NULL DEFAULT now());`);
      await connection.query("COMMIT");
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally {
      connection.release();
    }
  }

  async principal(id: string): Promise<Principal | undefined> {
    return (
      await this.central.query(
        `SELECT ${principalColumns} FROM xenia_control.principals WHERE id=$1 AND active=true`,
        [id],
      )
    ).rows[0];
  }
  async credentials(
    username: string,
  ): Promise<(Principal & { passwordHash: string }) | undefined> {
    return (
      await this.central.query(
        `SELECT ${principalColumns}, password_hash AS "passwordHash" FROM xenia_control.principals WHERE username=$1 AND active=true`,
        [username],
      )
    ).rows[0];
  }
  async organizations() {
    return (
      await this.central.query(
        "SELECT id,name FROM xenia_control.organizations ORDER BY name",
      )
    ).rows;
  }
  async createOrganization(actor: Principal, name: string) {
    this.requireAdmin(actor);
    return (
      await this.central.query(
        "INSERT INTO xenia_control.organizations(id,name) VALUES($1,$2) RETURNING id,name",
        [randomUUID(), name],
      )
    ).rows[0];
  }
  requireAdmin(actor: Principal) {
    if (!actor.platformAdmin)
      throw new ControlError(
        403,
        "No tenés permiso para administrar establecimientos o usuarios.",
      );
  }

  async properties(actor: Principal): Promise<Property[]> {
    return (
      await this.central.query(
        actor.platformAdmin
          ? `SELECT ${propertyColumns}, 'owner' AS role FROM xenia_control.properties p ORDER BY p.name`
          : `SELECT ${propertyColumns},m.role FROM xenia_control.properties p JOIN xenia_control.memberships m ON m.property_id=p.id
         WHERE m.principal_id=$1 AND p.status='active' ORDER BY p.name`,
        actor.platformAdmin ? [] : [actor.id],
      )
    ).rows;
  }

  async authorize(
    actor: Principal,
    propertyId: string,
    write = false,
  ): Promise<PrivateProperty> {
    const property = (
      await this.central.query(
        `SELECT ${propertyColumns},p.database_key AS "databaseKey",m.role FROM xenia_control.properties p
      LEFT JOIN xenia_control.memberships m ON m.property_id=p.id AND m.principal_id=$2 WHERE p.id=$1`,
        [propertyId, actor.id],
      )
    ).rows[0];
    // Same answer for unknown and unauthorized IDs: do not reveal another hotel's existence.
    if (!property || (!actor.platformAdmin && !property.role))
      throw new ControlError(404, "Establecimiento no disponible.");
    if (property.status !== "active")
      throw new ControlError(
        409,
        "El establecimiento todavía no está listo para operar.",
      );
    if (write && !actor.platformAdmin && property.role === "viewer")
      throw new ControlError(
        403,
        "Tu acceso a este establecimiento es de consulta.",
      );
    return property;
  }

  async createProperty(
    actor: Principal,
    input: {
      name: string;
      slug: string;
      organizationId: string;
      modules: string[];
    },
  ) {
    this.requireAdmin(actor);
    const connection = await this.central.connect();
    let propertyId = "";
    try {
      await connection.query("BEGIN");
      await connection.query("SELECT pg_advisory_xact_lock(87934211)");
      const organization = await connection.query(
        "SELECT id FROM xenia_control.organizations WHERE id=$1",
        [input.organizationId],
      );
      if (!organization.rowCount)
        throw new ControlError(400, "Elegí un cliente válido.");
      const allocated = new Set(
        (
          await connection.query(
            "SELECT database_key FROM xenia_control.properties",
          )
        ).rows.map((row) => row.database_key),
      );
      const databaseKey = Object.keys(this.config.propertyUrls).find(
        (key) => !allocated.has(key),
      );
      if (!databaseKey)
        throw new ControlError(
          409,
          "No hay una instalación disponible para un nuevo establecimiento. Contactá a Administración.",
        );
      propertyId = randomUUID();
      await connection.query(
        `INSERT INTO xenia_control.properties(id,organization_id,name,slug,modules,database_key,status)
        VALUES($1,$2,$3,$4,$5,$6,'provisioning')`,
        [
          propertyId,
          input.organizationId,
          input.name,
          input.slug,
          input.modules,
          databaseKey,
        ],
      );
      await connection.query(
        "INSERT INTO xenia_control.audit(actor_id,action,property_id) VALUES($1,'property_created',$2)",
        [actor.id, propertyId],
      );
      await connection.query("COMMIT");
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally {
      connection.release();
    }
    // Provisioning is resumable. Failed slots stay bound to their property; never recycle another hotel's database.
    return this.activateProperty(actor, propertyId);
  }

  async activateProperty(actor: Principal, propertyId: string) {
    this.requireAdmin(actor);
    const property: PrivateProperty | undefined = (
      await this.central.query(
        `SELECT ${propertyColumns},p.database_key AS "databaseKey" FROM xenia_control.properties p WHERE p.id=$1`,
        [propertyId],
      )
    ).rows[0];
    if (!property)
      throw new ControlError(404, "Establecimiento no disponible.");
    try {
      const pool = this.propertyPool(property.databaseKey);
      await requireDedicatedDatabase(pool, "xenia_property");
      await pool.query(`CREATE SCHEMA IF NOT EXISTS xenia_property;
        CREATE TABLE IF NOT EXISTS xenia_property.identity (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), property_id uuid NOT NULL UNIQUE);
        CREATE TABLE IF NOT EXISTS xenia_property.reservations (
          id uuid PRIMARY KEY, guest_name text NOT NULL, room text NOT NULL, check_in date NOT NULL, check_out date NOT NULL,
          status text NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled')), CHECK(check_out>check_in));`);
      await pool.query(
        "INSERT INTO xenia_property.identity(singleton,property_id) VALUES(true,$1) ON CONFLICT(singleton) DO NOTHING",
        [property.id],
      );
      await this.boundPool(property);
      await this.central.query(
        "UPDATE xenia_control.properties SET status='active' WHERE id=$1",
        [property.id],
      );
    } catch {
      await this.central.query(
        "UPDATE xenia_control.properties SET status='failed' WHERE id=$1",
        [property.id],
      );
    }
    return (await this.properties(actor)).find(
      (candidate) => candidate.id === property.id,
    )!;
  }
  private propertyPool(key: string) {
    if (this.closing)
      throw new ControlError(
        503,
        "La aplicación se está reiniciando. Reintentá en un momento.",
      );
    const url = this.config.propertyUrls[key];
    if (!url)
      throw new ControlError(
        503,
        "La instalación del establecimiento no está disponible.",
      );
    if (!this.propertyPools.has(key))
      this.propertyPools.set(key, this.pool(url));
    return this.propertyPools.get(key)!;
  }
  private async boundPool(property: PrivateProperty) {
    const pool = this.propertyPool(property.databaseKey);
    const identity = (
      await pool.query(
        "SELECT property_id FROM xenia_property.identity WHERE singleton=true",
      )
    ).rows[0];
    if (identity?.property_id !== property.id)
      throw new ControlError(
        503,
        "No se pudo validar la instalación del establecimiento.",
      );
    return pool;
  }
  private async operational(actor: Principal, id: string, write = false) {
    const property = await this.authorize(actor, id, write);
    if (!property.modules.includes("lodging"))
      throw new ControlError(
        403,
        "Este establecimiento no tiene habilitado Alojamiento.",
      );
    return this.boundPool(property);
  }
  async reservations(actor: Principal, id: string) {
    const pool = await this.operational(actor, id);
    return (
      await pool.query(`SELECT id,guest_name AS "guestName",room,check_in::text AS "checkIn",check_out::text AS "checkOut",status
      FROM xenia_property.reservations ORDER BY check_in,id`)
    ).rows;
  }
  async reservation(actor: Principal, id: string, reservationId: string) {
    const pool = await this.operational(actor, id);
    const row = (
      await pool.query(
        `SELECT id,guest_name AS "guestName",room,check_in::text AS "checkIn",check_out::text AS "checkOut",status
      FROM xenia_property.reservations WHERE id=$1`,
        [reservationId],
      )
    ).rows[0];
    if (!row) throw new ControlError(404, "Reserva no disponible.");
    return row;
  }
  async createReservation(
    actor: Principal,
    id: string,
    input: {
      guestName: string;
      room: string;
      checkIn: string;
      checkOut: string;
    },
  ) {
    const pool = await this.operational(actor, id, true);
    const reservationId = randomUUID();
    await pool.query(
      "INSERT INTO xenia_property.reservations(id,guest_name,room,check_in,check_out) VALUES($1,$2,$3,$4,$5)",
      [
        reservationId,
        input.guestName,
        input.room,
        input.checkIn,
        input.checkOut,
      ],
    );
    return this.reservation(actor, id, reservationId);
  }
  async cancelReservation(actor: Principal, id: string, reservationId: string) {
    const pool = await this.operational(actor, id, true);
    const result = await pool.query(
      "UPDATE xenia_property.reservations SET status='cancelled' WHERE id=$1",
      [reservationId],
    );
    if (!result.rowCount) throw new ControlError(404, "Reserva no disponible.");
    return this.reservation(actor, id, reservationId);
  }

  async users(actor: Principal) {
    this.requireAdmin(actor);
    return (
      await this.central.query(
        `SELECT ${principalColumns} FROM xenia_control.principals ORDER BY name`,
      )
    ).rows;
  }
  async memberships(actor: Principal, propertyId: string) {
    this.requireAdmin(actor);
    return (
      await this.central.query(
        `SELECT u.id,u.name,u.username,m.role FROM xenia_control.memberships m
      JOIN xenia_control.principals u ON u.id=m.principal_id WHERE m.property_id=$1 ORDER BY u.name`,
        [propertyId],
      )
    ).rows;
  }
  async createUser(
    actor: Principal,
    input: {
      username: string;
      name: string;
      password: string;
      propertyIds: string[];
      role: PropertyRole;
    },
  ) {
    this.requireAdmin(actor);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const client = await this.central.connect();
    const id = randomUUID();
    try {
      await client.query("BEGIN");
      const properties = await client.query(
        "SELECT id FROM xenia_control.properties WHERE id=ANY($1::uuid[]) AND status='active'",
        [input.propertyIds],
      );
      if (properties.rows.length !== input.propertyIds.length)
        throw new ControlError(
          400,
          "Elegí establecimientos activos y sin repetir.",
        );
      await client.query(
        "INSERT INTO xenia_control.principals(id,username,name,password_hash) VALUES($1,$2,$3,$4)",
        [id, input.username, input.name, passwordHash],
      );
      for (const propertyId of input.propertyIds)
        await client.query(
          "INSERT INTO xenia_control.memberships(principal_id,property_id,role) VALUES($1,$2,$3)",
          [id, propertyId, input.role],
        );
      await client.query(
        "INSERT INTO xenia_control.audit(actor_id,action) VALUES($1,'user_created')",
        [actor.id],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return this.principal(id);
  }
  async assign(
    actor: Principal,
    propertyId: string,
    principalId: string,
    role: PropertyRole,
  ) {
    this.requireAdmin(actor);
    await this.authorize(actor, propertyId);
    if (!(await this.principal(principalId)))
      throw new ControlError(404, "Usuario no disponible.");
    await this.central.query(
      `INSERT INTO xenia_control.memberships(principal_id,property_id,role) VALUES($1,$2,$3)
      ON CONFLICT(principal_id,property_id) DO UPDATE SET role=excluded.role`,
      [principalId, propertyId, role],
    );
  }
  async revoke(actor: Principal, propertyId: string, principalId: string) {
    this.requireAdmin(actor);
    await this.central.query(
      "DELETE FROM xenia_control.memberships WHERE property_id=$1 AND principal_id=$2",
      [propertyId, principalId],
    );
  }
}

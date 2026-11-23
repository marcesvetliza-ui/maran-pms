import { createHmac, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type pg from "pg";
import { ControlStore, ControlError, type Principal, type PropertyRole } from "./store";

type Connection = pg.PoolClient;
export type AccountInput = { requestId: string; username: string; name: string; password: string };
type AccountResult = { id: string; username: string; name: string; replayed: boolean };
export type StaffInput = AccountInput & { propertyIds: string[]; role: PropertyRole };

/** Organization authority is resolved from the database for every action. */
export class CustomerManagement {
  constructor(readonly store: ControlStore) {}

  async organizations(actor: Principal) {
    return (await this.store.central.query(`SELECT o.id,o.name FROM xenia_control.organizations o
      WHERE $2 OR EXISTS (SELECT 1 FROM xenia_control.organization_administrators a
        WHERE a.organization_id=o.id AND a.principal_id=$1) ORDER BY o.name`, [actor.id, actor.platformAdmin])).rows;
  }

  private async transaction<T>(operation: (connection: Connection) => Promise<T>): Promise<T> {
    const connection = await this.store.central.connect();
    try {
      await connection.query("BEGIN");
      const result = await operation(connection);
      await connection.query("COMMIT");
      return result;
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally { connection.release(); }
  }

  private async organization(actor: Principal, id: string, connection: Connection) {
    // All changes hold this shared organization lock. Removing an administrator
    // takes an exclusive lock, so a completed revocation cannot race a new write.
    const result = await connection.query(`SELECT o.id,o.name FROM xenia_control.organizations o
      WHERE o.id=$1 AND ($3 OR EXISTS (SELECT 1 FROM xenia_control.organization_administrators a
        WHERE a.organization_id=o.id AND a.principal_id=$2)) FOR SHARE OF o`, [id, actor.id, actor.platformAdmin]);
    if (!result.rowCount) throw new ControlError(404, "Cliente no disponible.");
    return result.rows[0];
  }

  private async audit(connection: Connection, actor: Principal, organizationId: string, action: string, details: object, propertyId?: string) {
    await connection.query(`INSERT INTO xenia_control.audit(actor_id,organization_id,property_id,action,details)
      VALUES($1,$2,$3,$4,$5)`, [actor.id, organizationId, propertyId ?? null, action, JSON.stringify(details)]);
  }

  private async invalidate(connection: Connection, organizationId: string, principalId: string, propertyId?: string) {
    for (const table of ["pms_grants", "pms_leases"] as const)
      await connection.query(`DELETE FROM xenia_control.${table} t USING xenia_control.pms_installations i,
        xenia_control.properties p WHERE t.client_id=i.client_id AND p.id=i.property_id
        AND p.organization_id=$1 AND t.principal_id=$2 AND ($3::uuid IS NULL OR p.id=$3)`, [organizationId, principalId, propertyId ?? null]);
  }

  async administrators(actor: Principal, organizationId: string) {
    this.store.requireAdmin(actor);
    return this.transaction(async connection => {
      await this.organization(actor, organizationId, connection);
      return (await connection.query(`SELECT u.id,u.username,u.name FROM xenia_control.organization_administrators a
        JOIN xenia_control.principals u ON u.id=a.principal_id WHERE a.organization_id=$1 ORDER BY u.name`, [organizationId])).rows;
    });
  }

  async createAdministrator(actor: Principal, organizationId: string, input: AccountInput) {
    this.store.requireAdmin(actor);
    return this.create(actor, organizationId, input, true);
  }

  async revokeAdministrator(actor: Principal, organizationId: string, principalId: string) {
    this.store.requireAdmin(actor);
    return this.transaction(async connection => {
      const row = await connection.query("SELECT id FROM xenia_control.organizations WHERE id=$1 FOR UPDATE", [organizationId]);
      if (!row.rowCount) throw new ControlError(404, "Cliente no disponible.");
      const removed = await connection.query("DELETE FROM xenia_control.organization_administrators WHERE organization_id=$1 AND principal_id=$2 RETURNING principal_id", [organizationId, principalId]);
      if (removed.rowCount) {
        await this.invalidate(connection, organizationId, principalId);
        await this.audit(connection, actor, organizationId, "customer_administrator_revoked", { principalId });
      }
      return { ok: true };
    });
  }

  async properties(actor: Principal, organizationId: string) {
    return this.transaction(async connection => {
      await this.organization(actor, organizationId, connection);
      return (await connection.query(`SELECT id,name,status,storage_kind AS "storageKind" FROM xenia_control.properties
        WHERE organization_id=$1 ORDER BY name`, [organizationId])).rows;
    });
  }

  async users(actor: Principal, organizationId: string) {
    return this.transaction(async connection => {
      await this.organization(actor, organizationId, connection);
      // Memberships from legacy installations remain visible only in their own
      // organization. A managed person stays listed after losing their last hotel.
      return (await connection.query(`SELECT u.id,u.username,u.name,
        (u.active AND COALESCE(op.active,true)) AS active,
        EXISTS(SELECT 1 FROM xenia_control.organization_administrators a
          WHERE a.organization_id=$1 AND a.principal_id=u.id) AS "isAdministrator",
        COALESCE((SELECT jsonb_agg(jsonb_build_object('propertyId',p.id,'propertyName',p.name,'role',m.role) ORDER BY p.name)
          FROM xenia_control.memberships m JOIN xenia_control.properties p ON p.id=m.property_id
          WHERE m.principal_id=u.id AND p.organization_id=$1),'[]'::jsonb) AS properties
        FROM xenia_control.principals u LEFT JOIN xenia_control.organization_people op ON op.principal_id=u.id AND op.organization_id=$1
        WHERE NOT u.platform_admin AND (op.principal_id IS NOT NULL OR
          EXISTS(SELECT 1 FROM xenia_control.organization_administrators a WHERE a.organization_id=$1 AND a.principal_id=u.id) OR
          EXISTS(SELECT 1 FROM xenia_control.memberships m JOIN xenia_control.properties p ON p.id=m.property_id
            WHERE m.principal_id=u.id AND p.organization_id=$1)) ORDER BY u.name`, [organizationId])).rows;
    });
  }

  async createStaff(actor: Principal, organizationId: string, input: StaffInput) {
    return this.create(actor, organizationId, input, false);
  }

  private async create(actor: Principal, organizationId: string, input: AccountInput | StaffInput, administrator: boolean): Promise<AccountResult> {
    const staff = administrator ? undefined : input as StaffInput;
    const digest = createHmac("sha256", this.store.config.sessionSecret).update(JSON.stringify({
      actorId: actor.id, organizationId, administrator, username: input.username, name: input.name, password: input.password,
      propertyIds: staff?.propertyIds.slice().sort() ?? [], role: staff?.role ?? null,
    })).digest("hex");
    return this.transaction(async connection => {
      await this.organization(actor, organizationId, connection);
      await connection.query("SELECT pg_advisory_xact_lock(hashtextextended($1,87934251))", [organizationId + ":" + input.requestId]);
      const previous = (await connection.query(`SELECT op.creation_digest,u.id,u.username,u.name FROM xenia_control.organization_people op
        JOIN xenia_control.principals u ON u.id=op.principal_id WHERE op.organization_id=$1 AND op.creation_request=$2`, [organizationId, input.requestId])).rows[0];
      if (previous) {
        if (previous.creation_digest !== digest) throw new ControlError(409, "La solicitud anterior contiene otros datos. Revisá el equipo antes de reintentar.");
        return { id: previous.id, username: previous.username, name: previous.name, replayed: true };
      }
      if (staff) {
        const ids = await connection.query(`SELECT id FROM xenia_control.properties WHERE organization_id=$1
          AND id=ANY($2::uuid[]) AND status='active'`, [organizationId, staff.propertyIds]);
        if (!staff.propertyIds.length || ids.rowCount !== staff.propertyIds.length)
          throw new ControlError(400, "Elegí únicamente establecimientos activos de este cliente.");
      }
      const principalId = randomUUID();
      const created = await connection.query(`INSERT INTO xenia_control.principals(id,username,name,password_hash)
        VALUES($1,$2,$3,$4) ON CONFLICT(username) DO NOTHING RETURNING id,username,name`, [principalId, input.username, input.name, await bcrypt.hash(input.password, 12)]);
      if (!created.rowCount) throw new ControlError(409, "Ese nombre de usuario no está disponible.");
      await connection.query(`INSERT INTO xenia_control.organization_people(organization_id,principal_id,creation_request,creation_digest,created_by)
        VALUES($1,$2,$3,$4,$5)`, [organizationId, principalId, input.requestId, digest, actor.id]);
      if (administrator)
        await connection.query("INSERT INTO xenia_control.organization_administrators(organization_id,principal_id,created_by) VALUES($1,$2,$3)", [organizationId, principalId, actor.id]);
      else for (const propertyId of staff!.propertyIds)
        await connection.query("INSERT INTO xenia_control.memberships(principal_id,property_id,role) VALUES($1,$2,$3)", [principalId, propertyId, staff!.role]);
      await this.audit(connection, actor, organizationId, administrator ? "customer_administrator_created" : "customer_staff_created", {
        principalId, requestId: input.requestId, propertyIds: staff?.propertyIds ?? [], role: staff?.role ?? "customer_admin",
      });
      const row = created.rows[0];
      return { id: row.id, username: row.username, name: row.name, replayed: false };
    });
  }

  private async staff(actor: Principal, organizationId: string, principalId: string, connection: Connection) {
    await this.organization(actor, organizationId, connection);
    const row = (await connection.query(`SELECT u.id,u.active,op.active AS "organizationActive" FROM xenia_control.principals u
      LEFT JOIN xenia_control.organization_people op ON op.organization_id=$1 AND op.principal_id=u.id
      WHERE u.id=$2 AND NOT u.platform_admin AND NOT EXISTS(SELECT 1 FROM xenia_control.organization_administrators a
        WHERE a.organization_id=$1 AND a.principal_id=u.id)
      AND (op.principal_id IS NOT NULL OR EXISTS(SELECT 1 FROM xenia_control.memberships m
        JOIN xenia_control.properties p ON p.id=m.property_id WHERE m.principal_id=u.id AND p.organization_id=$1)) FOR UPDATE OF u`, [organizationId, principalId])).rows[0];
    if (!row) throw new ControlError(404, "Colaborador no disponible para este cliente.");
    await connection.query(`INSERT INTO xenia_control.organization_people(organization_id,principal_id,created_by)
      VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, [organizationId, principalId, actor.id]);
    return row;
  }

  async assign(actor: Principal, organizationId: string, principalId: string, propertyId: string, role: PropertyRole) {
    return this.transaction(async connection => {
      const user = await this.staff(actor, organizationId, principalId, connection);
      if (!user.active || user.organizationActive === false) throw new ControlError(409, "Activá primero el acceso del colaborador a este cliente.");
      const property = await connection.query("SELECT id FROM xenia_control.properties WHERE id=$1 AND organization_id=$2 AND status='active'", [propertyId, organizationId]);
      if (!property.rowCount) throw new ControlError(404, "Establecimiento no disponible para este cliente.");
      const previous = (await connection.query("SELECT role FROM xenia_control.memberships WHERE principal_id=$1 AND property_id=$2", [principalId, propertyId])).rows[0];
      if (previous?.role !== role) {
        await connection.query(`INSERT INTO xenia_control.memberships(principal_id,property_id,role) VALUES($1,$2,$3)
          ON CONFLICT(principal_id,property_id) DO UPDATE SET role=EXCLUDED.role`, [principalId, propertyId, role]);
        await this.invalidate(connection, organizationId, principalId, propertyId);
        await this.audit(connection, actor, organizationId, "customer_staff_role_assigned", { principalId, role }, propertyId);
      }
      return { ok: true };
    });
  }

  async revoke(actor: Principal, organizationId: string, principalId: string, propertyId: string) {
    return this.transaction(async connection => {
      await this.staff(actor, organizationId, principalId, connection);
      const property = await connection.query("SELECT id FROM xenia_control.properties WHERE id=$1 AND organization_id=$2", [propertyId, organizationId]);
      if (!property.rowCount) throw new ControlError(404, "Establecimiento no disponible para este cliente.");
      await connection.query("DELETE FROM xenia_control.memberships WHERE principal_id=$1 AND property_id=$2", [principalId, propertyId]);
      await this.invalidate(connection, organizationId, principalId, propertyId);
      await this.audit(connection, actor, organizationId, "customer_staff_role_revoked", { principalId }, propertyId);
      return { ok: true };
    });
  }

  async setActive(actor: Principal, organizationId: string, principalId: string, active: boolean) {
    return this.transaction(async connection => {
      const user = await this.staff(actor, organizationId, principalId, connection);
      if (active && !user.active) throw new ControlError(409, "La cuenta requiere revisión de la administración de Xenia.");
      await connection.query("UPDATE xenia_control.organization_people SET active=$3 WHERE organization_id=$1 AND principal_id=$2", [organizationId, principalId, active]);
      if (!active) {
        await connection.query(`DELETE FROM xenia_control.memberships m USING xenia_control.properties p
          WHERE m.property_id=p.id AND p.organization_id=$1 AND m.principal_id=$2`, [organizationId, principalId]);
        await this.invalidate(connection, organizationId, principalId);
      }
      await this.audit(connection, actor, organizationId, active ? "customer_staff_enabled" : "customer_staff_disabled", { principalId });
      return { ok: true };
    });
  }
}

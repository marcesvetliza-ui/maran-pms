import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type pg from "pg";
import { exactXeniaOrigin } from "../xenia-pms/config";
import type { XeniaPmsIdentity, XeniaPmsRole } from "../../shared/xeniaPms";
import { ControlStore, ControlError, type Principal } from "./store";

export const opaqueHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const pkceChallenge = (value: string) =>
  createHash("sha256").update(value).digest("base64url");
const opaque = () => randomBytes(32).toString("base64url");
type Connection = pg.Pool | pg.PoolClient;
type Installation = {
  clientId: string;
  propertyId: string;
  origin: string;
  enabled: boolean;
};

export class PmsBroker {
  constructor(readonly store: ControlStore) {}

  async links(principal: Principal) {
    const properties = await this.store.properties(principal);
    if (!properties.length) return [];
    return (
      await this.store.central.query(
        `SELECT client_id AS "clientId",property_id AS "propertyId",origin,enabled,template FROM xenia_control.pms_installations
       WHERE property_id=ANY($1::uuid[]) AND enabled=true`,
        [properties.filter((p) => p.status === "active" || principal.platformAdmin && p.storageKind === "pms").map((p) => p.id)],
      )
    ).rows as Installation[];
  }

  async configure(
    principal: Principal,
    propertyId: string,
    requestedOrigin: string,
    requestedTemplate?: "aurora" | "brisa" | "custom",
  ) {
    this.store.requireAdmin(principal);
    const property = await this.store.catalogProperty(principal, propertyId);
    if (property.storageKind === "demo") await this.store.authorize(principal, propertyId);
    // Existing clients may omit the template for the original demonstration slugs.
    // A property's identity or display name must not decide whether it can connect.
    const template =
      requestedTemplate ??
      (property.storageKind === "pms" ? "custom" : property.slug === "aurora-demo"
        ? "aurora"
        : property.slug === "brisa-demo"
          ? "brisa"
          : undefined);
    if (template !== "aurora" && template !== "brisa" && template !== "custom")
      throw new ControlError(
        400,
        "Elegí la plantilla de demostración o el PMS independiente.",
      );
    if ((property.storageKind === "pms") !== (template === "custom"))
      throw new ControlError(409, "El tipo de conexión debe coincidir con el alta del establecimiento.");
    if (!property.modules.includes("lodging"))
      throw new ControlError(
        409,
        "Habilitá Alojamiento para conectar este PMS.",
      );
    let origin: string;
    try {
      origin = exactXeniaOrigin(requestedOrigin, this.store.config.production);
    } catch {
      throw new ControlError(
        400,
        "El PMS requiere su origen HTTPS exacto, sin rutas ni credenciales.",
      );
    }
    if (origin === this.store.config.origin)
      throw new ControlError(
        400,
        "El panel y el PMS deben tener orígenes distintos.",
      );
    if (
      this.store.config.production &&
      !(template === "custom" ? /^https:\/\/(?!aurora\.|brisa\.)[a-z0-9][a-z0-9-]{0,58}\.qa\.xeniapms\.com$/.test(origin) : origin === `https://${template}.qa.xeniapms.com`)
    )
      throw new ControlError(
        400,
        template === "custom" ? "Usá un subdominio exclusivo de pruebas en qa.xeniapms.com." : `Esta plantilla de pruebas usa https://${template}.qa.xeniapms.com.`,
      );
    const secret = opaque();
    const connection = await this.store.central.connect();
    try {
      await connection.query("BEGIN");
      await connection.query("SELECT pg_advisory_xact_lock(87934240)");
      const existingOrigin = await connection.query(
        "SELECT 1 FROM xenia_control.pms_installations WHERE origin=$1 AND property_id<>$2",
        [origin, propertyId],
      );
      if (existingOrigin.rows.length)
        throw new ControlError(
          409,
          "Ese origen ya pertenece al PMS de otro establecimiento.",
        );
      const result = await connection.query(
        `INSERT INTO xenia_control.pms_installations(client_id,property_id,origin,secret_hash,enabled,template)
         VALUES($1,$2,$3,$4,true,$5) ON CONFLICT(property_id) DO UPDATE SET origin=EXCLUDED.origin,secret_hash=EXCLUDED.secret_hash,enabled=true,template=EXCLUDED.template,verified_revision=NULL
         RETURNING client_id AS "clientId",property_id AS "propertyId",origin`,
        [randomUUID(), propertyId, origin, opaqueHash(secret), template],
      );
      const installation = result.rows[0];
      if (property.storageKind === "pms") await connection.query("UPDATE xenia_control.properties SET status='provisioning' WHERE id=$1", [propertyId]);
      await connection.query(
        "DELETE FROM xenia_control.pms_leases WHERE client_id=$1",
        [installation.clientId],
      );
      await connection.query(
        "DELETE FROM xenia_control.pms_grants WHERE client_id=$1",
        [installation.clientId],
      );
      await connection.query(
        "INSERT INTO xenia_control.audit(actor_id,action,property_id) VALUES($1,'pms_configured',$2)",
        [principal.id, propertyId],
      );
      await connection.query("COMMIT");
      return {
        ...installation,
        clientSecret: secret,
        propertyName: property.name,
        template,
      };
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally {
      connection.release();
    }
  }

  async identity(
    connection: Connection,
    principalId: string,
    clientId: string,
    version?: number,
  ): Promise<XeniaPmsIdentity & { sessionVersion: number }> {
    const row = (
      await connection.query(
        `SELECT u.id AS "principalId",u.username,u.name,u.platform_admin AS "platformAdmin",u.session_version AS "sessionVersion",
        p.id AS "propertyId",p.name AS "propertyName",i.client_id AS "clientId",CASE WHEN a.principal_id IS NOT NULL THEN 'customer_admin' ELSE m.role END AS role
       FROM xenia_control.pms_installations i JOIN xenia_control.properties p ON p.id=i.property_id
       JOIN xenia_control.principals u ON u.id=$1
       LEFT JOIN xenia_control.memberships m ON m.principal_id=u.id AND m.property_id=p.id
       LEFT JOIN xenia_control.organization_administrators a ON a.organization_id=p.organization_id AND a.principal_id=u.id
       WHERE i.client_id=$2 AND i.enabled=true AND p.status='active' AND u.active=true AND 'lodging'=ANY(p.modules)`,
        [principalId, clientId],
      )
    ).rows[0];
    if (
      !row ||
      (!row.platformAdmin && !row.role) ||
      (version !== undefined && row.sessionVersion !== version)
    )
      throw new ControlError(
        401,
        "Este acceso al PMS ya no está disponible. Ingresá desde Xenia.",
      );
    const { platformAdmin, ...identity } = row;
    return {
      ...identity,
      role: (platformAdmin ? "owner" : row.role) as XeniaPmsRole,
    };
  }

  async authenticate(clientId: string, secret: string) {
    const result = await this.store.central.query(
      'SELECT client_id AS "clientId",property_id AS "propertyId",origin,enabled,secret_hash FROM xenia_control.pms_installations WHERE client_id=$1',
      [clientId],
    );
    const row = result.rows[0];
    const expected = /^[a-f0-9]{64}$/.test(row?.secret_hash ?? "")
      ? row.secret_hash
      : "0".repeat(64);
    if (
      !timingSafeEqual(
        Buffer.from(opaqueHash(secret), "hex"),
        Buffer.from(expected, "hex"),
      ) ||
      !row?.enabled
    )
      throw new ControlError(
        401,
        "La instalación del PMS no pudo autenticarse.",
      );
    return {
      clientId: row.clientId,
      propertyId: row.propertyId,
      origin: row.origin,
      enabled: row.enabled,
      credentialVersion: row.secret_hash as string,
    };
  }

  async ready(clientId: string, credentialVersion: string, input: { databaseId: string; propertyId: string; revision: string; template: "custom"; mode: "qa"; operationsEnabled: boolean }) {
    const connection = await this.store.central.connect();
    try {
      await connection.query("BEGIN");
      const row = (await connection.query(`SELECT i.property_id,i.template,i.secret_hash,i.verified_revision,i.database_binding_id,p.organization_id,p.storage_kind
        FROM xenia_control.pms_installations i JOIN xenia_control.properties p ON p.id=i.property_id
        WHERE i.client_id=$1 AND i.enabled FOR UPDATE OF i,p`, [clientId])).rows[0];
      if (!row || row.secret_hash !== credentialVersion || row.property_id !== input.propertyId || row.template !== "custom" || row.storage_kind !== "pms" || (row.database_binding_id && row.database_binding_id !== input.databaseId))
        throw new ControlError(403, "La confirmación no corresponde a esta instalación.");
      await connection.query("UPDATE xenia_control.pms_installations SET verified_revision=$2,database_binding_id=$3 WHERE client_id=$1", [clientId, input.revision, input.databaseId]);
      await connection.query("UPDATE xenia_control.properties SET status='active' WHERE id=$1", [input.propertyId]);
      if (row.verified_revision !== input.revision)
        await connection.query(`INSERT INTO xenia_control.audit(organization_id,property_id,action,details)
          VALUES($1,$2,'pms_preparation_confirmed',$3)`, [row.organization_id, input.propertyId, JSON.stringify({ clientId, databaseId: input.databaseId, revision: input.revision, operationsEnabled: input.operationsEnabled })]);
      await connection.query("COMMIT"); return { ok: true };
    } catch (error) { await connection.query("ROLLBACK"); throw error; }
    finally { connection.release(); }
  }

  async grant(principal: Principal, clientId: string, challenge: string) {
    const identity = await this.identity(
      this.store.central,
      principal.id,
      clientId,
      principal.sessionVersion,
    );
    const installation = (
      await this.store.central.query(
        "SELECT origin FROM xenia_control.pms_installations WHERE client_id=$1 AND enabled=true",
        [clientId],
      )
    ).rows[0];
    if (!installation || !/^[a-zA-Z0-9_-]{43}$/.test(challenge))
      throw new ControlError(400, "Solicitud de acceso al PMS inválida.");
    const code = opaque();
    await this.store.central.query(
      "DELETE FROM xenia_control.pms_grants WHERE expires_at<now()",
    );
    await this.store.central.query(
      "DELETE FROM xenia_control.pms_leases WHERE expires_at<now()",
    );
    await this.store.central.query(
      `INSERT INTO xenia_control.pms_grants(code_hash,client_id,principal_id,principal_version,role,challenge,expires_at)
       VALUES($1,$2,$3,$4,$5,$6,now()+interval '60 seconds')`,
      [
        opaqueHash(code),
        clientId,
        principal.id,
        identity.sessionVersion,
        identity.role,
        challenge,
      ],
    );
    return { code, origin: installation.origin };
  }

  async exchange(clientId: string, code: string, verifier: string) {
    if (
      !/^[a-zA-Z0-9_-]{43}$/.test(code) ||
      !/^[a-zA-Z0-9._~-]{43,128}$/.test(verifier)
    )
      throw new ControlError(401, "El código de acceso no pudo validarse.");
    const connection = await this.store.central.connect();
    try {
      await connection.query("BEGIN");
      const grant = (
        await connection.query(
          "SELECT * FROM xenia_control.pms_grants WHERE code_hash=$1 AND client_id=$2 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE",
          [opaqueHash(code), clientId],
        )
      ).rows[0];
      if (!grant || grant.challenge !== pkceChallenge(verifier))
        throw new ControlError(
          401,
          "El código de acceso venció, ya fue utilizado o no corresponde a esta solicitud.",
        );
      const current = await this.identity(
        connection,
        grant.principal_id,
        clientId,
        grant.principal_version,
      );
      if (current.role !== grant.role)
        throw new ControlError(
          401,
          "Tus permisos cambiaron. Ingresá nuevamente desde Xenia.",
        );
      const leaseToken = opaque();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await connection.query(
        "UPDATE xenia_control.pms_grants SET consumed_at=now() WHERE code_hash=$1",
        [opaqueHash(code)],
      );
      await connection.query(
        "INSERT INTO xenia_control.pms_leases(token_hash,client_id,principal_id,principal_version,role,expires_at) VALUES($1,$2,$3,$4,$5,$6)",
        [
          opaqueHash(leaseToken),
          clientId,
          current.principalId,
          current.sessionVersion,
          current.role,
          expiresAt,
        ],
      );
      await connection.query(
        "INSERT INTO xenia_control.audit(actor_id,action,property_id) VALUES($1,'pms_access',$2)",
        [current.principalId, current.propertyId],
      );
      await connection.query("COMMIT");
      const { sessionVersion: _version, ...identity } = current;
      return { identity, leaseToken, expiresAt };
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally {
      connection.release();
    }
  }

  async introspect(clientId: string, token: string) {
    if (!/^[a-zA-Z0-9_-]{43}$/.test(token))
      throw new ControlError(401, "Acceso al PMS inválido.");
    const lease = (
      await this.store.central.query(
        "SELECT * FROM xenia_control.pms_leases WHERE token_hash=$1 AND client_id=$2 AND expires_at>now()",
        [opaqueHash(token), clientId],
      )
    ).rows[0];
    if (!lease)
      throw new ControlError(401, "La sesión del PMS venció o fue revocada.");
    const current = await this.identity(
      this.store.central,
      lease.principal_id,
      clientId,
      lease.principal_version,
    );
    if (current.role !== lease.role)
      throw new ControlError(
        401,
        "Tus permisos cambiaron. Ingresá nuevamente desde Xenia.",
      );
    const { sessionVersion: _version, ...identity } = current;
    return { identity, expiresAt: new Date(lease.expires_at).toISOString() };
  }

  async revoke(clientId: string, token: string) {
    await this.store.central.query(
      "DELETE FROM xenia_control.pms_leases WHERE client_id=$1 AND token_hash=$2",
      [clientId, opaqueHash(token)],
    );
  }
  async logoutPrincipal(principalId: string) {
    await this.store.central.query(
      "DELETE FROM xenia_control.pms_leases WHERE principal_id=$1",
      [principalId],
    );
    await this.store.central.query(
      "DELETE FROM xenia_control.pms_grants WHERE principal_id=$1",
      [principalId],
    );
  }
}

import type { Express } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, withDatabaseTransaction } from "./db";
import { requireAuth, requireRole } from "./auth";
import { hasPermission } from "./permissions";
import {
  accommodationPermission,
  ACCOMMODATION_PERMISSION,
} from "@shared/accommodationPermission";

export async function ensureAccommodationPermissionsSchema() {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS user_permission_overrides (
    user_id varchar NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
    resource_key text NOT NULL, allowed boolean NOT NULL,
    updated_at timestamp NOT NULL DEFAULT NOW(), updated_by varchar,
    CONSTRAINT user_permission_overrides_user_resource_idx UNIQUE(user_id, resource_key)
  )`);
  // One-time snapshot of the prior inherited permission. Later role revocations
  // must not be regranted on deployment; individual overrides remain untouched.
  await withDatabaseTransaction(async () => {
    await db.execute(
      sql`CREATE TABLE IF NOT EXISTS resource_permission_seeds(resource_key text PRIMARY KEY,seeded_at timestamp NOT NULL DEFAULT NOW())`,
    );
    const marker = await db.execute(
      sql`INSERT INTO resource_permission_seeds(resource_key) VALUES (${ACCOMMODATION_PERMISSION}) ON CONFLICT DO NOTHING RETURNING resource_key`,
    );
    if (marker.rows.length)
      await db.execute(sql`INSERT INTO role_permissions(role,resource_key)
      SELECT role,${ACCOMMODATION_PERMISSION} FROM role_permissions WHERE resource_key='sidebar:/reservations'
      ON CONFLICT DO NOTHING`);
  });
}

export async function canEditAccommodation(user: {
  id: string;
  role: string;
}): Promise<boolean> {
  const result =
    await db.execute(sql`SELECT allowed FROM user_permission_overrides
    WHERE user_id=${user.id} AND resource_key=${ACCOMMODATION_PERMISSION}`);
  const override = (result.rows[0] as { allowed: boolean } | undefined)
    ?.allowed;
  return accommodationPermission(
    user.role,
    override,
    hasPermission(user.role, ACCOMMODATION_PERMISSION),
  );
}

export function registerAccommodationPermissionRoutes(app: Express) {
  app.get("/api/reservation-edit-permission", requireAuth, async (req, res) => {
    try {
      res.json({ canEdit: await canEditAccommodation(req.user!) });
    } catch {
      res
        .status(503)
        .json({
          error: "No se pudo verificar el permiso de alojamiento. Reintentá.",
        });
    }
  });
  app.get(
    "/api/admin/accommodation-permissions",
    requireRole(["admin"]),
    async (_req, res) => {
      try {
        const result =
          await db.execute(sql`SELECT u.id, u.username, u.full_name AS "fullName", u.role,
        p.allowed AS override FROM system_users u LEFT JOIN user_permission_overrides p
        ON p.user_id=u.id AND p.resource_key=${ACCOMMODATION_PERMISSION}
        ORDER BY lower(u.username)`);
        res.json(
          result.rows.map((row: any) => ({
            ...row,
            inherited: hasPermission(row.role, ACCOMMODATION_PERMISSION),
            canEdit: accommodationPermission(
              row.role,
              row.override,
              hasPermission(row.role, ACCOMMODATION_PERMISSION),
            ),
          })),
        );
      } catch {
        res
          .status(503)
          .json({ error: "No se pudieron cargar los permisos por usuario." });
      }
    },
  );
  app.put(
    "/api/admin/accommodation-permissions/:id",
    requireRole(["admin"]),
    async (req, res) => {
      const parsed = z
        .object({ allowed: z.boolean().nullable() })
        .strict()
        .safeParse(req.body);
      if (!parsed.success)
        return res
          .status(400)
          .json({
            error: "Indicá habilitado, deshabilitado o heredar el rol.",
          });
      try {
        const found = await withDatabaseTransaction(async () => {
          const target = await db.execute(
            sql`SELECT id,role FROM system_users WHERE id=${req.params.id} FOR UPDATE`,
          );
          if (!target.rows.length) return false;
          const previous =
            await db.execute(sql`SELECT allowed FROM user_permission_overrides
          WHERE user_id=${req.params.id} AND resource_key=${ACCOMMODATION_PERMISSION}`);
          if (parsed.data.allowed === null) {
            await db.execute(sql`DELETE FROM user_permission_overrides WHERE user_id=${req.params.id}
            AND resource_key=${ACCOMMODATION_PERMISSION}`);
          } else {
            await db.execute(sql`INSERT INTO user_permission_overrides(user_id,resource_key,allowed,updated_by)
            VALUES (${req.params.id},${ACCOMMODATION_PERMISSION},${parsed.data.allowed},${req.user!.id})
            ON CONFLICT(user_id,resource_key) DO UPDATE SET allowed=EXCLUDED.allowed,
            updated_by=EXCLUDED.updated_by,updated_at=NOW()`);
          }
          await db.execute(sql`INSERT INTO audit_logs(user_id,user_name,action,module,entity_type,entity_id,description,details,timestamp)
          VALUES (${req.user!.id},${req.user!.username},'update','permisos','user_permission',${req.params.id},
          'Cambio del permiso individual: Editar tarifas y noches de alojamiento',
          ${JSON.stringify({ resourceKey: ACCOMMODATION_PERMISSION, before: (previous.rows[0] as any)?.allowed ?? null, after: parsed.data.allowed })},NOW())`);
          return true;
        });
        if (!found)
          return res.status(404).json({ error: "Usuario no encontrado." });
        res.status(204).end();
      } catch {
        res
          .status(503)
          .json({
            error:
              "No se pudo guardar el permiso. No se confirmó ningún cambio.",
          });
      }
    },
  );
}

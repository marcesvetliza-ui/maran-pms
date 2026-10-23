import type { Express } from "express";
import { sql } from "drizzle-orm";
import { db, withDatabaseTransaction } from "./db";
import { requireAuth, requireRole } from "./auth";
import { hasPermission } from "./permissions";
import {
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
  return hasPermission(user.role, ACCOMMODATION_PERMISSION);
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
  // Old clients must use the same role matrix as the current UI. Retain stored
  // overrides for history, but never apply or update them for this resource.
  app.all("/api/admin/accommodation-permissions", requireRole(["admin"]), (_req, res) => {
    res.status(410).json({error:"Este permiso se administra en Permisos por Rol: Edición de folios de reservas."});
  });
  app.all("/api/admin/accommodation-permissions/:id", requireRole(["admin"]), (_req, res) => {
    res.status(410).json({error:"Este permiso se administra en Permisos por Rol: Edición de folios de reservas."});
  });
}

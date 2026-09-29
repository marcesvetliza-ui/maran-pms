import type { Express } from "express";
import { db } from "../db";
import { rolePermissions } from "@shared/schema";
import { requireRole } from "../auth";
import { audit } from "../audit";
import {
  ALL_SYSTEM_ROLES,
  RESOURCE_KEY_LABELS,
  grantPermission,
  revokePermission,
} from "../permissions";

const KNOWN_RESOURCE_KEYS = new Set(Object.keys(RESOURCE_KEY_LABELS));
const KNOWN_ROLES = new Set<string>(ALL_SYSTEM_ROLES);

/**
 * Etapa 2 del ABM de usuarios: endpoints admin-only para editar role_permissions.
 * La mutación en sí (grantPermission/revokePermission, con recarga del caché
 * en memoria) ya existía desde la Etapa 1 — acá solo se agrega la capa HTTP,
 * validación de entrada y auditoría.
 */
export function registerAdminPermissionsRoutes(app: Express) {
  app.get("/api/admin/role-permissions", requireRole(["admin"]), async (_req, res) => {
    try {
      const rows = await db
        .select({ role: rolePermissions.role, resourceKey: rolePermissions.resourceKey })
        .from(rolePermissions);
      const catalog = Object.entries(RESOURCE_KEY_LABELS).map(([resourceKey, meta]) => ({
        resourceKey,
        ...meta,
      }));
      res.json({ roles: ALL_SYSTEM_ROLES, catalog, grants: rows });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/role-permissions/grant", requireRole(["admin"]), async (req, res) => {
    try {
      const { role, resourceKey } = req.body || {};
      if (!KNOWN_ROLES.has(role)) {
        return res.status(400).json({ error: "Rol desconocido" });
      }
      if (!KNOWN_RESOURCE_KEYS.has(resourceKey)) {
        return res.status(400).json({ error: "resourceKey desconocido" });
      }
      await grantPermission(role, resourceKey);
      await audit(req, "update", "permisos", `Permiso otorgado: ${role} → ${resourceKey}`, {
        entityType: "role_permission",
        entityId: `${role}:${resourceKey}`,
      });
      res.status(204).end();
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/role-permissions/revoke", requireRole(["admin"]), async (req, res) => {
    try {
      const { role, resourceKey } = req.body || {};
      if (!KNOWN_ROLES.has(role)) {
        return res.status(400).json({ error: "Rol desconocido" });
      }
      if (!KNOWN_RESOURCE_KEYS.has(resourceKey)) {
        return res.status(400).json({ error: "resourceKey desconocido" });
      }
      await revokePermission(role, resourceKey);
      await audit(req, "update", "permisos", `Permiso revocado: ${role} → ${resourceKey}`, {
        entityType: "role_permission",
        entityId: `${role}:${resourceKey}`,
      });
      res.status(204).end();
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}

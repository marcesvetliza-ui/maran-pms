import type { Express } from "express";
import { db } from "../db";
import { and, eq } from "drizzle-orm";
import { costCenters } from "@shared/schema";
import { requireAuth, requireRole } from "../auth";

// Mismo criterio de roles que el ítem "Centros de Costo" del sidebar.
const COST_CENTER_ADMIN_ROLES = ["admin", "resp_administracion"];

// Usado por los handlers de Facturas de Compra (server/routes.ts) para evitar que se
// guarde un centro de costo que no exista o que esté inactivo en la lista gestionada.
// Un valor vacío/null es válido (el campo es opcional).
export async function isValidCentroCosto(nombre: string | null | undefined): Promise<boolean> {
  if (!nombre || !String(nombre).trim()) return true;
  const rows = await db
    .select({ id: costCenters.id })
    .from(costCenters)
    .where(and(eq(costCenters.nombre, nombre), eq(costCenters.activo, true)));
  return rows.length > 0;
}

export function registerCostCentersRoutes(app: Express) {

  // Por defecto solo devuelve los activos (para selects en formularios).
  // ?all=1 devuelve también los inactivos (para la pantalla de administración; solo admins).
  app.get("/api/cost-centers", requireAuth, async (req, res) => {
    try {
      const includeInactive = req.query.all === "1" || req.query.all === "true";
      if (includeInactive && !COST_CENTER_ADMIN_ROLES.includes((req.user as Express.User).role)) {
        return res.status(403).json({ error: "No autorizado para esta acción" });
      }
      const rows = await db.select().from(costCenters).orderBy(costCenters.nombre);
      res.json(includeInactive ? rows : rows.filter((r) => r.activo));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/cost-centers", requireRole(COST_CENTER_ADMIN_ROLES), async (req, res) => {
    try {
      const nombre = (req.body?.nombre || "").trim();
      if (!nombre) return res.status(400).json({ error: "El nombre es requerido" });
      const [created] = await db.insert(costCenters).values({ nombre, activo: true }).returning();
      res.status(201).json(created);
    } catch (e: any) {
      if (String(e.message).includes("duplicate key")) {
        return res.status(409).json({ error: "Ya existe un centro de costo con ese nombre" });
      }
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/cost-centers/:id", requireRole(COST_CENTER_ADMIN_ROLES), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { nombre, activo } = req.body;
      const data: any = {};
      if (nombre !== undefined) data.nombre = String(nombre).trim();
      if (activo !== undefined) data.activo = !!activo;
      const [updated] = await db.update(costCenters).set(data).where(eq(costCenters.id, id)).returning();
      if (!updated) return res.status(404).json({ error: "Centro de costo no encontrado" });
      res.json(updated);
    } catch (e: any) {
      if (String(e.message).includes("duplicate key")) {
        return res.status(409).json({ error: "Ya existe un centro de costo con ese nombre" });
      }
      res.status(500).json({ error: e.message });
    }
  });
}

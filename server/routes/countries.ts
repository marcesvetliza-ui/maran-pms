import type { Express } from "express";
import { db } from "../db";
import { countries, insertCountrySchema } from "../../shared/schema";
import { eq, asc } from "drizzle-orm";
import { requireAuth, requireRole } from "../auth";

export function registerCountriesRoutes(app: Express) {
  // GET /api/countries — lista activa (pública, para selects)
  app.get("/api/countries", async (_req, res) => {
    try {
      const list = await db
        .select()
        .from(countries)
        .where(eq(countries.isActive, true))
        .orderBy(asc(countries.displayOrder), asc(countries.name));
      res.json(list);
    } catch {
      res.status(500).json({ error: "Error al obtener países" });
    }
  });

  // GET /api/admin/countries — lista completa para ABM
  app.get("/api/admin/countries", requireAuth, requireRole(["admin", "manager"]), async (_req, res) => {
    try {
      const list = await db
        .select()
        .from(countries)
        .orderBy(asc(countries.displayOrder), asc(countries.name));
      res.json(list);
    } catch {
      res.status(500).json({ error: "Error al obtener países" });
    }
  });

  // POST /api/admin/countries
  app.post("/api/admin/countries", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const parsed = insertCountrySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const [created] = await db.insert(countries).values({ ...parsed.data }).returning();
      res.status(201).json(created);
    } catch (e: any) {
      if (e?.code === "23505") return res.status(409).json({ error: "El código AFIP ya existe" });
      res.status(500).json({ error: "Error al crear país" });
    }
  });

  // PATCH /api/admin/countries/:id
  app.patch("/api/admin/countries/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { id } = req.params;
      const { name, afipCode, isActive, displayOrder } = req.body;
      const update: Record<string, unknown> = {};
      if (name !== undefined) update.name = name;
      if (afipCode !== undefined) update.afipCode = afipCode;
      if (isActive !== undefined) update.isActive = isActive;
      if (displayOrder !== undefined) update.displayOrder = displayOrder;
      const [updated] = await db.update(countries).set(update).where(eq(countries.id, id)).returning();
      if (!updated) return res.status(404).json({ error: "País no encontrado" });
      res.json(updated);
    } catch (e: any) {
      if (e?.code === "23505") return res.status(409).json({ error: "El código AFIP ya existe" });
      res.status(500).json({ error: "Error al actualizar país" });
    }
  });

  // DELETE /api/admin/countries/:id
  app.delete("/api/admin/countries/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { id } = req.params;
      await db.delete(countries).where(eq(countries.id, id));
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Error al eliminar país" });
    }
  });
}

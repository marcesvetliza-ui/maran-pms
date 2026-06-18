import type { Express } from "express";
import { db } from "../db";
import { sql, eq } from "drizzle-orm";
import { posConfigs } from "@shared/schema";
import { requireAuth } from "../auth";

export function registerPosConfigsRoutes(app: Express) {

  app.get("/api/pos-configs", requireAuth, async (req, res) => {
    try {
      const rows = await db.select().from(posConfigs).orderBy(posConfigs.numero);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/pos-configs", requireAuth, async (req, res) => {
    try {
      const { nombre, numero, area, tipo, descripcion, activo } = req.body;
      if (!nombre || !numero) return res.status(400).json({ error: "nombre y numero son requeridos" });
      const [created] = await db.insert(posConfigs).values({
        nombre, numero: parseInt(numero), area: area || "general",
        tipo: tipo || "manual", descripcion: descripcion || null,
        activo: activo !== false,
      }).returning();
      res.status(201).json(created);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/pos-configs/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { nombre, numero, area, tipo, descripcion, activo } = req.body;
      const data: any = {};
      if (nombre !== undefined) data.nombre = nombre;
      if (numero !== undefined) data.numero = parseInt(numero);
      if (area !== undefined) data.area = area;
      if (tipo !== undefined) data.tipo = tipo;
      if (descripcion !== undefined) data.descripcion = descripcion;
      if (activo !== undefined) data.activo = activo;
      const [updated] = await db.update(posConfigs).set(data).where(eq(posConfigs.id, id)).returning();
      if (!updated) return res.status(404).json({ error: "Punto de Venta no encontrado" });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/pos-configs/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = await db.delete(posConfigs).where(eq(posConfigs.id, id));
      if ((result.rowCount ?? 0) === 0) return res.status(404).json({ error: "Punto de Venta no encontrado" });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}

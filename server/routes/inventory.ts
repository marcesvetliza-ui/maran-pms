import type { Express } from "express";
import { storage } from "../db-storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../auth";

export function registerInventoryRoutes(app: Express) {
  // Item Categories
  app.get("/api/inventory/categories", async (req, res) => {
    try {
      let categories = await storage.getItemCategories();
      const area = req.query.area as string | undefined;
      if (area) {
        categories = categories.filter((c: any) => c.area === area);
      }
      res.json(categories);
    } catch (error) {
      res.status(500).json({ error: "Error fetching categories" });
    }
  });

  app.post("/api/inventory/categories", async (req, res) => {
    try {
      const category = await storage.createItemCategory(req.body);
      res.status(201).json(category);
    } catch (error) {
      res.status(500).json({ error: "Error creating category" });
    }
  });

  app.patch("/api/inventory/categories/:id", async (req, res) => {
    try {
      const category = await storage.updateItemCategory(req.params.id, req.body);
      if (!category) return res.status(404).json({ error: "Category not found" });
      res.json(category);
    } catch (error) {
      res.status(500).json({ error: "Error updating category" });
    }
  });

  app.delete("/api/inventory/categories/:id", async (req, res) => {
    try {
      await storage.deleteItemCategory(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting category" });
    }
  });

  // Suppliers
  app.get("/api/inventory/suppliers", async (req, res) => {
    try {
      const suppliers = await storage.getSuppliers();
      res.json(suppliers);
    } catch (error) {
      res.status(500).json({ error: "Error fetching suppliers" });
    }
  });

  app.post("/api/inventory/suppliers", async (req, res) => {
    try {
      const supplier = await storage.createSupplier(req.body);
      res.status(201).json(supplier);
    } catch (error) {
      res.status(500).json({ error: "Error creating supplier" });
    }
  });

  app.patch("/api/inventory/suppliers/:id", async (req, res) => {
    try {
      const supplier = await storage.updateSupplier(req.params.id, req.body);
      if (!supplier) return res.status(404).json({ error: "Supplier not found" });
      res.json(supplier);
    } catch (error) {
      res.status(500).json({ error: "Error updating supplier" });
    }
  });

  app.delete("/api/inventory/suppliers/:id", async (req, res) => {
    try {
      await storage.deleteSupplier(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting supplier" });
    }
  });

  // Inventory Items
  app.get("/api/inventory/items", async (req, res) => {
    try {
      let items = await storage.getInventoryItems();
      const area = req.query.area as string | undefined;
      if (area) {
        items = items.filter((item: any) => {
          if (item.category && (item.category as any).area === area) return true;
          return false;
        });
      }
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Error fetching inventory items" });
    }
  });

  app.get("/api/inventory/items/low-stock", async (req, res) => {
    try {
      const items = await storage.getInventoryItemsBelowMinStock();
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Error fetching low stock items" });
    }
  });

  app.post("/api/inventory/items", async (req, res) => {
    try {
      const body = { ...req.body };

      // Auto-generate SKU if not provided
      if (!body.sku) {
        const areaPrefixes: Record<string, string> = {
          spa: "SPA",
          restaurant: "RST",
          housekeeping: "HSK",
          maintenance: "MNT",
          admin: "ADM",
          general: "GEN",
        };
        // Prefer category area over item area for SKU prefix
        let area = body.area ?? "general";
        if (body.categoryId) {
          const cat = await storage.getItemCategory(body.categoryId);
          if (cat?.area) area = cat.area;
        }
        const prefix = areaPrefixes[area as string] ?? "GEN";

        // Find highest existing numeric suffix for this prefix
        const allItems = await storage.getInventoryItems();
        const pattern = new RegExp(`^${prefix}-(\\d+)$`);
        let maxNum = 0;
        for (const it of allItems) {
          if (it.sku) {
            const m = it.sku.match(pattern);
            if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
          }
        }
        body.sku = `${prefix}-${String(maxNum + 1).padStart(4, "0")}`;
      }

      const item = await storage.createInventoryItem(body);
      res.status(201).json(item);
    } catch (error) {
      res.status(500).json({ error: "Error creating inventory item" });
    }
  });

  app.patch("/api/inventory/items/:id", async (req, res) => {
    try {
      const item = await storage.updateInventoryItem(req.params.id, req.body);
      if (!item) return res.status(404).json({ error: "Item not found" });
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: "Error updating inventory item" });
    }
  });

  app.delete("/api/inventory/items/:id", async (req, res) => {
    try {
      await storage.deleteInventoryItem(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting inventory item" });
    }
  });

  // Stock Movements
  app.get("/api/inventory/movements", async (req, res) => {
    try {
      const itemId = req.query.itemId as string | undefined;
      const movements = await storage.getStockMovements(itemId);
      res.json(movements);
    } catch (error) {
      res.status(500).json({ error: "Error fetching stock movements" });
    }
  });

  app.post("/api/inventory/movements", async (req, res) => {
    try {
      const { itemId, movementType, quantity, notes, sourceType, sourceId } = req.body;

      const item = await storage.getInventoryItem(itemId);
      if (!item) return res.status(404).json({ error: "Artículo no encontrado" });

      const previousStock = parseFloat(String(item.currentStock ?? 0));
      const qty = parseFloat(String(quantity));
      let newStock = previousStock;

      if (movementType === "entrada") {
        newStock = previousStock + qty;
      } else if (movementType === "salida" || movementType === "consumo") {
        newStock = previousStock - qty;
        if (newStock < 0) {
          return res.status(400).json({
            error: `Stock insuficiente para ${item.name}. Stock actual: ${previousStock}, requerido: ${qty}`,
          });
        }
      } else if (movementType === "ajuste") {
        newStock = qty;
      }

      const movement = await storage.createStockMovement({
        itemId,
        movementType,
        quantity: String(qty),
        previousStock: String(previousStock),
        newStock: String(newStock),
        notes,
        sourceType: sourceType || "manual",
        sourceId: sourceId || null,
        createdAt: new Date(),
      });

      await storage.updateInventoryItem(itemId, { currentStock: String(newStock) as any });

      if (item.minStock && newStock <= parseFloat(String(item.minStock))) {
        console.warn(`[Inventario] Stock bajo: ${item.name} — ${newStock} ${item.unit} (mín: ${item.minStock})`);
      }

      res.status(201).json({ movement, newStock, item: { ...item, currentStock: newStock } });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Error registrando movimiento de stock" });
    }
  });

  app.get("/api/inventory/consumo-report", requireAuth, async (req, res) => {
    try {
      const { from, to } = req.query as { from?: string; to?: string };
      const today = new Date().toISOString().split("T")[0];
      const fromDate = from || today;
      const toDate = to || today;

      const consumos = await db.execute(sql`
        SELECT
          ii.id,
          ii.name as item_name,
          ii.unit,
          ii.cost_price,
          SUM(sm.quantity::numeric) as total_consumed,
          SUM(sm.quantity::numeric * COALESCE(ii.cost_price::numeric, 0)) as total_cost,
          COUNT(DISTINCT sm.source_id) as orders_count
        FROM stock_movements sm
        JOIN inventory_items ii ON sm.item_id = ii.id
        WHERE sm.movement_type = 'consumo'
          AND sm.source_type = 'restaurant_order'
          AND DATE(sm.created_at) BETWEEN ${fromDate} AND ${toDate}
        GROUP BY ii.id, ii.name, ii.unit, ii.cost_price
        ORDER BY total_cost DESC
      `);

      const totalCosto = (consumos.rows as any[]).reduce(
        (sum, r) => sum + parseFloat(r.total_cost || "0"), 0
      );

      res.json({ from: fromDate, to: toDate, items: consumos.rows, totalCosto });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Error generando reporte de consumo" });
    }
  });
}

import type { Express } from "express";
import { storage } from "../db-storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../auth";

const INVENTORY_WRITE_ROLES = ["admin", "manager", "restaurant", "resp_deposito", "resp_administracion"] as [string, ...string[]];

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

  app.post("/api/inventory/categories", requireRole(INVENTORY_WRITE_ROLES), async (req, res) => {
    try {
      const category = await storage.createItemCategory(req.body);
      res.status(201).json(category);
    } catch (error) {
      res.status(500).json({ error: "Error creating category" });
    }
  });

  app.patch("/api/inventory/categories/:id", requireRole(INVENTORY_WRITE_ROLES), async (req, res) => {
    try {
      const category = await storage.updateItemCategory(req.params.id, req.body);
      if (!category) return res.status(404).json({ error: "Category not found" });
      res.json(category);
    } catch (error) {
      res.status(500).json({ error: "Error updating category" });
    }
  });

  app.delete("/api/inventory/categories/:id", requireRole(INVENTORY_WRITE_ROLES), async (req, res) => {
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

  app.post("/api/inventory/suppliers", requireRole(INVENTORY_WRITE_ROLES), async (req, res) => {
    try {
      const supplier = await storage.createSupplier(req.body);
      res.status(201).json(supplier);
    } catch (error) {
      res.status(500).json({ error: "Error creating supplier" });
    }
  });

  app.patch("/api/inventory/suppliers/:id", requireRole(INVENTORY_WRITE_ROLES), async (req, res) => {
    try {
      const supplier = await storage.updateSupplier(req.params.id, req.body);
      if (!supplier) return res.status(404).json({ error: "Supplier not found" });
      res.json(supplier);
    } catch (error) {
      res.status(500).json({ error: "Error updating supplier" });
    }
  });

  app.delete("/api/inventory/suppliers/:id", requireRole(INVENTORY_WRITE_ROLES), async (req, res) => {
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
      const itemKind = req.query.itemKind as string | undefined;
      if (itemKind) {
        items = items.filter((item: any) => item.itemKind === itemKind);
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

  app.post("/api/inventory/items", requireRole(INVENTORY_WRITE_ROLES), async (req, res) => {
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
          marketing: "MKT",
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

  app.patch("/api/inventory/items/:id", requireRole(INVENTORY_WRITE_ROLES), async (req, res) => {
    try {
      const item = await storage.updateInventoryItem(req.params.id, req.body);
      if (!item) return res.status(404).json({ error: "Item not found" });
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: "Error updating inventory item" });
    }
  });

  app.delete("/api/inventory/items/:id", requireRole(INVENTORY_WRITE_ROLES), async (req, res) => {
    try {
      const result = await storage.deleteInventoryItem(req.params.id);
      if (!result.deleted && !result.deactivated) {
        return res.status(404).json({ error: "Item not found" });
      }
      if (result.deactivated) {
        return res.status(200).json({ deleted: false, deactivated: true, message: "El artículo tiene movimientos registrados, no se puede eliminar. Se desactivó en su lugar." });
      }
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

  app.post("/api/inventory/movements", requireRole(INVENTORY_WRITE_ROLES), async (req, res) => {
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

  // ==================== WAREHOUSES (Depósitos) ====================

  app.get("/api/inventory/warehouses", async (req, res) => {
    try {
      const rows = await db.execute(sql`SELECT * FROM inventory_warehouses WHERE is_active = 'true' ORDER BY created_at ASC`);
      res.json(rows.rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Error fetching warehouses" });
    }
  });

  app.post("/api/inventory/warehouses", requireRole(INVENTORY_WRITE_ROLES), async (req, res) => {
    try {
      const { name, description, area } = req.body;
      const rows = await db.execute(sql`
        INSERT INTO inventory_warehouses (name, description, area)
        VALUES (${name}, ${description || null}, ${area || "general"})
        RETURNING *
      `);
      res.status(201).json(rows.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Error creating warehouse" });
    }
  });

  app.patch("/api/inventory/warehouses/:id", requireRole(INVENTORY_WRITE_ROLES), async (req, res) => {
    try {
      const { name, description, area, isActive } = req.body;
      const rows = await db.execute(sql`
        UPDATE inventory_warehouses
        SET name = COALESCE(${name}, name),
            description = COALESCE(${description}, description),
            area = COALESCE(${area}, area),
            is_active = COALESCE(${isActive}, is_active)
        WHERE id = ${req.params.id}
        RETURNING *
      `);
      if (!rows.rows[0]) return res.status(404).json({ error: "Warehouse not found" });
      res.json(rows.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Error updating warehouse" });
    }
  });

  app.delete("/api/inventory/warehouses/:id", requireRole(INVENTORY_WRITE_ROLES), async (req, res) => {
    try {
      await db.execute(sql`UPDATE inventory_warehouses SET is_active = 'false' WHERE id = ${req.params.id}`);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Error deleting warehouse" });
    }
  });

  // Stock by warehouse — GET /api/inventory/warehouses/:id/stock
  app.get("/api/inventory/warehouses/:id/stock", async (req, res) => {
    try {
      const rows = await db.execute(sql`
        SELECT ws.*, ii.name as item_name, ii.sku, ii.unit, ii.cost_price, ii.min_stock, ii.is_active as item_active,
               ic.name as category_name
        FROM warehouse_stock ws
        JOIN inventory_items ii ON ws.item_id = ii.id
        LEFT JOIN item_categories ic ON ii.category_id = ic.id
        WHERE ws.warehouse_id = ${req.params.id}
        ORDER BY ii.name ASC
      `);
      res.json(rows.rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Error fetching warehouse stock" });
    }
  });

  // All warehouses stock for an item — GET /api/inventory/items/:id/warehouses
  app.get("/api/inventory/items/:id/warehouses", async (req, res) => {
    try {
      const rows = await db.execute(sql`
        SELECT ws.*, iw.name as warehouse_name, iw.area as warehouse_area
        FROM warehouse_stock ws
        JOIN inventory_warehouses iw ON ws.warehouse_id = iw.id
        WHERE ws.item_id = ${req.params.id}
        ORDER BY iw.name ASC
      `);
      res.json(rows.rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Error fetching item warehouse stock" });
    }
  });

  // Transfer stock between warehouses — POST /api/inventory/transfer
  app.post("/api/inventory/transfer", requireRole(INVENTORY_WRITE_ROLES), async (req, res) => {
    try {
      const { itemId, fromWarehouseId, toWarehouseId, quantity, notes } = req.body;
      if (!itemId || !fromWarehouseId || !toWarehouseId || !quantity) {
        return res.status(400).json({ error: "Faltan campos requeridos" });
      }
      if (fromWarehouseId === toWarehouseId) {
        return res.status(400).json({ error: "Los depósitos origen y destino deben ser distintos" });
      }
      const qty = parseFloat(String(quantity));

      // Get source warehouse stock
      const fromStockRows = await db.execute(sql`
        SELECT current_stock FROM warehouse_stock WHERE warehouse_id = ${fromWarehouseId} AND item_id = ${itemId}
      `);
      const fromStock = parseFloat(String((fromStockRows.rows[0] as any)?.current_stock ?? 0));

      if (fromStock < qty) {
        return res.status(400).json({ error: `Stock insuficiente en depósito origen. Disponible: ${fromStock}` });
      }

      const newFromStock = fromStock - qty;

      // Get dest warehouse stock
      const toStockRows = await db.execute(sql`
        SELECT current_stock FROM warehouse_stock WHERE warehouse_id = ${toWarehouseId} AND item_id = ${itemId}
      `);
      const toStock = parseFloat(String((toStockRows.rows[0] as any)?.current_stock ?? 0));
      const newToStock = toStock + qty;

      // Update source
      await db.execute(sql`
        INSERT INTO warehouse_stock (warehouse_id, item_id, current_stock, updated_at)
        VALUES (${fromWarehouseId}, ${itemId}, ${newFromStock}, now())
        ON CONFLICT (warehouse_id, item_id) DO UPDATE SET current_stock = ${newFromStock}, updated_at = now()
      `);

      // Update dest
      await db.execute(sql`
        INSERT INTO warehouse_stock (warehouse_id, item_id, current_stock, updated_at)
        VALUES (${toWarehouseId}, ${itemId}, ${newToStock}, now())
        ON CONFLICT (warehouse_id, item_id) DO UPDATE SET current_stock = ${newToStock}, updated_at = now()
      `);

      // Record movement
      const item = await storage.getInventoryItem(itemId);
      const totalPrev = parseFloat(String(item?.currentStock ?? 0));

      await db.execute(sql`
        INSERT INTO stock_movements (item_id, movement_type, quantity, previous_stock, new_stock, notes, source_type, created_at, warehouse_id, to_warehouse_id)
        VALUES (${itemId}, 'transferencia', ${qty}, ${fromStock}, ${newFromStock}, ${notes || null}, 'manual', now(), ${fromWarehouseId}, ${toWarehouseId})
      `);

      res.json({ success: true, fromStock: newFromStock, toStock: newToStock });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Error en transferencia" });
    }
  });

  // Warehouse stock movement (entrada/salida within a specific warehouse)
  app.post("/api/inventory/warehouses/:warehouseId/movements", requireAuth, async (req, res) => {
    try {
      const { warehouseId } = req.params;
      const { itemId, movementType, quantity, notes, unitCost } = req.body;

      const item = await storage.getInventoryItem(itemId);
      if (!item) return res.status(404).json({ error: "Artículo no encontrado" });

      // Get current warehouse stock
      const wsRows = await db.execute(sql`
        SELECT current_stock FROM warehouse_stock WHERE warehouse_id = ${warehouseId} AND item_id = ${itemId}
      `);
      const prevWStock = parseFloat(String((wsRows.rows[0] as any)?.current_stock ?? 0));
      const qty = parseFloat(String(quantity));
      let newWStock = prevWStock;

      if (movementType === "entrada") {
        newWStock = prevWStock + qty;
      } else if (movementType === "salida" || movementType === "consumo") {
        newWStock = prevWStock - qty;
        if (newWStock < 0) return res.status(400).json({ error: `Stock insuficiente en este depósito. Disponible: ${prevWStock}` });
      } else if (movementType === "ajuste") {
        newWStock = qty;
      }

      // Upsert warehouse stock
      await db.execute(sql`
        INSERT INTO warehouse_stock (warehouse_id, item_id, current_stock, updated_at)
        VALUES (${warehouseId}, ${itemId}, ${newWStock}, now())
        ON CONFLICT (warehouse_id, item_id) DO UPDATE SET current_stock = ${newWStock}, updated_at = now()
      `);

      // Also update the global currentStock on the item (sum of all warehouses)
      const allWsRows = await db.execute(sql`SELECT SUM(current_stock::numeric) as total FROM warehouse_stock WHERE item_id = ${itemId}`);
      const globalTotal = parseFloat(String((allWsRows.rows[0] as any)?.total ?? 0));
      await storage.updateInventoryItem(itemId, { currentStock: String(globalTotal) as any });

      // Record movement
      await db.execute(sql`
        INSERT INTO stock_movements (item_id, movement_type, quantity, previous_stock, new_stock, unit_cost, notes, source_type, created_at, warehouse_id)
        VALUES (${itemId}, ${movementType}, ${qty}, ${prevWStock}, ${newWStock}, ${unitCost || null}, ${notes || null}, 'manual', now(), ${warehouseId})
      `);

      // Track price history on entrada
      if (movementType === "entrada" && unitCost && parseFloat(String(unitCost)) > 0) {
        const newCost = parseFloat(String(unitCost));
        const oldCost = parseFloat(String(item.costPrice ?? 0));
        if (Math.abs(newCost - oldCost) > 0.001) {
          await db.execute(sql`
            INSERT INTO item_price_history (item_id, price, source, notes)
            VALUES (${itemId}, ${newCost}, 'entrada', ${notes || null})
          `);
          await storage.updateInventoryItem(itemId, { costPrice: String(newCost) as any });
        }
      }

      res.status(201).json({ success: true, newWarehouseStock: newWStock, newGlobalStock: globalTotal });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Error registrando movimiento" });
    }
  });

  // Price history for an item
  app.get("/api/inventory/items/:id/price-history", async (req, res) => {
    try {
      const rows = await db.execute(sql`
        SELECT * FROM item_price_history WHERE item_id = ${req.params.id} ORDER BY recorded_at DESC LIMIT 50
      `);
      res.json(rows.rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Error fetching price history" });
    }
  });

  // All warehouses summary — GET /api/inventory/warehouses-summary
  app.get("/api/inventory/warehouses-summary", async (req, res) => {
    try {
      const rows = await db.execute(sql`
        SELECT
          iw.id as warehouse_id,
          iw.name as warehouse_name,
          iw.area,
          COUNT(DISTINCT ws.item_id) as item_count,
          SUM(ws.current_stock::numeric * COALESCE(ii.cost_price::numeric, 0)) as total_value,
          COUNT(CASE WHEN ws.current_stock::numeric <= COALESCE(ii.min_stock::numeric, 0) AND ws.current_stock::numeric > 0 THEN 1 END) as low_stock_count,
          COUNT(CASE WHEN ws.current_stock::numeric = 0 THEN 1 END) as zero_stock_count
        FROM inventory_warehouses iw
        LEFT JOIN warehouse_stock ws ON iw.id = ws.warehouse_id
        LEFT JOIN inventory_items ii ON ws.item_id = ii.id
        WHERE iw.is_active = 'true'
        GROUP BY iw.id, iw.name, iw.area
        ORDER BY iw.created_at ASC
      `);
      res.json(rows.rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Error fetching warehouses summary" });
    }
  });
}

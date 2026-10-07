import { consumeInventoryInternally, internalConsumptionOrigins } from "../inventoryInternalConsumption";
import { safeInventoryTransfer, safeWarehouseMovement } from "../inventorySafety";
import { correctInventoryMovement } from "../inventoryMovementCorrection";
import type { Express } from "express";
import { storage } from "../db-storage";
import { db, withDatabaseTransaction } from "../db";
import { sql } from "drizzle-orm";
import { requireAuth, requirePermission } from "../auth";

// Etapa 3 del ABM de usuarios: mismos roles de antes, ahora como resourceKey
// propio en role_permissions (ver API_RESOURCE_PERMISSIONS en server/permissions.ts).
const INVENTORY_WRITE_RESOURCE_KEY = "api:inventory:write";

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

  app.post("/api/inventory/categories", requirePermission(INVENTORY_WRITE_RESOURCE_KEY), async (req, res) => {
    try {
      const category = await storage.createItemCategory(req.body);
      res.status(201).json(category);
    } catch (error) {
      res.status(500).json({ error: "Error creating category" });
    }
  });

  app.patch("/api/inventory/categories/:id", requirePermission(INVENTORY_WRITE_RESOURCE_KEY), async (req, res) => {
    try {
      const category = await storage.updateItemCategory(req.params.id, req.body);
      if (!category) return res.status(404).json({ error: "Category not found" });
      res.json(category);
    } catch (error) {
      res.status(500).json({ error: "Error updating category" });
    }
  });

  app.delete("/api/inventory/categories/:id", requirePermission(INVENTORY_WRITE_RESOURCE_KEY), async (req, res) => {
    try {
      await storage.deleteItemCategory(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting category" });
    }
  });

  // Brands (Marcas)
  app.get("/api/inventory/brands", async (req, res) => {
    try {
      const items = await storage.getBrands();
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Error fetching brands" });
    }
  });

  app.post("/api/inventory/brands", requirePermission(INVENTORY_WRITE_RESOURCE_KEY), async (req, res) => {
    try {
      const brand = await storage.createBrand(req.body);
      res.status(201).json(brand);
    } catch (error) {
      res.status(500).json({ error: "Error creating brand" });
    }
  });

  app.patch("/api/inventory/brands/:id", requirePermission(INVENTORY_WRITE_RESOURCE_KEY), async (req, res) => {
    try {
      const brand = await storage.updateBrand(req.params.id, req.body);
      if (!brand) return res.status(404).json({ error: "Brand not found" });
      res.json(brand);
    } catch (error) {
      res.status(500).json({ error: "Error updating brand" });
    }
  });

  app.delete("/api/inventory/brands/:id", requirePermission(INVENTORY_WRITE_RESOURCE_KEY), async (req, res) => {
    try {
      await storage.deleteBrand(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      if (error?.code === "23503") {
        return res.status(400).json({ error: "No se puede eliminar — tiene artículos asociados" });
      }
      res.status(500).json({ error: "Error deleting brand" });
    }
  });

  // Inventory Items
  app.get("/api/inventory/items", requireAuth, async (req, res) => {
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
        const kinds = itemKind.split(",").map(k => k.trim()).filter(Boolean);
        items = items.filter((item: any) => kinds.includes(item.itemKind));
      }
      res.json(items);
    } catch (error) {
      console.error("[inventory/items] error:", error);
      res.status(500).json({ error: "Error fetching inventory items" });
    }
  });

  app.get("/api/inventory/items/low-stock", requireAuth, async (req, res) => {
    try {
      const items = await storage.getInventoryItemsBelowMinStock();
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Error fetching low stock items" });
    }
  });

  app.post("/api/inventory/items", requirePermission(INVENTORY_WRITE_RESOURCE_KEY), async (req, res) => {
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

      // If a warehouseId was provided and there's initial stock, seed warehouse_stock
      const warehouseId = req.body.warehouseId;
      const initialStock = parseFloat(String(body.currentStock ?? 0));
      if (warehouseId && initialStock > 0) {
        await db.execute(sql`
          INSERT INTO warehouse_stock (warehouse_id, item_id, current_stock, updated_at)
          VALUES (${warehouseId}, ${item.id}, ${initialStock}, now())
          ON CONFLICT (warehouse_id, item_id) DO UPDATE SET current_stock = ${initialStock}, updated_at = now()
        `);
        await db.execute(sql`
          INSERT INTO stock_movements (item_id, movement_type, quantity, previous_stock, new_stock, notes, source_type, created_at, warehouse_id)
          VALUES (${item.id}, 'entrada', ${initialStock}, 0, ${initialStock}, 'Stock inicial', 'manual', now(), ${warehouseId})
        `);
      }

      res.status(201).json(item);
    } catch (error: any) {
      const status = error?.message?.includes("proveedor") ? 400 : 500;
      res.status(status).json({ error: status === 400 ? error.message : "Error creating inventory item" });
    }
  });

  app.patch("/api/inventory/items/:id", requirePermission(INVENTORY_WRITE_RESOURCE_KEY), async (req, res) => {
    try {
      const item = await storage.updateInventoryItem(req.params.id, req.body);
      if (!item) return res.status(404).json({ error: "Item not found" });
      res.json(item);
    } catch (error: any) {
      const status = error?.message?.includes("proveedor") ? 400 : 500;
      res.status(status).json({ error: status === 400 ? error.message : "Error updating inventory item" });
    }
  });

  app.delete("/api/inventory/items/:id", requireAuth, requirePermission(INVENTORY_WRITE_RESOURCE_KEY), (_req,res) => {
    res.status(405).json({error:"Los artículos se dan de baja con motivo y conservan su historial. Usá la acción de baja."});
  });

  app.patch("/api/inventory/items/:id/metadata", requireAuth, requirePermission(INVENTORY_WRITE_RESOURCE_KEY), async(req,res) => {
    try {
      const {name,sku,minStock,costPrice,isActive}=req.body;
      if (typeof name !== "string" || !name.trim() || !Number.isFinite(Number(minStock)) || Number(minStock)<0 || !Number.isFinite(Number(costPrice)) || Number(costPrice)<0) return res.status(400).json({error:"Revisá el nombre, stock mínimo y costo"});
      const item = await withDatabaseTransaction(async()=>{
        await db.execute(sql`SELECT id FROM inventory_items WHERE id=${req.params.id} FOR UPDATE`);
        const before=await storage.getInventoryItem(req.params.id); if(!before)return null;
        if(before.isActive !== "false" && isActive === "false") throw Object.assign(new Error("Usá dar de baja e indicá el motivo"),{statusCode:400});
        const after=await storage.updateInventoryItem(req.params.id,{name:name.trim(),sku:typeof sku === "string" ? sku.trim() || null : null,minStock:String(minStock),costPrice:String(costPrice),isActive:isActive === "true" ? "true" : before.isActive});
        await db.execute(sql`INSERT INTO audit_logs(user_id,user_name,action,module,entity_type,entity_id,description,details,timestamp) VALUES(${req.user!.id},${req.user!.username},'update','inventory','inventory_item',${req.params.id},'Edición de artículo',${JSON.stringify({before,after})},now())`);return after;
      });
      if(!item)return res.status(404).json({error:"Artículo no encontrado"});res.json(item);
    }catch(error:any){res.status(error.statusCode || 500).json({error:error.message || "No se pudo editar el artículo"});}
  });

  app.post("/api/inventory/items/:id/deactivate", requireAuth, requirePermission(INVENTORY_WRITE_RESOURCE_KEY), async (req,res) => {
    try {
      if (!String(req.body.reason || "").trim()) return res.status(400).json({error:"Indicá el motivo de la baja"});
      const item = await withDatabaseTransaction(async () => {
        await db.execute(sql`SELECT id FROM inventory_items WHERE id=${req.params.id} FOR UPDATE`);
        const before = await storage.getInventoryItem(req.params.id);
        if (!before) return null;
        const updated = await storage.updateInventoryItem(req.params.id,{isActive:"false"});
        await db.execute(sql`INSERT INTO audit_logs(user_id,user_name,action,module,entity_type,entity_id,description,details,timestamp) VALUES(${req.user!.id},${req.user!.username},'update','inventory','inventory_item',${req.params.id},${String(req.body.reason)},${JSON.stringify({before,after:updated})},now())`);
        return updated;
      });
      if (!item) return res.status(404).json({error:"Artículo no encontrado"});
      res.json(item);
    } catch { res.status(500).json({error:"No se pudo dar de baja el artículo"}); }
  });
  for (const action of ["anular","corregir"] as const) {
    app.post(`/api/inventory/movements/:id/${action}`, requireAuth, requirePermission(INVENTORY_WRITE_RESOURCE_KEY), async(req,res) => {
      try { res.json(await correctInventoryMovement(req.params.id,String(req.body.reason || ""),req.user!.id,action === "corregir" ? {quantity:String(req.body.quantity),notes:req.body.notes ? String(req.body.notes) : undefined}:undefined)); }
      catch(error:any) {res.status(error.statusCode || 500).json({error:error.message || "No se pudo corregir el movimiento"});}
    });
  }

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

  app.post("/api/inventory/movements", requireAuth, requirePermission(INVENTORY_WRITE_RESOURCE_KEY), async (req, res) => {
    try {
      const {itemId,movementType,quantity,notes}=req.body;
      const qty=Number(quantity);
      if (!['entrada','salida','consumo','ajuste'].includes(movementType) || !Number.isFinite(qty) || qty<0 || (movementType !== 'ajuste' && qty===0)) return res.status(400).json({error:"Tipo o cantidad inválida"});
      const result=await withDatabaseTransaction(async()=>{
        const locked=await db.execute(sql`SELECT id FROM inventory_items WHERE id=${itemId} FOR UPDATE`);
        if (!locked.rows[0]) throw Object.assign(new Error("Artículo no encontrado"),{statusCode:404});
        const item=await storage.getInventoryItem(itemId);
        if(item!.isActive === "false")throw Object.assign(new Error("El artículo está inactivo"),{statusCode:409});
        const previousStock=Number(item!.currentStock);
        const newStock=Math.round((movementType==='ajuste' ? qty : previousStock+(movementType==='entrada'?qty:-qty))*1000)/1000;
        if(newStock<0)throw Object.assign(new Error("Stock insuficiente"),{statusCode:409});
        const movement=await storage.createStockMovement({itemId,movementType,quantity:String(qty),previousStock:String(previousStock),newStock:String(newStock),notes,sourceType:'manual',sourceId:null,createdAt:new Date(),createdBy:req.user!.id});
        await storage.updateInventoryItem(itemId,{currentStock:String(newStock)});
        return {movement,newStock,item:{...item,currentStock:newStock}};
      });
      res.status(201).json(result);
    }catch(error:any){res.status(error.statusCode || 500).json({error:error.message || "No se pudo registrar el movimiento"});}
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

  app.post("/api/inventory/warehouses", requirePermission(INVENTORY_WRITE_RESOURCE_KEY), async (req, res) => {
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

  app.patch("/api/inventory/warehouses/:id", requirePermission(INVENTORY_WRITE_RESOURCE_KEY), async (req, res) => {
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

  app.delete("/api/inventory/warehouses/:id", requirePermission(INVENTORY_WRITE_RESOURCE_KEY), async (req, res) => {
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
  // Accepts one or more items for the same origin/destination pair; all of
  // them move (or none do) inside a single transaction so a mid-batch stock
  // shortfall never leaves some items moved and others not.
  app.post("/api/inventory/transfer", requirePermission(INVENTORY_WRITE_RESOURCE_KEY), async (req, res) => {
    try {
      const { fromWarehouseId, toWarehouseId, notes } = req.body;
      const items: { itemId: string; quantity: number }[] = Array.isArray(req.body.items)
        ? req.body.items
        : (req.body.itemId && req.body.quantity ? [{ itemId: req.body.itemId, quantity: req.body.quantity }] : []);

      if (!fromWarehouseId || !toWarehouseId || items.length === 0) {
        return res.status(400).json({ error: "Faltan campos requeridos" });
      }
      if (fromWarehouseId === toWarehouseId) {
        return res.status(400).json({ error: "Los depósitos origen y destino deben ser distintos" });
      }
      const itemIds = items.map((it) => it.itemId);
      if (!itemIds.every(Boolean) || new Set(itemIds).size !== itemIds.length) {
        return res.status(400).json({ error: "Los artículos deben estar completos y no repetirse" });
      }

      const results = await safeInventoryTransfer(fromWarehouseId,toWarehouseId,items,notes,req.user?.id || "Sistema");

      res.json({ success: true, items: results });
    } catch (error: any) {
      res.status(error.statusCode || error.status || 500).json({ error: error.message || "Error en transferencia" });
    }
  });

  // Warehouse stock movement (entrada/salida within a specific warehouse)
  app.post("/api/inventory/warehouses/:warehouseId/movements", requireAuth, requirePermission(INVENTORY_WRITE_RESOURCE_KEY), async(req,res)=>{
    try{res.status(201).json(await safeWarehouseMovement(req.params.warehouseId,req.body,req.user!.id));}
    catch(error:any){res.status(error.statusCode || 500).json({error:error.message || "No se pudo registrar el movimiento"});}
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

  // ── Toma de Inventario ────────────────────────────────────────────────────────

  app.get("/api/inventory/counts", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getInventoryCounts());
    } catch (e: any) {
      res.status(e.statusCode || 500).json({ error: e.message });
    }
  });

  app.post("/api/inventory/counts", requirePermission(INVENTORY_WRITE_RESOURCE_KEY), async (req, res) => {
    try {
      const user = (req as any).user;
      const count = await storage.createInventoryCount({ ...req.body, createdBy: user?.username });
      res.status(201).json(count);
    } catch (e: any) {
      res.status(e.statusCode || 500).json({ error: e.message });
    }
  });

  app.get("/api/inventory/counts/:id", requireAuth, async (req, res) => {
    try {
      const count = await storage.getInventoryCountWithItems(req.params.id);
      if (!count) return res.status(404).json({ error: "Toma no encontrada" });
      res.json(count);
    } catch (e: any) {
      res.status(e.statusCode || 500).json({ error: e.message });
    }
  });

  app.patch("/api/inventory/counts/:id/items/:itemId", requirePermission(INVENTORY_WRITE_RESOURCE_KEY), async (req, res) => {
    try {
      const { actualStock, notes } = req.body;
      await storage.updateInventoryCountItem(
        req.params.id,
        req.params.itemId,
        actualStock !== undefined && actualStock !== "" && actualStock !== null ? Number(actualStock) : null,
        notes
      );
      res.json({ ok: true });
    } catch (e: any) {
      res.status(e.statusCode || 500).json({ error: e.message });
    }
  });

  app.post("/api/inventory/counts/:id/close", requirePermission(INVENTORY_WRITE_RESOURCE_KEY), async (req, res) => {
    try {
      const user = (req as any).user;
      const result = await storage.closeInventoryCount(req.params.id, user?.username ?? "sistema");
      res.json(result);
    } catch (e: any) {
      res.status(e.statusCode || 500).json({ error: e.message });
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

  // ==================== INTERNAL MOVEMENTS (Movimientos Internos) ====================

  app.get("/api/inventory/internal-movements/report", requireAuth, async (req, res) => {
    try {
      const from = (req.query.from as string) || new Date().toISOString().split("T")[0];
      const to = (req.query.to as string) || new Date().toISOString().split("T")[0];
      const rows = await db.execute(sql`
        SELECT
          imi.item_id,
          imi.item_name,
          imi.unit,
          imi.cost_price,
          SUM(imi.quantity)::numeric as total_quantity,
          SUM(imi.quantity * imi.cost_price)::numeric as total_cost,
          COUNT(DISTINCT im.id)::int as movement_count
        FROM internal_movement_items imi
        JOIN internal_movements im ON im.id = imi.movement_id
        WHERE im.date >= ${from} AND im.date <= ${to}
        GROUP BY imi.item_id, imi.item_name, imi.unit, imi.cost_price
        ORDER BY total_cost DESC
      `);
      const totalCost = (rows.rows as any[]).reduce((s, r) => s + parseFloat(r.total_cost || "0"), 0);
      res.json({ from, to, items: rows.rows, totalCost });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Error generating internal movements report" });
    }
  });

  app.get("/api/inventory/internal-movements", requireAuth, async (req, res) => {
    try {
      const from = (req.query.from as string) || new Date().toISOString().split("T")[0];
      const to = (req.query.to as string) || new Date().toISOString().split("T")[0];
      const rows = await db.execute(sql`
        SELECT
          im.*,
          COUNT(imi.id)::int as item_count,
          COALESCE(SUM(imi.quantity * imi.cost_price), 0)::numeric as total_cost
        FROM internal_movements im
        LEFT JOIN internal_movement_items imi ON imi.movement_id = im.id
        WHERE im.date >= ${from} AND im.date <= ${to}
        GROUP BY im.id
        ORDER BY im.created_at DESC
      `);
      res.json(rows.rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Error fetching internal movements" });
    }
  });

  app.get("/api/inventory/internal-movements/:id", requireAuth, async (req, res) => {
    try {
      const mov = await db.execute(sql`SELECT * FROM internal_movements WHERE id = ${req.params.id}`);
      if (!mov.rows.length) return res.status(404).json({ error: "Not found" });
      const items = await db.execute(sql`SELECT i.*,m.warehouse_id,h.name AS warehouse_name FROM internal_movement_items i
        LEFT JOIN stock_movements m ON m.source_type='internal_movement' AND m.source_id=i.movement_id AND m.item_id=i.item_id
        LEFT JOIN inventory_warehouses h ON h.id=m.warehouse_id WHERE i.movement_id = ${req.params.id} ORDER BY i.id`);
      res.json({ ...mov.rows[0], items: items.rows });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Error fetching movement" });
    }
  });

  app.get("/api/inventory/internal-consumption-origins", requireAuth, async (_req, res) => {
    try { res.json(await internalConsumptionOrigins()); }
    catch { res.status(500).json({error:"No se pudieron consultar los depósitos de origen"}); }
  });

  app.post("/api/inventory/internal-movements", requireAuth, requirePermission(INVENTORY_WRITE_RESOURCE_KEY), async (req, res) => {
    try { res.status(201).json(await consumeInventoryInternally(req.body, req.user!.id)); }
    catch (error: any) { res.status(error.statusCode || 500).json({error: error.message || "Error registrando consumo interno"}); }
  });
}

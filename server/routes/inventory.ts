import type { Express } from "express";
import { storage } from "../db-storage";

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
      const item = await storage.createInventoryItem(req.body);
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
      const { itemId, movementType, quantity, notes } = req.body;

      const item = await storage.getInventoryItem(itemId);
      if (!item) return res.status(404).json({ error: "Item not found" });

      const previousStock = item.currentStock ?? 0;
      let newStock = previousStock;

      if (movementType === "entrada") {
        newStock = previousStock + quantity;
      } else if (movementType === "salida" || movementType === "consumo") {
        newStock = previousStock - quantity;
        if (newStock < 0) {
          return res.status(400).json({ error: "Stock insuficiente" });
        }
      } else if (movementType === "ajuste") {
        newStock = quantity;
      }

      const movement = await storage.createStockMovement({
        itemId,
        movementType,
        quantity,
        previousStock,
        newStock,
        notes,
        createdAt: new Date(),
      });

      res.status(201).json(movement);
    } catch (error) {
      res.status(500).json({ error: "Error creating stock movement" });
    }
  });
}

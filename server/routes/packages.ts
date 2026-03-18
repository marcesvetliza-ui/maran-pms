import type { Express } from "express";
import { storage } from "../db-storage";

export function registerPackagesRoutes(app: Express) {
  app.get("/api/packages", async (req, res) => {
    try {
      const packages = await storage.getPackages();
      res.json(packages);
    } catch (error) {
      res.status(500).json({ error: "Error fetching packages" });
    }
  });

  app.get("/api/packages/active", async (req, res) => {
    try {
      const packages = await storage.getActivePackages();
      res.json(packages);
    } catch (error) {
      res.status(500).json({ error: "Error fetching active packages" });
    }
  });

  app.get("/api/packages/:id", async (req, res) => {
    try {
      const pkg = await storage.getPackage(req.params.id);
      if (!pkg) return res.status(404).json({ error: "Package not found" });
      res.json(pkg);
    } catch (error) {
      res.status(500).json({ error: "Error fetching package" });
    }
  });

  app.post("/api/packages", async (req, res) => {
    try {
      const { name, description, roomTypeId, nights, basePrice, discountPercent, validFrom, validUntil, status, includedServices, terms } = req.body;
      if (!name || !basePrice) {
        return res.status(400).json({ error: "Name and base price are required" });
      }
      const code = storage.generatePackageCode();
      const pkg = await storage.createPackage({
        code,
        name,
        description,
        roomTypeId,
        nights: nights || 1,
        basePrice: String(basePrice),
        discountPercent: discountPercent ? String(discountPercent) : null,
        validFrom,
        validUntil,
        status: status || "active",
        includedServices,
        terms,
        createdAt: new Date(),
      });
      res.status(201).json(pkg);
    } catch (error) {
      res.status(500).json({ error: "Error creating package" });
    }
  });

  app.patch("/api/packages/:id", async (req, res) => {
    try {
      const updates = { ...req.body };
      if (updates.basePrice) updates.basePrice = String(updates.basePrice);
      if (updates.discountPercent) updates.discountPercent = String(updates.discountPercent);
      const pkg = await storage.updatePackage(req.params.id, updates);
      if (!pkg) return res.status(404).json({ error: "Package not found" });
      res.json(pkg);
    } catch (error) {
      res.status(500).json({ error: "Error updating package" });
    }
  });

  app.delete("/api/packages/:id", async (req, res) => {
    try {
      await storage.deletePackage(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting package" });
    }
  });

  app.post("/api/packages/:id/duplicate", async (req, res) => {
    try {
      const original = await storage.getPackage(req.params.id);
      if (!original) return res.status(404).json({ error: "Package not found" });
      const code = storage.generatePackageCode();
      const pkg = await storage.createPackage({
        code,
        name: `${original.name} (Copia)`,
        description: original.description,
        roomTypeId: original.roomTypeId,
        nights: original.nights,
        basePrice: original.basePrice,
        discountPercent: original.discountPercent,
        validFrom: original.validFrom,
        validUntil: original.validUntil,
        status: "inactive",
        includedServices: original.includedServices,
        terms: original.terms,
        createdAt: new Date(),
      });
      if (original.items && original.items.length > 0) {
        for (const item of original.items) {
          await storage.createPackageItem({
            packageId: pkg.id,
            itemType: item.itemType,
            description: item.description,
            quantity: item.quantity,
            unitValue: item.unitValue,
          });
        }
      }
      const duplicated = await storage.getPackage(pkg.id);
      res.status(201).json(duplicated);
    } catch (error) {
      res.status(500).json({ error: "Error duplicating package" });
    }
  });

  app.patch("/api/packages/:id/toggle-status", async (req, res) => {
    try {
      const pkg = await storage.getPackage(req.params.id);
      if (!pkg) return res.status(404).json({ error: "Package not found" });
      const newStatus = pkg.status === "active" ? "inactive" : "active";
      const updated = await storage.updatePackage(req.params.id, { status: newStatus });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Error toggling package status" });
    }
  });

  app.get("/api/packages/:packageId/items", async (req, res) => {
    try {
      const items = await storage.getPackageItems(req.params.packageId);
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Error fetching package items" });
    }
  });

  app.post("/api/packages/:packageId/items", async (req, res) => {
    try {
      const { itemType, description, quantity, unitValue } = req.body;
      if (!itemType || !description) {
        return res.status(400).json({ error: "Item type and description are required" });
      }
      const item = await storage.createPackageItem({
        packageId: req.params.packageId,
        itemType,
        description,
        quantity: quantity || 1,
        unitValue: unitValue ? String(unitValue) : null,
      });
      res.status(201).json(item);
    } catch (error) {
      res.status(500).json({ error: "Error creating package item" });
    }
  });

  app.patch("/api/package-items/:id", async (req, res) => {
    try {
      const updates = { ...req.body };
      if (updates.unitValue) updates.unitValue = String(updates.unitValue);
      const item = await storage.updatePackageItem(req.params.id, updates);
      if (!item) return res.status(404).json({ error: "Package item not found" });
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: "Error updating package item" });
    }
  });

  app.delete("/api/package-items/:id", async (req, res) => {
    try {
      await storage.deletePackageItem(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting package item" });
    }
  });
}

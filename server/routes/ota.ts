import type { Express } from "express";
import { storage } from "../db-storage";

export function registerOtaRoutes(app: Express) {
  app.get("/api/ota-channels", async (req, res) => {
    try {
      const channels = await storage.getOTAChannels();
      res.json(channels);
    } catch (error) {
      res.status(500).json({ error: "Error fetching OTA channels" });
    }
  });

  app.get("/api/ota-channels/:id", async (req, res) => {
    try {
      const channel = await storage.getOTAChannel(req.params.id);
      if (!channel) {
        return res.status(404).json({ error: "OTA channel not found" });
      }
      res.json(channel);
    } catch (error) {
      res.status(500).json({ error: "Error fetching OTA channel" });
    }
  });

  app.post("/api/ota-channels", async (req, res) => {
    try {
      const channel = await storage.createOTAChannel({
        ...req.body,
        createdAt: new Date(),
      });
      res.status(201).json(channel);
    } catch (error) {
      res.status(500).json({ error: "Error creating OTA channel" });
    }
  });

  app.patch("/api/ota-channels/:id", async (req, res) => {
    try {
      const channel = await storage.updateOTAChannel(req.params.id, req.body);
      if (!channel) {
        return res.status(404).json({ error: "OTA channel not found" });
      }
      res.json(channel);
    } catch (error) {
      res.status(500).json({ error: "Error updating OTA channel" });
    }
  });

  app.delete("/api/ota-channels/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteOTAChannel(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "OTA channel not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting OTA channel" });
    }
  });

  app.get("/api/ota-reservations", async (req, res) => {
    try {
      const channelId = req.query.channelId as string | undefined;
      const logs = await storage.getOTAReservationLogs(channelId);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Error fetching OTA reservation logs" });
    }
  });

  app.get("/api/ota-reservations/:id", async (req, res) => {
    try {
      const log = await storage.getOTAReservationLog(req.params.id);
      if (!log) {
        return res.status(404).json({ error: "OTA reservation log not found" });
      }
      res.json(log);
    } catch (error) {
      res.status(500).json({ error: "Error fetching OTA reservation log" });
    }
  });

  app.post("/api/ota-reservations", async (req, res) => {
    try {
      const log = await storage.createOTAReservationLog({
        ...req.body,
        createdAt: new Date(),
      });
      res.status(201).json(log);
    } catch (error) {
      res.status(500).json({ error: "Error creating OTA reservation log" });
    }
  });

  app.post("/api/ota-reservations/:id/sync", async (req, res) => {
    try {
      const reservation = await storage.syncOTAReservation(req.params.id);
      if (!reservation) {
        return res.status(400).json({ error: "Could not sync reservation - no available rooms or already synced" });
      }
      res.json({ success: true, reservation });
    } catch (error) {
      res.status(500).json({ error: "Error syncing OTA reservation" });
    }
  });

  app.post("/api/ota-channels/:id/simulate-import", async (req, res) => {
    try {
      const channel = await storage.getOTAChannel(req.params.id);
      if (!channel) {
        return res.status(404).json({ error: "OTA channel not found" });
      }

      const today = new Date();
      const checkIn = new Date(today.getTime() + (Math.floor(Math.random() * 7) + 1) * 86400000);
      const nights = Math.floor(Math.random() * 5) + 1;
      const checkOut = new Date(checkIn.getTime() + nights * 86400000);
      const totalAmount = (Math.floor(Math.random() * 200) + 50) * nights;
      const commission = totalAmount * parseFloat(channel.commissionPercent || "15") / 100;

      const guestNames = ["Maria Rodriguez", "John Smith", "Carlos Gonzalez", "Sophie Martin", "Hans Mueller", "Yuki Tanaka", "Emma Johnson"];
      const roomTypes = ["Standard", "Doble", "Suite", "Familiar"];

      const log = await storage.createOTAReservationLog({
        channelId: channel.id,
        externalReservationId: `${channel.channelType.toUpperCase()}-${Date.now()}`,
        guestName: guestNames[Math.floor(Math.random() * guestNames.length)],
        checkInDate: checkIn.toISOString().split("T")[0],
        checkOutDate: checkOut.toISOString().split("T")[0],
        roomTypeName: roomTypes[Math.floor(Math.random() * roomTypes.length)],
        totalAmount: totalAmount.toFixed(2),
        commission: commission.toFixed(2),
        netAmount: (totalAmount - commission).toFixed(2),
        status: "pending",
        rawData: null,
        syncedAt: null,
        createdAt: new Date(),
      });

      res.status(201).json(log);
    } catch (error) {
      res.status(500).json({ error: "Error simulating OTA import" });
    }
  });
}

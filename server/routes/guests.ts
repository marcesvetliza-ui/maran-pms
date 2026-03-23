import type { Express } from "express";
import { storage } from "../db-storage";

export function registerGuestsRoutes(app: Express) {
  // Companies
  app.get("/api/companies", async (req, res) => {
    try {
      const companies = await storage.getCompanies();
      res.json(companies);
    } catch (error) {
      res.status(500).json({ error: "Error fetching companies" });
    }
  });

  app.get("/api/companies/search", async (req, res) => {
    try {
      const query = req.query.q as string || "";
      const companies = await storage.searchCompanies(query);
      res.json(companies);
    } catch (error) {
      res.status(500).json({ error: "Error searching companies" });
    }
  });

  app.get("/api/companies/:id", async (req, res) => {
    try {
      const company = await storage.getCompany(req.params.id);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }
      res.json(company);
    } catch (error) {
      res.status(500).json({ error: "Error fetching company" });
    }
  });

  app.post("/api/companies", async (req, res) => {
    try {
      const company = await storage.createCompany(req.body);
      res.status(201).json(company);
    } catch (error) {
      res.status(500).json({ error: "Error creating company" });
    }
  });

  app.patch("/api/companies/:id", async (req, res) => {
    try {
      const company = await storage.updateCompany(req.params.id, req.body);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }
      res.json(company);
    } catch (error) {
      res.status(500).json({ error: "Error updating company" });
    }
  });

  app.delete("/api/companies/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteCompany(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Company not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting company" });
    }
  });

  // Agencies
  app.get("/api/agencies", async (req, res) => {
    try {
      const agencies = await storage.getAgencies();
      res.json(agencies);
    } catch (error) {
      res.status(500).json({ error: "Error fetching agencies" });
    }
  });

  app.get("/api/agencies/search", async (req, res) => {
    try {
      const query = req.query.q as string || "";
      const agencies = await storage.searchAgencies(query);
      res.json(agencies);
    } catch (error) {
      res.status(500).json({ error: "Error searching agencies" });
    }
  });

  app.get("/api/agencies/report", async (req, res) => {
    try {
      const from = req.query.from as string;
      const to = req.query.to as string;
      const allAgencies = await storage.getAgencies();
      const allReservations = await storage.getReservations();

      const report = allAgencies.map(agency => {
        let agencyReservations = allReservations.filter(r => r.agencyId === agency.id);
        if (from) agencyReservations = agencyReservations.filter(r => r.checkInDate >= from);
        if (to) agencyReservations = agencyReservations.filter(r => r.checkOutDate <= to);

        const totalRevenue = agencyReservations.reduce((sum, r) => sum + parseFloat(r.totalRoomAmount || "0"), 0);
        const commissionRate = parseFloat(agency.commissionRate || "0");
        const totalCommission = totalRevenue * (commissionRate / 100);

        return {
          agency,
          totalReservations: agencyReservations.length,
          totalRevenue,
          commissionRate,
          totalCommission,
          totalNights: agencyReservations.reduce((sum, r) => sum + (r.nights || 0), 0),
        };
      });

      res.json(report);
    } catch (error) {
      res.status(500).json({ error: "Error generating agency report" });
    }
  });

  app.get("/api/agencies/:id/stats", async (req, res) => {
    try {
      const agency = await storage.getAgency(req.params.id);
      if (!agency) {
        return res.status(404).json({ error: "Agency not found" });
      }
      const allReservations = await storage.getReservations();
      const agencyReservations = allReservations.filter(r => r.agencyId === agency.id);
      const totalRevenue = agencyReservations.reduce((sum, r) => sum + parseFloat(r.totalRoomAmount || "0"), 0);
      const commissionRate = parseFloat(agency.commissionRate || "0");
      const totalCommission = totalRevenue * (commissionRate / 100);

      res.json({
        totalReservations: agencyReservations.length,
        totalRevenue,
        commissionRate,
        totalCommission,
        totalNights: agencyReservations.reduce((sum, r) => sum + (r.nights || 0), 0),
        activeReservations: agencyReservations.filter(r => ["confirmed", "checked_in", "pending"].includes(r.status)).length,
      });
    } catch (error) {
      res.status(500).json({ error: "Error fetching agency stats" });
    }
  });

  app.get("/api/agencies/:id", async (req, res) => {
    try {
      const agency = await storage.getAgency(req.params.id);
      if (!agency) {
        return res.status(404).json({ error: "Agency not found" });
      }
      res.json(agency);
    } catch (error) {
      res.status(500).json({ error: "Error fetching agency" });
    }
  });

  app.post("/api/agencies", async (req, res) => {
    try {
      const agency = await storage.createAgency(req.body);
      res.status(201).json(agency);
    } catch (error) {
      res.status(500).json({ error: "Error creating agency" });
    }
  });

  app.patch("/api/agencies/:id", async (req, res) => {
    try {
      const agency = await storage.updateAgency(req.params.id, req.body);
      if (!agency) {
        return res.status(404).json({ error: "Agency not found" });
      }
      res.json(agency);
    } catch (error) {
      res.status(500).json({ error: "Error updating agency" });
    }
  });

  app.delete("/api/agencies/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteAgency(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Agency not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting agency" });
    }
  });

  // Account Movements (Cuenta Corriente)
  app.get("/api/guests/:id/account", async (req, res) => {
    try {
      const movements = await storage.getAccountMovements("guest", req.params.id);
      const balance = await storage.getAccountBalance("guest", req.params.id);
      res.json({ movements, balance });
    } catch (error) {
      res.status(500).json({ error: "Error fetching guest account" });
    }
  });

  app.post("/api/guests/:id/account/payment", async (req, res) => {
    try {
      const guest = await storage.getGuest(req.params.id);
      if (!guest) return res.status(404).json({ error: "Huésped no encontrado" });
      const { amount, description, reference, date } = req.body;
      if (!amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: "Monto inválido" });
      }
      const movement = await storage.createAccountMovement({
        entityType: "guest",
        entityId: req.params.id,
        date: date || new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }),
        type: "pago",
        description: description || "Pago recibido",
        amount: (-parseFloat(amount)).toFixed(2),
        reference: reference || null,
        guestName: `${guest.firstName} ${guest.lastName}`,
        createdBy: req.body.createdBy || null,
      });
      res.json(movement);
    } catch (error) {
      res.status(500).json({ error: "Error registering payment" });
    }
  });

  app.get("/api/companies/:id/account", async (req, res) => {
    try {
      const movements = await storage.getAccountMovements("company", req.params.id);
      const balance = await storage.getAccountBalance("company", req.params.id);
      res.json({ movements, balance });
    } catch (error) {
      res.status(500).json({ error: "Error fetching account" });
    }
  });

  app.get("/api/agencies/:id/account", async (req, res) => {
    try {
      const movements = await storage.getAccountMovements("agency", req.params.id);
      const balance = await storage.getAccountBalance("agency", req.params.id);
      res.json({ movements, balance });
    } catch (error) {
      res.status(500).json({ error: "Error fetching account" });
    }
  });

  app.post("/api/companies/:id/account/payment", async (req, res) => {
    try {
      const company = await storage.getCompany(req.params.id);
      if (!company) {
        return res.status(404).json({ error: "Empresa no encontrada" });
      }
      const { amount, description, reference, date } = req.body;
      if (!amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: "Monto inválido" });
      }
      const movement = await storage.createAccountMovement({
        entityType: "company",
        entityId: req.params.id,
        date: date || new Date().toISOString().split("T")[0],
        type: "pago",
        description: description || "Pago recibido",
        amount: (-parseFloat(amount)).toFixed(2),
        reference: reference || null,
        createdBy: req.body.createdBy || null,
      });
      res.json(movement);
    } catch (error) {
      res.status(500).json({ error: "Error registering payment" });
    }
  });

  app.post("/api/agencies/:id/account/payment", async (req, res) => {
    try {
      const agency = await storage.getAgency(req.params.id);
      if (!agency) {
        return res.status(404).json({ error: "Agencia no encontrada" });
      }
      const { amount, description, reference, date } = req.body;
      if (!amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: "Monto inválido" });
      }
      const movement = await storage.createAccountMovement({
        entityType: "agency",
        entityId: req.params.id,
        date: date || new Date().toISOString().split("T")[0],
        type: "pago",
        description: description || "Pago recibido",
        amount: (-parseFloat(amount)).toFixed(2),
        reference: reference || null,
        createdBy: req.body.createdBy || null,
      });
      res.json(movement);
    } catch (error) {
      res.status(500).json({ error: "Error registering payment" });
    }
  });

  app.get("/api/account-summary", async (req, res) => {
    try {
      const summary = await storage.getAccountSummary();
      res.json(summary);
    } catch (error) {
      res.status(500).json({ error: "Error fetching summary" });
    }
  });

  app.get("/api/account-movements/report", async (req, res) => {
    try {
      const { from, to } = req.query as { from?: string; to?: string };
      const summary = await storage.getAccountSummary();

      const movements: any[] = [];
      for (const c of summary.companies) {
        const ms = await storage.getAccountMovements("company", c.id);
        ms.forEach(m => movements.push({ ...m, entityName: c.name, entityTypeName: "Empresa" }));
      }
      for (const a of summary.agencies) {
        const ms = await storage.getAccountMovements("agency", a.id);
        ms.forEach(m => movements.push({ ...m, entityName: a.name, entityTypeName: "Agencia" }));
      }
      for (const g of summary.guests) {
        const ms = await storage.getAccountMovements("guest", g.id);
        ms.forEach(m => movements.push({ ...m, entityName: g.name, entityTypeName: "Huésped" }));
      }

      const filtered = movements.filter(m => {
        if (from && m.date < from) return false;
        if (to && m.date > to) return false;
        return true;
      }).sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt)));

      res.json(filtered);
    } catch (error) {
      console.error("Error fetching account movements report:", error);
      res.status(500).json({ error: "Error fetching report" });
    }
  });

  // Guests
  app.get("/api/guests", async (req, res) => {
    try {
      const guests = await storage.getGuests();
      res.json(guests);
    } catch (error) {
      res.status(500).json({ error: "Error fetching guests" });
    }
  });

  app.get("/api/guests/search", async (req, res) => {
    try {
      const query = req.query.q as string || "";
      const guests = await storage.searchGuests(query);
      res.json(guests);
    } catch (error) {
      res.status(500).json({ error: "Error searching guests" });
    }
  });

  app.get("/api/guests/:id", async (req, res) => {
    try {
      const guest = await storage.getGuest(req.params.id);
      if (!guest) {
        return res.status(404).json({ error: "Guest not found" });
      }
      res.json(guest);
    } catch (error) {
      res.status(500).json({ error: "Error fetching guest" });
    }
  });

  app.post("/api/guests", async (req, res) => {
    try {
      const guest = await storage.createGuest(req.body);
      res.status(201).json(guest);
    } catch (error) {
      res.status(500).json({ error: "Error creating guest" });
    }
  });

  app.patch("/api/guests/:id", async (req, res) => {
    try {
      const guest = await storage.updateGuest(req.params.id, req.body);
      if (!guest) {
        return res.status(404).json({ error: "Guest not found" });
      }
      res.json(guest);
    } catch (error) {
      res.status(500).json({ error: "Error updating guest" });
    }
  });

  app.delete("/api/guests/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteGuest(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Guest not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting guest" });
    }
  });

  // Bed Types
  app.get("/api/bed-types", async (req, res) => {
    try {
      const bedTypes = await storage.getBedTypes();
      res.json(bedTypes);
    } catch (error) {
      res.status(500).json({ error: "Error fetching bed types" });
    }
  });

  app.post("/api/bed-types", async (req, res) => {
    try {
      const bedType = await storage.createBedType(req.body);
      res.status(201).json(bedType);
    } catch (error) {
      res.status(500).json({ error: "Error creating bed type" });
    }
  });

  app.patch("/api/bed-types/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const bedType = await storage.updateBedType(id, req.body);
      if (!bedType) {
        return res.status(404).json({ error: "Bed type not found" });
      }
      res.json(bedType);
    } catch (error) {
      res.status(500).json({ error: "Error updating bed type" });
    }
  });

  app.delete("/api/bed-types/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const result = await storage.deleteBedType(id);
      if (!result) {
        return res.status(404).json({ error: "Bed type not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Error deleting bed type" });
    }
  });
}

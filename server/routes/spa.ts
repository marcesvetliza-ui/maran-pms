import type { Express } from "express";
import { storage } from "../db-storage";
import { db } from "../db";
import { spaPayments, spaProfessionals, spaClients } from "@shared/schema";
import { requireAuth } from "../auth";
import { eq, desc } from "drizzle-orm";

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function registerSpaRoutes(app: Express) {
  // SPA Cabins
  app.get("/api/spa/cabins", async (req, res) => {
    try {
      const cabins = await storage.getSpaCabins();
      res.json(cabins);
    } catch (error) {
      res.status(500).json({ error: "Error fetching spa cabins" });
    }
  });

  app.get("/api/spa/cabins/:id", async (req, res) => {
    try {
      const cabin = await storage.getSpaCabin(req.params.id);
      if (!cabin) return res.status(404).json({ error: "Cabin not found" });
      res.json(cabin);
    } catch (error) {
      res.status(500).json({ error: "Error fetching spa cabin" });
    }
  });

  app.post("/api/spa/cabins", async (req, res) => {
    try {
      const cabin = await storage.createSpaCabin(req.body);
      res.status(201).json(cabin);
    } catch (error) {
      res.status(500).json({ error: "Error creating spa cabin" });
    }
  });

  app.patch("/api/spa/cabins/:id", async (req, res) => {
    try {
      const cabin = await storage.updateSpaCabin(req.params.id, req.body);
      if (!cabin) return res.status(404).json({ error: "Cabin not found" });
      res.json(cabin);
    } catch (error) {
      res.status(500).json({ error: "Error updating spa cabin" });
    }
  });

  app.delete("/api/spa/cabins/:id", async (req, res) => {
    try {
      await storage.deleteSpaCabin(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting spa cabin" });
    }
  });

  // SPA Treatment Categories
  app.get("/api/spa/treatment-categories", async (req, res) => {
    try {
      const categories = await storage.getSpaTreatmentCategories();
      res.json(categories);
    } catch (error) {
      res.status(500).json({ error: "Error fetching treatment categories" });
    }
  });

  app.get("/api/spa/treatment-categories/:id", async (req, res) => {
    try {
      const category = await storage.getSpaTreatmentCategory(req.params.id);
      if (!category) return res.status(404).json({ error: "Category not found" });
      res.json(category);
    } catch (error) {
      res.status(500).json({ error: "Error fetching treatment category" });
    }
  });

  app.post("/api/spa/treatment-categories", async (req, res) => {
    try {
      const category = await storage.createSpaTreatmentCategory(req.body);
      res.status(201).json(category);
    } catch (error) {
      res.status(500).json({ error: "Error creating treatment category" });
    }
  });

  app.patch("/api/spa/treatment-categories/:id", async (req, res) => {
    try {
      const category = await storage.updateSpaTreatmentCategory(req.params.id, req.body);
      if (!category) return res.status(404).json({ error: "Category not found" });
      res.json(category);
    } catch (error) {
      res.status(500).json({ error: "Error updating treatment category" });
    }
  });

  app.delete("/api/spa/treatment-categories/:id", async (req, res) => {
    try {
      await storage.deleteSpaTreatmentCategory(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting treatment category" });
    }
  });

  // SPA Treatments
  app.get("/api/spa/treatments", async (req, res) => {
    try {
      const treatments = await storage.getSpaTreatments();
      res.json(treatments);
    } catch (error) {
      res.status(500).json({ error: "Error fetching treatments" });
    }
  });

  app.get("/api/spa/treatments/:id", async (req, res) => {
    try {
      const treatment = await storage.getSpaTreatment(req.params.id);
      if (!treatment) return res.status(404).json({ error: "Treatment not found" });
      res.json(treatment);
    } catch (error) {
      res.status(500).json({ error: "Error fetching treatment" });
    }
  });

  app.get("/api/spa/treatments/by-category/:categoryId", async (req, res) => {
    try {
      const treatments = await storage.getSpaTreatmentsByCategory(req.params.categoryId);
      res.json(treatments);
    } catch (error) {
      res.status(500).json({ error: "Error fetching treatments by category" });
    }
  });

  app.post("/api/spa/treatments", async (req, res) => {
    try {
      const treatment = await storage.createSpaTreatment(req.body);
      res.status(201).json(treatment);
    } catch (error) {
      res.status(500).json({ error: "Error creating treatment" });
    }
  });

  app.patch("/api/spa/treatments/:id", async (req, res) => {
    try {
      const treatment = await storage.updateSpaTreatment(req.params.id, req.body);
      if (!treatment) return res.status(404).json({ error: "Treatment not found" });
      res.json(treatment);
    } catch (error) {
      res.status(500).json({ error: "Error updating treatment" });
    }
  });

  app.delete("/api/spa/treatments/:id", async (req, res) => {
    try {
      await storage.deleteSpaTreatment(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting treatment" });
    }
  });

  // SPA Appointments
  app.get("/api/spa/appointments", async (req, res) => {
    try {
      const date = req.query.date as string | undefined;
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;

      if (startDate && endDate) {
        const appointments = await storage.getSpaAppointmentsByDateRange(startDate, endDate);
        return res.json(appointments);
      }

      const appointments = await storage.getSpaAppointments(date);
      res.json(appointments);
    } catch (error) {
      res.status(500).json({ error: "Error fetching appointments" });
    }
  });

  app.get("/api/spa/appointments/weekly-summary", async (req, res) => {
    try {
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      if (!startDate || !endDate) {
        return res.status(400).json({ error: "startDate and endDate are required" });
      }
      const appointments = await storage.getSpaAppointmentsByDateRange(startDate, endDate);
      const activeStatuses = ["pending", "confirmed", "in_progress"];
      const summaryMap = new Map<string, { cabinId: string; date: string; count: number }>();

      for (const apt of appointments) {
        if (!activeStatuses.includes(apt.status)) continue;
        const key = `${apt.cabinId}_${apt.appointmentDate}`;
        const existing = summaryMap.get(key);
        if (existing) {
          existing.count++;
        } else {
          summaryMap.set(key, { cabinId: apt.cabinId, date: apt.appointmentDate, count: 1 });
        }
      }

      res.json(Array.from(summaryMap.values()));
    } catch (error) {
      res.status(500).json({ error: "Error fetching weekly summary" });
    }
  });

  app.get("/api/spa/appointments/:id", async (req, res) => {
    try {
      const appointment = await storage.getSpaAppointment(req.params.id);
      if (!appointment) return res.status(404).json({ error: "Appointment not found" });
      res.json(appointment);
    } catch (error) {
      res.status(500).json({ error: "Error fetching appointment" });
    }
  });

  app.post("/api/spa/appointments", async (req, res) => {
    try {
      const { cabinId, treatmentId, professionalId, guestName, guestLastName, guestPhone, guestEmail, reservationId, appointmentDate, startTime, endTime, status, notes } = req.body;

      if (!cabinId || !treatmentId || !guestName || !appointmentDate || !startTime || !endTime) {
        return res.status(400).json({ error: "cabinId, treatmentId, guestName, appointmentDate, startTime, and endTime are required" });
      }

      const existingAppointments = await storage.getSpaAppointmentsByCabin(cabinId, appointmentDate);
      const activeStatuses = ["pending", "confirmed", "in_progress"];
      const newStart = timeToMinutes(startTime);
      const newEnd = timeToMinutes(endTime);

      for (const existing of existingAppointments) {
        if (!activeStatuses.includes(existing.status)) continue;
        const existStart = timeToMinutes(existing.startTime);
        const existEnd = timeToMinutes(existing.endTime);
        if (newStart < existEnd && newEnd > existStart) {
          const cabin = await storage.getSpaCabin(cabinId);
          return res.status(409).json({
            error: "Superposición de turno",
            message: `El gabinete '${cabin?.name || cabinId}' ya tiene un turno de ${existing.startTime} a ${existing.endTime} hs. Elegí otro horario o gabinete.`,
          });
        }
      }

      const appointment = await storage.createSpaAppointment({
        cabinId,
        treatmentId,
        professionalId: professionalId || null,
        guestName,
        guestLastName: guestLastName || null,
        guestPhone: guestPhone || null,
        guestEmail: guestEmail || null,
        reservationId: reservationId || null,
        appointmentDate,
        startTime,
        endTime,
        status: status || "pending",
        notes: notes || null,
        createdAt: new Date(),
      });

      const treatment = await storage.getSpaTreatment(treatmentId);
      if (!treatment) {
        return res.status(400).json({ error: "Treatment not found" });
      }

      const fullName = guestLastName ? `${guestName} ${guestLastName}` : guestName;
      const treatmentPrice = treatment.price || "0";

      const account = await storage.createSpaAccount({
        appointmentId: appointment.id,
        guestName: fullName,
        reservationId: reservationId || null,
        status: "open",
        subtotal: treatmentPrice,
        total: treatmentPrice,
        notes: null,
        openedAt: new Date(),
        closedAt: null,
        closedBy: null,
        chargedTo: null,
      });

      await storage.createSpaAccountItem({
        accountId: account.id,
        description: treatment.name,
        quantity: 1,
        unitPrice: treatmentPrice,
        subtotal: treatmentPrice,
        itemType: "treatment",
        notes: null,
        createdAt: new Date(),
      });

      res.status(201).json(appointment);
    } catch (error) {
      res.status(500).json({ error: "Error creating appointment" });
    }
  });

  app.patch("/api/spa/appointments/:id", async (req, res) => {
    try {
      const current = await storage.getSpaAppointment(req.params.id);
      if (!current) return res.status(404).json({ error: "Appointment not found" });

      const cabinId = req.body.cabinId || current.cabinId;
      const appointmentDate = req.body.appointmentDate || current.appointmentDate;
      const startTime = req.body.startTime || current.startTime;
      const endTime = req.body.endTime || current.endTime;

      if (req.body.cabinId || req.body.startTime || req.body.endTime || req.body.appointmentDate) {
        const existingAppointments = await storage.getSpaAppointmentsByCabin(cabinId, appointmentDate);
        const activeStatuses = ["pending", "confirmed", "in_progress"];
        const newStart = timeToMinutes(startTime);
        const newEnd = timeToMinutes(endTime);

        for (const existing of existingAppointments) {
          if (existing.id === req.params.id) continue;
          if (!activeStatuses.includes(existing.status)) continue;
          const existStart = timeToMinutes(existing.startTime);
          const existEnd = timeToMinutes(existing.endTime);
          if (newStart < existEnd && newEnd > existStart) {
            const cabin = await storage.getSpaCabin(cabinId);
            return res.status(409).json({
              error: "Superposición de turno",
              message: `El gabinete '${cabin?.name || cabinId}' ya tiene un turno de ${existing.startTime} a ${existing.endTime} hs. Elegí otro horario o gabinete.`,
            });
          }
        }
      }

      const appointment = await storage.updateSpaAppointment(req.params.id, req.body);
      if (!appointment) return res.status(404).json({ error: "Appointment not found" });
      res.json(appointment);
    } catch (error) {
      res.status(500).json({ error: "Error updating appointment" });
    }
  });

  app.delete("/api/spa/appointments/:id", async (req, res) => {
    try {
      await storage.deleteSpaAppointment(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting appointment" });
    }
  });

  // SPA Accounts
  app.get("/api/spa/accounts", async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const accounts = await storage.getSpaAccounts(status as "open" | "closed" | "cancelled" | undefined);
      res.json(accounts);
    } catch (error) {
      res.status(500).json({ error: "Error fetching spa accounts" });
    }
  });

  app.get("/api/spa/accounts/:id", async (req, res) => {
    try {
      const account = await storage.getSpaAccount(req.params.id);
      if (!account) return res.status(404).json({ error: "Account not found" });
      res.json(account);
    } catch (error) {
      res.status(500).json({ error: "Error fetching spa account" });
    }
  });

  app.get("/api/spa/accounts/by-appointment/:appointmentId", async (req, res) => {
    try {
      const account = await storage.getSpaAccountByAppointment(req.params.appointmentId);
      if (!account) return res.status(404).json({ error: "Account not found" });
      res.json(account);
    } catch (error) {
      res.status(500).json({ error: "Error fetching spa account" });
    }
  });

  app.post("/api/spa/accounts", async (req, res) => {
    try {
      const { appointmentId, guestName, reservationId, notes } = req.body;

      if (!appointmentId || !guestName) {
        return res.status(400).json({ error: "appointmentId and guestName are required" });
      }

      const account = await storage.createSpaAccount({
        appointmentId,
        guestName,
        reservationId: reservationId || null,
        status: "open",
        subtotal: "0",
        total: "0",
        notes: notes || null,
        openedAt: new Date(),
        closedAt: null,
        closedBy: null,
        chargedTo: null,
      });
      res.status(201).json(account);
    } catch (error) {
      res.status(500).json({ error: "Error creating spa account" });
    }
  });

  app.patch("/api/spa/accounts/:id", async (req, res) => {
    try {
      const account = await storage.updateSpaAccount(req.params.id, req.body);
      if (!account) return res.status(404).json({ error: "Account not found" });
      res.json(account);
    } catch (error) {
      res.status(500).json({ error: "Error updating spa account" });
    }
  });

  app.post("/api/spa/accounts/:id/close", async (req, res) => {
    try {
      const { chargedTo, receiptType } = req.body;

      if (!chargedTo || !receiptType) {
        return res.status(400).json({ error: "chargedTo and receiptType are required" });
      }

      const accountData = await storage.getSpaAccount(req.params.id);
      if (!accountData) return res.status(404).json({ error: "Account not found" });

      const totalAmount = accountData.items.reduce((sum: number, item: any) => sum + parseFloat(item.subtotal), 0);
      const totalPaid = accountData.payments.reduce((sum: number, p: any) => sum + parseFloat(p.amount), 0);

      if (totalPaid < totalAmount) {
        return res.status(400).json({
          error: "Saldo pendiente",
          message: `Faltan $${(totalAmount - totalPaid).toFixed(2)} por cobrar antes de cerrar el folio.`,
        });
      }

      const account = await storage.closeSpaAccount(req.params.id, chargedTo, receiptType);
      if (!account) return res.status(404).json({ error: "Account not found" });
      res.json(account);
    } catch (error) {
      res.status(500).json({ error: "Error closing spa account" });
    }
  });

  app.get("/api/spa/accounts/:id/payments", async (req, res) => {
    try {
      const payments = await storage.getSpaPayments(req.params.id);
      res.json(payments);
    } catch (error) {
      res.status(500).json({ error: "Error fetching payments" });
    }
  });

  app.post("/api/spa/accounts/:id/payments", async (req, res) => {
    try {
      const { amount, method, isAdvance, appointmentId, reservationId, notes } = req.body;

      if (!amount || !method) {
        return res.status(400).json({ error: "amount and method are required" });
      }

      const payment = await storage.createSpaPayment({
        accountId: req.params.id,
        amount,
        method,
        isAdvance: isAdvance ? "true" : "false",
        appointmentId: appointmentId || null,
        reservationId: reservationId || null,
        notes: notes || null,
        createdAt: new Date(),
      });

      if (method === "room_charge" && reservationId) {
        await storage.createCharge({
          reservationId,
          category: "spa" as const,
          description: `SPA - Pago ${isAdvance ? "(Seña)" : ""}`,
          amount: amount,
          date: new Date().toISOString().split("T")[0],
          createdBy: null,
        });
      }

      try {
        const label = `SPA - Pago ${isAdvance ? "(Seña)" : ""} - Cuenta ${req.params.id}`;
        await storage.registerCashMovement(
          "spa", "spa_account", req.params.id, label,
          method, String(amount), "income"
        );
      } catch (e) {
        console.error("Error registrando movimiento de caja:", e);
      }

      res.status(201).json(payment);
    } catch (error) {
      res.status(500).json({ error: "Error creating payment" });
    }
  });

  app.patch("/api/spa/payments/:id/anular", requireAuth, async (req, res) => {
    try {
      const { motivoAnulacion } = req.body;
      if (!motivoAnulacion?.trim()) return res.status(400).json({ error: "El motivo de anulación es requerido" });
      const [pay] = await db.select().from(spaPayments).where(eq(spaPayments.id, req.params.id));
      if (!pay) return res.status(404).json({ error: "Pago no encontrado" });
      if (pay.status === "anulado") return res.status(400).json({ error: "El pago ya está anulado" });
      const account = await storage.getSpaAccount(pay.accountId);
      if (account?.status === "closed") return res.status(403).json({ error: "No se puede anular pagos de una cuenta cerrada" });
      const [updated] = await db.update(spaPayments)
        .set({ status: "anulado", motivoAnulacion, anuladoAt: new Date() })
        .where(eq(spaPayments.id, req.params.id))
        .returning();
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/spa/payments/:id", async (req, res) => {
    console.warn(`[DEPRECADO] DELETE /api/spa/payments/${req.params.id} — usar PATCH /anular`);
    try {
      await storage.deleteSpaPayment(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting payment" });
    }
  });

  // SPA Account Items
  app.get("/api/spa/accounts/:accountId/items", async (req, res) => {
    try {
      const items = await storage.getSpaAccountItems(req.params.accountId);
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Error fetching account items" });
    }
  });

  app.post("/api/spa/accounts/:accountId/items", async (req, res) => {
    try {
      const { description, quantity, unitPrice, itemType, notes } = req.body;

      if (!description || !unitPrice) {
        return res.status(400).json({ error: "description and unitPrice are required" });
      }

      const qty = quantity || 1;
      const subtotal = (parseFloat(unitPrice) * qty).toFixed(2);

      const item = await storage.createSpaAccountItem({
        accountId: req.params.accountId,
        description,
        quantity: qty,
        unitPrice,
        subtotal,
        itemType: itemType || "treatment",
        notes: notes || null,
        createdAt: new Date(),
      });
      res.status(201).json(item);
    } catch (error) {
      res.status(500).json({ error: "Error creating account item" });
    }
  });

  app.patch("/api/spa/account-items/:id", async (req, res) => {
    try {
      const item = await storage.updateSpaAccountItem(req.params.id, req.body);
      if (!item) return res.status(404).json({ error: "Item not found" });
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: "Error updating account item" });
    }
  });

  app.delete("/api/spa/account-items/:id", async (req, res) => {
    try {
      await storage.deleteSpaAccountItem(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting account item" });
    }
  });

  // SPA Professionals
  app.get("/api/spa/professionals", async (req, res) => {
    try {
      const professionals = await db.select().from(spaProfessionals);
      res.json(professionals);
    } catch (error) {
      res.status(500).json({ error: "Error fetching professionals" });
    }
  });

  app.post("/api/spa/professionals", async (req, res) => {
    try {
      const [created] = await db.insert(spaProfessionals).values(req.body).returning();
      res.json(created);
    } catch (error) {
      res.status(500).json({ error: "Error creating professional" });
    }
  });

  app.patch("/api/spa/professionals/:id", async (req, res) => {
    try {
      const [updated] = await db.update(spaProfessionals)
        .set(req.body)
        .where(eq(spaProfessionals.id, req.params.id))
        .returning();
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Error updating professional" });
    }
  });

  // SPA Clients
  app.get("/api/spa/clients", async (req, res) => {
    try {
      const { search } = req.query;
      const clients = await db.select().from(spaClients).orderBy(desc(spaClients.createdAt));
      if (search) {
        const s = (search as string).toLowerCase();
        return res.json(clients.filter((c: any) =>
          c.firstName.toLowerCase().includes(s) ||
          (c.lastName || "").toLowerCase().includes(s) ||
          (c.phone || "").includes(s) ||
          (c.email || "").toLowerCase().includes(s)
        ));
      }
      res.json(clients);
    } catch (error) {
      res.status(500).json({ error: "Error fetching spa clients" });
    }
  });

  app.post("/api/spa/clients", async (req, res) => {
    try {
      const [created] = await db.insert(spaClients).values(req.body).returning();
      res.json(created);
    } catch (error) {
      res.status(500).json({ error: "Error creating spa client" });
    }
  });

  app.patch("/api/spa/clients/:id", async (req, res) => {
    try {
      const [updated] = await db.update(spaClients)
        .set(req.body).where(eq(spaClients.id, req.params.id)).returning();
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Error updating spa client" });
    }
  });

  app.delete("/api/spa/clients/:id", async (req, res) => {
    try {
      await db.delete(spaClients).where(eq(spaClients.id, req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Error deleting spa client" });
    }
  });
}

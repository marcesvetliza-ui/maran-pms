import type { Express } from "express";
import { storage } from "../db-storage";
import { db } from "../db";
import { spaPayments, spaProfessionals, spaClients, inventoryItems, guests, salesInvoices, spaAccounts } from "@shared/schema";
import { requireAuth } from "../auth";
import { eq, desc, inArray, and } from "drizzle-orm";
import { folioMovements } from "@shared/schema";
import { generateConfirmacionTurnoSpaPdf, generateSpaAccountReceiptPdf } from "../spaPdfs";
import { emitirFactura } from "../billing/invoiceService";
import { sendEmailWithPdfAttachment } from "../email-service";

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
        // Enrich with account billing status (invoiceId / ncId) so the agenda
        // card can show an NC badge without a per-card API call.
        if (appointments.length > 0) {
          const aptIds = appointments.map((a) => a.id);
          const accounts = await db
            .select({
              appointmentId: spaAccounts.appointmentId,
              invoiceId: spaAccounts.invoiceId,
              ncId: spaAccounts.ncId,
            })
            .from(spaAccounts)
            .where(inArray(spaAccounts.appointmentId, aptIds));
          const accountMap = new Map(accounts.map((acc) => [acc.appointmentId, acc]));
          const enriched = appointments.map((a) => {
            const acc = accountMap.get(a.id);
            return acc ? { ...a, invoiceId: acc.invoiceId, ncId: acc.ncId } : a;
          });
          return res.json(enriched);
        }
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
      const { cabinId, treatmentId, professionalId, guestId, guestName, guestLastName, guestPhone, guestEmail, reservationId, appointmentDate, startTime, endTime, status, notes } = req.body;

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
        guestId: guestId || null,
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
      console.error("[SPA] Error creating appointment:", error);
      const msg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: "Error creating appointment", detail: msg });
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
      const { chargedTo, receiptType, customerRazonSocial, customerCuit, customerDni, vatCondition, pvOverride } = req.body;

      if (!chargedTo || !receiptType) {
        return res.status(400).json({ error: "chargedTo and receiptType are required" });
      }

      if (["factura_a", "factura_c"].includes(receiptType) && !customerCuit?.trim()) {
        return res.status(400).json({ error: "El CUIT es obligatorio para Factura A/C" });
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

      // Descontar insumos del inventario (nunca bloquea el cierre)
      storage.deductStockFromSpaAccount(req.params.id).catch((err: any) =>
        console.warn("[SPA] Error deducting stock:", err)
      );

      // Emitir factura AFIP si se solicitó un comprobante fiscal
      let invoiceId: number | undefined;
      if (["factura_a", "factura_b", "factura_c"].includes(receiptType || "")) {
        try {
          const tipo = receiptType === "factura_a" ? "FA" : receiptType === "factura_b" ? "FB" : "FC";
          const condicion = vatCondition || (receiptType === "factura_a" ? "responsable_inscripto" : "consumidor_final");

          const invoiceItems: { descripcion: string; cantidad: number; precioUnitario: number; alicuotaIva: "21"; subtotalNeto: number; subtotal: number }[] = [];
          for (const item of accountData.items) {
            const gross = parseFloat(item.subtotal);
            if (gross <= 0.001) continue;
            const qty = item.quantity || 1;
            const grossUnit = parseFloat((gross / qty).toFixed(2));
            const netUnit = parseFloat((grossUnit / 1.21).toFixed(4));
            const netTotal = parseFloat((netUnit * qty).toFixed(4));
            const grossTotal = parseFloat((grossUnit * qty).toFixed(2));
            invoiceItems.push({ descripcion: item.description, cantidad: qty, precioUnitario: netUnit, alicuotaIva: "21" as const, subtotalNeto: netTotal, subtotal: grossTotal });
          }
          if (invoiceItems.length === 0) {
            const gross = parseFloat(totalAmount.toFixed(2));
            const net = parseFloat((gross / 1.21).toFixed(4));
            invoiceItems.push({ descripcion: "Servicios SPA", cantidad: 1, precioUnitario: net, alicuotaIva: "21" as const, subtotalNeto: net, subtotal: gross });
          }

          const invoice = await emitirFactura({
            tipoComprobante: tipo as "FA" | "FB" | "FC",
            cliente: {
              razonSocial: customerRazonSocial || "CONSUMIDOR FINAL",
              cuit: customerCuit || undefined,
              dni: customerDni || undefined,
              condicionIva: condicion,
            },
            items: invoiceItems,
            operador: (req as any).user?.fullName || (req as any).user?.username,
            puntoVentaOverride: pvOverride ? parseInt(pvOverride) : undefined,
          });
          invoiceId = invoice.id;
          // Persist the invoice link on the account record
          await storage.updateSpaAccount(req.params.id, { invoiceId } as any);
        } catch (e) {
          console.error("[Billing] Error emitiendo factura SPA:", e);
        }
      }

      res.json({ ...account, invoiceId });
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

      // Motor financiero: escribir al folio de la cuenta SPA
      storage.addFolioPayment(
        "spa_account", req.params.id,
        parseFloat(String(amount)),
        `SPA - Pago${isAdvance ? " (Seña)" : ""}`,
        method, "spa_payment", payment.id,
        undefined, (req as any).user?.username,
      ).catch(e => console.error("[Folio] Error SPA pago:", e));

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

      // Motor financiero: escribir cargo al folio de la cuenta SPA
      storage.addFolioCharge(
        "spa_account", req.params.accountId,
        parseFloat(subtotal),
        description,
        "spa_item", item.id,
        (req as any).user?.username,
      ).catch(e => console.error("[Folio] Error SPA cargo:", e));

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

  // SPA Clients — unified: uses guests table so all modules share the same client base
  app.get("/api/spa/clients", async (req, res) => {
    try {
      const { search } = req.query;
      const allGuests = await db.select().from(guests).orderBy(desc(guests.createdAt));
      if (search) {
        const s = (search as string).toLowerCase();
        return res.json(allGuests.filter((c: any) =>
          (c.firstName || "").toLowerCase().includes(s) ||
          (c.lastName || "").toLowerCase().includes(s) ||
          (c.phone || "").includes(s) ||
          (c.email || "").toLowerCase().includes(s) ||
          (c.documentNumber || "").includes(s)
        ));
      }
      res.json(allGuests);
    } catch (error) {
      res.status(500).json({ error: "Error fetching clients" });
    }
  });

  app.post("/api/spa/clients", async (req, res) => {
    try {
      const [created] = await db.insert(guests).values(req.body).returning();
      res.json(created);
    } catch (error) {
      res.status(500).json({ error: "Error creating client" });
    }
  });

  app.patch("/api/spa/clients/:id", async (req, res) => {
    try {
      const ALLOWED = ["firstName","lastName","email","phone","notes","documentType",
        "documentNumber","vatCondition","cuilCuit","estadoCivil","direccion",
        "localidad","provincia","codigoPostal","fechaNacimiento","sexo","tipoPersona"];
      const patch: Record<string, any> = {};
      for (const f of ALLOWED) { if (req.body[f] !== undefined) patch[f] = req.body[f]; }
      const [updated] = await db.update(guests).set(patch).where(eq(guests.id, req.params.id)).returning();
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Error updating client" });
    }
  });

  app.delete("/api/spa/clients/:id", async (req, res) => {
    try {
      await db.delete(guests).where(eq(guests.id, req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Error deleting client" });
    }
  });

  // ==================== TREATMENT SUPPLIES ====================
  app.get("/api/spa/treatments/:id/supplies", async (req, res) => {
    try {
      const supplies = await storage.getTreatmentSupplies(req.params.id);
      // Enrich with inventory item info
      const enriched = await Promise.all(supplies.map(async (s) => {
        const [item] = await db.select({ name: inventoryItems.name, unit: inventoryItems.unit })
          .from(inventoryItems).where(eq(inventoryItems.id, s.inventoryItemId));
        return { ...s, inventoryItemName: item?.name ?? "—", inventoryItemUnit: item?.unit ?? s.unit };
      }));
      res.json(enriched);
    } catch (error) {
      res.status(500).json({ error: "Error fetching treatment supplies" });
    }
  });

  app.post("/api/spa/treatments/:id/supplies", requireAuth, async (req, res) => {
    try {
      const { inventoryItemId, quantity, unit, notes } = req.body;
      if (!inventoryItemId || !quantity) {
        return res.status(400).json({ error: "inventoryItemId and quantity are required" });
      }
      const supply = await storage.createTreatmentSupply({
        treatmentId: req.params.id,
        inventoryItemId,
        quantity: String(quantity),
        unit: unit || "",
        notes: notes || null,
      });
      res.json(supply);
    } catch (error) {
      res.status(500).json({ error: "Error creating treatment supply" });
    }
  });

  app.delete("/api/spa/treatments/supplies/:supplyId", requireAuth, async (req, res) => {
    try {
      const ok = await storage.deleteTreatmentSupply(req.params.supplyId);
      res.json({ success: ok });
    } catch (error) {
      res.status(500).json({ error: "Error deleting treatment supply" });
    }
  });

  // ── PDF: Confirmación de turno SPA ────────────────────────────────────────
  app.get("/api/spa/appointments/:id/pdf/confirmacion", requireAuth, async (req, res) => {
    try {
      const appointment = await storage.getSpaAppointment(req.params.id);
      if (!appointment) return res.status(404).json({ error: "Turno no encontrado" });

      const account = await storage.getSpaAccountByAppointment(req.params.id);

      let professional = undefined;
      if (appointment.professionalId) {
        const [prof] = await db.select().from(spaProfessionals).where(eq(spaProfessionals.id, appointment.professionalId));
        professional = prof;
      }

      const pdfBuffer = await generateConfirmacionTurnoSpaPdf(appointment, account, professional);
      const guestName = `${appointment.guestName}_${appointment.guestLastName || ""}`.replace(/\s+/g, "_");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Confirmacion_SPA_${guestName}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating SPA confirmation PDF:", error);
      res.status(500).json({ error: "Error generando PDF de confirmación" });
    }
  });

  // ── PDF: Comprobante de cuenta SPA ────────────────────────────────────────
  app.get("/api/spa/accounts/:id/receipt-pdf", requireAuth, async (req, res) => {
    try {
      const account = await storage.getSpaAccount(req.params.id);
      if (!account) return res.status(404).json({ error: "Cuenta no encontrada" });
      const appointment = await storage.getSpaAppointment(account.appointmentId);

      const treatment = appointment?.treatmentId
        ? await storage.getSpaTreatment(appointment.treatmentId)
        : null;

      const pdfBuffer = await generateSpaAccountReceiptPdf({
        accountId: account.id,
        guestName: account.guestName,
        appointmentDate: appointment?.appointmentDate ?? new Date().toISOString().split("T")[0],
        startTime: appointment?.startTime ?? "",
        treatmentName: treatment?.name ?? "Servicio SPA",
        receiptType: account.receiptType,
        closedAt: account.closedAt ? String(account.closedAt) : null,
        items: account.items.map((i: any) => ({
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          subtotal: i.subtotal,
        })),
        payments: account.payments.map((p: any) => ({ method: p.method, amount: p.amount })),
        total: account.items.reduce((s: number, i: any) => s + parseFloat(i.subtotal), 0),
      });

      const guestSlug = account.guestName.replace(/\s+/g, "_");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Recibo_SPA_${guestSlug}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating SPA receipt PDF:", error);
      res.status(500).json({ error: "Error generando comprobante PDF" });
    }
  });

  // ── Email: Enviar comprobante SPA por email ────────────────────────────────
  app.post("/api/spa/accounts/:id/receipt-email", requireAuth, async (req, res) => {
    try {
      const { to } = req.body;
      if (!to?.trim()) return res.status(400).json({ error: "El destinatario (to) es requerido" });

      const account = await storage.getSpaAccount(req.params.id);
      if (!account) return res.status(404).json({ error: "Cuenta no encontrada" });
      const appointment = await storage.getSpaAppointment(account.appointmentId);

      const treatment = appointment?.treatmentId
        ? await storage.getSpaTreatment(appointment.treatmentId)
        : null;

      const pdfBuffer = await generateSpaAccountReceiptPdf({
        accountId: account.id,
        guestName: account.guestName,
        appointmentDate: appointment?.appointmentDate ?? new Date().toISOString().split("T")[0],
        startTime: appointment?.startTime ?? "",
        treatmentName: treatment?.name ?? "Servicio SPA",
        receiptType: account.receiptType,
        closedAt: account.closedAt ? String(account.closedAt) : null,
        items: account.items.map((i: any) => ({
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          subtotal: i.subtotal,
        })),
        payments: account.payments.map((p: any) => ({ method: p.method, amount: p.amount })),
        total: account.items.reduce((s: number, i: any) => s + parseFloat(i.subtotal), 0),
      });

      const guestSlug = account.guestName.replace(/\s+/g, "_");
      const subject = `Comprobante SPA — ${account.guestName}`;
      const body = `Estimado/a,\n\nAdjunto encontrará el comprobante de su sesión de SPA en Maran Suites & Towers.\n\nGracias por elegirnos.\n\nMaran Suites & Towers\nSPA & Wellness — Paraná, Entre Ríos`;

      const result = await sendEmailWithPdfAttachment({
        to: to.trim(),
        subject,
        body,
        attachmentFilename: `Recibo_SPA_${guestSlug}.pdf`,
        attachmentBuffer: pdfBuffer,
      });

      if (!result.ok) {
        return res.status(502).json({ error: result.error || "Error al enviar el email" });
      }

      res.json({ ok: true });
    } catch (error: any) {
      console.error("Error sending SPA receipt email:", error);
      res.status(500).json({ error: "Error al enviar el email" });
    }
  });

  // Emit NC (Nota de Crédito) against a closed SPA account invoice
  app.post("/api/spa/accounts/:accountId/nc", requireAuth, async (req, res) => {
    try {
      const account = await storage.getSpaAccount(req.params.accountId);
      if (!account) return res.status(404).json({ error: "Cuenta SPA no encontrada" });
      if (!(account as any).invoiceId) {
        return res.status(400).json({ error: "La cuenta no tiene una factura AFIP emitida" });
      }
      if ((account as any).ncId) {
        return res.status(400).json({ error: "Esta cuenta ya tiene una Nota de Crédito emitida" });
      }

      const [originalInvoice] = await db.select().from(salesInvoices).where(eq(salesInvoices.id, (account as any).invoiceId));
      if (!originalInvoice) return res.status(404).json({ error: "Factura original no encontrada" });

      const ncTipo: "NCA" | "NCB" = originalInvoice.tipoComprobante === "FA" ? "NCA" : "NCB";

      const originalItems = (originalInvoice.items as any[]) || [];
      let ncItems: { descripcion: string; cantidad: number; precioUnitario: number; alicuotaIva: "21" | "10.5" | "exento" | "no_gravado"; subtotalNeto: number; subtotal: number }[];
      if (originalItems.length > 0) {
        ncItems = originalItems.map((item: any) => ({
          descripcion: item.descripcion || "Anulación",
          cantidad: item.cantidad || 1,
          precioUnitario: item.precioUnitario || 0,
          alicuotaIva: (item.alicuotaIva || "21") as "21" | "10.5" | "exento" | "no_gravado",
          subtotalNeto: item.subtotalNeto || 0,
          subtotal: item.subtotal || 0,
        }));
      } else {
        const gross = parseFloat(originalInvoice.montoTotal || "0");
        const net = parseFloat((gross / 1.21).toFixed(4));
        ncItems = [{ descripcion: `NC SPA ${account.guestName}`, cantidad: 1, precioUnitario: net, alicuotaIva: "21" as const, subtotalNeto: net, subtotal: gross }];
      }

      const nc = await emitirFactura({
        tipoComprobante: ncTipo,
        cliente: {
          razonSocial: originalInvoice.clienteRazonSocial || "CONSUMIDOR FINAL",
          cuit: originalInvoice.clienteCuit || undefined,
          dni: originalInvoice.clienteDni || undefined,
          condicionIva: originalInvoice.clienteCondicionIva || "consumidor_final",
        },
        items: ncItems,
        facturaOriginalId: originalInvoice.id,
        operador: (req as any).user?.fullName || (req as any).user?.username,
      });

      await storage.updateSpaAccount(req.params.accountId, { ncId: nc.id } as any);

      // Write void folio_movements for each payment so the folio balance
      // correctly reflects the reversal (balance goes back to non-zero).
      try {
        const folio = await (storage as any).getFolioByEntity("spa_account", req.params.accountId);
        if (folio) {
          const payments: any[] = account.payments || [];
          for (const payment of payments) {
            const amt = parseFloat(payment.amount);
            if (amt > 0) {
              await (storage as any).addFolioAdjustment(
                folio.id,
                "void",
                amt,
                `NC SPA - Anulación pago ${payment.method}`,
                (req as any).user?.username,
                payment.id,
                `NC emitida id=${nc.id}`,
              );
            }
          }
        }
      } catch (voidErr) {
        console.error("[Folio] Error escribiendo movimientos void para NC SPA:", voidErr);
      }

      res.json({ ncId: nc.id, nc });
    } catch (e: any) {
      console.error("[Billing] Error emitiendo NC SPA:", e);
      res.status(500).json({ error: e?.message || "Error al emitir la Nota de Crédito" });
    }
  });

  // Admin-only: reset ncId on a SPA account so a new NC can be emitted after the previous one was voided
  app.patch("/api/spa/accounts/:accountId/reset-nc", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user || user.role !== "admin") {
        return res.status(403).json({ error: "Solo un administrador puede restablecer el estado de NC" });
      }
      const account = await storage.getSpaAccount(req.params.accountId);
      if (!account) return res.status(404).json({ error: "Cuenta SPA no encontrada" });
      const ncId = (account as any).ncId;
      if (!ncId) {
        return res.status(400).json({ error: "Esta cuenta no tiene una NC emitida" });
      }

      // Reverse the void folio movements written during NC emission so the
      // folio balance is consistent when a new NC is emitted later.
      try {
        const folio = await (storage as any).getFolioByEntity("spa_account", req.params.accountId);
        if (folio) {
          const voidMovements = await db
            .select()
            .from(folioMovements)
            .where(
              and(
                eq(folioMovements.folioId, folio.id),
                eq(folioMovements.type, "void"),
                eq(folioMovements.voidReason, `NC emitida id=${ncId}`),
              ),
            );
          for (const mov of voidMovements) {
            await db.delete(folioMovements).where(eq(folioMovements.id, mov.id));
          }
          if (voidMovements.length > 0) {
            await (storage as any).recalcFolioBalance(folio.id);
          }
        }
      } catch (folioErr) {
        console.error("[Folio] Error revirtiendo movimientos void para reset-nc SPA:", folioErr);
        // Non-fatal: we still clear ncId so the account isn't permanently blocked.
      }

      await storage.updateSpaAccount(req.params.accountId, { ncId: null } as any);
      const updated = await storage.getSpaAccount(req.params.accountId);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Error al restablecer el estado de NC" });
    }
  });
}

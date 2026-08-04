import type { Express } from "express";
import { storage } from "../db-storage";
import { db } from "../db";
import { eventPayments, salesInvoices } from "@shared/schema";
import { requireAuth } from "../auth";
import { eq, and } from "drizzle-orm";
import { generateHojaFuncionPdf, generateConfirmacionEventoPdf, generateTablesResumenPdf, generateTableReceiptPdf } from "../eventPdfs";
import { emitirFactura } from "../billing/invoiceService";
import { sendEmailWithPdfAttachment } from "../email-service";

export function registerEventsRoutes(app: Express) {
  // Event Rooms
  app.get("/api/events/rooms", async (req, res) => {
    try {
      const rooms = await storage.getEventRooms();
      res.json(rooms);
    } catch (error) {
      res.status(500).json({ error: "Error fetching event rooms" });
    }
  });

  app.get("/api/events/rooms/:id", async (req, res) => {
    try {
      const room = await storage.getEventRoom(req.params.id);
      if (!room) return res.status(404).json({ error: "Event room not found" });
      res.json(room);
    } catch (error) {
      res.status(500).json({ error: "Error fetching event room" });
    }
  });

  app.post("/api/events/rooms", async (req, res) => {
    try {
      const room = await storage.createEventRoom(req.body);
      res.status(201).json(room);
    } catch (error) {
      res.status(500).json({ error: "Error creating event room" });
    }
  });

  app.patch("/api/events/rooms/:id", async (req, res) => {
    try {
      const room = await storage.updateEventRoom(req.params.id, req.body);
      if (!room) return res.status(404).json({ error: "Event room not found" });
      res.json(room);
    } catch (error) {
      res.status(500).json({ error: "Error updating event room" });
    }
  });

  app.delete("/api/events/rooms/:id", async (req, res) => {
    try {
      await storage.deleteEventRoom(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting event room" });
    }
  });

  // Event Planning
  app.get("/api/events/planning", async (req, res) => {
    try {
      const startDate = req.query.start as string;
      const endDate = req.query.end as string;

      if (!startDate || !endDate) {
        return res.status(400).json({ error: "Start and end dates are required" });
      }

      const planningData = await storage.getEventPlanningData(startDate, endDate);
      res.json(planningData);
    } catch (error) {
      res.status(500).json({ error: "Error fetching event planning data" });
    }
  });

  // Event Charge Types - MUST come before /api/events/:id
  app.get("/api/events/charge-types", async (req, res) => {
    try {
      const chargeTypes = await storage.getEventChargeTypes();
      res.json(chargeTypes);
    } catch (error) {
      res.status(500).json({ error: "Error fetching event charge types" });
    }
  });

  app.post("/api/events/charge-types", async (req, res) => {
    try {
      const chargeType = await storage.createEventChargeType(req.body);
      res.status(201).json(chargeType);
    } catch (error) {
      res.status(500).json({ error: "Error creating event charge type" });
    }
  });

  app.patch("/api/events/charge-types/:id", async (req, res) => {
    try {
      const chargeType = await storage.updateEventChargeType(req.params.id, req.body);
      if (!chargeType) return res.status(404).json({ error: "Event charge type not found" });
      res.json(chargeType);
    } catch (error) {
      res.status(500).json({ error: "Error updating event charge type" });
    }
  });

  app.delete("/api/events/charge-types/:id", async (req, res) => {
    try {
      await storage.deleteEventChargeType(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting event charge type" });
    }
  });

  // Events CRUD
  app.get("/api/events", async (req, res) => {
    try {
      const events = await storage.getEvents();
      res.json(events);
    } catch (error) {
      res.status(500).json({ error: "Error fetching events" });
    }
  });

  app.get("/api/events/:id", async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) return res.status(404).json({ error: "Event not found" });
      res.json(event);
    } catch (error) {
      res.status(500).json({ error: "Error fetching event" });
    }
  });

  app.post("/api/events", async (req, res) => {
    try {
      const { eventRoomId, startDate, endDate, startTime, endTime } = req.body;
      if (eventRoomId && startDate && endDate) {
        const activeStatuses = ["tentative", "confirmed", "in_progress"];
        const existingEvents = await storage.getEventsByDateRange(startDate, endDate);
        for (const existing of existingEvents) {
          if (existing.eventRoomId !== eventRoomId) continue;
          if (!activeStatuses.includes(existing.status)) continue;
          if (existing.startDate <= endDate && existing.endDate >= startDate) {
            // Si ambos eventos tienen horario definido, verificar superposición de horario
            if (startTime && endTime && existing.startTime && existing.endTime) {
              if (startTime >= existing.endTime || endTime <= existing.startTime) continue;
            }
            const room = await storage.getEventRoom(eventRoomId);
            return res.status(409).json({
              error: "Superposición de evento",
              message: `El salón '${room?.name || eventRoomId}' ya tiene el evento '${existing.name}' reservado del ${existing.startDate} al ${existing.endDate}${existing.startTime ? ` (${existing.startTime}–${existing.endTime})` : ""}.`,
            });
          }
        }
      }
      const eventCode = storage.generateEventCode();
      const event = await storage.createEvent({
        ...req.body,
        eventCode,
        createdAt: new Date(),
      });
      res.status(201).json(event);
    } catch (error) {
      res.status(500).json({ error: "Error creating event" });
    }
  });

  app.patch("/api/events/:id", async (req, res) => {
    try {
      const current = await storage.getEvent(req.params.id);
      if (!current) return res.status(404).json({ error: "Event not found" });

      const eventRoomId = req.body.eventRoomId || current.eventRoomId;
      const startDate = req.body.startDate || current.startDate;
      const endDate = req.body.endDate || current.endDate;

      if (req.body.eventRoomId || req.body.startDate || req.body.endDate) {
        const startTime = req.body.startTime ?? current.startTime;
        const endTime = req.body.endTime ?? current.endTime;
        const activeStatuses = ["tentative", "confirmed", "in_progress"];
        const existingEvents = await storage.getEventsByDateRange(startDate, endDate);
        for (const existing of existingEvents) {
          if (existing.id === req.params.id) continue;
          if (existing.eventRoomId !== eventRoomId) continue;
          if (!activeStatuses.includes(existing.status)) continue;
          if (existing.startDate <= endDate && existing.endDate >= startDate) {
            // Si ambos eventos tienen horario definido, verificar superposición de horario
            if (startTime && endTime && existing.startTime && existing.endTime) {
              if (startTime >= existing.endTime || endTime <= existing.startTime) continue;
            }
            const room = await storage.getEventRoom(eventRoomId);
            return res.status(409).json({
              error: "Superposición de evento",
              message: `El salón '${room?.name || eventRoomId}' ya tiene el evento '${existing.name}' reservado del ${existing.startDate} al ${existing.endDate}${existing.startTime ? ` (${existing.startTime}–${existing.endTime})` : ""}.`,
            });
          }
        }
      }

      const event = await storage.updateEvent(req.params.id, req.body);
      res.json(event);
    } catch (error) {
      res.status(500).json({ error: "Error updating event" });
    }
  });

  app.delete("/api/events/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteEvent(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Evento no encontrado" });
      res.status(204).send();
    } catch (error: any) {
      console.error("[events] deleteEvent error:", error?.message || error);
      res.status(500).json({ error: error?.message || "Error al eliminar el evento" });
    }
  });

  // Event Charges
  app.get("/api/events/:eventId/charges", async (req, res) => {
    try {
      const chargesList = await storage.getEventCharges(req.params.eventId);
      res.json(chargesList);
    } catch (error) {
      res.status(500).json({ error: "Error fetching event charges" });
    }
  });

  app.post("/api/events/:eventId/charges", async (req, res) => {
    try {
      const evt = await storage.getEvent(req.params.eventId);
      if (!evt) return res.status(404).json({ error: "Event not found" });
      if (evt.status === "invoiced" || evt.status === "cancelled") {
        return res.status(400).json({ error: "No se pueden agregar cargos a un evento facturado o cancelado" });
      }
      const { chargeTypeId, description, quantity, unitPrice, notes } = req.body;

      if (!description || !unitPrice) {
        return res.status(400).json({ error: "description and unitPrice are required" });
      }

      const qty = quantity || 1;
      const total = (parseFloat(unitPrice) * qty).toFixed(2);

      const charge = await storage.createEventCharge({
        eventId: req.params.eventId,
        chargeTypeId: chargeTypeId || null,
        description,
        quantity: qty,
        unitPrice,
        totalAmount: total,
        date: new Date().toISOString().split("T")[0],
        notes: notes || null,
        createdAt: new Date(),
      });

      // Motor financiero: escribir cargo al folio del evento
      storage.addFolioCharge(
        "event", req.params.eventId,
        parseFloat(total),
        description,
        "event_charge", charge.id,
        (req as any).user?.username,
      ).catch(e => console.error("[Folio] Error evento cargo:", e));

      res.status(201).json(charge);
    } catch (error) {
      res.status(500).json({ error: "Error creating event charge" });
    }
  });

  app.patch("/api/events/charges/:id", async (req, res) => {
    try {
      const charge = await storage.updateEventCharge(req.params.id, req.body);
      if (!charge) return res.status(404).json({ error: "Event charge not found" });
      res.json(charge);
    } catch (error) {
      res.status(500).json({ error: "Error updating event charge" });
    }
  });

  app.delete("/api/events/charges/:id", async (req, res) => {
    try {
      await storage.deleteEventCharge(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting event charge" });
    }
  });

  // Event Payments
  app.get("/api/events/:eventId/payments", async (req, res) => {
    try {
      const paymentsList = await storage.getEventPayments(req.params.eventId);
      res.json(paymentsList);
    } catch (error) {
      res.status(500).json({ error: "Error fetching event payments" });
    }
  });

  app.post("/api/events/:eventId/payments", async (req, res) => {
    try {
      const existingEvent = await storage.getEvent(req.params.eventId);
      if (!existingEvent) return res.status(404).json({ error: "Event not found" });
      if (existingEvent.status === "invoiced") {
        return res.status(400).json({ error: "No se pueden agregar pagos a un evento facturado" });
      }
      const { amount, method, isAdvance, reservationId, notes, ccEntityType, ccEntityId } = req.body;
      if (!amount || !method) {
        return res.status(400).json({ error: "amount and method are required" });
      }
      if (method === "room_charge" && !reservationId) {
        return res.status(400).json({ error: "reservationId es requerido para cargo a habitacion" });
      }
      const payment = await storage.createEventPayment({
        eventId: req.params.eventId,
        amount,
        method,
        isAdvance: isAdvance ? "true" : "false",
        reservationId: reservationId || null,
        notes: notes || null,
        paidAt: new Date(),
        createdAt: new Date(),
      });
      const refreshedEvent = await storage.getEvent(req.params.eventId);
      if (refreshedEvent) {
        const totalPaid = (refreshedEvent.payments || []).reduce((sum: number, p: any) => sum + parseFloat(p.amount), 0);
        await storage.updateEvent(req.params.eventId, { totalPaid: totalPaid.toFixed(2) } as any);
      }

      try {
        const evt = await storage.getEvent(req.params.eventId);
        const label = `Evento ${evt?.name || req.params.eventId} - Pago ${method}`;
        await storage.registerCashMovement(
          "events", "event", req.params.eventId, label,
          method, String(amount), "income"
        );
      } catch (e) {
        console.error("Error registrando movimiento de caja:", e);
      }

      // Motor financiero: escribir al folio del evento
      storage.addFolioPayment(
        "event", req.params.eventId,
        parseFloat(String(amount)),
        `Pago Evento${isAdvance ? " (Seña)" : ""}`,
        method, "event_payment", payment.id,
        undefined, (req as any).user?.username,
      ).catch(e => console.error("[Folio] Error evento pago:", e));

      // Si es cuenta corriente, crear movimiento en CC
      if (method === "cuenta_corriente") {
        const evt = await storage.getEvent(req.params.eventId);
        const entityType = ccEntityType || (evt?.companyId ? "company" : null);
        const entityId = ccEntityId || evt?.companyId || null;
        if (entityType && entityId) {
          try {
            const today = new Date().toISOString().split("T")[0];
            await storage.createAccountMovement({
              entityType: entityType as "company" | "agency",
              entityId,
              date: today,
              type: "cargo",
              description: `Evento: ${evt?.name || req.params.eventId}`,
              amount: String(parseFloat(amount).toFixed(2)),
            });
          } catch (e) {
            console.error("Error creando movimiento CC para evento:", e);
          }
        }
      }

      res.status(201).json(payment);
    } catch (error) {
      res.status(500).json({ error: "Error creating event payment" });
    }
  });

  app.patch("/api/events/:eventId/payments/:payId/anular", requireAuth, async (req, res) => {
    try {
      const { motivoAnulacion } = req.body;
      if (!motivoAnulacion?.trim()) return res.status(400).json({ error: "El motivo de anulación es requerido" });
      const event = await storage.getEvent(req.params.eventId);
      if (event?.status === "invoiced") return res.status(403).json({ error: "No se puede anular pagos de un evento facturado" });
      const [pay] = await db.select().from(eventPayments).where(eq(eventPayments.id, req.params.payId));
      if (!pay) return res.status(404).json({ error: "Pago no encontrado" });
      if (pay.status === "anulado") return res.status(400).json({ error: "El pago ya está anulado" });
      const [updated] = await db.update(eventPayments)
        .set({ status: "anulado", motivoAnulacion, anuladoAt: new Date() })
        .where(eq(eventPayments.id, req.params.payId))
        .returning();
      if (event) {
        const allPays = await db.select().from(eventPayments).where(
          and(eq(eventPayments.eventId, req.params.eventId), eq(eventPayments.status, "active"))
        );
        const totalPaid = allPays.reduce((sum: number, p: any) => sum + parseFloat(p.amount), 0);
        await storage.updateEvent(req.params.eventId, { totalPaid: totalPaid.toFixed(2) } as any);
      }
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/events/:eventId/payments/:payId", async (req, res) => {
    console.warn(`[DEPRECADO] DELETE /api/events/${req.params.eventId}/payments/${req.params.payId} — usar PATCH /anular`);
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (event && event.status === "invoiced") {
        return res.status(400).json({ error: "No se pueden eliminar pagos de un evento facturado" });
      }
      await storage.deleteEventPayment(req.params.payId);
      if (event) {
        const remaining = (event.payments || []).filter((p: any) => p.id !== req.params.payId);
        const totalPaid = remaining.reduce((sum: number, p: any) => sum + parseFloat(p.amount), 0);
        await storage.updateEvent(req.params.eventId, { totalPaid: totalPaid.toFixed(2) } as any);
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting event payment" });
    }
  });

  app.get("/api/events/:eventId/summary", async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });
      const chargesList = event.charges || [];
      const paymentsList = event.payments || [];
      const totalCharges = chargesList.reduce((sum: number, c: any) => sum + parseFloat(c.totalAmount), 0);
      const totalPayments = paymentsList.reduce((sum: number, p: any) => sum + parseFloat(p.amount), 0);
      res.json({
        totalCharges,
        totalPayments,
        balance: totalCharges - totalPayments,
        charges: chargesList,
        payments: paymentsList,
      });
    } catch (error) {
      res.status(500).json({ error: "Error fetching event summary" });
    }
  });

  app.post("/api/events/:eventId/close", async (req, res) => {
    try {
      const { receiptType, customerRazonSocial, customerCuit, customerDni, vatCondition, pvOverride } = req.body;
      if (!receiptType) {
        return res.status(400).json({ error: "receiptType es requerido" });
      }

      // Normalise early so validation uses the canonical form
      const normalizedForValidation = receiptType === "Factura A" ? "factura_a"
        : receiptType === "Factura C" ? "factura_c"
        : receiptType;
      if (["factura_a", "factura_c"].includes(normalizedForValidation) && !customerCuit?.trim()) {
        return res.status(400).json({ error: "El CUIT es obligatorio para Factura A/C" });
      }

      const event = await storage.getEvent(req.params.eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      const chargesList = event.charges || [];
      const paymentsList = event.payments || [];
      const totalCharges = chargesList.reduce((sum: number, c: any) => sum + parseFloat(c.totalAmount), 0);
      const totalPayments = paymentsList.reduce((sum: number, p: any) => sum + parseFloat(p.amount), 0);
      const balance = totalCharges - totalPayments;

      if (balance > 0.01) {
        return res.status(400).json({
          error: "Saldo pendiente",
          message: `Hay un saldo pendiente de $${balance.toFixed(2)}. Registre los pagos antes de cerrar.`,
        });
      }

      for (const payment of paymentsList) {
        if (payment.method === "room_charge" && payment.reservationId) {
          await storage.createCharge({
            reservationId: payment.reservationId,
            description: `Eventos - ${event.name}`,
            amount: payment.amount,
            date: new Date().toISOString().split("T")[0],
            category: "events",
            createdBy: null,
          });
        }
      }

      // Normalise receiptType: accept both snake_case ("factura_a") and legacy display strings ("Factura A")
      const normalizedReceiptType = receiptType === "Factura A" ? "factura_a"
        : receiptType === "Factura B" ? "factura_b"
        : receiptType === "Factura C" ? "factura_c"
        : receiptType;

      await storage.updateEvent(req.params.eventId, {
        status: "invoiced",
        receiptType: normalizedReceiptType,
        closedAt: new Date(),
        totalAmount: totalCharges.toFixed(2),
        totalPaid: totalPayments.toFixed(2),
      } as any);

      // Emitir factura AFIP si se solicitó un comprobante fiscal
      let invoiceId: number | undefined;
      if (["factura_a", "factura_b", "factura_c"].includes(normalizedReceiptType || "")) {
        try {
          const tipo = normalizedReceiptType === "factura_a" ? "FA" : normalizedReceiptType === "factura_b" ? "FB" : "FC";
          const condicion = vatCondition || (normalizedReceiptType === "factura_a" ? "responsable_inscripto" : "consumidor_final");

          const invoiceItems: { descripcion: string; cantidad: number; precioUnitario: number; alicuotaIva: "21"; subtotalNeto: number; subtotal: number }[] = [];
          for (const charge of chargesList) {
            const gross = parseFloat(charge.totalAmount);
            if (gross <= 0.001) continue;
            const qty = charge.quantity || 1;
            const grossUnit = parseFloat((gross / qty).toFixed(2));
            const netUnit = parseFloat((grossUnit / 1.21).toFixed(4));
            const netTotal = parseFloat((netUnit * qty).toFixed(4));
            const grossTotal = parseFloat((grossUnit * qty).toFixed(2));
            invoiceItems.push({ descripcion: charge.description, cantidad: qty, precioUnitario: netUnit, alicuotaIva: "21" as const, subtotalNeto: netTotal, subtotal: grossTotal });
          }
          if (invoiceItems.length === 0) {
            const gross = parseFloat(totalCharges.toFixed(2));
            const net = parseFloat((gross / 1.21).toFixed(4));
            invoiceItems.push({ descripcion: `Evento: ${event.name}`, cantidad: 1, precioUnitario: net, alicuotaIva: "21" as const, subtotalNeto: net, subtotal: gross });
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
          // Persist the invoice link on the event record
          await storage.updateEvent(req.params.eventId, { invoiceId } as any);
        } catch (e) {
          console.error("[Billing] Error emitiendo factura Evento:", e);
        }
      }

      const updated = await storage.getEvent(req.params.eventId);
      res.json({ ...updated, invoiceId });
    } catch (error) {
      res.status(500).json({ error: "Error closing event" });
    }
  });

  // Event Tables (Evento por Mesa)
  app.get("/api/events/:eventId/tables", async (req, res) => {
    try {
      const tables = await storage.getEventTables(req.params.eventId);
      res.json(tables);
    } catch (error) {
      res.status(500).json({ error: "Error fetching event tables" });
    }
  });

  app.post("/api/events/:eventId/tables", async (req, res) => {
    try {
      const { tableNumber, label, seats, reservationId } = req.body;
      if (!tableNumber) {
        return res.status(400).json({ error: "tableNumber is required" });
      }
      const table = await storage.createEventTable({
        eventId: req.params.eventId,
        tableNumber,
        label: label || null,
        seats: seats || null,
        reservationId: reservationId || null,
        createdAt: new Date(),
      });
      res.status(201).json(table);
    } catch (error) {
      res.status(500).json({ error: "Error creating event table" });
    }
  });

  app.patch("/api/events/:eventId/tables/:tableId", async (req, res) => {
    try {
      const table = await storage.updateEventTable(req.params.tableId, req.body);
      if (!table) return res.status(404).json({ error: "Event table not found" });
      res.json(table);
    } catch (error) {
      res.status(500).json({ error: "Error updating event table" });
    }
  });

  app.delete("/api/events/:eventId/tables/:tableId", async (req, res) => {
    try {
      const table = await storage.getEventTable(req.params.tableId);
      if (!table) return res.status(404).json({ error: "Event table not found" });
      if (table.charges.length > 0 || table.payments.length > 0) {
        return res.status(400).json({ error: "No se puede eliminar una mesa con cargos o pagos" });
      }
      await storage.deleteEventTable(req.params.tableId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting event table" });
    }
  });

  app.post("/api/events/:eventId/tables/:tableId/charges", async (req, res) => {
    try {
      const table = await storage.getEventTable(req.params.tableId);
      if (!table) return res.status(404).json({ error: "Table not found" });
      if (table.status !== "open") {
        return res.status(400).json({ error: "No se pueden agregar cargos a una mesa cerrada" });
      }
      const { description, quantity, unitPrice } = req.body;
      if (!description || !unitPrice) {
        return res.status(400).json({ error: "description and unitPrice are required" });
      }
      const qty = quantity || 1;
      const total = (parseFloat(unitPrice) * qty).toFixed(2);
      const charge = await storage.createEventTableCharge({
        eventTableId: req.params.tableId,
        description,
        quantity: qty,
        unitPrice,
        total,
        createdAt: new Date(),
      });
      res.status(201).json(charge);
    } catch (error) {
      res.status(500).json({ error: "Error creating table charge" });
    }
  });

  app.delete("/api/events/:eventId/tables/:tableId/charges/:chargeId", async (req, res) => {
    try {
      await storage.deleteEventTableCharge(req.params.chargeId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting table charge" });
    }
  });

  app.post("/api/events/:eventId/tables/:tableId/payments", async (req, res) => {
    try {
      const table = await storage.getEventTable(req.params.tableId);
      if (!table) return res.status(404).json({ error: "Table not found" });
      if (table.status !== "open") {
        return res.status(400).json({ error: "No se pueden agregar pagos a una mesa cerrada" });
      }
      const { amount, method, isAdvance, reservationId } = req.body;
      if (!amount || !method) {
        return res.status(400).json({ error: "amount and method are required" });
      }
      if (method === "room_charge" && !reservationId) {
        return res.status(400).json({ error: "reservationId es requerido para cargo a habitacion" });
      }
      const payment = await storage.createEventTablePayment({
        eventTableId: req.params.tableId,
        amount,
        method,
        isAdvance: isAdvance ? "true" : "false",
        reservationId: reservationId || null,
        paidAt: new Date(),
        createdAt: new Date(),
      });

      try {
        const evt = await storage.getEvent(req.params.eventId);
        const label = `Evento ${evt?.name || req.params.eventId} - Mesa ${table.tableName} - Pago ${method}`;
        await storage.registerCashMovement(
          "events", "event", req.params.eventId, label,
          method, String(amount), "income"
        );
      } catch (e) {
        console.error("Error registrando movimiento de caja:", e);
      }

      res.status(201).json(payment);
    } catch (error) {
      res.status(500).json({ error: "Error creating table payment" });
    }
  });

  app.get("/api/events/:eventId/tables/:tableId/summary", async (req, res) => {
    try {
      const table = await storage.getEventTable(req.params.tableId);
      if (!table) return res.status(404).json({ error: "Event table not found" });
      const totalCharges = table.charges.reduce((sum: number, c: any) => sum + parseFloat(c.total), 0);
      const totalPayments = table.payments.reduce((sum: number, p: any) => sum + parseFloat(p.amount), 0);
      res.json({
        totalCharges,
        totalPayments,
        balance: totalCharges - totalPayments,
        charges: table.charges,
        payments: table.payments,
      });
    } catch (error) {
      res.status(500).json({ error: "Error fetching table summary" });
    }
  });

  app.post("/api/events/:eventId/tables/:tableId/close", async (req, res) => {
    try {
      const { receiptType, customerRazonSocial, customerCuit, customerDni, vatCondition, pvOverride } = req.body;
      if (!receiptType) {
        return res.status(400).json({ error: "receiptType es requerido" });
      }

      // Normalise early for validation
      const normalizedReceiptType = receiptType === "Factura A" ? "factura_a"
        : receiptType === "Factura B" ? "factura_b"
        : receiptType === "Factura C" ? "factura_c"
        : receiptType;

      if (["factura_a", "factura_c"].includes(normalizedReceiptType) && !customerCuit?.trim()) {
        return res.status(400).json({ error: "El CUIT es obligatorio para Factura A/C" });
      }

      const table = await storage.getEventTable(req.params.tableId);
      if (!table) return res.status(404).json({ error: "Event table not found" });

      const totalCharges = table.charges.reduce((sum: number, c: any) => sum + parseFloat(c.total), 0);
      const totalPayments = table.payments.reduce((sum: number, p: any) => sum + parseFloat(p.amount), 0);
      const balance = totalCharges - totalPayments;

      if (balance > 0.01) {
        return res.status(400).json({
          error: "Saldo pendiente",
          message: `Saldo pendiente de $${balance.toFixed(2)}. Registre los pagos antes de cerrar.`,
        });
      }

      for (const payment of table.payments) {
        if (payment.method === "room_charge" && payment.reservationId) {
          const event = await storage.getEvent(req.params.eventId);
          await storage.createCharge({
            reservationId: payment.reservationId,
            description: `Eventos Mesa ${table.tableNumber} - ${event?.name || ""}`,
            amount: payment.amount,
            date: new Date().toISOString().split("T")[0],
            category: "events",
            createdBy: null,
          });
        }
      }

      await storage.updateEventTable(req.params.tableId, {
        status: "invoiced",
        receiptType: normalizedReceiptType,
        closedAt: new Date(),
      });

      // Emitir factura AFIP si se solicitó un comprobante fiscal
      let invoiceId: number | undefined;
      if (["factura_a", "factura_b", "factura_c"].includes(normalizedReceiptType)) {
        try {
          const tipo = normalizedReceiptType === "factura_a" ? "FA" : normalizedReceiptType === "factura_b" ? "FB" : "FC";
          const condicion = vatCondition || (normalizedReceiptType === "factura_a" ? "responsable_inscripto" : "consumidor_final");

          const invoiceItems: { descripcion: string; cantidad: number; precioUnitario: number; alicuotaIva: "21"; subtotalNeto: number; subtotal: number }[] = [];
          for (const charge of table.charges) {
            const gross = parseFloat(charge.total);
            if (gross <= 0.001) continue;
            const qty = charge.quantity || 1;
            const grossUnit = parseFloat((gross / qty).toFixed(2));
            const netUnit = parseFloat((grossUnit / 1.21).toFixed(4));
            const netTotal = parseFloat((netUnit * qty).toFixed(4));
            const grossTotal = parseFloat((grossUnit * qty).toFixed(2));
            invoiceItems.push({ descripcion: charge.description, cantidad: qty, precioUnitario: netUnit, alicuotaIva: "21" as const, subtotalNeto: netTotal, subtotal: grossTotal });
          }
          if (invoiceItems.length === 0) {
            const gross = parseFloat(totalCharges.toFixed(2));
            const net = parseFloat((gross / 1.21).toFixed(4));
            const event = await storage.getEvent(req.params.eventId);
            invoiceItems.push({ descripcion: `Evento Mesa ${table.tableNumber}${event ? " - " + event.name : ""}`, cantidad: 1, precioUnitario: net, alicuotaIva: "21" as const, subtotalNeto: net, subtotal: gross });
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
          // Persist the invoice link on the event table record
          await storage.updateEventTable(req.params.tableId, { invoiceId } as any);
        } catch (e) {
          console.error("[Billing] Error emitiendo factura Mesa Evento:", e);
        }
      }

      const updated = await storage.getEventTable(req.params.tableId);
      res.json({ ...updated, invoiceId });
    } catch (error) {
      res.status(500).json({ error: "Error closing table" });
    }
  });

  // Emit Nota de Crédito for the event main-folio AFIP invoice
  app.post("/api/events/:eventId/nc", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) return res.status(404).json({ error: "Evento no encontrado" });
      if (!(event as any).invoiceId) {
        return res.status(400).json({ error: "El evento no tiene una factura AFIP emitida" });
      }
      if ((event as any).ncId) {
        return res.status(400).json({ error: "Este evento ya tiene una Nota de Crédito emitida" });
      }

      const [originalInvoice] = await db.select().from(salesInvoices).where(eq(salesInvoices.id, (event as any).invoiceId));
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
        ncItems = [{ descripcion: `NC Evento ${event.name}`, cantidad: 1, precioUnitario: net, alicuotaIva: "21" as const, subtotalNeto: net, subtotal: gross }];
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

      await storage.updateEvent(req.params.eventId, { ncId: nc.id } as any);

      res.json({ ncId: nc.id, nc });
    } catch (e: any) {
      console.error("[Billing] Error emitiendo NC evento:", e);
      res.status(500).json({ error: e?.message || "Error al emitir la Nota de Crédito" });
    }
  });

  // Admin-only: reset ncId on an event so a new NC can be emitted after the previous one was voided
  app.patch("/api/events/:eventId/reset-nc", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user || user.role !== "admin") {
        return res.status(403).json({ error: "Solo un administrador puede restablecer el estado de NC" });
      }
      const event = await storage.getEvent(req.params.eventId);
      if (!event) return res.status(404).json({ error: "Evento no encontrado" });
      if (!(event as any).ncId) {
        return res.status(400).json({ error: "Este evento no tiene una NC emitida" });
      }
      await storage.updateEvent(req.params.eventId, { ncId: null } as any);
      const updated = await storage.getEvent(req.params.eventId);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Error al restablecer el estado de NC" });
    }
  });

  // Emit Nota de Crédito for a table-level AFIP invoice
  app.post("/api/events/:eventId/tables/:tableId/nc", requireAuth, async (req, res) => {
    try {
      const table = await storage.getEventTable(req.params.tableId);
      if (!table) return res.status(404).json({ error: "Mesa no encontrada" });
      if (!table.invoiceId) {
        return res.status(400).json({ error: "La mesa no tiene una factura AFIP emitida" });
      }
      if ((table as any).ncId) {
        return res.status(400).json({ error: "Esta mesa ya tiene una Nota de Crédito emitida" });
      }

      // Fetch original invoice
      const [originalInvoice] = await db.select().from(salesInvoices).where(eq(salesInvoices.id, table.invoiceId));
      if (!originalInvoice) return res.status(404).json({ error: "Factura original no encontrada" });

      // Determine NC tipo: FA→NCA, FB/FC→NCB
      const ncTipo: "NCA" | "NCB" = originalInvoice.tipoComprobante === "FA" ? "NCA" : "NCB";

      // Build NC items from original invoice items
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
        ncItems = [{ descripcion: `NC Mesa ${table.tableNumber}`, cantidad: 1, precioUnitario: net, alicuotaIva: "21" as const, subtotalNeto: net, subtotal: gross }];
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

      // Persist NC id on the table record
      await storage.updateEventTable(req.params.tableId, { ncId: nc.id } as any);

      res.json({ ncId: nc.id, nc });
    } catch (e: any) {
      console.error("[Billing] Error emitiendo NC mesa evento:", e);
      res.status(500).json({ error: e?.message || "Error al emitir la Nota de Crédito" });
    }
  });

  // Admin-only: reset ncId on a table so a new NC can be emitted after the previous one was voided
  app.patch("/api/events/:eventId/tables/:tableId/reset-nc", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user || user.role !== "admin") {
        return res.status(403).json({ error: "Solo un administrador puede restablecer el estado de NC de una mesa" });
      }
      const table = await storage.getEventTable(req.params.tableId);
      if (!table) return res.status(404).json({ error: "Mesa no encontrada" });
      if (!(table as any).ncId) {
        return res.status(400).json({ error: "Esta mesa no tiene una NC emitida" });
      }
      await storage.updateEventTable(req.params.tableId, { ncId: null } as any);
      const updated = await storage.getEventTable(req.params.tableId);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Error al restablecer el estado de NC de la mesa" });
    }
  });

  app.get("/api/events/:eventId/tables/:tableId/receipt-pdf", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });
      const table = await storage.getEventTable(req.params.tableId);
      if (!table) return res.status(404).json({ error: "Event table not found" });

      const pdfBuffer = await generateTableReceiptPdf(event.name, event.eventCode, {
        tableNumber: table.tableNumber,
        label: table.label ?? null,
        seats: table.seats ?? null,
        status: table.status,
        receiptType: table.receiptType ?? null,
        invoiceRef: (table as any).invoiceRef ?? null,
        ncId: (table as any).ncId ?? null,
        closedAt: table.closedAt ? String(table.closedAt) : null,
        charges: table.charges.map((c: any) => ({
          description: c.description,
          quantity: c.quantity,
          unitPrice: c.unitPrice,
          total: c.total,
        })),
        payments: table.payments.map((p: any) => ({
          amount: p.amount,
          method: p.method,
          isAdvance: p.isAdvance,
          paidAt: p.paidAt ? String(p.paidAt) : "",
        })),
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="comprobante-mesa-${table.tableNumber}-${event.eventCode}.pdf"`,
      );
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating table receipt PDF:", error);
      res.status(500).json({ error: "Error generating PDF" });
    }
  });

  app.post("/api/events/:eventId/tables/:tableId/receipt-email", requireAuth, async (req, res) => {
    try {
      const { to } = req.body;
      if (!to?.trim()) return res.status(400).json({ error: "El destinatario (to) es requerido" });

      const event = await storage.getEvent(req.params.eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });
      const table = await storage.getEventTable(req.params.tableId);
      if (!table) return res.status(404).json({ error: "Event table not found" });

      const pdfBuffer = await generateTableReceiptPdf(event.name, event.eventCode, {
        tableNumber: table.tableNumber,
        label: table.label ?? null,
        seats: table.seats ?? null,
        status: table.status,
        receiptType: table.receiptType ?? null,
        invoiceRef: (table as any).invoiceRef ?? null,
        ncId: (table as any).ncId ?? null,
        closedAt: table.closedAt ? String(table.closedAt) : null,
        charges: table.charges.map((c: any) => ({
          description: c.description,
          quantity: c.quantity,
          unitPrice: c.unitPrice,
          total: c.total,
        })),
        payments: table.payments.map((p: any) => ({
          amount: p.amount,
          method: p.method,
          isAdvance: p.isAdvance,
          paidAt: p.paidAt ? String(p.paidAt) : "",
        })),
      });

      const tableLabel = `Mesa ${table.tableNumber}${table.label ? ` (${table.label})` : ""}`;
      const subject = `Comprobante ${tableLabel} — ${event.name}`;
      const body = `Estimado/a,\n\nAdjunto encontrará el comprobante correspondiente a la ${tableLabel} del evento "${event.name}".\n\nMaran Suites & Towers\nHotel & Spa — Paraná, Entre Ríos`;

      const result = await sendEmailWithPdfAttachment({
        to: to.trim(),
        subject,
        body,
        attachmentFilename: `comprobante-mesa-${table.tableNumber}-${event.eventCode}.pdf`,
        attachmentBuffer: pdfBuffer,
      });

      if (!result.ok) {
        return res.status(502).json({ error: result.error || "Error al enviar el email" });
      }

      res.json({ ok: true });
    } catch (error: any) {
      console.error("Error sending table receipt email:", error);
      res.status(500).json({ error: "Error al enviar el email" });
    }
  });

  app.get("/api/events/:eventId/tables-summary", async (req, res) => {
    try {
      const tables = await storage.getEventTables(req.params.eventId);
      const tableSummaries = tables.map((table: any) => {
        const totalCharges = table.charges.reduce((sum: number, c: any) => sum + parseFloat(c.total), 0);
        const totalPayments = table.payments.reduce((sum: number, p: any) => sum + parseFloat(p.amount), 0);
        return {
          id: table.id,
          tableNumber: table.tableNumber,
          label: table.label,
          seats: table.seats,
          status: table.status,
          receiptType: table.receiptType ?? null,
          invoiceRef: table.invoiceRef ?? null,
          ncId: (table as any).ncId ?? null,
          totalCharges,
          totalPayments,
          balance: totalCharges - totalPayments,
        };
      });
      const totalAll = tableSummaries.reduce((sum: number, t: any) => sum + t.totalCharges, 0);
      const paidAll = tableSummaries.reduce((sum: number, t: any) => sum + t.totalPayments, 0);
      const pendingTables = tableSummaries.filter((t: any) => t.status === "open").length;
      res.json({
        tables: tableSummaries,
        totalCharges: totalAll,
        totalPayments: paidAll,
        balance: totalAll - paidAll,
        pendingTables,
      });
    } catch (error) {
      res.status(500).json({ error: "Error fetching tables summary" });
    }
  });

  app.get("/api/events/:eventId/tables-summary-pdf", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });
      const tables = await storage.getEventTables(req.params.eventId);
      const tableRows = tables.map((table: any) => {
        const totalCharges = table.charges.reduce((sum: number, c: any) => sum + parseFloat(c.total), 0);
        const totalPayments = table.payments.reduce((sum: number, p: any) => sum + parseFloat(p.amount), 0);
        return {
          tableNumber: table.tableNumber,
          label: table.label ?? null,
          seats: table.seats ?? null,
          status: table.status,
          receiptType: table.receiptType ?? null,
          invoiceRef: table.invoiceRef ?? null,
          ncId: (table as any).ncId ?? null,
          totalCharges,
          totalPayments,
          balance: totalCharges - totalPayments,
        };
      });
      const pdfBuffer = await generateTablesResumenPdf(event.name, event.eventCode, tableRows);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="mesas-${event.eventCode}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating tables summary PDF:", error);
      res.status(500).json({ error: "Error generating PDF" });
    }
  });

  // PDF exports for events
  app.get("/api/events/:eventId/hoja-funcion-pdf", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });
      const pdfBuffer = await generateHojaFuncionPdf(event);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="hoja-funcion-${event.eventCode}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating hoja funcion PDF:", error);
      res.status(500).json({ error: "Error generating PDF" });
    }
  });

  app.get("/api/events/:eventId/confirmacion-pdf", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });
      const pdfBuffer = await generateConfirmacionEventoPdf(event);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="confirmacion-${event.eventCode}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating confirmacion PDF:", error);
      res.status(500).json({ error: "Error generating PDF" });
    }
  });
}

import type { Express } from "express";
import { storage } from "../db-storage";
import { requireAuth } from "../auth";
import { emitirFactura } from "../billing/invoiceService";
import { db } from "../db";
import { restaurantOrders } from "@shared/schema";
import { eq, and, not, inArray } from "drizzle-orm";

export function registerRestaurantRoutes(app: Express) {
  // Restaurant Areas
  app.get("/api/restaurant/areas", async (req, res) => {
    try {
      const areas = await storage.getRestaurantAreas();
      res.json(areas);
    } catch (error) {
      res.status(500).json({ error: "Error fetching areas" });
    }
  });

  app.post("/api/restaurant/areas", async (req, res) => {
    try {
      const area = await storage.createRestaurantArea(req.body);
      res.status(201).json(area);
    } catch (error) {
      res.status(500).json({ error: "Error creating area" });
    }
  });

  app.patch("/api/restaurant/areas/:id", async (req, res) => {
    try {
      const area = await storage.updateRestaurantArea(req.params.id, req.body);
      if (!area) return res.status(404).json({ error: "Area not found" });
      res.json(area);
    } catch (error) {
      res.status(500).json({ error: "Error updating area" });
    }
  });

  app.delete("/api/restaurant/areas/:id", async (req, res) => {
    try {
      await storage.deleteRestaurantArea(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting area" });
    }
  });

  // Restaurant Tables
  app.get("/api/restaurant/tables", async (req, res) => {
    try {
      const tables = await storage.getRestaurantTables();
      res.json(tables);
    } catch (error) {
      res.status(500).json({ error: "Error fetching tables" });
    }
  });

  app.post("/api/restaurant/tables", async (req, res) => {
    try {
      const table = await storage.createRestaurantTable(req.body);
      res.status(201).json(table);
    } catch (error) {
      res.status(500).json({ error: "Error creating table" });
    }
  });

  app.patch("/api/restaurant/tables/:id", async (req, res) => {
    try {
      const table = await storage.updateRestaurantTable(req.params.id, req.body);
      if (!table) return res.status(404).json({ error: "Table not found" });
      res.json(table);
    } catch (error) {
      res.status(500).json({ error: "Error updating table" });
    }
  });

  app.delete("/api/restaurant/tables/:id", async (req, res) => {
    try {
      await storage.deleteRestaurantTable(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting table" });
    }
  });

  // Menu Categories
  app.get("/api/restaurant/menu/categories", async (req, res) => {
    try {
      const categories = await storage.getMenuCategories();
      res.json(categories);
    } catch (error) {
      res.status(500).json({ error: "Error fetching menu categories" });
    }
  });

  app.post("/api/restaurant/menu/categories", async (req, res) => {
    try {
      const category = await storage.createMenuCategory(req.body);
      res.status(201).json(category);
    } catch (error) {
      res.status(500).json({ error: "Error creating category" });
    }
  });

  app.patch("/api/restaurant/menu/categories/:id", async (req, res) => {
    try {
      const category = await storage.updateMenuCategory(req.params.id, req.body);
      if (!category) return res.status(404).json({ error: "Category not found" });
      res.json(category);
    } catch (error) {
      res.status(500).json({ error: "Error updating category" });
    }
  });

  app.delete("/api/restaurant/menu/categories/:id", async (req, res) => {
    try {
      await storage.deleteMenuCategory(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting category" });
    }
  });

  // Menu Items
  app.get("/api/restaurant/menu/items", async (req, res) => {
    try {
      const items = await storage.getMenuItems();
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Error fetching menu items" });
    }
  });

  app.post("/api/restaurant/menu/items", async (req, res) => {
    try {
      const item = await storage.createMenuItem(req.body);
      res.status(201).json(item);
    } catch (error) {
      res.status(500).json({ error: "Error creating menu item" });
    }
  });

  app.patch("/api/restaurant/menu/items/:id", async (req, res) => {
    try {
      const item = await storage.updateMenuItem(req.params.id, req.body);
      if (!item) return res.status(404).json({ error: "Item not found" });
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: "Error updating menu item" });
    }
  });

  app.delete("/api/restaurant/menu/items/:id", async (req, res) => {
    try {
      await storage.deleteMenuItem(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting menu item" });
    }
  });

  // Restaurant Orders
  app.get("/api/restaurant/orders", async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;
      // Auto-close stale orders (sin filtros = plano de mesas): cierra viejas y libera mesas
      if (!status && !from && !to) {
        await storage.closeStaleOrders().catch(e => console.error("[closeStaleOrders]", e));
      }
      const orders = await storage.getRestaurantOrders(status as any, from, to);
      const ordersWithSplits = await Promise.all(
        orders.map(async (order: any) => {
          const splits = await storage.getOrderSplits(order.id);
          return { ...order, splits };
        })
      );
      res.json(ordersWithSplits);
    } catch (error) {
      res.status(500).json({ error: "Error fetching orders" });
    }
  });

  app.get("/api/restaurant/orders/:id", async (req, res) => {
    try {
      const order = await storage.getRestaurantOrder(req.params.id);
      if (!order) return res.status(404).json({ error: "Order not found" });
      res.json(order);
    } catch (error) {
      res.status(500).json({ error: "Error fetching order" });
    }
  });

  app.post("/api/restaurant/orders", async (req, res) => {
    try {
      const { waiterName, tableId, areaId, orderLabel } = req.body;
      if (!waiterName || !waiterName.trim()) {
        return res.status(400).json({ error: "Mozo es requerido" });
      }
      if (!tableId && !areaId) {
        return res.status(400).json({ error: "Se requiere mesa o area" });
      }
      if (!tableId && (!orderLabel || !orderLabel.trim())) {
        return res.status(400).json({ error: "Etiqueta de orden es requerida para areas sin mesas" });
      }
      // Auto-cerrar órdenes activas previas de la misma mesa (mismo día) para evitar
      // que consumos de una sesión anterior aparezcan al abrir la mesa de nuevo.
      if (tableId) {
        const staleForTable = await db
          .select({ id: restaurantOrders.id })
          .from(restaurantOrders)
          .where(
            and(
              eq(restaurantOrders.tableId, tableId),
              not(inArray(restaurantOrders.status, ["closed", "cancelled"] as any[]))
            )
          );
        if (staleForTable.length > 0) {
          const staleIds = staleForTable.map(o => o.id);
          await db
            .update(restaurantOrders)
            .set({ status: "closed" as any })
            .where(inArray(restaurantOrders.id, staleIds));
        }
      }
      const orderNumber = storage.generateOrderNumber();
      const order = await storage.createRestaurantOrder({
        ...req.body,
        orderNumber,
        openedAt: new Date(),
      });
      if (order.tableId) {
        await storage.updateRestaurantTable(order.tableId, { status: "occupied" });
      }
      res.status(201).json(order);
    } catch (error) {
      res.status(500).json({ error: "Error creating order" });
    }
  });

  app.patch("/api/restaurant/orders/:id", async (req, res) => {
    try {
      const order = await storage.updateRestaurantOrder(req.params.id, req.body);
      if (!order) return res.status(404).json({ error: "Order not found" });
      res.json(order);
    } catch (error) {
      res.status(500).json({ error: "Error updating order" });
    }
  });

  // Close order and optionally charge to room
  app.post("/api/restaurant/orders/:id/close", async (req, res) => {
    try {
      const order = await storage.getRestaurantOrder(req.params.id);
      if (!order) return res.status(404).json({ error: "Order not found" });

      const { chargeToRoom, roomNumber, reservationId, roomReservationId, receiptType, paymentMethod, discount, discountType, ccEntityType, ccEntityId, emitInvoice, vatCondition, customerRazonSocial, customerCuit, puntoVenta: pvOverride, reservationAdvanceCredit } = req.body;
      const effectiveReservationId = reservationId || roomReservationId;
      const isRoomCharge = chargeToRoom || receiptType === "cuenta_habitacion" || paymentMethod === "cuenta_habitacion";
      const effectivePaymentMethod = isRoomCharge ? "room_charge" : (paymentMethod || "cash");

      let finalTotal = parseFloat(order.total || "0");
      let discountAmount = 0;
      if (discount && discount > 0) {
        if (discountType === "percent") {
          discountAmount = finalTotal * discount / 100;
        } else {
          discountAmount = discount;
        }
        finalTotal = Math.max(0, finalTotal - discountAmount);
      }

      // Apply reservation advance credit (pre-paid deposits)
      const advanceCredit = parseFloat(String(reservationAdvanceCredit || 0)) || 0;
      if (advanceCredit > 0) {
        finalTotal = Math.max(0, finalTotal - advanceCredit);
      }

      const updatedOrder = await storage.updateRestaurantOrder(req.params.id, {
        status: "closed",
        closedAt: new Date(),
        chargedToRoom: isRoomCharge ? "true" : "false",
        roomNumber: roomNumber || null,
        receiptType: receiptType || null,
        paymentMethod: effectivePaymentMethod,
        total: String(finalTotal.toFixed(2)),
        notes: discountAmount > 0 ? `Descuento: $${discountAmount.toFixed(2)}` : undefined,
      });

      if (isRoomCharge && effectiveReservationId) {
        await storage.createCharge({
          reservationId: effectiveReservationId,
          description: `Restaurante - Pedido ${order.orderNumber}${discountAmount > 0 ? ` (Desc: $${discountAmount.toFixed(2)})` : ""}`,
          amount: String(finalTotal.toFixed(2)),
          category: "restaurant",
          date: new Date().toISOString().split("T")[0],
        });
      }

      if (order.tableId) {
        await storage.updateRestaurantTable(order.tableId, { status: "available" });
      }

      try {
        const label = `Pedido ${order.orderNumber}${order.tableId ? "" : " (sin mesa)"}${discountAmount > 0 ? ` (Desc: $${discountAmount.toFixed(2)})` : ""}`;
        await storage.registerCashMovement(
          "restaurant", "restaurant_order", req.params.id, label,
          effectivePaymentMethod,
          String(finalTotal.toFixed(2)), "income",
          undefined, receiptType
        );
      } catch (e) {
        console.error("Error registrando movimiento de caja:", e);
      }

      // Motor financiero: escribir al folio del pedido
      {
        const ordLabel = `Pedido ${order.orderNumber}${discountAmount > 0 ? ` (Desc: $${discountAmount.toFixed(2)})` : ""}`;
        storage.addFolioCharge(
          "restaurant_order", req.params.id,
          parseFloat(order.total || "0"),
          ordLabel,
          "restaurant_order", req.params.id,
          (req as any).user?.username,
        ).then(() => storage.addFolioPayment(
          "restaurant_order", req.params.id,
          finalTotal,
          `Cobro — ${effectivePaymentMethod}`,
          effectivePaymentMethod, "restaurant_payment", req.params.id,
          undefined, (req as any).user?.username, receiptType,
        )).catch(e => console.error("[Folio] Error restaurant:", e));
      }

      // Si es cuenta corriente y hay entidad especificada, crear movimiento CC
      if (paymentMethod === "cuenta_corriente" && ccEntityType && ccEntityId) {
        try {
          const today = new Date().toISOString().split("T")[0];
          const label = `Restaurante - Pedido ${order.orderNumber}${discountAmount > 0 ? ` (Desc: $${discountAmount.toFixed(2)})` : ""}`;
          await storage.createAccountMovement({
            entityType: ccEntityType as "company" | "agency",
            entityId: ccEntityId,
            date: today,
            type: "cargo",
            description: label,
            amount: String(finalTotal.toFixed(2)),
          });
        } catch (e) {
          console.error("Error creando movimiento CC para restaurant:", e);
        }
      }

      // Mark reservation advances as applied to this order
      // Use the order's openedAt date (not today) to correctly find advances for multi-day orders.
      if (advanceCredit > 0 && order.tableId) {
        try {
          const orderDate = order.openedAt
            ? new Date(order.openedAt).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })
            : new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
          const tableAdvances = await storage.getReservationAdvancesByTable(order.tableId, orderDate);
          for (const adv of tableAdvances.filter(a => !a.appliedToOrderId)) {
            await (storage as any).applyReservationAdvancesToOrder(adv.reservationId, req.params.id);
          }
        } catch (e) {
          console.error("[Advances] Error aplicando adelantos al cierre:", e);
        }
      }

      // Obtener ítems del pedido (necesario tanto para la factura como para el stock)
      const orderItemsList = await storage.getOrderItems(req.params.id);

      // Emitir factura AFIP si se solicitó
      let invoiceId: number | undefined;
      if (emitInvoice && ["factura_a", "factura_b", "factura_c"].includes(receiptType || "")) {
        try {
          const tipo = receiptType === "factura_a" ? "FA" : receiptType === "factura_b" ? "FB" : "FC";
          const condicion = vatCondition || (receiptType === "factura_a" ? "responsable_inscripto" : "consumidor_final");

          // Construir ítems de factura: una línea por ítem del pedido
          const originalTotal = parseFloat(order.total || "0");
          const scaleFactor = originalTotal > 0 ? finalTotal / originalTotal : 1;

          const invoiceItems: { descripcion: string; cantidad: number; precioUnitario: number; alicuotaIva: "21"; subtotalNeto: number; subtotal: number }[] = [];

          for (const item of orderItemsList) {
            const menuItem = await storage.getMenuItem(item.menuItemId);
            // Nombre: customName en notes (entre corchetes) > nombre del ítem de menú > fallback
            let itemName = menuItem?.name || "Ítem";
            const notesMatch = (item.notes || "").match(/^\[(.+?)\]/);
            if (notesMatch) itemName = notesMatch[1];

            const grossItem = parseFloat(item.subtotal || "0") * scaleFactor;
            if (grossItem <= 0.001) continue;

            const qty = item.quantity || 1;
            const grossUnit = parseFloat((grossItem / qty).toFixed(2));
            const netUnit = parseFloat((grossUnit / 1.21).toFixed(4));
            const grossTotal = parseFloat((grossUnit * qty).toFixed(2));
            const netTotal = parseFloat((netUnit * qty).toFixed(4));

            invoiceItems.push({ descripcion: itemName, cantidad: qty, precioUnitario: netUnit, alicuotaIva: "21" as const, subtotalNeto: netTotal, subtotal: grossTotal });
          }

          // Fallback: línea única si no hay ítems válidos
          if (invoiceItems.length === 0) {
            const advLbl = advanceCredit > 0 ? ` (Seña: $${advanceCredit.toFixed(2)})` : "";
            const discLbl = discountAmount > 0 ? ` (Desc: $${discountAmount.toFixed(2)})` : "";
            const gross = parseFloat(finalTotal.toFixed(2));
            const net = parseFloat((gross / 1.21).toFixed(4));
            invoiceItems.push({ descripcion: `Consumiciones Restaurante — Pedido ${order.orderNumber}${discLbl}${advLbl}`, cantidad: 1, precioUnitario: net, alicuotaIva: "21" as const, subtotalNeto: net, subtotal: gross });
          }

          const invoice = await emitirFactura({
            tipoComprobante: tipo as "FA" | "FB" | "FC",
            cliente: {
              razonSocial: customerRazonSocial || "CONSUMIDOR FINAL",
              cuit: customerCuit || undefined,
              condicionIva: condicion,
            },
            items: invoiceItems,
            operador: (req as any).user?.fullName || (req as any).user?.username,
            puntoVentaOverride: pvOverride ? parseInt(pvOverride) : undefined,
          });
          invoiceId = invoice.id;
        } catch (e) {
          console.error("[Billing] Error emitiendo factura restaurant:", e);
        }
      }

      try {
        const stockResult = await storage.deductStockFromOrder(
          req.params.id,
          orderItemsList.map(i => ({ menuItemId: i.menuItemId, quantity: i.quantity }))
        );
        if (stockResult.warnings.length > 0) {
          console.warn(`[Stock] Advertencias en orden ${req.params.id}:`, stockResult.warnings);
        }
        return res.json({ ...updatedOrder, stockDeducted: stockResult.deducted, stockWarnings: stockResult.warnings, invoiceId });
      } catch (stockError) {
        console.error("[Stock] Error en descuento automático:", stockError);
        return res.json({ ...updatedOrder, invoiceId });
      }
    } catch (error) {
      res.status(500).json({ error: "Error closing order" });
    }
  });

  // Order Items
  app.post("/api/restaurant/orders/:orderId/items", async (req, res) => {
    try {
      const { menuItemId, quantity, notes, course, customPrice, customName } = req.body;
      const menuItem = await storage.getMenuItem(menuItemId);
      if (!menuItem) return res.status(404).json({ error: "Menu item not found" });

      const order = await storage.getRestaurantOrder(req.params.orderId);
      if (!order) return res.status(404).json({ error: "Order not found" });

      let finalCustomPrice = undefined;
      let finalCustomName = undefined;
      if (customPrice || customName) {
        if ((menuItem as any).isEditable !== "true") {
          return res.status(400).json({ error: "Este ítem no permite precio personalizado" });
        }
        if (customPrice) {
          const parsed = parseFloat(customPrice);
          if (isNaN(parsed) || parsed <= 0) {
            return res.status(400).json({ error: "El precio personalizado debe ser un número positivo" });
          }
          finalCustomPrice = parsed.toFixed(2);
        }
        finalCustomName = customName;
      }

      const unitPrice = finalCustomPrice || menuItem.price;
      const subtotal = (parseFloat(unitPrice) * (quantity || 1)).toFixed(2);
      const itemCourse = course || 1;
      const activeCourse = order.activeCourse || 1;
      const itemStatus = itemCourse <= activeCourse ? "pending" : "waiting_course";
      const itemNotes = customName ? `[${customName}] ${notes || ""}`.trim() : notes;

      const item = await storage.createOrderItem({
        orderId: req.params.orderId,
        menuItemId,
        quantity: quantity || 1,
        unitPrice,
        subtotal,
        notes: itemNotes,
        course: itemCourse,
        status: itemStatus,
      });

      const orderItems = await storage.getOrderItems(req.params.orderId);
      const total = orderItems.reduce((sum: number, i: any) => sum + parseFloat(i.subtotal), 0);
      const neto = parseFloat((total / 1.21).toFixed(2));
      const tax = parseFloat((total - neto).toFixed(2));
      await storage.updateRestaurantOrder(req.params.orderId, {
        subtotal: neto.toFixed(2),
        tax: tax.toFixed(2),
        total: total.toFixed(2),
        status: "in_progress",
      });

      res.status(201).json(item);
    } catch (error) {
      res.status(500).json({ error: "Error adding item to order" });
    }
  });

  // Advance course
  app.post("/api/restaurant/orders/:id/advance-course", async (req, res) => {
    try {
      const order = await storage.getRestaurantOrder(req.params.id);
      if (!order) return res.status(404).json({ error: "Order not found" });

      const currentCourse = order.activeCourse || 1;
      if (currentCourse >= 3) return res.status(400).json({ error: "Ya se alcanzó el último curso" });

      const newCourse = currentCourse + 1;
      await storage.updateRestaurantOrder(req.params.id, { activeCourse: newCourse });

      const orderItems = await storage.getOrderItems(req.params.id);
      let activated = 0;
      for (const item of orderItems) {
        if (item.course === newCourse && item.status === "waiting_course") {
          await storage.updateOrderItem(item.id, { status: "pending" });
          activated++;
        }
      }

      res.json({ activeCourse: newCourse, activatedItems: activated });
    } catch (error) {
      res.status(500).json({ error: "Error advancing course" });
    }
  });

  app.patch("/api/restaurant/orders/:orderId/items/:itemId", requireAuth, async (req, res) => {
    try {
      const { course } = req.body;
      const updated = await storage.updateOrderItem(req.params.itemId, { course: course !== undefined ? course : undefined });
      if (!updated) return res.status(404).json({ error: "Item no encontrado" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating order item:", error);
      res.status(500).json({ error: "Error actualizando ítem" });
    }
  });

  app.delete("/api/restaurant/orders/:orderId/items/:itemId", async (req, res) => {
    try {
      await storage.deleteOrderItem(req.params.itemId);

      const orderItems = await storage.getOrderItems(req.params.orderId);
      const total = orderItems.reduce((sum: number, i: any) => sum + parseFloat(i.subtotal), 0);
      const neto = parseFloat((total / 1.21).toFixed(2));
      const tax = parseFloat((total - neto).toFixed(2));
      await storage.updateRestaurantOrder(req.params.orderId, {
        subtotal: neto.toFixed(2),
        tax: tax.toFixed(2),
        total: total.toFixed(2),
      });

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error removing item from order" });
    }
  });

  // Table Reservations
  app.get("/api/restaurant/table-reservations", async (req, res) => {
    try {
      const { date } = req.query;
      if (date && typeof date === "string") {
        const tableReservations = await storage.getTableReservationsByDate(date);
        return res.json(tableReservations);
      }
      const tableReservations = await storage.getTableReservations();
      res.json(tableReservations);
    } catch (error) {
      res.status(500).json({ error: "Error fetching table reservations" });
    }
  });

  app.get("/api/restaurant/table-reservations/:id", async (req, res) => {
    try {
      const tableReservation = await storage.getTableReservation(req.params.id);
      if (!tableReservation) return res.status(404).json({ error: "Reservation not found" });
      res.json(tableReservation);
    } catch (error) {
      res.status(500).json({ error: "Error fetching table reservation" });
    }
  });

  app.post("/api/restaurant/table-reservations", async (req, res) => {
    try {
      const tableReservation = await storage.createTableReservation({
        ...req.body,
        createdAt: new Date(),
      });
      res.status(201).json(tableReservation);
    } catch (error) {
      res.status(500).json({ error: "Error creating table reservation" });
    }
  });

  app.patch("/api/restaurant/table-reservations/:id", async (req, res) => {
    try {
      const tableReservation = await storage.updateTableReservation(req.params.id, req.body);
      if (!tableReservation) return res.status(404).json({ error: "Reservation not found" });
      res.json(tableReservation);
    } catch (error) {
      res.status(500).json({ error: "Error updating table reservation" });
    }
  });

  app.delete("/api/restaurant/table-reservations/:id", async (req, res) => {
    try {
      await storage.deleteTableReservation(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting table reservation" });
    }
  });

  // Restaurant Time Slots
  app.get("/api/restaurant/time-slots", async (req, res) => {
    try {
      const slots = await storage.getRestaurantTimeSlots();
      res.json(slots);
    } catch (error) {
      res.status(500).json({ error: "Error fetching time slots" });
    }
  });

  app.post("/api/restaurant/time-slots", async (req, res) => {
    try {
      const slot = await storage.createRestaurantTimeSlot(req.body);
      res.status(201).json(slot);
    } catch (error) {
      res.status(500).json({ error: "Error creating time slot" });
    }
  });

  app.patch("/api/restaurant/time-slots/:id", async (req, res) => {
    try {
      const slot = await storage.updateRestaurantTimeSlot(req.params.id, req.body);
      if (!slot) return res.status(404).json({ error: "Time slot not found" });
      res.json(slot);
    } catch (error) {
      res.status(500).json({ error: "Error updating time slot" });
    }
  });

  app.delete("/api/restaurant/time-slots/:id", async (req, res) => {
    try {
      await storage.deleteRestaurantTimeSlot(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting time slot" });
    }
  });

  // Order Splits
  app.post("/api/restaurant/orders/:id/split", async (req, res) => {
    try {
      const order = await storage.getRestaurantOrder(req.params.id);
      if (!order) return res.status(404).json({ error: "Order not found" });
      if (order.status === "closed") return res.status(400).json({ error: "La orden ya está cerrada" });

      const existingSplits = await storage.getOrderSplits(req.params.id);
      if (existingSplits.length > 0) return res.status(400).json({ error: "La orden ya tiene una división activa" });

      const { parts } = req.body;
      if (!parts || parts < 2) return res.status(400).json({ error: "Se requieren al menos 2 partes" });

      const total = parseFloat(order.total || "0");
      const baseAmount = Math.floor(total / parts * 100) / 100;
      const remainder = total - baseAmount * parts;

      const splits = [];
      for (let i = 1; i <= parts; i++) {
        const amount = i === parts ? (baseAmount + remainder).toFixed(2) : baseAmount.toFixed(2);
        const split = await storage.createOrderSplit({
          orderId: req.params.id,
          splitNumber: i,
          amount,
          createdAt: new Date(),
        });
        splits.push(split);
      }

      res.status(201).json(splits);
    } catch (error) {
      res.status(500).json({ error: "Error splitting order" });
    }
  });

  app.get("/api/restaurant/orders/:id/split", async (req, res) => {
    try {
      const splits = await storage.getOrderSplits(req.params.id);
      res.json(splits);
    } catch (error) {
      res.status(500).json({ error: "Error fetching splits" });
    }
  });

  app.patch("/api/restaurant/orders/:id/split/:splitId", async (req, res) => {
    try {
      const { method, receiptType, roomReservationId, amount, emitInvoice, vatCondition, customerRazonSocial, customerCuit, puntoVenta: pvOverride } = req.body;

      // Allow updating just the amount (without paying)
      if (amount !== undefined && !method) {
        const split = await storage.updateOrderSplit(req.params.splitId, { amount: parseFloat(amount).toFixed(2) });
        return res.json(split);
      }

      if (!method) return res.status(400).json({ error: "Método de pago requerido" });

      const split = await storage.updateOrderSplit(req.params.splitId, {
        method,
        receiptType: receiptType || null,
        isPaid: "true",
        paidAt: new Date(),
      });
      if (!split) return res.status(404).json({ error: "Split not found" });

      // If charging to room, create the charge on the reservation
      if (method === "cuenta_habitacion" && roomReservationId) {
        const order = await storage.getRestaurantOrder(req.params.id);
        try {
          await storage.createCharge({
            reservationId: roomReservationId,
            description: `Restaurante - Pedido ${order?.orderNumber || req.params.id} (Parte ${split.splitNumber})`,
            amount: split.amount,
            category: "restaurant",
            date: new Date().toISOString().split("T")[0],
          });
        } catch (e) {
          console.error("Error creando cargo a habitación en split:", e);
        }
      }

      // Emitir factura AFIP si se solicitó
      let invoiceId: number | undefined;
      if (emitInvoice && ["factura_a", "factura_b", "factura_c"].includes(receiptType || "")) {
        try {
          const tipo = receiptType === "factura_a" ? "FA" : receiptType === "factura_b" ? "FB" : "FC";
          const condicion = vatCondition || (receiptType === "factura_a" ? "responsable_inscripto" : "consumidor_final");
          const splitOrder = await storage.getRestaurantOrder(req.params.id);
          const invoice = await emitirFactura({
            tipoComprobante: tipo as "FA" | "FB" | "FC",
            cliente: {
              razonSocial: customerRazonSocial || "CONSUMIDOR FINAL",
              cuit: customerCuit || undefined,
              condicionIva: condicion,
            },
            items: [{
              descripcion: `Restaurante — Pedido ${splitOrder?.orderNumber || req.params.id} (Parte ${split.splitNumber})`,
              cantidad: 1,
              precioUnitario: parseFloat((parseFloat(split.amount) / 1.21).toFixed(4)),
              alicuotaIva: "21" as const,
              subtotalNeto: parseFloat((parseFloat(split.amount) / 1.21).toFixed(4)),
              subtotal: parseFloat(split.amount),
            }],
            operador: (req as any).user?.fullName || (req as any).user?.username,
            puntoVentaOverride: pvOverride ? parseInt(pvOverride) : undefined,
          });
          invoiceId = invoice.id;
        } catch (e) {
          console.error("[Billing] Error emitiendo factura split restaurant:", e);
        }
      }

      const allSplits = await storage.getOrderSplits(req.params.id);
      const allPaid = allSplits.every((s: any) => s.isPaid === "true");

      if (allPaid) {
        const orderForClose = await storage.getRestaurantOrder(req.params.id);
        await storage.updateRestaurantOrder(req.params.id, {
          status: "closed",
          closedAt: new Date(),
          paymentMethod: method,
          receiptType: receiptType || null,
          chargedToRoom: method === "cuenta_habitacion" ? "true" : "false",
        });
        if (orderForClose?.tableId) {
          await storage.updateRestaurantTable(orderForClose.tableId, { status: "available" });
        }
      }

      res.json({ split, allPaid, invoiceId });
    } catch (error) {
      res.status(500).json({ error: "Error paying split" });
    }
  });

  app.delete("/api/restaurant/orders/:id/split", async (req, res) => {
    try {
      await storage.deleteOrderSplitsByOrder(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error cancelling split" });
    }
  });

  // Cancel order
  app.post("/api/restaurant/orders/:id/cancel", async (req, res) => {
    try {
      const order = await storage.getRestaurantOrder(req.params.id);
      if (!order) return res.status(404).json({ error: "Orden no encontrada" });
      if (order.status === "closed") return res.status(400).json({ error: "La orden ya está cerrada" });
      if (order.status === "cancelled") return res.status(400).json({ error: "La orden ya está cancelada" });

      const { reason } = req.body;
      if (!reason || !reason.trim()) return res.status(400).json({ error: "El motivo de cancelación es requerido" });

      await storage.updateRestaurantOrder(req.params.id, {
        status: "cancelled",
        cancellationReason: reason.trim(),
        closedAt: new Date(),
      } as any);

      if (order.tableId) {
        await storage.updateRestaurantTable(order.tableId, { status: "available" });
      }

      res.json({ ok: true });
    } catch (error) {
      console.error("Error cancelling order:", error);
      res.status(500).json({ error: "Error al cancelar la orden" });
    }
  });

  // Pay selected items (partial payment)
  app.post("/api/restaurant/orders/:id/pay-items", async (req, res) => {
    try {
      const {
        itemIds, method, receiptType, roomReservationId,
        emitInvoice, vatCondition, customerRazonSocial, customerCuit,
        ccEntityType, ccEntityId, discount, discountType, puntoVenta: pvOverride,
      } = req.body;

      if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ error: "Seleccioná al menos un ítem" });
      }
      if (!method) return res.status(400).json({ error: "Método de pago requerido" });

      const order = await storage.getRestaurantOrder(req.params.id);
      if (!order) return res.status(404).json({ error: "Orden no encontrada" });
      if (order.status === "closed") return res.status(400).json({ error: "La orden ya está cerrada" });

      const allItems = await storage.getOrderItems(req.params.id);
      const selectedItems = allItems.filter((i: any) => itemIds.includes(i.id) && !i.paid);
      if (selectedItems.length === 0) {
        return res.status(400).json({ error: "Los ítems seleccionados ya fueron cobrados o no existen" });
      }

      // Calculate amount with optional discount
      let subtotal = selectedItems.reduce((s: number, i: any) => s + parseFloat(i.subtotal || "0"), 0);
      if (discount) {
        const discNum = parseFloat(discount) || 0;
        const discAmount = discountType === "percent" ? subtotal * discNum / 100 : discNum;
        subtotal = Math.max(0, subtotal - discAmount);
      }
      const amount = subtotal.toFixed(2);

      // Mark selected items as paid
      for (const item of selectedItems) {
        await storage.updateOrderItem(item.id, { paid: true } as any);
      }

      // Register in caja (skip for room charges)
      if (method !== "cuenta_habitacion") {
        try {
          await storage.registerCashMovement(
            "restaurant", "restaurant_partial", req.params.id,
            `Restaurante — Pedido ${order.orderNumber} (cobro parcial)`,
            method, amount, "income",
            (req as any).user?.username, receiptType || "cierre_mesa"
          );
        } catch (e) {
          console.error("[pay-items] caja:", e);
        }
      }

      // If CC: account movement
      if (method === "cuenta_corriente" && ccEntityType && ccEntityId) {
        try {
          await storage.createAccountMovement({
            entityType: ccEntityType,
            entityId: ccEntityId,
            date: new Date().toISOString().split("T")[0],
            type: "cargo",
            description: `Restaurante — Pedido ${order.orderNumber} (pago parcial)`,
            amount,
            reference: `Orden: ${order.orderNumber}`,
            createdBy: (req as any).user?.id || null,
          } as any);
        } catch (e) {
          console.error("[pay-items] CC movement:", e);
        }
      }

      // If room charge
      if (method === "cuenta_habitacion" && roomReservationId) {
        try {
          await storage.createCharge({
            reservationId: roomReservationId,
            description: `Restaurante — Pedido ${order.orderNumber} (${selectedItems.length} ítem${selectedItems.length !== 1 ? "s" : ""})`,
            amount,
            category: "restaurant",
            date: new Date().toISOString().split("T")[0],
          });
        } catch (e) {
          console.error("[pay-items] room charge:", e);
        }
      }

      // Emit AFIP invoice if requested
      let invoiceId: number | undefined;
      if (emitInvoice && ["factura_a", "factura_b", "factura_c"].includes(receiptType || "")) {
        try {
          const tipo = receiptType === "factura_a" ? "FA" : receiptType === "factura_b" ? "FB" : "FC";
          const condicion = vatCondition || (receiptType === "factura_a" ? "responsable_inscripto" : "consumidor_final");
          const invoice = await emitirFactura({
            tipoComprobante: tipo as "FA" | "FB" | "FC",
            cliente: {
              razonSocial: customerRazonSocial || "CONSUMIDOR FINAL",
              cuit: customerCuit || undefined,
              condicionIva: condicion,
            },
            items: selectedItems.map((i: any) => ({
              descripcion: i.menuItem?.name || `Ítem restaurante`,
              cantidad: i.quantity || 1,
              precioUnitario: parseFloat((parseFloat(i.subtotal) / 1.21 / (i.quantity || 1)).toFixed(4)),
              alicuotaIva: "21" as const,
              subtotalNeto: parseFloat((parseFloat(i.subtotal) / 1.21).toFixed(4)),
              subtotal: parseFloat(i.subtotal),
            })),
            operador: (req as any).user?.fullName || (req as any).user?.username,
            puntoVentaOverride: pvOverride ? parseInt(pvOverride) : undefined,
          });
          invoiceId = invoice.id;
        } catch (e) {
          console.error("[pay-items] AFIP invoice:", e);
        }
      }

      // Recalculate order total from fresh data
      const freshItems = await storage.getOrderItems(req.params.id);
      const unpaidItems = freshItems.filter((i: any) => !i.paid);
      const newTotal = unpaidItems.reduce((s: number, i: any) => s + parseFloat(i.subtotal || "0"), 0);
      const newNeto = parseFloat((newTotal / 1.21).toFixed(2));
      const newTax = parseFloat((newTotal - newNeto).toFixed(2));
      const allPaid = unpaidItems.length === 0;

      if (allPaid) {
        await storage.updateRestaurantOrder(req.params.id, {
          status: "closed",
          closedAt: new Date(),
          paymentMethod: method,
          receiptType: receiptType || null,
          chargedToRoom: method === "cuenta_habitacion" ? "true" : "false",
          subtotal: "0",
          tax: "0",
          total: "0",
        });
        if (order.tableId) {
          await storage.updateRestaurantTable(order.tableId, { status: "available" });
        }
      } else {
        await storage.updateRestaurantOrder(req.params.id, {
          subtotal: newNeto.toFixed(2),
          tax: newTax.toFixed(2),
          total: newTotal.toFixed(2),
        });
      }

      res.json({ allPaid, invoiceId, amount, remainingTotal: newTotal.toFixed(2) });
    } catch (error) {
      console.error("[pay-items] Error:", error);
      res.status(500).json({ error: "Error al procesar pago por ítems" });
    }
  });

  // Transfer items between orders
  app.post("/api/restaurant/orders/:id/transfer-items", async (req, res) => {
    try {
      const sourceOrder = await storage.getRestaurantOrder(req.params.id);
      if (!sourceOrder) return res.status(404).json({ error: "Orden origen no encontrada" });
      if (sourceOrder.status === "closed") return res.status(400).json({ error: "La orden origen está cerrada" });

      const { itemIds, targetOrderId, newOrderData } = req.body;
      if (!itemIds || itemIds.length === 0) return res.status(400).json({ error: "Seleccioná al menos un ítem" });

      let finalTargetOrderId = targetOrderId;

      // If "new", create a new order first
      if (targetOrderId === "new") {
        if (!newOrderData?.waiterName) return res.status(400).json({ error: "Mozo requerido para nuevo ticket" });
        const orderNumber = storage.generateOrderNumber();
        const newOrder = await storage.createRestaurantOrder({
          ...newOrderData,
          orderNumber,
          openedAt: new Date(),
          status: "open",
        });
        if (newOrder.tableId) {
          await storage.updateRestaurantTable(newOrder.tableId, { status: "occupied" });
        }
        finalTargetOrderId = newOrder.id;
      } else {
        const target = await storage.getRestaurantOrder(finalTargetOrderId);
        if (!target) return res.status(404).json({ error: "Orden destino no encontrada" });
        if (target.status === "closed") return res.status(400).json({ error: "La orden destino está cerrada" });
      }

      // Move items
      await storage.moveOrderItems(itemIds, finalTargetOrderId);

      // Recalculate source order total
      const sourceItems = await storage.getOrderItems(req.params.id);
      const sourceTotal = sourceItems.reduce((s: number, i: any) => s + parseFloat(i.subtotal || "0"), 0);
      const sourceNeto = parseFloat((sourceTotal / 1.21).toFixed(2));
      const sourceTax = parseFloat((sourceTotal - sourceNeto).toFixed(2));
      await storage.updateRestaurantOrder(req.params.id, {
        subtotal: sourceNeto.toFixed(2),
        tax: sourceTax.toFixed(2),
        total: sourceTotal.toFixed(2),
      });

      // Recalculate target order total
      const targetItems = await storage.getOrderItems(finalTargetOrderId);
      const targetTotal = targetItems.reduce((s: number, i: any) => s + parseFloat(i.subtotal || "0"), 0);
      const targetNeto = parseFloat((targetTotal / 1.21).toFixed(2));
      const targetTax = parseFloat((targetTotal - targetNeto).toFixed(2));
      const updatedTarget = await storage.updateRestaurantOrder(finalTargetOrderId, {
        subtotal: targetNeto.toFixed(2),
        tax: targetTax.toFixed(2),
        total: targetTotal.toFixed(2),
      });

      res.json({ targetOrderId: finalTargetOrderId, targetOrder: updatedTarget });
    } catch (error) {
      console.error("Error transferring items:", error);
      res.status(500).json({ error: "Error al transferir ítems" });
    }
  });

  // Recipes
  app.get("/api/restaurant/recipes", async (req, res) => {
    try {
      const recipes = await storage.getRecipes();
      res.json(recipes);
    } catch (error) {
      res.status(500).json({ error: "Error fetching recipes" });
    }
  });

  app.get("/api/restaurant/recipes/:id", async (req, res) => {
    try {
      const recipe = await storage.getRecipe(req.params.id);
      if (!recipe) return res.status(404).json({ error: "Recipe not found" });
      res.json(recipe);
    } catch (error) {
      res.status(500).json({ error: "Error fetching recipe" });
    }
  });

  app.get("/api/restaurant/recipes/by-menu-item/:menuItemId", async (req, res) => {
    try {
      const recipe = await storage.getRecipeByMenuItem(req.params.menuItemId);
      res.json(recipe || null);
    } catch (error) {
      res.status(500).json({ error: "Error fetching recipe" });
    }
  });

  app.post("/api/restaurant/recipes", async (req, res) => {
    try {
      const recipe = await storage.createRecipe(req.body);
      res.status(201).json(recipe);
    } catch (error) {
      res.status(500).json({ error: "Error creating recipe" });
    }
  });

  app.patch("/api/restaurant/recipes/:id", async (req, res) => {
    try {
      const recipe = await storage.updateRecipe(req.params.id, req.body);
      if (!recipe) return res.status(404).json({ error: "Recipe not found" });
      res.json(recipe);
    } catch (error) {
      res.status(500).json({ error: "Error updating recipe" });
    }
  });

  app.delete("/api/restaurant/recipes/:id", async (req, res) => {
    try {
      await storage.deleteRecipe(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting recipe" });
    }
  });

  // Recipe Ingredients
  app.get("/api/restaurant/recipes/:recipeId/ingredients", async (req, res) => {
    try {
      const ingredients = await storage.getRecipeIngredients(req.params.recipeId);
      res.json(ingredients);
    } catch (error) {
      res.status(500).json({ error: "Error fetching ingredients" });
    }
  });

  app.post("/api/restaurant/recipes/:recipeId/ingredients", async (req, res) => {
    try {
      const ingredient = await storage.createRecipeIngredient({
        ...req.body,
        recipeId: req.params.recipeId,
      });
      res.status(201).json(ingredient);
    } catch (error) {
      res.status(500).json({ error: "Error creating ingredient" });
    }
  });

  app.patch("/api/restaurant/recipe-ingredients/:id", async (req, res) => {
    try {
      const ingredient = await storage.updateRecipeIngredient(req.params.id, req.body);
      if (!ingredient) return res.status(404).json({ error: "Ingredient not found" });
      res.json(ingredient);
    } catch (error) {
      res.status(500).json({ error: "Error updating ingredient" });
    }
  });

  app.delete("/api/restaurant/recipe-ingredients/:id", async (req, res) => {
    try {
      await storage.deleteRecipeIngredient(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting ingredient" });
    }
  });

  // ── Mozo / Cocina ────────────────────────────────────────────────────────

  // Enviar items pendientes a cocina (sentAt = now, status → preparing)
  app.post("/api/restaurant/orders/:id/send-kitchen", async (req, res) => {
    try {
      const order = await storage.getRestaurantOrder(req.params.id);
      if (!order) return res.status(404).json({ error: "Orden no encontrada" });
      if (order.status === "closed") return res.status(400).json({ error: "La orden está cerrada" });

      const items = await storage.getOrderItems(req.params.id);
      const unsent = items.filter((i: any) => !i.sentAt && i.status === "pending");
      if (unsent.length === 0) return res.status(400).json({ error: "No hay ítems pendientes de envío" });

      const now = new Date();
      await Promise.all(
        unsent.map((i: any) =>
          storage.updateOrderItem(i.id, { sentAt: now, status: "preparing" })
        )
      );

      const updated = await storage.getRestaurantOrder(req.params.id);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Error enviando a cocina" });
    }
  });

  // Pedir cuenta (cuentaPedida = true)
  app.post("/api/restaurant/orders/:id/pedir-cuenta", async (req, res) => {
    try {
      const order = await storage.getRestaurantOrder(req.params.id);
      if (!order) return res.status(404).json({ error: "Orden no encontrada" });

      const updated = await storage.updateRestaurantOrder(req.params.id, {
        cuentaPedida: true,
      } as any);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Error al pedir cuenta" });
    }
  });

  // Feed de cocina — órdenes activas con ítems enviados (KDS)
  app.get("/api/restaurant/kitchen", async (req, res) => {
    try {
      const [openOrders, inProgressOrders, tables] = await Promise.all([
        storage.getRestaurantOrders("open" as any),
        storage.getRestaurantOrders("in_progress" as any),
        storage.getRestaurantTables(),
      ]);

      const allActive = [...openOrders, ...inProgressOrders];

      const results = await Promise.all(
        allActive.map(async (order: any) => {
          const items = await storage.getOrderItems(order.id);
          const kitchenItems = (items as any[]).filter(
            (i) => i.sentAt !== null && !["served", "cancelled"].includes(i.status)
          );
          if (kitchenItems.length === 0) return null;

          const table = (tables as any[]).find((t) => t.id === order.tableId);
          const oldestSentAt = kitchenItems.reduce(
            (oldest: Date | null, i: any) => {
              const d = i.sentAt ? new Date(i.sentAt) : null;
              return d && (!oldest || d < oldest) ? d : oldest;
            },
            null as Date | null
          );

          return {
            ...order,
            tableNumber: table?.tableNumber || order.orderLabel || order.orderNumber,
            areaName: table?.area?.name || "",
            kitchenItems,
            oldestSentAt,
          };
        })
      );

      const filtered = results
        .filter(Boolean)
        .sort(
          (a: any, b: any) =>
            (a.oldestSentAt ? new Date(a.oldestSentAt).getTime() : 0) -
            (b.oldestSentAt ? new Date(b.oldestSentAt).getTime() : 0)
        );

      res.json(filtered);
    } catch (error) {
      res.status(500).json({ error: "Error fetching kitchen orders" });
    }
  });

  // Reservation Advances
  app.get("/api/restaurant/table-reservations/:id/advances", requireAuth, async (req, res) => {
    try {
      const advances = await storage.getReservationAdvances(req.params.id);
      res.json(advances);
    } catch (error) {
      res.status(500).json({ error: "Error fetching advances" });
    }
  });

  app.post("/api/restaurant/table-reservations/:id/advances", requireAuth, async (req, res) => {
    try {
      const { amount, paymentMethod, notes, receiptType, vatCondition, customerRazonSocial, customerCuit, puntoVenta: pvOverride } = req.body;
      // Generate voucher number ADV-YYYY-NNNN
      const year = new Date().getFullYear();
      const allAdvances = await storage.getReservationAdvances(req.params.id);
      const seq = String(allAdvances.length + 1).padStart(4, "0");
      const voucherNumber = `ADV-${year}-${seq}`;

      // Emit AFIP invoice if receipt type is factura
      let invoiceId: number | null = null;
      if (receiptType && ["factura_a", "factura_b", "factura_c"].includes(receiptType)) {
        try {
          const tipo = receiptType === "factura_a" ? "FA" : receiptType === "factura_b" ? "FB" : "FC";
          const condicion = vatCondition || (receiptType === "factura_a" ? "responsable_inscripto" : "consumidor_final");
          const amountNum = parseFloat(String(amount));
          const neto = parseFloat((amountNum / 1.21).toFixed(4));
          const invoice = await emitirFactura({
            tipoComprobante: tipo as "FA" | "FB" | "FC",
            cliente: {
              razonSocial: customerRazonSocial || "CONSUMIDOR FINAL",
              cuit: customerCuit || undefined,
              condicionIva: condicion,
            },
            items: [{
              descripcion: `Seña / Anticipo Reserva Restaurante — ${voucherNumber}`,
              cantidad: 1,
              precioUnitario: neto,
              alicuotaIva: "21" as const,
              subtotalNeto: neto,
              subtotal: amountNum,
            }],
            operador: (req as any).user?.fullName || (req as any).user?.username,
            puntoVentaOverride: pvOverride ? parseInt(pvOverride) : undefined,
          });
          invoiceId = invoice.id;
        } catch (e) {
          console.error("[Billing] Error emitiendo factura adelanto reserva:", e);
        }
      }

      const advance = await storage.createReservationAdvance({
        reservationId: req.params.id,
        amount: String(amount),
        paymentMethod: paymentMethod || "efectivo",
        voucherNumber,
        notes: notes || null,
        appliedToOrderId: null,
        invoiceId,
      });
      res.status(201).json({ ...advance, invoiceId });
    } catch (error) {
      res.status(500).json({ error: "Error creating advance" });
    }
  });

  app.delete("/api/restaurant/reservation-advances/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteReservationAdvance(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting advance" });
    }
  });

  app.post("/api/restaurant/table-reservations/:id/apply-advances", requireAuth, async (req, res) => {
    try {
      const { orderId } = req.body;
      if (!orderId) return res.status(400).json({ error: "orderId requerido" });
      await (storage as any).applyReservationAdvancesToOrder(req.params.id, orderId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Error applying advances" });
    }
  });

  // Advances for a table (used by close dialog to auto-apply credit)
  app.get("/api/restaurant/tables/:tableId/advances", requireAuth, async (req, res) => {
    try {
      const { date } = req.query;
      const advances = await storage.getReservationAdvancesByTable(req.params.tableId, date as string);
      res.json(advances);
    } catch (error) {
      res.status(500).json({ error: "Error fetching table advances" });
    }
  });
}

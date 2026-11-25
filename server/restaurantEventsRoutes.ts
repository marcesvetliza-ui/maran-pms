import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { getAppEnv } from "./app-env";
import { requireAuth, requirePermission } from "./auth";
import { storage } from "./db-storage";
import {
  restaurantEventInput,
  eventBookingInput,
  eventAdvanceInput,
  eventAssignmentInput,
} from "@shared/restaurant-events";
import * as service from "./restaurantEvents";
const error = (res: Response, e: any) =>
  res.status(e instanceof z.ZodError ? 400 : e.statusCode || 500).json({
    error:
      e instanceof z.ZodError
        ? e.issues[0]?.message
        : e.statusCode
          ? e.message
          : "No se pudo completar la operación. Podés reintentar.",
  });
export function registerRestaurantEventsRoutes(app: Express) {
  const prefix = "/api/restaurant/events",
    access = [requireAuth, requirePermission("sidebar:/restaurant")];
  app.use(prefix, (_req, res, next) =>
    getAppEnv() === "production"
      ? res.status(404).json({ error: "No disponible." })
      : next(),
  );
  app.get(prefix, ...access, async (_req, res) => {
    try {
      res.json(await service.listRestaurantEvents());
    } catch (e) {
      error(res, e);
    }
  });
  app.get(prefix + "/catalog", ...access, async (_req, res) => {
    try {
      res.json({
        areas: await storage.getRestaurantAreas(),
        items: await storage.getMenuItems(),
      });
    } catch (e) {
      error(res, e);
    }
  });
  app.get(prefix + "/orders/:orderId", ...access, async (req, res) => {
    try {
      res.json(await service.restaurantEventOrderContext(req.params.orderId));
    } catch (e) {
      error(res, e);
    }
  });
  app.post(
    prefix + "/orders/:orderId/document",
    ...access,
    async (req, res) => {
      try {
        res.json(
          await service.completeRestaurantEventFinalDocument(
            req.params.orderId,
          ),
        );
      } catch (e) {
        error(res, e);
      }
    },
  );
  app.get(prefix + "/:id", ...access, async (req, res) => {
    try {
      res.json(await service.restaurantEventDetail(req.params.id));
    } catch (e) {
      error(res, e);
    }
  });
  app.post(prefix, ...access, async (req, res) => {
    try {
      res.json(
        await service.createRestaurantEvent(
          restaurantEventInput.parse(req.body),
          req.user!.id,
        ),
      );
    } catch (e) {
      error(res, e);
    }
  });
  app.patch(prefix + "/:id", ...access, async (req, res) => {
    try {
      res.json(
        await service.updateRestaurantEvent(
          req.params.id,
          restaurantEventInput.parse(req.body),
          req.user!.id,
        ),
      );
    } catch (e) {
      error(res, e);
    }
  });
  app.post(prefix + "/:id/bookings", ...access, async (req, res) => {
    try {
      res.json(
        await service.createRestaurantEventBooking(
          req.params.id,
          eventBookingInput.parse(req.body),
          req.user!.id,
        ),
      );
    } catch (e) {
      error(res, e);
    }
  });
  app.patch(prefix + "/bookings/:id/tables", ...access, async (req, res) => {
    try {
      res.json(
        await service.assignRestaurantEventTables(
          req.params.id,
          eventAssignmentInput.parse(req.body),
          req.user!.id,
        ),
      );
    } catch (e) {
      error(res, e);
    }
  });
  app.post(prefix + "/bookings/:id/advances", ...access, async (req, res) => {
    try {
      const result = await service.collectRestaurantEventAdvance(
        req.params.id,
        eventAdvanceInput.parse(req.body),
        req.user!.id,
      );
      res.json({
        ...result,
        ...(await service.completeEventAdvanceDocument(result.id)),
      });
    } catch (e) {
      error(res, e);
    }
  });
  app.post(prefix + "/advances/:id/document", ...access, async (req, res) => {
    try {
      res.json(await service.completeEventAdvanceDocument(req.params.id));
    } catch (e) {
      error(res, e);
    }
  });
  app.post(prefix + "/bookings/:id/start", ...access, async (req, res) => {
    try {
      const input = z
        .object({ operationId: z.string().uuid() })
        .strict()
        .parse(req.body);
      res.json(
        await service.startRestaurantEventService(
          req.params.id,
          input.operationId,
          req.user!.id,
        ),
      );
    } catch (e) {
      error(res, e);
    }
  });
  app.post(prefix + "/bookings/:id/cancel", ...access, async (req, res) => {
    try {
      const input = z
        .object({
          operationId: z.string().uuid(),
          reason: z.string().trim().min(5).max(500),
        })
        .strict()
        .parse(req.body);
      res.json(
        await service.cancelRestaurantEventBooking(
          req.params.id,
          input.operationId,
          input.reason,
          req.user!.id,
        ),
      );
    } catch (e) {
      error(res, e);
    }
  });
  // Prevent the old editors from mutating event accounts behind their reservation ledger.
  const guard = async (req: Request, res: Response, next: NextFunction) => {
    if (
      ["GET", "HEAD", "OPTIONS"].includes(req.method) ||
      getAppEnv() === "production"
    )
      return next();
    try {
      const id = req.params.eventId || req.params.id;
      const found = await db.execute(
        req.baseUrl.startsWith("/api/events/")
          ? sql`SELECT 1 FROM restaurant_events WHERE event_id=${id}`
          : sql`SELECT 1 FROM restaurant_event_bookings WHERE reservation_id=${id}`,
      );
      if (found.rows.length)
        return res.status(409).json({
          error:
            "Gestioná esta reserva desde Evento restaurant para conservar mesas, anticipos y saldo.",
        });
      next();
    } catch (e) {
      error(res, e);
    }
  };

  app.use("/api/restaurant/orders/:id", async (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    try {
      const context = await service.restaurantEventOrderContext(req.params.id);
      if (!context) return next();
      if (["closed", "cancelled"].includes(context.orderStatus))
        return res
          .status(409)
          .json({ error: "La cuenta del evento ya está cerrada." });
      const path = req.path;
      if (
        /^\/(split|pay-items|transfer-items|cancel)(\/|$)/.test(path) ||
        (req.method === "PATCH" && path === "/")
      )
        return res.status(409).json({
          error:
            "Esta reserva tiene una cuenta compartida entre sus mesas. Usá Cerrar cuenta, con uno o varios medios de pago.",
        });
      const itemId = path.match(/^\/items\/([^/]+)$/)?.[1];
      if (
        itemId &&
        context.included_item_ids.includes(itemId) &&
        !(
          req.method === "PATCH" &&
          Object.keys(req.body).every((key) =>
            ["status", "notes"].includes(key),
          ) &&
          (!req.body.status ||
            [
              "pending",
              "preparing",
              "ready",
              "served",
              "waiting_course",
            ].includes(req.body.status))
        )
      )
        return res.status(409).json({
          error:
            "El menú contratado se conserva. Los consumos adicionales se cargan como nuevos artículos.",
        });
      next();
    } catch (e) {
      error(res, e);
    }
  });
  app.use(
    "/api/restaurant/reservation-advances/:id",
    async (req, res, next) => {
      if (req.method === "GET") return next();
      try {
        const found = await db.execute(
          sql`SELECT 1 FROM restaurant_event_collections WHERE advance_id=${req.params.id}`,
        );
        if (found.rows.length)
          return res.status(409).json({
            error:
              "El anticipo tiene un cobro registrado. Conservamos el movimiento para revisión de Administración.",
          });
        next();
      } catch (e) {
        error(res, e);
      }
    },
  );
  app.use("/api/events/:eventId", guard);
  app.use("/api/restaurant/table-reservations/:id", guard);
}

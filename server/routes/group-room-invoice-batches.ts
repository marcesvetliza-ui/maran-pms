import type { Express } from "express";
import { requireAuth, requirePermission } from "../auth";
import {
  previewRoomInvoiceBatch,
  prepareRoomInvoiceBatch,
  roomInvoiceBatchProgress,
  listRoomInvoiceBatches,
  finishZeroBatchCollection,
  retireUnstartedRoomInvoiceBatch,
} from "../groupRoomInvoiceBatch";

export function registerGroupRoomInvoiceBatchRoutes(app: Express) {
  const guards = [
    requireAuth,
    requirePermission("sidebar:/groups"),
    requirePermission("sidebar:/reservations"),
  ];
  const actor = (req: any) => String(req.user?.id || req.user?.username || "");
  const route =
    (handler: (req: any) => Promise<any>) => async (req: any, res: any) => {
      try {
        res.json(await handler(req));
      } catch (e: any) {
        res
          .status(e.statusCode || 500)
          .json({
            error: e.message,
            ...(e.notApplied === true ? { notApplied: true } : {}),
          });
      }
    };
  app.get(
    "/api/groups/:groupId/room-invoice-batches",
    ...guards,
    route((req) => listRoomInvoiceBatches(req.params.groupId)),
  );
  app.post(
    "/api/groups/:groupId/room-invoice-batches/preview",
    ...guards,
    route((req) => previewRoomInvoiceBatch(req.params.groupId, req.body)),
  );
  app.post(
    "/api/groups/:groupId/room-invoice-batches",
    ...guards,
    route((req) =>
      prepareRoomInvoiceBatch(req.params.groupId, req.body, actor(req)),
    ),
  );
  app.get(
    "/api/groups/:groupId/room-invoice-batches/:id",
    ...guards,
    route((req) =>
      roomInvoiceBatchProgress(req.params.groupId, req.params.id, actor(req)),
    ),
  );
  app.post(
    "/api/groups/:groupId/room-invoice-batches/:id/collection",
    ...guards,
    route((req) =>
      finishZeroBatchCollection(req.params.groupId, req.params.id, actor(req)),
    ),
  );
  app.post(
    "/api/groups/:groupId/room-invoice-batches/:id/retire",
    ...guards,
    route((req) =>
      retireUnstartedRoomInvoiceBatch(
        req.params.groupId,
        req.params.id,
        actor(req),
      ),
    ),
  );
}

import type { Express } from "express";
import { hasCanonicalRoomType, isRoomAvailableForInterval } from "@shared/room-availability";
import { createHash } from "node:crypto";
import archiver from "archiver";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform, type Writable } from "node:stream";
import { storage, getArgentinaToday } from "../db-storage";
import { audit } from "../audit";
import { requireRole } from "../auth";
import { db } from "../db";
import { reservations, rooms as roomsTable, guests, guestPreferences, charges, payments, hospitalityAlerts, reservationCompanions, roomTypes as roomTypesTable, bedTypes } from "@shared/schema";
import type { RoomTypeReferenceSource } from "@shared/schema";
import { eq, inArray, and, or, ne, sql } from "drizzle-orm";
import { loadReservationOperationalBalances } from "../reservation-operational-balances";

const ROOMS_WRITE_ROLES = ["admin", "manager", "ama_de_llaves", "resp_deposito", "resp_administracion", "jefe_recepcion", "comercial"] as [string, ...string[]];
const RATES_WRITE_ROLES = ["admin", "manager"] as [string, ...string[]];
const ROOM_TYPE_ADMIN_ROLES = ["admin", "manager"] as [string, ...string[]];
const ROOM_TYPE_REFERENCE_EXPORT_PAGE_SIZE = 250;
const ROOM_TYPE_REFERENCE_EXPORT_MAX_CSV_BYTES = 256 * 1024 * 1024;
const ROOM_TYPE_REFERENCE_EXPORT_MAX_ZIP_BYTES = 300 * 1024 * 1024;
const ROOM_TYPE_REFERENCE_SOURCES: RoomTypeReferenceSource[] = [
  "rooms",
  "rate_plans",
  "reservations",
  "reservation_history",
  "group_room_blocks",
  "packages",
  "package_room_prices",
];

class RoomTypeExportLimitError extends Error {
  constructor(fileType: "CSV" | "ZIP", maxBytes: number) {
    super(`La evidencia excede el límite de ${fileType} de ${maxBytes} bytes`);
    this.name = "RoomTypeExportLimitError";
  }
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error("Descarga cancelada");
}

function writeChunk(stream: Writable, chunk: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      stream.off("error", onError);
      stream.off("drain", onDrain);
      signal.removeEventListener("abort", onAbort);
    };
    const resolveOnce = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onError = (error: Error) => rejectOnce(error);
    const onDrain = () => resolveOnce();
    const onAbort = () => rejectOnce(abortReason(signal));

    if (signal.aborted) {
      onAbort();
      return;
    }

    stream.once("error", onError);
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      if (stream.write(chunk, "utf8")) {
        resolveOnce();
      } else {
        stream.once("drain", onDrain);
      }
    } catch (error) {
      rejectOnce(error);
    }
  });
}

function finishWritable(stream: Writable, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      stream.off("error", onError);
      stream.off("finish", onFinish);
      signal.removeEventListener("abort", onAbort);
    };
    const resolveOnce = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onError = (error: Error) => rejectOnce(error);
    const onFinish = () => resolveOnce();
    const onAbort = () => rejectOnce(abortReason(signal));

    if (signal.aborted) {
      onAbort();
      return;
    }

    stream.once("error", onError);
    stream.once("finish", onFinish);
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      stream.end();
    } catch (error) {
      rejectOnce(error);
    }
  });
}

export function registerRoomsRoutes(app: Express) {
  // Room Types
  app.get("/api/room-types", async (req, res) => {
    try {
      const roomTypes = await storage.getRoomTypes();
      res.json(roomTypes);
    } catch (error) {
      res.status(500).json({ error: "Error fetching room types" });
    }
  });

  // Diagnostic endpoint for legacy rows created before room-type references
  // were protected. It intentionally exposes the source/count so an admin
  // can resolve each orphan without guessing which records are affected.
  app.get("/api/room-types/integrity", requireRole(ROOM_TYPE_ADMIN_ROLES), async (_req, res) => {
    try {
      res.json({ orphanedReferences: await storage.getOrphanedRoomTypeReferences() });
    } catch (error) {
      res.status(500).json({ error: "Error checking room type references" });
    }
  });

  app.get("/api/room-types/integrity/preview", requireRole(ROOM_TYPE_ADMIN_ROLES), async (req, res) => {
    const { roomTypeId, source, limit } = req.query;
    const requestedSource = typeof source === "string" ? source : "";
    if (
      typeof roomTypeId !== "string" ||
      !roomTypeId ||
      !ROOM_TYPE_REFERENCE_SOURCES.includes(requestedSource as RoomTypeReferenceSource)
    ) {
      return res.status(400).json({ error: "roomTypeId y source válidos son requeridos" });
    }

    const parsedLimit = limit === undefined ? 50 : Number(limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      return res.status(400).json({ error: "limit debe ser un entero entre 1 y 100" });
    }

    try {
      const preview = await storage.getRoomTypeReferencePreview(
        roomTypeId,
        requestedSource as RoomTypeReferenceSource,
        parsedLimit,
      );
      res.json(preview);
    } catch (error) {
      res.status(500).json({ error: "Error cargando la vista previa de referencias" });
    }
  });

  app.get("/api/room-types/integrity/export", requireRole(ROOM_TYPE_ADMIN_ROLES), async (req, res) => {
    const { roomTypeId, source, format } = req.query;
    const requestedSource = typeof source === "string" ? source : "";
    const requestedFormat = format === "csv" ? "csv" : "zip";
    if (
      typeof roomTypeId !== "string" ||
      !roomTypeId ||
      !ROOM_TYPE_REFERENCE_SOURCES.includes(requestedSource as RoomTypeReferenceSource)
    ) {
      return res.status(400).json({ error: "roomTypeId y source válidos son requeridos" });
    }

    const safeRoomTypeId = roomTypeId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "desconocido";
    const csvFilename = `evidencia_tipo_habitacion_${safeRoomTypeId}_${requestedSource}.csv`;
    const zipFilename = `evidencia_tipo_habitacion_${safeRoomTypeId}_${requestedSource}_certificada.zip`;

    const csvCell = (value: unknown) => {
      const text = String(value ?? "");
      const safeText = /^[\u0000-\u0020]*[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safeText.replaceAll('"', '""')}"`;
    };

    const abortController = new AbortController();
    let requestAborted = false;
    let csvStream: ReturnType<typeof createWriteStream> | undefined;
    let archive: ReturnType<typeof archiver> | undefined;
    let tempDir: string | undefined;
    const abortExport = () => {
      requestAborted = true;
      if (!abortController.signal.aborted) {
        abortController.abort(new Error("Descarga cancelada por el cliente"));
      }
      csvStream?.destroy();
      archive?.abort();
    };
    const onResponseClose = () => {
      if (!res.writableEnded) abortExport();
    };
    const cleanupExportResources = async () => {
      csvStream?.destroy();
      csvStream = undefined;
      if (archive && !archive.destroyed) archive.abort();
      archive = undefined;
      if (tempDir) {
        const directoryToRemove = tempDir;
        try {
          await rm(directoryToRemove, { recursive: true, force: true, maxRetries: 3, retryDelay: 25 });
          if (tempDir === directoryToRemove) tempDir = undefined;
        } catch (cleanupError) {
          console.error("[room-type-integrity-export] cleanup error:", cleanupError);
        }
      }
    };
    req.once("aborted", abortExport);
    res.once("close", onResponseClose);

    try {
      let offset = 0;
      let recordCount = 0;
      let csvBytes = 0;
      const csvHash = requestedFormat === "zip" ? createHash("sha256") : undefined;
      let page = await storage.getRoomTypeReferenceExportPage(
        roomTypeId,
        requestedSource as RoomTypeReferenceSource,
        offset,
        ROOM_TYPE_REFERENCE_EXPORT_PAGE_SIZE,
      );

      const csvHeader = "\uFEFFIdentificador técnico,Etiqueta legible\n";
      if (requestedFormat === "csv") {
        res.status(200);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${csvFilename}"`);
        res.setHeader("Cache-Control", "no-store");
        csvBytes += Buffer.byteLength(csvHeader, "utf8");
        if (csvBytes > ROOM_TYPE_REFERENCE_EXPORT_MAX_CSV_BYTES) {
          throw new RoomTypeExportLimitError("CSV", ROOM_TYPE_REFERENCE_EXPORT_MAX_CSV_BYTES);
        }
        await writeChunk(res, csvHeader, abortController.signal);
      } else {
        tempDir = await mkdtemp(join(tmpdir(), "room-type-integrity-"));
        csvStream = createWriteStream(join(tempDir, csvFilename), { flags: "wx", mode: 0o600 });
        csvStream.on("error", (error) => {
          if (!abortController.signal.aborted) {
            abortController.abort(error);
          }
        });
        csvBytes += Buffer.byteLength(csvHeader, "utf8");
        if (csvBytes > ROOM_TYPE_REFERENCE_EXPORT_MAX_CSV_BYTES) {
          throw new RoomTypeExportLimitError("CSV", ROOM_TYPE_REFERENCE_EXPORT_MAX_CSV_BYTES);
        }
        await writeChunk(csvStream, csvHeader, abortController.signal);
        csvHash!.update(csvHeader, "utf8");
      }

      while (true) {
        for (const record of page.records) {
          const row = `${csvCell(record.id)},${csvCell(record.label)}\n`;
          const rowBytes = Buffer.byteLength(row, "utf8");
          if (csvBytes + rowBytes > ROOM_TYPE_REFERENCE_EXPORT_MAX_CSV_BYTES) {
            throw new RoomTypeExportLimitError("CSV", ROOM_TYPE_REFERENCE_EXPORT_MAX_CSV_BYTES);
          }
          if (requestedFormat === "csv") {
            await writeChunk(res, row, abortController.signal);
          } else {
            await writeChunk(csvStream!, row, abortController.signal);
            csvHash!.update(row, "utf8");
          }
          csvBytes += rowBytes;
          recordCount += 1;
        }

        offset += page.records.length;
        if (!page.hasMore || page.records.length === 0) break;

        page = await storage.getRoomTypeReferenceExportPage(
          roomTypeId,
          requestedSource as RoomTypeReferenceSource,
          offset,
          ROOM_TYPE_REFERENCE_EXPORT_PAGE_SIZE,
        );
      }

      if (requestedFormat === "csv") {
        res.end();
        return;
      }

      await finishWritable(csvStream!, abortController.signal);
      csvStream = undefined;
      const sha256 = csvHash!.digest("hex");
      const generatedAt = new Date().toISOString();
      const manifest = {
        manifestVersion: 1,
        generatedAt,
        roomTypeId,
        source: requestedSource,
        recordCount,
        csvFile: csvFilename,
        hash: {
          algorithm: "SHA-256",
          value: sha256,
          verifiedBytes: "El contenido completo del CSV, incluyendo su encabezado y BOM UTF-8.",
        },
        verificationInstructions: [
          `Extraé ${csvFilename} de este ZIP.`,
          `Ejecutá sha256sum "${csvFilename}" (o una herramienta equivalente SHA-256).`,
          `Compará el resultado con hash.value de este manifiesto; deben coincidir exactamente.`,
        ],
      };
      const verificationGuide = [
        "Evidencia certificada de referencias de tipos de habitación",
        "",
        `Generada: ${generatedAt}`,
        `Tipo huérfano: ${roomTypeId}`,
        `Origen: ${requestedSource}`,
        `Cantidad de registros: ${manifest.recordCount}`,
        `Archivo CSV: ${csvFilename}`,
        `Algoritmo: SHA-256`,
        `Huella esperada: ${sha256}`,
        "",
        "Cómo verificar:",
        `1. Extraé ${csvFilename} de este ZIP.`,
        `2. Ejecutá: sha256sum "${csvFilename}"`,
        `3. Compará la salida con la huella esperada de arriba.`,
        "Si las huellas no coinciden, el CSV fue modificado o no es el archivo original.",
        "",
      ].join("\n");
      archive = archiver("zip", {
        zlib: { level: 6 },
        highWaterMark: 1024 * 1024,
      });
      archive.append(createReadStream(join(tempDir!, csvFilename)), { name: csvFilename });
      archive.append(`${JSON.stringify(manifest, null, 2)}\n`, { name: "manifiesto.json" });
      archive.append(verificationGuide, { name: "COMO_VERIFICAR.txt" });

      res.status(200);
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${zipFilename}"`);
      res.setHeader("Cache-Control", "no-store");
      let zipBytes = 0;
      const limitedZip = new Transform({
        transform(chunk, _encoding, callback) {
          zipBytes += chunk.length;
          if (zipBytes > ROOM_TYPE_REFERENCE_EXPORT_MAX_ZIP_BYTES) {
            callback(new RoomTypeExportLimitError("ZIP", ROOM_TYPE_REFERENCE_EXPORT_MAX_ZIP_BYTES));
            return;
          }
          callback(null, chunk);
        },
      });
      const transfer = pipeline(archive, limitedZip, res, { signal: abortController.signal });
      archive.finalize();
      await transfer;
    } catch (error) {
      console.error("[room-type-integrity-export] error:", error);
      await cleanupExportResources();
      if (res.headersSent && !res.destroyed) {
        res.destroy(error instanceof Error ? error : new Error("Error exportando referencias"));
      } else if (!requestAborted) {
        const status = error instanceof RoomTypeExportLimitError ? 413 : 500;
        const message = error instanceof RoomTypeExportLimitError
          ? "La evidencia excede el límite permitido"
          : "Error exportando las referencias";
        res.status(status).json({ error: message });
      }
    } finally {
      req.off("aborted", abortExport);
      res.off("close", onResponseClose);
      await cleanupExportResources();
    }
  });

  app.post("/api/room-types", requireRole(ROOMS_WRITE_ROLES), async (req, res) => {
    try {
      const roomType = await storage.createRoomType(req.body);
      res.status(201).json(roomType);
    } catch (error) {
      res.status(500).json({ error: "Error creating room type" });
    }
  });

  app.patch("/api/room-types/:id", requireRole(ROOMS_WRITE_ROLES), async (req, res) => {
    try {
      const roomType = await storage.updateRoomType(req.params.id, req.body);
      if (!roomType) {
        return res.status(404).json({ error: "Room type not found" });
      }
      res.json(roomType);
    } catch (error) {
      res.status(500).json({ error: "Error updating room type" });
    }
  });

  app.post("/api/room-types/reassign-references", requireRole(ROOM_TYPE_ADMIN_ROLES), async (req, res) => {
    const { fromRoomTypeId, toRoomTypeId } = req.body ?? {};
    if (typeof fromRoomTypeId !== "string" || typeof toRoomTypeId !== "string" || !fromRoomTypeId || !toRoomTypeId) {
      return res.status(400).json({ error: "fromRoomTypeId y toRoomTypeId son requeridos" });
    }
    try {
      const result = await storage.reassignRoomTypeReferences(fromRoomTypeId, toRoomTypeId);
      await audit(
        req,
        "update",
        "room-types",
        `Referencias de tipo de habitación reasignadas: ${fromRoomTypeId} → ${toRoomTypeId}`,
        {
          entityType: "room_type",
          entityId: toRoomTypeId,
          details: {
            before: { roomTypeId: fromRoomTypeId },
            after: { roomTypeId: toRoomTypeId, updated: result.updated },
          },
        },
      );
      res.json(result);
    } catch (error: any) {
      const message = error?.message || "Error reassigning room type references";
      const status = message.includes("origen ya existe")
        ? 409
        : message.includes("destino no existe") || message.includes("origen y destino")
          ? 400
          : 500;
      res.status(status).json({ error: message });
    }
  });

  app.delete("/api/room-types/:id", requireRole(ROOM_TYPE_ADMIN_ROLES), async (req, res) => {
    try {
      const result = await storage.deleteRoomType(req.params.id);
      if (result.references.length > 0) {
        return res.status(409).json({
          error: "No se puede eliminar un tipo de habitación utilizado",
          code: "ROOM_TYPE_IN_USE",
          references: result.references,
          resolution: "Reasigne las referencias a otro tipo de habitación y vuelva a eliminarlo.",
        });
      }
      if (!result.deleted) {
        return res.status(404).json({ error: "Room type not found" });
      }
      await audit(
        req,
        "delete",
        "room-types",
        `Tipo de habitación eliminado: ${req.params.id}`,
        { entityType: "room_type", entityId: req.params.id },
      );
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting room type" });
    }
  });

  // Rate Plans
  app.get("/api/rate-plans", async (req, res) => {
    try {
      const ratePlans = await storage.getRatePlans();
      res.json(ratePlans);
    } catch (error) {
      res.status(500).json({ error: "Error fetching rate plans" });
    }
  });

  app.get("/api/rate-plans/by-room-type/:roomTypeId", async (req, res) => {
    try {
      const ratePlans = await storage.getRatePlansByRoomType(req.params.roomTypeId);
      res.json(ratePlans);
    } catch (error) {
      res.status(500).json({ error: "Error fetching rate plans by room type" });
    }
  });

  app.get("/api/rate-plans/:id", async (req, res) => {
    try {
      const ratePlan = await storage.getRatePlan(req.params.id);
      if (!ratePlan) {
        return res.status(404).json({ error: "Rate plan not found" });
      }
      res.json(ratePlan);
    } catch (error) {
      res.status(500).json({ error: "Error fetching rate plan" });
    }
  });

  app.post("/api/rate-plans", requireRole(RATES_WRITE_ROLES), async (req, res) => {
    try {
      const ratePlan = await storage.createRatePlan(req.body);
      await audit(req, "create", "rate-plans", `Nueva tarifa creada: ${req.body.name}`, { entityType: "rate_plan", entityId: ratePlan.id });
      res.status(201).json(ratePlan);
    } catch (error) {
      res.status(500).json({ error: "Error creating rate plan" });
    }
  });

  app.patch("/api/rate-plans/:id", requireRole(RATES_WRITE_ROLES), async (req, res) => {
    try {
      const existing = await storage.getRatePlan(req.params.id);
      const ratePlan = await storage.updateRatePlan(req.params.id, req.body);
      if (!ratePlan) {
        return res.status(404).json({ error: "Rate plan not found" });
      }
      await audit(req, "update", "rate-plans",
        `Tarifa modificada: ${ratePlan.name} — $${existing?.baseRate ?? "?"} → $${ratePlan.baseRate ?? "?"}`,
        { entityType: "rate_plan", entityId: req.params.id }
      );
      res.json(ratePlan);
    } catch (error) {
      res.status(500).json({ error: "Error updating rate plan" });
    }
  });

  app.delete("/api/rate-plans/:id", requireRole(RATES_WRITE_ROLES), async (req, res) => {
    try {
      const deleted = await storage.deleteRatePlan(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Rate plan not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting rate plan" });
    }
  });

  // Rooms
  app.get("/api/rooms", async (req, res) => {
    try {
      const rooms = await storage.getRooms();
      const today = getArgentinaToday();
      const allReservations = await storage.getReservations();
      const checkedInReservations = allReservations.filter(r => r.status === "checked_in");

      const roomsWithReconciled = await Promise.all(rooms.map(async (room) => {
        const activeRes = checkedInReservations.find(r => r.roomId === room.id && r.checkInDate <= today && r.checkOutDate >= today);

        if (room.status === "occupied" && !activeRes) {
          await storage.updateRoom(room.id, { status: "dirty" });
          return { ...room, status: "dirty" as const };
        }
        if ((room.status === "available" || room.status === "dirty") && activeRes) {
          await storage.updateRoom(room.id, { status: "occupied" });
          return { ...room, status: "occupied" as const };
        }
        return room;
      }));

      res.json(roomsWithReconciled);
    } catch (error) {
      res.status(500).json({ error: "Error fetching rooms" });
    }
  });

  app.get("/api/rooms/in-house", async (req, res) => {
    try {
      const today = getArgentinaToday();

      const activeRows = await db.select({
        res: reservations,
        room: roomsTable,
      })
        .from(reservations)
        .innerJoin(roomsTable, eq(roomsTable.id, reservations.roomId))
        .where(
          and(
            or(eq(reservations.status, "checked_in"), eq(reservations.status, "web_checkin")),
            sql`(${roomsTable.isVirtual} IS NULL OR ${roomsTable.isVirtual} = false)`
          )
        );

      if (activeRows.length === 0) return res.json([]);

      const reservationIds = activeRows.map(r => r.res.id);
      const guestIds = activeRows.map(r => r.res.guestId).filter(Boolean) as string[];

      const [guestList, allPrefs, balanceByReservation, allAlerts, allCompanions, allRoomTypesList] = await Promise.all([
        guestIds.length > 0 ? db.select().from(guests).where(inArray(guests.id, guestIds)) : Promise.resolve([]),
        guestIds.length > 0 ? db.select().from(guestPreferences).where(and(eq(guestPreferences.isActive, true), inArray(guestPreferences.guestId, guestIds))) : Promise.resolve([]),
        loadReservationOperationalBalances(activeRows.map(row => row.res)),
        db.select().from(hospitalityAlerts).where(and(ne(hospitalityAlerts.status, "completed"), inArray(hospitalityAlerts.reservationId, reservationIds))),
        db.select().from(reservationCompanions).where(inArray(reservationCompanions.reservationId, reservationIds)),
        db.select().from(roomTypesTable),
      ]);

      const guestMap = new Map(guestList.map(g => [g.id, g]));
      const prefsByGuest = new Map<string, Array<typeof guestPreferences.$inferSelect>>();
      for (const p of allPrefs) {
        if (!prefsByGuest.has(p.guestId)) prefsByGuest.set(p.guestId, []);
        prefsByGuest.get(p.guestId)!.push(p);
      }
      const alertsByRes = new Map<string, number>();
      for (const a of allAlerts) {
        alertsByRes.set(a.reservationId, (alertsByRes.get(a.reservationId) ?? 0) + 1);
      }
      const companionCountByRes = new Map<string, number>();
      for (const c of allCompanions) {
        companionCountByRes.set(c.reservationId, (companionCountByRes.get(c.reservationId) ?? 0) + 1);
      }
      const roomTypeMap = new Map(allRoomTypesList.map(rt => [rt.id, rt]));

      const daysDiff = (a: string, b: string) => {
        const da = new Date(a + "T12:00:00");
        const db2 = new Date(b + "T12:00:00");
        return Math.round((db2.getTime() - da.getTime()) / 86400000);
      };

      const result = activeRows
        .sort((a, b) => a.room.roomNumber.localeCompare(b.room.roomNumber, undefined, { numeric: true }))
        .map(({ res, room }) => {
          const guest = res.guestId ? guestMap.get(res.guestId) : undefined;
          const prefs = res.guestId ? (prefsByGuest.get(res.guestId) ?? []) : [];
          const roomType = room.roomTypeId ? roomTypeMap.get(room.roomTypeId) : undefined;
          return {
            roomId: room.id,
            roomNumber: room.roomNumber,
            roomTypeName: roomType?.name ?? null,
            floor: room.floor,
            roomStatus: room.status,
            reservationId: res.id,
            reservationNumber: (res as any).reservationNumber ?? null,
            checkIn: res.checkInDate,
            checkOut: res.checkOutDate,
            nightsRemaining: daysDiff(today, res.checkOutDate),
            nightsStayed: daysDiff(res.checkInDate, today),
            adults: res.numberOfGuests ?? 1,
            children: 0,
            numberOfGuests: res.numberOfGuests ?? 1,
            source: res.source,
            earlyCheckIn: res.earlyCheckIn ?? false,
            earlyCheckInTime: res.earlyCheckInTime ?? null,
            lateCheckOut: res.lateCheckOut ?? false,
            lateCheckOutTime: res.lateCheckOutTime ?? null,
            reservationStatus: res.status,
            guest: guest ? {
              id: guest.id,
              firstName: guest.firstName,
              lastName: guest.lastName,
              phone: guest.phone ?? null,
              email: guest.email ?? null,
              segment: (guest as any).segment ?? null,
            } : null,
            companionsCount: companionCountByRes.get(res.id) ?? 0,
            folioBalance: balanceByReservation.get(res.id) ?? 0,
            hasPreferences: prefs.length > 0,
            hasCritical: prefs.some(p => p.priority === "critical"),
            hasSpecialDate: prefs.some(p => p.category === "fecha_especial"),
            hasDiet: prefs.some(p => p.category === "alimentacion"),
            prefsCount: prefs.length,
            pendingAlertsCount: alertsByRes.get(res.id) ?? 0,
          };
        });

      res.json(result);
    } catch (error: any) {
      console.error("[in-house] error:", error.message);
      res.status(500).json({ error: "Error fetching in-house rooms" });
    }
  });

  // ── Daily operations report ──────────────────────────────────────────────
  app.get("/api/daily-report", async (req, res) => {
    try {
      const date = (req.query.date as string) || getArgentinaToday();

      const [checkOutRows, checkInRows] = await Promise.all([
        // Check-outs: checked_in reservations whose checkOutDate = date
        db.select({ res: reservations, room: roomsTable })
          .from(reservations)
          .innerJoin(roomsTable, eq(roomsTable.id, reservations.roomId))
          .where(and(
            sql`${reservations.checkOutDate} = ${date}`,
            eq(reservations.status, "checked_in"),
            sql`(${roomsTable.isVirtual} IS NULL OR ${roomsTable.isVirtual} = false)`
          )),
        // Check-ins: confirmed/web_checkin reservations whose checkInDate = date
        db.select({ res: reservations, room: roomsTable })
          .from(reservations)
          .innerJoin(roomsTable, eq(roomsTable.id, reservations.roomId))
          .where(and(
            sql`${reservations.checkInDate} = ${date}`,
            or(eq(reservations.status, "confirmed"), eq(reservations.status, "web_checkin")),
            sql`(${roomsTable.isVirtual} IS NULL OR ${roomsTable.isVirtual} = false)`
          )),
      ]);

      const allGuestIds = [
        ...checkOutRows.map(r => r.res.guestId),
        ...checkInRows.map(r => r.res.guestId),
      ].filter(Boolean) as string[];
      const checkOutResIds = checkOutRows.map(r => r.res.id);

      const [guestList, balanceByReservation, allRoomTypes, allBedTypeList] = await Promise.all([
        allGuestIds.length > 0
          ? db.select().from(guests).where(inArray(guests.id, allGuestIds))
          : Promise.resolve([]),
        loadReservationOperationalBalances(checkOutRows.map(row => row.res)),
        db.select().from(roomTypesTable),
        db.select().from(bedTypes),
      ]);

      const guestMap = new Map(guestList.map(g => [g.id, g]));
      const roomTypeMap = new Map(allRoomTypes.map(rt => [rt.id, rt]));
      const bedTypeMap = new Map(allBedTypeList.map(bt => [bt.id, bt]));

      const daysDiff = (a: string, b: string) =>
        Math.round((new Date(b + "T12:00:00").getTime() - new Date(a + "T12:00:00").getTime()) / 86400000);

      const sortByRoom = (a: { room: typeof roomsTable.$inferSelect }, b: { room: typeof roomsTable.$inferSelect }) =>
        a.room.roomNumber.localeCompare(b.room.roomNumber, undefined, { numeric: true });

      const checkOuts = checkOutRows.sort(sortByRoom).map(({ res, room }) => {
        const guest = res.guestId ? guestMap.get(res.guestId) : undefined;
        const roomType = room.roomTypeId ? roomTypeMap.get(room.roomTypeId) : undefined;
        const bedTypeName = res.bedTypeNotes || (res.bedTypeId ? (bedTypeMap.get(res.bedTypeId) as any)?.name : null) || null;
        return {
          reservationId: res.id,
          reservationCode: (res as any).reservationCode ?? null,
          roomNumber: room.roomNumber,
          roomTypeName: roomType?.name ?? null,
          guestName: guest ? `${guest.lastName} ${guest.firstName}`.trim() : ((res as any).guestName || "Sin asignar"),
          guestPhone: guest?.phone ?? null,
          checkInDate: res.checkInDate,
          checkOutDate: res.checkOutDate,
          nightsStayed: daysDiff(res.checkInDate, date),
          nights: res.nights ?? daysDiff(res.checkInDate, res.checkOutDate),
          finalRatePerNight: res.finalRatePerNight ? parseFloat(String(res.finalRatePerNight)) : null,
          totalRoomAmount: res.totalRoomAmount ? parseFloat(String(res.totalRoomAmount)) : null,
          folioBalance: balanceByReservation.get(res.id) ?? 0,
          bedTypeNotes: bedTypeName,
          lateCheckOut: res.lateCheckOut ?? false,
          lateCheckOutTime: res.lateCheckOutTime ?? null,
          notes: res.notes ?? null,
          numberOfGuests: res.numberOfGuests ?? 1,
        };
      });

      const checkIns = checkInRows.sort(sortByRoom).map(({ res, room }) => {
        const guest = res.guestId ? guestMap.get(res.guestId) : undefined;
        const roomType = room.roomTypeId ? roomTypeMap.get(room.roomTypeId) : undefined;
        const bedTypeName = res.bedTypeNotes || (res.bedTypeId ? (bedTypeMap.get(res.bedTypeId) as any)?.name : null) || null;
        return {
          reservationId: res.id,
          reservationCode: (res as any).reservationCode ?? null,
          roomNumber: room.roomNumber,
          floor: room.floor ?? null,
          roomTypeName: roomType?.name ?? null,
          guestName: guest ? `${guest.lastName} ${guest.firstName}`.trim() : ((res as any).guestName || "Sin asignar"),
          guestPhone: guest?.phone ?? null,
          checkInDate: res.checkInDate,
          checkOutDate: res.checkOutDate,
          nights: res.nights ?? daysDiff(res.checkInDate, res.checkOutDate),
          finalRatePerNight: res.finalRatePerNight ? parseFloat(String(res.finalRatePerNight)) : null,
          totalRoomAmount: res.totalRoomAmount ? parseFloat(String(res.totalRoomAmount)) : null,
          bedTypeNotes: bedTypeName,
          earlyCheckIn: res.earlyCheckIn ?? false,
          earlyCheckInTime: res.earlyCheckInTime ?? null,
          numberOfGuests: res.numberOfGuests ?? 1,
          notes: res.notes ?? null,
          source: res.source ?? null,
          status: res.status,
        };
      });

      res.json({ date, checkOuts, checkIns });
    } catch (error: any) {
      console.error("[daily-report] error:", error.message);
      res.status(500).json({ error: "Error generating daily report" });
    }
  });

  // Arriving today: confirmed/web_checkin reservations with checkInDate = today
  app.get("/api/rooms/arriving-today", async (req, res) => {
    try {
      const today = getArgentinaToday();

      const rows = await db.select({
        res: reservations,
        room: roomsTable,
      })
        .from(reservations)
        .innerJoin(roomsTable, eq(roomsTable.id, reservations.roomId))
        .where(
          and(
            sql`${reservations.checkInDate} = ${today}`,
            or(eq(reservations.status, "confirmed"), eq(reservations.status, "web_checkin")),
            sql`(${roomsTable.isVirtual} IS NULL OR ${roomsTable.isVirtual} = false)`
          )
        );

      if (rows.length === 0) return res.json([]);

      const guestIds = rows.map(r => r.res.guestId).filter(Boolean) as string[];
      const [guestList, allRoomTypesList] = await Promise.all([
        guestIds.length > 0 ? db.select().from(guests).where(inArray(guests.id, guestIds)) : Promise.resolve([]),
        db.select().from(roomTypesTable),
      ]);

      const guestMap = new Map(guestList.map(g => [g.id, g]));
      const roomTypeMap = new Map(allRoomTypesList.map(rt => [rt.id, rt]));

      const result = rows
        .sort((a, b) => a.room.roomNumber.localeCompare(b.room.roomNumber, undefined, { numeric: true }))
        .map(({ res, room }) => {
          const guest = res.guestId ? guestMap.get(res.guestId) : undefined;
          const roomType = room.roomTypeId ? roomTypeMap.get(room.roomTypeId) : undefined;
          return {
            reservationId: res.id,
            reservationNumber: (res as any).reservationNumber ?? null,
            roomId: room.id,
            roomNumber: room.roomNumber,
            roomTypeName: roomType?.name ?? null,
            floor: room.floor,
            checkIn: res.checkInDate,
            checkOut: res.checkOutDate,
            nights: res.nights ?? 1,
            adults: res.numberOfGuests ?? 1,
            children: 0,
            numberOfGuests: res.numberOfGuests ?? 1,
            source: res.source,
            reservationStatus: res.status,
            earlyCheckIn: res.earlyCheckIn ?? false,
            earlyCheckInTime: res.earlyCheckInTime ?? null,
            guest: guest ? {
              id: guest.id,
              firstName: guest.firstName,
              lastName: guest.lastName,
              phone: guest.phone ?? null,
              email: guest.email ?? null,
            } : null,
          };
        });

      res.json(result);
    } catch (error: any) {
      console.error("[arriving-today] error:", error.message);
      res.status(500).json({ error: "Error fetching arriving today" });
    }
  });

  app.get("/api/rooms/available", async (req, res) => {
    try {
      const { checkIn, checkOut, roomTypeId, groupId } = req.query as { checkIn?: string; checkOut?: string; roomTypeId?: string; groupId?: string };
      if (!checkIn || !checkOut) {
        return res.status(400).json({ error: "checkIn and checkOut son requeridos" });
      }
      const rooms = await storage.getRooms();
      const allReservations = await storage.getReservations();
      const maintenanceBlocks = await storage.getMaintenanceBlocks();

      // When called from a group passenger-assignment dialog, exclude that group's
      // own placeholder reservations from the conflict check — they are reserved FOR
      // the group and should appear as valid room options for passenger assignment.
      let groupReservationIds = new Set<string>();
      if (groupId) {
        const { db } = await import("../db");
        const { groupReservationLinks } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        const links = await db.select().from(groupReservationLinks).where(eq(groupReservationLinks.groupId, groupId));
        groupReservationIds = new Set(links.map((l: any) => l.reservationId));
      }

      let filtered = rooms;
      if (roomTypeId) {
        filtered = filtered.filter(r => hasCanonicalRoomType(r, roomTypeId));
      }

      const available = filtered.filter((room) => isRoomAvailableForInterval({
        room,
        checkIn,
        checkOut,
        reservations: allReservations,
        maintenanceBlocks,
        // A group's existing placeholders reserve rooms for that group, not
        // against it, while all other overlapping stays remain unavailable.
        excludedReservationIds: groupReservationIds,
      }));

      res.json(available);
    } catch (error) {
      res.status(500).json({ error: "Error fetching available rooms" });
    }
  });

  app.get("/api/rooms/:id", async (req, res) => {
    try {
      const room = await storage.getRoom(req.params.id);
      if (!room) {
        return res.status(404).json({ error: "Room not found" });
      }
      res.json(room);
    } catch (error) {
      res.status(500).json({ error: "Error fetching room" });
    }
  });

  app.post("/api/rooms", requireRole(ROOMS_WRITE_ROLES), async (req, res) => {
    try {
      const room = await storage.createRoom(req.body);
      res.status(201).json(room);
    } catch (error) {
      res.status(500).json({ error: "Error creating room" });
    }
  });

  app.patch("/api/rooms/:id", requireRole(ROOMS_WRITE_ROLES), async (req, res) => {
    try {
      const room = await storage.updateRoom(req.params.id, req.body);
      if (!room) {
        return res.status(404).json({ error: "Room not found" });
      }
      res.json(room);
    } catch (error) {
      res.status(500).json({ error: "Error updating room" });
    }
  });

  // Eliminar habitaciones está deshabilitado por política del sistema.
  // Usar PATCH con { isActive: false } para deshabilitar.
  app.delete("/api/rooms/:id", requireRole(ROOMS_WRITE_ROLES), (_req, res) => {
    res.status(405).json({ error: "No está permitido eliminar habitaciones. Usá la opción Deshabilitar para ocultarla del sistema." });
  });
}

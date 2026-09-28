import type { Express } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { requireAuth } from "../auth";
import {
  loadReservationOperationalSummaries,
  projectReservationOperationalReportRows,
} from "../reservation-operational-balances";

/**
 * Operational accommodation reports: arrivals/departures, pending balances,
 * and per-guest debt. Extracted verbatim from server/routes.ts into its own
 * focused registrar — same routes, same requireAuth middleware, same JSON
 * contracts — so tests for these three endpoints don't have to import and
 * register the entire route monolith just to reach them.
 */
export function registerOperationalReportRoutes(app: Express) {
  app.get("/api/reports/arrivals-departures", requireAuth, async (req, res) => {
    try {
      const { from, to } = req.query as { from: string; to: string };
      if (!from || !to) return res.status(400).json({ error: "from y to son requeridos" });

      const rowMapper = (r: any) => ({
        id: r.id,
        code: r.code,
        guest: r.guest,
        room: r.room,
        roomType: r.room_type,
        checkIn: r.check_in,
        checkOut: r.check_out,
        nights: Number(r.nights),
        pax: Number(r.pax),
        status: r.status,
        totalRoomAmount: r.total_room_amount,
        finalRatePerNight: r.final_rate_per_night,
      });

      const arrRows = await db.execute(sql`
        SELECT r.id, r.reservation_code AS code,
               g.first_name || ' ' || g.last_name AS guest,
               ro.room_number AS room, rt.name AS room_type,
               r.check_in_date AS check_in, r.check_out_date AS check_out,
               r.nights, r.number_of_guests AS pax, r.status,
               r.total_room_amount, r.final_rate_per_night
        FROM reservations r
        LEFT JOIN guests g ON r.guest_id = g.id
        LEFT JOIN rooms ro ON r.room_id = ro.id
        LEFT JOIN room_types rt ON r.room_type_id = rt.id
        WHERE r.check_in_date BETWEEN ${from} AND ${to} AND r.status != 'cancelled'
        ORDER BY r.check_in_date, ro.room_number
      `);

      const depRows = await db.execute(sql`
        SELECT r.id, r.reservation_code AS code,
               g.first_name || ' ' || g.last_name AS guest,
               ro.room_number AS room, rt.name AS room_type,
               r.check_in_date AS check_in, r.check_out_date AS check_out,
               r.nights, r.number_of_guests AS pax, r.status,
               r.total_room_amount, r.final_rate_per_night
        FROM reservations r
        LEFT JOIN guests g ON r.guest_id = g.id
        LEFT JOIN rooms ro ON r.room_id = ro.id
        LEFT JOIN room_types rt ON r.room_type_id = rt.id
        WHERE r.check_out_date BETWEEN ${from} AND ${to} AND r.status != 'cancelled'
        ORDER BY r.check_out_date, ro.room_number
      `);

      const arrivals = (arrRows.rows as any[]).map(rowMapper);
      const departures = (depRows.rows as any[]).map(rowMapper);
      const uniqueReservations = Array.from(
        new Map([...arrivals, ...departures].map(row => [row.id, row])).values(),
      );
      const summaries = await loadReservationOperationalSummaries(uniqueReservations);
      const cleanReportRow = ({ id, totalRoomAmount, finalRatePerNight, ...row }: any) => row;
      res.json({
        arrivals: projectReservationOperationalReportRows(arrivals, summaries).map(cleanReportRow),
        departures: projectReservationOperationalReportRows(departures, summaries).map(cleanReportRow),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/reports/pending-balances", requireAuth, async (req, res) => {
    try {
      const rows = await db.execute(sql`
        SELECT r.id, r.reservation_code AS code,
               g.first_name || ' ' || g.last_name AS guest,
               ro.room_number AS room, rt.name AS room_type,
               r.check_in_date AS check_in, r.check_out_date AS check_out,
               r.nights, r.number_of_guests AS pax, r.status,
               r.total_room_amount, r.final_rate_per_night
        FROM reservations r
        LEFT JOIN guests g ON r.guest_id = g.id
        LEFT JOIN rooms ro ON r.room_id = ro.id
        LEFT JOIN room_types rt ON r.room_type_id = rt.id
        WHERE r.status IN ('checked_in', 'confirmed', 'pending')
        ORDER BY room
      `);
      const reportRows = (rows.rows as any[]).map((r: any) => ({
        id: r.id, code: r.code, guest: r.guest, room: r.room, roomType: r.room_type,
        checkIn: r.check_in, checkOut: r.check_out,
        nights: Number(r.nights), pax: Number(r.pax), status: r.status,
        totalRoomAmount: r.total_room_amount,
        finalRatePerNight: r.final_rate_per_night,
      }));
      const summaries = await loadReservationOperationalSummaries(reportRows);
      res.json(projectReservationOperationalReportRows(reportRows, summaries, true).map(
        ({ id, totalRoomAmount, finalRatePerNight, ...row }) => row,
      ));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Deuda consolidada por huésped — alojamiento + extras de reservas activas
  app.get("/api/reports/guest-debt", requireAuth, async (req, res) => {
    try {
      const rows = (await db.execute(sql`
        SELECT
          g.id AS guest_id,
          g.first_name || ' ' || g.last_name AS guest_name,
          g.document_number,
          g.document_type,
          r.id AS reservation_id,
          r.reservation_code,
          r.check_in_date,
          r.check_out_date,
          r.status,
          rm.room_number,
           r.total_room_amount,
           r.final_rate_per_night,
           r.nights
        FROM reservations r
        JOIN guests g ON g.id = r.guest_id
        LEFT JOIN rooms rm ON rm.id = r.room_id
        WHERE r.status IN ('confirmed', 'checked_in')
        ORDER BY g.last_name, g.first_name, r.check_in_date
      `)).rows as any[];
      const debtSummaries = await loadReservationOperationalSummaries(rows.map(row => ({
        id: row.reservation_id,
        totalRoomAmount: row.total_room_amount,
        finalRatePerNight: row.final_rate_per_night,
        nights: Number(row.nights),
      })));

      // Group by guest
      const byGuest: Record<string, any> = {};
      for (const row of rows) {
        const summary = debtSummaries.get(row.reservation_id);
        if (!summary || summary.operationalFolioBalance <= 0.01) continue;
        const gid = row.guest_id;
        if (!byGuest[gid]) {
          byGuest[gid] = {
            guestId: gid,
            guestName: row.guest_name,
            documentNumber: row.document_number,
            documentType: row.document_type,
            reservations: [],
            totalAlojamiento: 0,
            totalExtras: 0,
            totalPagado: 0,
            totalDeuda: 0,
          };
        }
        const savedRoomTotal = parseFloat(row.total_room_amount || "0");
        const aloj = savedRoomTotal > 0
          ? savedRoomTotal
          : (parseFloat(row.final_rate_per_night || "0") || 0) * (Number(row.nights) || 0);
        const extr = summary.operationalServices - aloj;
        const pag = summary.activeHistoricalSettlements;
        const saldo = summary.operationalFolioBalance;
        byGuest[gid].reservations.push({
          reservationId: row.reservation_id,
          reservationCode: row.reservation_code,
          roomNumber: row.room_number,
          checkInDate: row.check_in_date,
          checkOutDate: row.check_out_date,
          status: row.status,
          alojamiento: aloj,
          extras: extr,
          pagado: pag,
          saldo,
        });
        byGuest[gid].totalAlojamiento += aloj;
        byGuest[gid].totalExtras += extr;
        byGuest[gid].totalPagado += pag;
        byGuest[gid].totalDeuda += saldo;
      }

      res.json(Object.values(byGuest));
    } catch (error) {
      console.error("Error fetching guest debt report:", error);
      res.status(500).json({ error: "Error al obtener deuda por huésped" });
    }
  });
}

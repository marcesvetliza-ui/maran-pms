import type { Express } from 'express';
import { storage } from '../db-storage';
import { loadReservationOperationalBalances } from '../reservation-operational-balances';

/** Same operational folio balance as occupied rooms, loaded in bulk. */
export function registerDepartureRoutes(app: Express) {
  app.get('/api/dashboard/departures', async (_req, res) => {
    try {
      const departures = await storage.getReservationsForCheckOut();
      const balances = await loadReservationOperationalBalances(departures);
      res.json(departures.map(reservation => ({ ...reservation, folioBalance: balances.get(reservation.id) ?? null })));
    } catch {
      res.status(500).json({ error: 'Error fetching departures' });
    }
  });
}

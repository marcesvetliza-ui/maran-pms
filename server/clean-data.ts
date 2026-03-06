import { db } from "./db";
import {
  cashMovements, cashClosingSummaries, cashShifts,
  orderItems, restaurantOrders,
  spaPayments, spaAccountItems, spaAccounts, spaAppointments,
  eventTablePayments, eventTableCharges, eventTables, eventCharges, eventPayments, events,
  housekeepingTasks,
  workOrders,
  webCheckins,
  stayNotes, guestPreferences, hospitalityAlerts,
  charges, payments,
  groupReservationLinks, groupRoomBlocks, groups,
  reservations,
  auditLogs,
  systemNotifications,
  guests,
  companies,
  rooms,
  restaurantTables,
} from "@shared/schema";

async function cleanTestData() {
  console.log("Iniciando limpieza de datos de prueba...");

  console.log("Borrando movimientos de caja...");
  await db.delete(cashMovements);
  await db.delete(cashClosingSummaries);
  await db.delete(cashShifts);

  console.log("Borrando órdenes de restaurante...");
  await db.delete(orderItems);
  await db.delete(restaurantOrders);

  console.log("Borrando turnos de SPA...");
  await db.delete(spaPayments).catch(() => console.log("spaPayments no existe, omitiendo"));
  await db.delete(spaAccountItems).catch(() => console.log("spaAccountItems no existe, omitiendo"));
  await db.delete(spaAccounts).catch(() => console.log("spaAccounts no existe, omitiendo"));
  await db.delete(spaAppointments);

  console.log("Borrando eventos...");
  await db.delete(eventTablePayments).catch(() => console.log("eventTablePayments no existe, omitiendo"));
  await db.delete(eventTableCharges).catch(() => console.log("eventTableCharges no existe, omitiendo"));
  await db.delete(eventTables).catch(() => console.log("eventTables no existe, omitiendo"));
  await db.delete(eventCharges).catch(() => console.log("eventCharges no existe, omitiendo"));
  await db.delete(eventPayments).catch(() => console.log("eventPayments no existe, omitiendo"));
  await db.delete(events);

  console.log("Borrando tareas de housekeeping y mantenimiento...");
  await db.delete(housekeepingTasks);
  await db.delete(workOrders);

  console.log("Borrando web check-ins...");
  await db.delete(webCheckins);

  console.log("Borrando datos de hospitalidad...");
  await db.delete(stayNotes);
  await db.delete(guestPreferences);
  await db.delete(hospitalityAlerts);

  console.log("Borrando cargos y pagos...");
  await db.delete(charges);
  await db.delete(payments);

  console.log("Borrando grupos...");
  await db.delete(groupReservationLinks);
  await db.delete(groupRoomBlocks);
  await db.delete(groups);

  console.log("Borrando reservas...");
  await db.delete(reservations);

  console.log("Borrando logs y notificaciones...");
  await db.delete(auditLogs);
  await db.delete(systemNotifications);

  console.log("Borrando huéspedes y empresas...");
  await db.delete(guests);
  await db.delete(companies);

  console.log("Reseteando estado de habitaciones...");
  await db.update(rooms).set({ status: "available" });

  console.log("Reseteando estado de mesas...");
  await db.update(restaurantTables).set({ status: "available" });

  console.log("✅ Limpieza completada. El sistema está listo para uso real.");
  process.exit(0);
}

cleanTestData().catch((err) => {
  console.error("Error durante la limpieza:", err);
  process.exit(1);
});

import { describe, expect, it } from "vitest";
import { authorizePilotExternalRole, PILOT_EXTERNAL_ROLE } from "../pilot-external-role";

function callMiddleware(role: string, method: string, apiPath: string): { status: number | null; nextCalled: boolean } {
  const req: any = {
    user: { role },
    method,
    baseUrl: "/api",
    // authorizePilotExternalRole recibe req.path YA recortado del prefijo
    // de montaje "/api" — así es como Express lo entrega dentro de un
    // app.use("/api", ...). Ver server/pilot-external-role.ts.
    path: apiPath.startsWith("/api") ? apiPath.slice(4) : apiPath,
  };
  let status: number | null = null;
  const res: any = {
    status(code: number) {
      status = code;
      return this;
    },
    json() {
      return this;
    },
  };
  let nextCalled = false;
  authorizePilotExternalRole(req, res, () => {
    nextCalled = true;
  });
  return { status, nextCalled };
}

describe("authorizePilotExternalRole — reglas exhaustivas (Fase 6)", () => {
  it("no afecta a roles distintos de piloto_externo (siempre next())", () => {
    for (const role of ["admin", "manager", "reception", "comercial"]) {
      const { nextCalled, status } = callMiddleware(role, "POST", "/api/reservations/x/cancel");
      expect(nextCalled).toBe(true);
      expect(status).toBeNull();
    }
  });

  const ALLOWED: Array<[string, string]> = [
    // Reservas
    ["GET", "/api/reservations"],
    ["GET", "/api/reservations/abc"],
    ["POST", "/api/reservations"],
    ["PATCH", "/api/reservations/abc"],
    ["POST", "/api/reservations/abc/check-in"],
    ["POST", "/api/reservations/abc/check-out"],
    ["POST", "/api/reservations/abc/duplicate"],
    ["POST", "/api/reservations/abc/undo-checkin"],
    ["POST", "/api/reservations/abc/undo-checkout"],
    ["POST", "/api/reservations/bulk-checkout-overdue"],
    ["GET", "/api/cancelled-reservations"],
    ["DELETE", "/api/reservations/abc/companions/xyz"],
    ["GET", "/api/reservations/abc/invoices"],
    ["GET", "/api/reservations/abc/credit-notes"],
    // Cargos
    ["POST", "/api/charges"],
    ["PATCH", "/api/charges/abc"],
    ["POST", "/api/charges/abc/transfer"],
    ["GET", "/api/charge-types"],
    ["GET", "/api/charge-types/all"],
    // Pagos
    ["POST", "/api/payments"],
    ["PATCH", "/api/payments/abc"],
    // Huéspedes
    ["GET", "/api/guests"],
    ["GET", "/api/guests/abc"],
    ["POST", "/api/guests"],
    ["PATCH", "/api/guests/abc"],
    ["GET", "/api/guests/search"],
    ["GET", "/api/guests/abc/preferences"],
    ["POST", "/api/guests/abc/preferences"],
    ["DELETE", "/api/guests/abc/preferences/xyz"],
    ["PATCH", "/api/guests/abc/deactivate"],
    ["GET", "/api/guests/abc/reservations"],
    // Folios
    ["GET", "/api/folios"],
    ["GET", "/api/folios/reservation/abc"],
    ["GET", "/api/folios/reservation/abc/pdf"],
    ["POST", "/api/folios/reservation/abc/ensure"],
    // Caja operativa
    ["GET", "/api/cash/shifts"],
    ["GET", "/api/cash/shifts/current"],
    ["GET", "/api/cash/shifts/abc"],
    ["GET", "/api/cash/shifts/autocreados"],
    ["POST", "/api/cash/shifts/open"],
    ["GET", "/api/cash/movements"],
    ["GET", "/api/cash/summary"],
    ["GET", "/api/reports/caja-unificada"],
    // Ampliación a pedido del dueño del producto — PMS-Recepción completo
    ["GET", "/api/planning"],
    ["POST", "/api/planning/day-notes"],
    ["PUT", "/api/planning/day-notes/abc"],
    ["GET", "/api/maintenance/work-orders"],
    ["GET", "/api/room-types"],
    ["POST", "/api/room-types"],
    ["PATCH", "/api/room-types/abc"],
    ["GET", "/api/rooms"],
    ["POST", "/api/rooms"],
    ["PATCH", "/api/rooms/abc"],
    ["GET", "/api/daily-report"],
    ["GET", "/api/rate-plans"],
    ["POST", "/api/rate-plans"],
    ["PATCH", "/api/rate-plans/abc"],
    // Comercial: Motor de Reservas, OTAs, Grupos, Empresas, Agencias
    ["GET", "/api/admin/booking-engine/available-rooms"],
    ["GET", "/api/admin/booking-engine/reservations"],
    ["GET", "/api/ota-channels"],
    ["POST", "/api/ota-channels"],
    ["PATCH", "/api/ota-channels/abc"],
    ["POST", "/api/ota-channels/abc/simulate-import"],
    ["GET", "/api/ota-reservations"],
    ["POST", "/api/ota-reservations"],
    ["POST", "/api/ota-reservations/abc/sync"],
    ["GET", "/api/groups"],
    ["POST", "/api/groups"],
    ["PATCH", "/api/groups/abc"],
    ["GET", "/api/companies"],
    ["POST", "/api/companies"],
    ["PATCH", "/api/companies/abc"],
    ["GET", "/api/agencies"],
    ["GET", "/api/agencies/abc"],
    ["POST", "/api/agencies"],
    // Servicios: Restaurant, Spa, Clientes Spa, Eventos, Vouchers Regalo
    ["GET", "/api/restaurant/tables"],
    ["POST", "/api/restaurant/orders"],
    ["PATCH", "/api/restaurant/orders/abc"],
    ["GET", "/api/spa/appointments"],
    ["POST", "/api/spa/appointments"],
    ["GET", "/api/spa/clients"],
    ["POST", "/api/spa/clients"],
    ["GET", "/api/reports/spa/por-profesional"],
    ["GET", "/api/events"],
    ["POST", "/api/events"],
    ["PATCH", "/api/events/abc"],
    ["GET", "/api/gift-vouchers"],
    ["POST", "/api/gift-vouchers"],
    ["PATCH", "/api/gift-vouchers/abc"],
    ["POST", "/api/gift-vouchers/abc/use"],
    // Referencias de solo lectura usadas por las pantallas de arriba
    ["GET", "/api/bed-types"],
    ["GET", "/api/pos-configs"],
    ["GET", "/api/inventory/items"],
  ];

  it.each(ALLOWED)("permite %s %s", (method, path) => {
    const { nextCalled, status } = callMiddleware(PILOT_EXTERNAL_ROLE, method, path);
    expect(nextCalled).toBe(true);
    expect(status).toBeNull();
  });

  const BLOCKED: Array<[string, string]> = [
    // Anular pagos o reservas
    ["POST", "/api/reservations/abc/cancel"],
    ["DELETE", "/api/reservations/abc"],
    ["PATCH", "/api/charges/abc/anular"],
    ["DELETE", "/api/charges/abc"],
    ["PATCH", "/api/payments/abc/anular"],
    ["DELETE", "/api/payments/abc"],
    // Facturación/ARCA (incluso disparada desde /api/payments)
    ["PATCH", "/api/payments/abc/invoice"],
    ["POST", "/api/payments/abc/resume-invoice"],
    ["PATCH", "/api/payments/abc/invoice-reapplication"],
    ["PATCH", "/api/payments/abc/invoice-link-failed"],
    ["GET", "/api/billing/config"],
    ["POST", "/api/billing/invoices/abc/nota-credito"],
    ["POST", "/api/billing/invoices/abc/nota-debito"],
    // Config / catálogo, no operación diaria
    ["POST", "/api/charge-types"],
    ["PATCH", "/api/charge-types/abc"],
    ["DELETE", "/api/charge-types/abc"],
    // Borrado físico de huésped y cuenta corriente
    ["DELETE", "/api/guests/abc"],
    ["GET", "/api/guests/abc/account"],
    ["GET", "/api/guests/abc/account/pending-charges"],
    ["POST", "/api/guests/abc/account/payment"],
    ["GET", "/api/account-summary"],
    ["GET", "/api/account-movements/report"],
    ["GET", "/api/reports/indec"],
    // Folios: cierres, reapertura, movimientos directos y agregados
    ["POST", "/api/folios/abc/close"],
    ["POST", "/api/folios/abc/reopen"],
    ["POST", "/api/folios/abc/movements"],
    ["GET", "/api/folios/stats/summary"],
    ["GET", "/api/folios/stats/by-entity-type"],
    ["GET", "/api/folios/movements/by-date"],
    // Movimientos manuales de caja / cierre de turno
    ["POST", "/api/cash/movements"],
    ["PATCH", "/api/cash/movements/abc/anular"],
    ["POST", "/api/cash/shifts/abc/close"],
    ["PATCH", "/api/cash/shifts/abc/tomar"],
    ["POST", "/api/cash/init-shifts"],
    ["GET", "/api/cash/configs"],
    ["GET", "/api/admin-cash/saldo"],
    ["POST", "/api/admin-cash/movimientos"],
    ["PATCH", "/api/admin-cash/movimientos/abc/anular"],
    ["POST", "/api/admin-cash/arqueo"],
    // Night audit manual
    ["POST", "/api/night-audit/run"],
    // Todo lo demás: administración, configuración, usuarios, exports
    ["GET", "/api/admin/users"],
    ["GET", "/api/system-users"],
    ["GET", "/api/system-settings"],
    ["GET", "/api/exports/reservations"],
    ["POST", "/api/webhook/chatbot"],
    // Ampliación a pedido del dueño del producto — borrados físicos y
    // cierres/anulaciones de los módulos nuevos, uno por uno (misma
    // exigencia que ya se aplicaba a Reservas/Cargos/Pagos)
    ["DELETE", "/api/room-types/abc"],
    ["DELETE", "/api/rate-plans/abc"],
    ["DELETE", "/api/rooms/abc"],
    ["DELETE", "/api/ota-channels/abc"],
    ["DELETE", "/api/groups/abc"],
    ["DELETE", "/api/group-blocks/abc"],
    ["DELETE", "/api/groups/abc/charges/xyz"],
    ["DELETE", "/api/groups/abc/master-payments/xyz"],
    ["DELETE", "/api/groups/abc/reservations/xyz"],
    ["DELETE", "/api/companies/abc"],
    ["DELETE", "/api/agencies/abc"],
    ["DELETE", "/api/restaurant/areas/abc"],
    ["DELETE", "/api/restaurant/tables/abc"],
    ["DELETE", "/api/restaurant/menu/categories/abc"],
    ["DELETE", "/api/restaurant/menu/items/abc"],
    ["POST", "/api/restaurant/orders/abc/close"],
    ["DELETE", "/api/restaurant/orders/abc/items/xyz"],
    ["DELETE", "/api/restaurant/table-reservations/abc"],
    ["DELETE", "/api/restaurant/time-slots/abc"],
    ["DELETE", "/api/restaurant/orders/abc/split"],
    ["POST", "/api/restaurant/orders/abc/cancel"],
    ["DELETE", "/api/restaurant/recipes/abc"],
    ["DELETE", "/api/restaurant/recipe-ingredients/abc"],
    ["DELETE", "/api/restaurant/reservation-advances/abc"],
    ["DELETE", "/api/spa/cabins/abc"],
    ["DELETE", "/api/spa/treatment-categories/abc"],
    ["DELETE", "/api/spa/treatments/abc"],
    ["DELETE", "/api/spa/appointments/abc"],
    ["POST", "/api/spa/accounts/abc/close"],
    ["PATCH", "/api/spa/payments/abc/anular"],
    ["DELETE", "/api/spa/payments/abc"],
    ["DELETE", "/api/spa/account-items/abc"],
    ["DELETE", "/api/spa/clients/abc"],
    ["DELETE", "/api/spa/treatments/supplies/xyz"],
    ["DELETE", "/api/events/rooms/abc"],
    ["DELETE", "/api/events/charge-types/abc"],
    ["DELETE", "/api/events/abc"],
    ["DELETE", "/api/events/charges/abc"],
    ["PATCH", "/api/events/abc/payments/xyz/anular"],
    ["DELETE", "/api/events/abc/payments/xyz"],
    ["POST", "/api/events/abc/close"],
    ["DELETE", "/api/events/abc/tables/xyz"],
    ["DELETE", "/api/events/abc/tables/xyz/charges/qwe"],
    ["POST", "/api/events/abc/tables/xyz/close"],
    ["DELETE", "/api/gift-vouchers/abc"],
    // Escritura sobre catálogos de solo lectura (no pedidos)
    ["POST", "/api/bed-types"],
    ["PATCH", "/api/pos-configs/abc"],
    ["POST", "/api/inventory/items"],
    ["DELETE", "/api/inventory/items/abc"],
    // Configuración del motor de reservas fuera de las 2 rutas de solo
    // lectura permitidas arriba
    ["POST", "/api/admin/booking-engine/config"],
  ];

  it.each(BLOCKED)("bloquea %s %s (403)", (method, path) => {
    const { nextCalled, status } = callMiddleware(PILOT_EXTERNAL_ROLE, method, path);
    expect(nextCalled).toBe(false);
    expect(status).toBe(403);
  });
});

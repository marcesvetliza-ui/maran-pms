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
    ["GET", "/api/bed-types"],
    // Borrado físico de huésped y cuenta corriente
    ["DELETE", "/api/guests/abc"],
    ["GET", "/api/guests/abc/account"],
    ["GET", "/api/guests/abc/account/pending-charges"],
    ["POST", "/api/guests/abc/account/payment"],
    ["GET", "/api/companies"],
    ["GET", "/api/agencies/abc"],
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
  ];

  it.each(BLOCKED)("bloquea %s %s (403)", (method, path) => {
    const { nextCalled, status } = callMiddleware(PILOT_EXTERNAL_ROLE, method, path);
    expect(nextCalled).toBe(false);
    expect(status).toBe(403);
  });
});

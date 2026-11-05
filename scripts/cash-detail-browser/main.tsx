import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import "@/index.css";

const params = new URLSearchParams(location.search);
const area = params.get("area") || "restaurant";
const status = params.get("status") || "closed";
const shift = {
  id: "fixture-shift", area, status, shiftNumber: 40, turnoTipo: "tarde",
  openedBy: "Operador de prueba", closedBy: "Supervisor de prueba",
  openedAt: "2026-11-04T17:01:00-03:00",
  closedAt: status === "closed" ? "2026-11-05T01:15:00-03:00" : null,
};
const methods = ["cash", "debit_card", "credit_card", "transfer", "mercadopago", "current_account", "room_charge", "voucher"];
const movements = Array.from({ length: 48 }, (_, i) => ({
  id: i + 1, shiftId: 1, area, sourceType: i % 3 === 0 ? "restaurant_order" : "manual",
  sourceId: `PRUEBA-${i + 1}-${"referencia".repeat(7)}`,
  sourceLabel: `Comprobante ficticio ${i + 1}`,
  paymentMethod: methods[i % methods.length], amount: 123456789.99 + i,
  movementType: i % 8 >= 5 ? "informational" : "income",
  receiptType: "ticket", receiptNumber: `FICTICIO-${i + 1}`,
  description: "Descripción ficticia extensa para comprobar la lectura completa y la distribución del detalle sin modificar operaciones del hotel. " + "TextoSinEspacios".repeat(8),
  createdAt: "2026-11-04T19:20:00-03:00",
}));
const sum = (rows: typeof movements) => rows.reduce((total, m) => total + Math.round(m.amount * 100), 0) / 100;
const sumMethod = (method: string) => String(sum(movements.filter(m => m.paymentMethod === method)));
const summary = {
  totalCash: sumMethod("cash"), totalDebitCard: sumMethod("debit_card"), totalCreditCard: sumMethod("credit_card"),
  totalTransfer: sumMethod("transfer"), totalMercadopago: sumMethod("mercadopago"), totalCurrentAccount: sumMethod("current_account"),
  totalRoomCharge: sumMethod("room_charge"), totalVoucher: sumMethod("voucher"),
  totalGeneral: String(sum(movements.filter(m => m.movementType === "income"))), transactionCount: 30,
  nonCashSettlementsTotal: String(sum(movements.filter(m => m.movementType === "informational"))),
  nonCashSettlementsCount: 18, closedAt: shift.closedAt,
  notes: "Observaciones ficticias extensas del cierre. " + "ReferenciaSinSeparadores".repeat(12),
};
// No backend is connected. Unknown reads and all writes fail explicitly.
window.fetch = async (input, options) => {
  const method = (options?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method !== "GET") {
    document.body.dataset.attemptedWrite = method;
    throw new Error("Prohibido escribir desde la prueba visual de Caja");
  }
  const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
  let data;
  if (url.pathname === "/api/cash/summary") data = status === "closed" ? [{ ...summary, id: "fixture-summary", shiftId: shift.id, area, shift }] : [];
  else if (url.pathname === "/api/cash/shifts") data = status === "open" ? [shift] : [];
  else if (url.pathname === `/api/cash/shifts/${shift.id}`) data = { shift, movements, summary: status === "closed" ? summary : null };
  else if (url.pathname === "/api/restaurant/orders") data = [{
    id: "cancelled-fixture", orderNumber: "FICTICIO-99", total: 987654321.99,
    closedAt: shift.closedAt, table: { tableNumber: 10 },
    cancellationReason: "Motivo ficticio extenso, visible completo. " + "MotivoSinEspacios".repeat(12),
  }];
  else if (["/api/spa/appointments/cancellations/in-shift", "/api/reservations/cancellations/in-shift", `/api/cash/shifts/${shift.id}/card-rectifications`].includes(url.pathname)) data = [];
  else throw new Error(`Lectura no prevista en el fixture: ${url.pathname}`);
  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
};
const modulePath = params.has("baseline")
  ? "/@id/cash-review-baseline"
  : "/@id/cash-review-current";
const { HistorialTab } = await import(/* @vite-ignore */ modulePath);
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <p style={{ padding: "12px 16px" }}>Prueba visual aislada · Datos ficticios · Sin conexión a Caja</p>
    <HistorialTab />
  </QueryClientProvider>
);
if (params.has("auto")) {
  const timer = setInterval(() => {
    const button = status === "closed"
      ? document.querySelector<HTMLButtonElement>('[data-testid="btn-view-detail-fixture-summary"]')
      : Array.from(document.querySelectorAll("button")).find(b => b.textContent?.includes("Ver movimientos"));
    if (button) { button.focus(); button.click(); clearInterval(timer); }
  }, 100);
}

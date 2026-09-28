import express from "express";
import { describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";

/**
 * "No debe guardarse parcialmente si falla caja" — investigando esto se
 * encontró que POST /api/billing/invoices no puede envolverse en una sola
 * transacción (emitirFactura llama a ARCA por HTTP en el medio, imposible
 * de meter dentro de una transacción Postgres). El problema real era más
 * puntual: si storage.registerCashMovement() fallaba después de emitida la
 * factura, el error se tragaba en silencio (solo console.error) y la
 * respuesta igual devolvía 201 sin avisar a nadie que la plata no quedó
 * asentada en caja.
 *
 * La factura ya es fiscalmente válida en ese punto (puede tener CAE real de
 * ARCA) — no hay forma segura de "deshacerla", así que la respuesta sigue
 * siendo 201 (evita que un reintento automático genere una segunda factura
 * real), pero ahora el fallo de caja queda visible en la respuesta
 * (cashMovementError) y auditado (audit_logs, visible en Administración)
 * en vez de perderse.
 */

const state = vi.hoisted(() => ({ invoices: [] as any[], auditCalls: [] as any[] }));

vi.mock("../db", () => ({
  db: { execute: vi.fn(async () => ({ rows: state.invoices })) },
  pool: { connect: vi.fn(async () => ({ query: vi.fn(async () => ({ rows: [] })), release: vi.fn() })) },
}));

vi.mock("@shared/schema", () => ({
  salesInvoices: {},
  invoiceCounters: {},
  folioMovements: {},
}));

vi.mock("../billing/invoiceService", () => ({
  calcularMontos: vi.fn((items: any[]) => ({
    montoTotal: items.reduce((sum: number, item: any) => sum + Number(item.subtotal ?? item.precioUnitario * item.cantidad), 0),
  })),
  emitirFactura: vi.fn(async (data: any) => ({
    id: 501,
    tipoComprobante: data.tipoComprobante,
    puntoVenta: 1,
    numero: 501,
    montoTotal: "1000.00",
  })),
  buildComprobanteAsociado: vi.fn(() => ({ tipo: "", puntoVenta: 0, numero: 0, fecha: "" })),
}));

vi.mock("../db-storage", () => ({
  storage: {
    getReservation: vi.fn(async () => null),
    getCharges: vi.fn(async () => []),
    getPayments: vi.fn(async () => []),
    createAccountMovement: vi.fn(),
    registerCashMovement: vi.fn(async () => { throw new Error("Turno de caja cerrado"); }),
    createAuditLog: vi.fn(async (log: any) => { state.auditCalls.push(log); return { id: "audit-1", ...log }; }),
  },
}));

vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
  requireRole: () => (_req: any, _res: any, next: () => void) => next(),
}));
vi.mock("../audit", async () => {
  const actual = await vi.importActual<typeof import("../audit")>("../audit");
  return actual;
});
vi.mock("../billing/billingConfig", () => ({
  getBillingConfig: vi.fn(),
  updateBillingConfig: vi.fn(),
}));
vi.mock("../billing/invoicePdf", () => ({
  generarFacturaPDF: vi.fn(),
  generarVoucherHabitacionPDF: vi.fn(),
}));
vi.mock("../utils/assetPath", () => ({ assetPath: (value: string) => value }));
vi.mock("pdfkit", () => ({ default: class PDFDocument {} }));

const { registerBillingRoutes } = await import("../billing/routes");

async function withServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: "admin-1", username: "admin", fullName: "Admin" };
    next();
  });
  registerBillingRoutes(app);
  const server = await new Promise<Server>((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  try {
    return await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

describe("falla en el registro de movimiento de caja después de emitida la factura", () => {
  it("no se traga el error: sigue devolviendo la factura (201) pero con cashMovementError, y audita el fallo", async () => {
    state.auditCalls = [];
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/billing/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipoComprobante: "FB",
          cliente: { razonSocial: "Consumidor Final", condicionIva: "Consumidor Final" },
          items: [{
            descripcion: "Cargo de prueba",
            cantidad: 1,
            precioUnitario: 1000,
            alicuotaIva: "21",
            subtotalNeto: 826.45,
            subtotal: 1000,
          }],
          cashArea: "restaurant",
          cashFormaPago: "efectivo",
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      // La factura sigue siendo válida y se devuelve igual — no se pierde.
      expect(body.id).toBe(501);
      // Pero ahora el fallo de caja es visible, no silencioso.
      expect(body.cashMovementError).toMatch(/Turno de caja cerrado/);
    });

    expect(state.auditCalls).toHaveLength(1);
    expect(state.auditCalls[0]).toMatchObject({
      action: "update",
      module: "sales_invoices",
      entityId: "501",
    });
    expect(state.auditCalls[0].description).toMatch(/falló el registro del movimiento de caja/i);
  });
});

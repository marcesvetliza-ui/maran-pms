import express from "express";
import type { Server } from "node:http";
import { inflateSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  dbResponses: [] as Array<{ rows: any[] }>,
  pdfPayloads: [] as any[],
}));

const reservation = {
  id: "reservation-1",
  reservationCode: "RES-442",
  totalRoomAmount: "143000.00",
  finalRatePerNight: "143000.00",
  nights: 1,
  checkInDate: "2026-08-31",
  checkOutDate: "2026-09-01",
  guest: { firstName: "Caso", lastName: "NC" },
  room: { roomNumber: "101" },
};

const charges = [
  { id: "parking", description: "Cochera", amount: "2500.00", date: "2026-08-31", category: "otros", status: "active" },
  {
    id: "nc-adjustment",
    description: "Ajuste por NC NCB 0001-00000087 — Alojamiento [nc:87:accommodation]",
    amount: "-43000.00",
    date: "2026-08-31",
    category: "adjustment",
    status: "active",
  },
];

const payments = [{
  id: "payment-1",
  amount: "43000.00",
  method: "transferencia",
  date: "2026-08-31",
  status: "active",
  invoiceRef: JSON.stringify({ id: 86, tipoComprobante: "FB", puntoVenta: 1, numero: 86 }),
}];

const invoices = [
  {
    id: 86,
    tipo_comprobante: "FB",
    punto_venta: 1,
    numero: 86,
    fecha_emision: "2026-08-31",
    monto_total: "43000.00",
    monto_acreditado: "43000.00",
    estado: "anulada",
    nota_credito_id: 87,
    cae: "CAE-FB",
  },
  {
    id: 87,
    tipo_comprobante: "NCB",
    punto_venta: 1,
    numero: 87,
    fecha_emision: "2026-08-31",
    monto_total: "43000.00",
    monto_acreditado: "0.00",
    estado: "emitida",
    nota_credito_id: 86,
    cae: "CAE-NC",
  },
];

const storage = {
  getReservation: vi.fn(async () => reservation),
  getCharges: vi.fn(async () => charges),
  getPayments: vi.fn(async () => payments),
};

vi.mock("../db-storage", () => ({
  storage,
  getArgentinaToday: () => "2026-08-31",
}));
vi.mock("../db", () => ({
  db: {
    execute: vi.fn(async () => state.dbResponses.shift() ?? { rows: [] }),
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(),
  },
  pool: { query: vi.fn(), connect: vi.fn() },
}));
vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
}));
vi.mock("../billing/invoiceService", () => ({ emitirFactura: vi.fn() }));
vi.mock("../billing/invoicePdf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../billing/invoicePdf")>();
  return {
    ...actual,
    generarResumenCuentaPDF: vi.fn(async (payload: any, config: any) => {
      state.pdfPayloads.push(payload);
      return actual.generarResumenCuentaPDF(payload, config);
    }),
  };
});
vi.mock("../billing/billingConfig", () => ({
  getBillingConfig: vi.fn(async () => ({ razonSocial: "Maran" })),
}));
vi.mock("../audit", () => ({ audit: vi.fn() }));
vi.mock("../email-service", () => ({ sendCheckoutEmail: vi.fn(), sendConfirmationEmail: vi.fn() }));
vi.mock("../utils/assetPath", () => ({ assetPath: (value: string) => value }));

const { registerReservationsRoutes } = await import("../routes/reservations");

/**
 * PDFKit writes page content as Flate-compressed PDF streams. Decode those
 * streams directly with Node so this regression test does not require
 * pdftotext (or any other system utility) in CI.
 */
function extractPdfText(pdf: Buffer): string {
  const source = pdf.toString("latin1");
  const chunks: string[] = [];

  for (const match of source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let content: string;
    try {
      content = inflateSync(Buffer.from(match[1], "latin1")).toString("latin1");
    } catch {
      continue;
    }

    // Rebuild each text operation independently. PDFKit can split a word
    // into multiple hexadecimal strings inside one TJ array for kerning.
    for (const operation of content.matchAll(/\[([\s\S]*?)\]\s*TJ|\(((?:\\.|[^\\()])*)\)\s*Tj/g)) {
      const operands = operation[1] ?? `(${operation[2]})`;
      const operationChunks: string[] = [];
      for (const textMatch of operands.matchAll(/<([0-9a-f]+)>|\(((?:\\.|[^\\()])*)\)/gi)) {
        if (textMatch[1] !== undefined) {
          operationChunks.push(Buffer.from(textMatch[1], "hex").toString("latin1"));
        } else {
          operationChunks.push(textMatch[2].replace(/\\([\\()nrtbf])/g, (_match, escaped: string) => ({
            "\\": "\\",
            "(": "(",
            ")": ")",
            n: "\n",
            r: "\r",
            t: "\t",
            b: "\b",
            f: "\f",
          })[escaped] ?? escaped));
        }
      }
      chunks.push(operationChunks.join(""));
    }
  }

  return chunks.join(" ");
}

async function withServer<T>(run: (baseUrl: string) => Promise<T>) {
  const app = express();
  app.use(express.json());
  registerReservationsRoutes(app);
  const server = await new Promise<Server>((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  try {
    return await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

beforeEach(() => {
  state.dbResponses = [];
  state.pdfPayloads = [];
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("reservation folio after a total credit note", () => {
  it("keeps operational totals in JSON and sends the same reconciled totals to the account-summary PDF", async () => {
    await withServer(async (baseUrl) => {
      const folioResponse = await fetch(`${baseUrl}/api/reservations/reservation-1/folio`);
      expect(folioResponse.status).toBe(200);
      await expect(folioResponse.json()).resolves.toMatchObject({
        roomTotal: 143000,
        totalCharges: 2500,
        totalPayments: 43000,
        grandTotal: 145500,
        balance: 102500,
        charges: [expect.objectContaining({ id: "parking", date: "2026-08-31" })],
        fiscalAdjustments: [expect.objectContaining({ id: "nc-adjustment", date: "2026-08-31" })],
      });

      state.dbResponses = [
        { rows: invoices },
        { rows: [{ id: "folio-1" }] },
        { rows: [] },
      ];
      const pdfResponse = await fetch(`${baseUrl}/api/reservations/reservation-1/folio/pdf`);
      expect(pdfResponse.status).toBe(200);
      expect(pdfResponse.headers.get("content-type")).toContain("application/pdf");

      const pdfText = extractPdfText(Buffer.from(await pdfResponse.arrayBuffer()));
      expect(pdfText).toContain("FB 0001-00000086");
      expect(pdfText).toContain("NCB 0001-00000087");
      expect(pdfText).toContain("31/08/2026");
      expect(pdfText).toContain("$145.500,00");
      expect(pdfText).toContain("$102.500,00");
      expect(pdfText).toContain("Facturado neto: $0,00");
      expect(pdfText).toContain("Anticipo disponible: $43.000,00");
    });

    expect(state.pdfPayloads).toHaveLength(1);
    expect(state.pdfPayloads[0]).toMatchObject({
      roomTotal: 143000,
      charges: [expect.objectContaining({ description: "Cochera", date: "2026-08-31" })],
      payments: [expect.objectContaining({ amount: "43000.00", date: "2026-08-31" })],
      invoices: [
        expect.objectContaining({ tipo_comprobante: "FB", numero: 86, estado: "anulada" }),
        expect.objectContaining({ tipo_comprobante: "NCB", numero: 87, estado: "emitida" }),
      ],
      grandTotal: 145500,
      totalPayments: 43000,
      balance: 102500,
      netInvoiced: 0,
      availableAdvance: 43000,
      pendingBilling: 145500,
    });
  });
});
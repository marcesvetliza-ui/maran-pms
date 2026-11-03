import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
vi.mock("../db", () => ({ db: {} }));
vi.mock("../accounting", () => ({ generarAsientoOP: vi.fn(async () => 70) }));
import { createPaymentOrder } from "../paymentOrder";
import { generarAsientoOP } from "../accounting";

const dialect = new PgDialect();
describe("OP en efectivo de comprobante no fiscal", () => {
  it.each([null, 1000])("cancela el importe solicitado y mantiene el saldo correcto: %s", async montoParcial => {
    const amount = montoParcial ?? 2400;
    const op = { id: 30, fecha: "2026-11-03", total_facturas: amount, efectivo: amount, dep_bancario: 0, total_abonado: amount };
    const answers = [
      { rows: [{ id: 9, monto_total: "2400", monto_neto: "2400", saldo_pendiente: "2400", tipo_comprobante: "REMITO-NF", estado: "pendiente", supplier_id: 1 }] },
      { rows: [{ next: 1 }] }, { rows: [op] }, { rows: [] }, { rows: [] },
      { rows: [{ razon_social: "Proveedor" }] }, { rows: [] },
    ];
    const statements: ReturnType<PgDialect["sqlToQuery"]>[] = [];
    const tx = { execute: vi.fn(async (query: any) => { statements.push(dialect.sqlToQuery(query)); const answer = answers.shift(); if (!answer) throw new Error("Consulta inesperada"); return answer; }) };
    const result = await createPaymentOrder(tx as any, { supplierId: 1, facturaIds: [9], formaPago: "efectivo", efectivo: amount, montoParcial }, () => "2026-11-03");
    expect(result.op).toMatchObject({ efectivo: amount, total_abonado: amount, asiento_id: 70 });
    expect(statements.find(q => q.sql.startsWith("UPDATE purchase_invoices"))?.params).toEqual([montoParcial ? "parcial" : "pagado", 2400 - amount, 9]);
    expect(generarAsientoOP).toHaveBeenLastCalledWith(expect.objectContaining({ efectivo: amount, totalFacturas: amount }), tx);
    expect(answers).toHaveLength(0);
  });
});

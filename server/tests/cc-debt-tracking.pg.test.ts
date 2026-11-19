import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool, withDatabaseTransaction } from "../db";
import {
  getCcInvoiceTrackingList,
  getCcInvoiceTrackingMonthReport,
  upsertCcInvoiceTracking,
} from "../ccInvoiceTracking";
import { upsertCcMovementTracking } from "../ccDebtTracking";
import { addCcManualTracking } from "../ccManualTracking";

beforeAll(() => {
  const url = new URL(process.env.DATABASE_URL!);
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    !url.pathname.includes("test")
  )
    throw new Error("Disposable local test database required");
});
afterAll(() => pool.end());
async function fixture(run: (f: any) => Promise<void>) {
  const rollback = new Error("fixture rollback");
  await expect(
    withDatabaseTransaction(async () => {
      const f: any = Object.fromEntries(
        [
          "company",
          "agency",
          "guest",
          "stay",
          "payment",
          "extraPayment",
          "lodging",
          "extras",
          "agencyCargo",
          "room",
          "roomType",
        ].map((k) => [k, randomUUID()]),
      );
      f.date = "2003-05-19";
      await db.execute(
        sql`INSERT INTO companies(id,razon_social,cuil_cuit,nombre_fantasia) VALUES(${f.company},'Caja de Previsión Social Médicos y Bioquímicos','30111111111','')`,
      );
      await db.execute(
        sql`INSERT INTO agencies(id,razon_social,cuil_cuit,nombre_fantasia) VALUES(${f.agency},'Agencia sin fantasía','30222222222','   ')`,
      );
      await db.execute(
        sql`INSERT INTO guests(id,first_name,last_name) VALUES(${f.guest},'JAIME','BASTERRA')`,
      );
      const room = (
        await db.execute(
          sql`SELECT id FROM rooms WHERE room_number='807' LIMIT 1`,
        )
      ).rows[0];
      if (room) f.room = room.id;
      else {
        await db.execute(
          sql`INSERT INTO room_types(id,code,name,max_occupancy) VALUES(${f.roomType},${f.roomType},'Tipo sintético',2)`,
        );
        await db.execute(
          sql`INSERT INTO rooms(id,room_number,room_type_id,status) VALUES(${f.room},'807',${f.roomType},'available')`,
        );
      }
      await db.execute(sql`INSERT INTO reservations(id,reservation_code,guest_id,company_id,room_type_id,room_id,check_in_date,check_out_date,status,created_at)
   VALUES(${f.stay},'RES-BASTERRA-TEST',${f.guest},${f.company},${f.roomType},${f.room},'2026-11-16','2026-11-19','checked_out',now())`);
      await db.execute(
        sql`INSERT INTO payments(id,reservation_id,amount,method,date) VALUES(${f.payment},${f.stay},585000,'cuenta_corriente',${f.date}),(${f.extraPayment},${f.stay},108500,'cuenta_corriente',${f.date})`,
      );
      for (const [id, amount, payment, desc] of [
        [f.lodging, 585000, f.payment, "Alojamiento"],
        [
          f.extras,
          108500,
          f.extraPayment,
          "Estacionamiento $22.500 y restaurante $86.000",
        ],
      ]) {
        await db.execute(sql`INSERT INTO account_movements(id,entity_type,entity_id,date,type,description,amount,reservation_id,payment_id)
    VALUES(${id},'company',${f.company},${f.date},'cargo',${desc},${amount},${f.stay},${payment})`);
      }
      f.invoice = async (
        payment: string | null,
        amount: number,
        number = 252,
        pv = 5,
      ) =>
        Number(
          (
            await db.execute(sql`INSERT INTO sales_invoices(tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_condicion_iva,recipient_entity_type,recipient_entity_id,monto_neto,monto_total,estado,cash_forma_pago,reserva_id,payment_id)
    VALUES('FA',${pv},${number},${f.date},'Titular fiscal', 'responsable_inscripto','company',${f.company},${amount},${amount},'emitida','cuenta_corriente',${f.stay},${payment}) RETURNING id`)
          ).rows[0].id,
        );
      f.invoiceId = await f.invoice(f.payment, 585000);
      f.rows = () => getCcInvoiceTrackingList({ entityId: f.company });
      f.pay = async (amount: number, target = f.extras) => {
        const id = randomUUID();
        await db.execute(
          sql`INSERT INTO account_movements(id,entity_type,entity_id,date,type,description,amount) VALUES(${id},'company',${f.company},${f.date},'pago','Recibo sintético',${-amount})`,
        );
        await db.execute(
          sql`INSERT INTO account_movement_allocations(pago_id,cargo_id,amount) VALUES(${id},${target},${amount})`,
        );
        return id;
      };
      await run(f);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
}
async function fiscalSnapshot(f: any) {
  return (
    await db.execute(sql`SELECT
  (SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM account_movements m WHERE entity_id=${f.company}) ledger,
  (SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM sales_invoices i WHERE reserva_id=${f.stay}) invoices,
  (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM payments p WHERE reservation_id=${f.stay}) payments,
  (SELECT count(*) FROM cash_movements) cash_count`)
  ).rows[0];
}

describe("CC debt tracking projection (no financial mutations)", () => {
  it("Basterra: shows both real charges under the company, only the lodging has FA 00005-00000252", () =>
    fixture(async (f) => {
      const before = await fiscalSnapshot(f),
        rows = await f.rows();
      expect(rows).toHaveLength(2);
      expect(
        rows.every(
          (r: any) =>
            r.entityName === "Caja de Previsión Social Médicos y Bioquímicos" &&
            r.motivo === "BASTERRA, JAIME — habitación 807",
        ),
      ).toBe(true);
      expect(
        rows.find((r: any) => r.salesInvoiceId === f.invoiceId),
      ).toMatchObject({
        numeroFactura: "00005-00000252",
        monto: 585000,
        saldoPendiente: 585000,
        documentStatus: "facturada",
      });
      expect(
        rows.find((r: any) => r.documentStatus === "sin_factura"),
      ).toMatchObject({
        monto: 108500,
        saldoPendiente: 108500,
        accountMovementIds: [f.extras],
        salesInvoiceId: 0,
      });
      expect(rows.reduce((s: number, r: any) => s + r.saldoPendiente, 0)).toBe(
        693500,
      );
      expect(await fiscalSnapshot(f)).toEqual(before);
    }));
  it("falls back for blank/whitespace company names, and includes agency charges without any invoice", () =>
    fixture(async (f) => {
      await db.execute(
        sql`UPDATE companies SET nombre_fantasia=E' \t\n ' WHERE id=${f.company}`,
      );
      await db.execute(
        sql`INSERT INTO account_movements(id,entity_type,entity_id,date,type,description,amount) VALUES(${f.agencyCargo},'agency',${f.agency},${f.date},'cargo','Cargo sin documento',123)`,
      );
      expect((await f.rows())[0].entityName).toBe(
        "Caja de Previsión Social Médicos y Bioquímicos",
      );
      expect(
        await getCcInvoiceTrackingList({ entityId: f.agency }),
      ).toMatchObject([
        {
          entityType: "agency",
          entityName: "Agencia sin fantasía",
          monto: 123,
          saldoPendiente: 123,
          documentStatus: "sin_factura",
        },
      ]);
    }));
  it("keeps original amount distinct from a partial payment; a voided payment no longer cancels debt", () =>
    fixture(async (f) => {
      const pay = await f.pay(8500);
      expect(
        (await f.rows()).find((r: any) => r.documentStatus === "sin_factura"),
      ).toMatchObject({ monto: 108500, saldoPendiente: 100000 });
      await db.execute(
        sql`UPDATE account_movements SET voided=true WHERE id=${pay}`,
      );
      expect(
        (await f.rows()).find((r: any) => r.documentStatus === "sin_factura")
          .saldoPendiente,
      ).toBe(108500);
    }));
  it("does not use administrative pagada as evidence of payment or treat a paid unbilled charge as invoiced", () =>
    fixture(async (f) => {
      await upsertCcMovementTracking(
        f.extras,
        { estado: "pagada", observaciones: "Estado de gestión" },
        "test",
      );
      expect(
        (await f.rows()).find((r: any) => r.documentStatus === "sin_factura"),
      ).toMatchObject({ estado: "pagada", saldoPendiente: 108500 });
      await f.pay(108500);
      expect(
        (await f.rows()).find((r: any) => r.documentStatus === "sin_factura"),
      ).toMatchObject({
        monto: 108500,
        saldoPendiente: 0,
        documentStatus: "sin_factura",
      });
    }));
  it("a later invoice replaces the unbilled presentation without duplicating debt, preserving management notes", () =>
    fixture(async (f) => {
      await upsertCcMovementTracking(
        f.extras,
        { estado: "reclamada", observaciones: "Llamar mañana" },
        "test",
      );
      const invoice = await f.invoice(f.extraPayment, 108500, 253);
      const rows = await f.rows();
      expect(rows).toHaveLength(2);
      expect(rows.some((r: any) => r.documentStatus === "sin_factura")).toBe(
        false,
      );
      expect(rows.find((r: any) => r.salesInvoiceId === invoice)).toMatchObject(
        {
          estado: "reclamada",
          observaciones: "Llamar mañana",
          monto: 108500,
          saldoPendiente: 108500,
        },
      );
    }));
  it("does not infer invoicing from a different invoice for the same reservation and amount", () =>
    fixture(async (f) => {
      await f.invoice(null, 108500, 254);
      const rows = await f.rows();
      expect(
        rows.find((r: any) => r.accountMovementIds?.includes(f.extras))
          .documentStatus,
      ).toBe("sin_factura");
      expect(
        rows.find((r: any) => r.numeroFactura === "00005-00000254")
          .saldoPendiente,
      ).toBeNull();
    }));
  it("partial documentation keeps the remaining amount outside billed totals", () =>
    fixture(async (f) => {
      await db.execute(
        sql`UPDATE sales_invoices SET monto_total=300000,monto_neto=300000 WHERE id=${f.invoiceId}`,
      );
      const rows = await f.rows();
      expect(
        rows.find((r: any) => r.salesInvoiceId === f.invoiceId),
      ).toMatchObject({
        documentStatus: "facturacion_parcial",
        importeFacturado: 300000,
        importeSinFactura: 285000,
        monto: 585000,
        saldoPendiente: 585000,
      });
      expect(await getCcInvoiceTrackingMonthReport(2003, 5)).toMatchObject({
        totalFacturado: 300000,
        totalSinFactura: 393500,
        totalSaldoPendiente: 693500,
      });
    }));
  it("the ledger owner takes precedence over a different fiscal recipient when the payment link is explicit", () =>
    fixture(async (f) => {
      await db.execute(
        sql`UPDATE sales_invoices SET recipient_entity_type='guest',recipient_entity_id=${f.guest} WHERE id=${f.invoiceId}`,
      );
      expect(
        (await f.rows()).find((r: any) => r.salesInvoiceId === f.invoiceId),
      ).toMatchObject({
        entityType: "company",
        entityId: f.company,
        entityName: "Caja de Previsión Social Médicos y Bioquímicos",
        documentStatus: "facturada",
      });
    }));
  it("voided cargo disappears; a cancelled invoice with an active cargo is exposed for review without hiding debt", () =>
    fixture(async (f) => {
      await db.execute(
        sql`UPDATE account_movements SET voided=true WHERE id=${f.extras}`,
      );
      await db.execute(
        sql`UPDATE sales_invoices SET estado='anulada' WHERE id=${f.invoiceId}`,
      );
      const rows = await f.rows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        documentStatus: "factura_anulada",
        saldoPendiente: 585000,
        importeFacturado: 0,
      });
    }));
  it("applies explicit credit-note ledger compensation once, even when also allocated", () =>
    fixture(async (f) => {
      const pay = await f.pay(5000, f.lodging);
      await db.execute(
        sql`UPDATE account_movements SET description=${"NC sintética [nc:999] [cargo:" + f.lodging + "]"} WHERE id=${pay}`,
      );
      await db.execute(
        sql`UPDATE sales_invoices SET monto_acreditado=5000 WHERE id=${f.invoiceId}`,
      );
      const row = (await f.rows()).find(
        (r: any) => r.salesInvoiceId === f.invoiceId,
      );
      expect(row).toMatchObject({
        monto: 585000,
        saldoPendiente: 580000,
        importeFacturado: 580000,
      });
      await db.execute(
        sql`UPDATE account_movement_allocations SET voided=true WHERE pago_id=${pay}`,
      );
      expect(
        (await f.rows()).find((r: any) => r.salesInvoiceId === f.invoiceId)
          .saldoPendiente,
      ).toBe(580000);
    }));
  it("manual invoice overlap keeps its state/notes, owner and verified balance, without another debt row", () =>
    fixture(async (f) => {
      await upsertCcInvoiceTracking(
        f.invoiceId,
        { estado: "enviada", observaciones: "Mail previo" },
        "test",
      );
      const manual = await addCcManualTracking(
        {
          requestId: randomUUID(),
          salesInvoiceId: f.invoiceId,
          entityName: "Huésped NO es titular",
          fecha: f.date,
          motivo: "Gestión de recepción",
        },
        "test",
      );
      const rows = await f.rows();
      expect(rows).toHaveLength(2);
      expect(
        rows.find((r: any) => r.salesInvoiceId === f.invoiceId),
      ).toMatchObject({
        manualId: manual.id,
        estado: "enviada",
        observaciones: "Mail previo",
        entityName: "Caja de Previsión Social Médicos y Bioquímicos",
        saldoPendiente: 585000,
      });
    }));
  it("manual charge follow-up survives later invoicing and free tasks are excluded from monetary totals", () =>
    fixture(async (f) => {
      const manual = await addCcManualTracking(
        {
          requestId: randomUUID(),
          accountMovementId: f.extras,
          entityName: "Temporal",
          fecha: f.date,
          motivo: "Esperar factura",
          estado: "reclamada",
          observaciones: "Mantener",
        },
        "test",
      );
      await f.invoice(f.extraPayment, 108500, 253);
      const rows = await f.rows();
      expect(rows).toHaveLength(2);
      expect(rows.find((r: any) => r.manualId === manual.id)).toMatchObject({
        monto: 108500,
        observaciones: "Mantener",
        estado: "reclamada",
        documentStatus: "facturada",
      });
      await addCcManualTracking(
        {
          requestId: randomUUID(),
          entityName: "Caja de Previsión Social Médicos y Bioquímicos",
          reference: "RES-BASTERRA-TEST",
          fecha: f.date,
          motivo: "Gestión histórica sin identidad de cargo",
          monto: 693500,
        },
        "test",
      );
      const report = await getCcInvoiceTrackingMonthReport(2003, 5);
      expect(report).toMatchObject({
        totalFacturado: 693500,
        totalSinFactura: 0,
        totalSaldoPendiente: 693500,
        totalGestionesManuales: 1,
      });
    }));
  it("keeps monthly billed, unbilled and pending totals separate and searches the actual owner/reference/full invoice number", () =>
    fixture(async (f) => {
      const report = await getCcInvoiceTrackingMonthReport(2003, 5);
      expect(report).toMatchObject({
        totalFacturado: 585000,
        totalFacturas: 1,
        totalSinFactura: 108500,
        totalSaldoPendiente: 693500,
      });
      for (const search of [
        "BASTERRA",
        "habitación 807",
        "RES-BASTERRA-TEST",
        "Bioquímicos",
        "bioquimicos",
      ])
        expect(
          (await getCcInvoiceTrackingList({ entityId: f.company, search }))
            .length,
        ).toBe(2);
      expect(
        await getCcInvoiceTrackingList({
          entityId: f.company,
          search: "00005-00000252",
        }),
      ).toHaveLength(1);
      expect(
        await getCcInvoiceTrackingList({
          entityId: f.company,
          documentStatus: "sin_factura",
        }),
      ).toHaveLength(1);
    }));
  it("refuses a guessed legacy fiscal match when two points of sale share the same number", () =>
    fixture(async (f) => {
      await db.execute(
        sql`UPDATE account_movements SET reference='FA-00000254',payment_id=NULL WHERE id=${f.extras}`,
      );
      await f.invoice(null, 108500, 254, 5);
      await f.invoice(null, 108500, 254, 6);
      const rows = await f.rows();
      expect(rows).toHaveLength(2);
      expect(
        rows.find((r: any) => r.accountMovementIds?.includes(f.extras)),
      ).toMatchObject({
        documentStatus: "revision_vinculo",
        monto: 108500,
        saldoPendiente: 108500,
      });
    }));
  it("follow-up edits change only tracking/audit records, never financial records", () =>
    fixture(async (f) => {
      const before = await fiscalSnapshot(f);
      await upsertCcMovementTracking(
        f.extras,
        { estado: "enviada", observaciones: "Solicitar documentación" },
        "test",
      );
      await upsertCcInvoiceTracking(
        f.invoiceId,
        { estado: "reclamada", observaciones: "Seguimiento" },
        "test",
      );
      await addCcManualTracking(
        {
          requestId: randomUUID(),
          accountMovementId: f.extras,
          entityName: "Temporal",
          fecha: f.date,
          motivo: "Gestionar factura",
        },
        "test",
      );
      expect(await fiscalSnapshot(f)).toEqual(before);
    }));

  it("preserves manual state and observations when its invoice is cancelled", () =>
    fixture(async (f) => {
      const manual = await addCcManualTracking(
        {
          requestId: randomUUID(),
          salesInvoiceId: f.invoiceId,
          entityName: "Temporal",
          fecha: f.date,
          motivo: "Revisión",
          estado: "reclamada",
          observaciones: "No perder",
        },
        "test",
      );
      await db.execute(
        sql`UPDATE sales_invoices SET estado='anulada' WHERE id=${f.invoiceId}`,
      );
      const row = (await f.rows()).find((r: any) => r.manualId === manual.id);
      expect(row).toMatchObject({
        documentStatus: "factura_anulada",
        estado: "reclamada",
        observaciones: "No perder",
        saldoPendiente: 585000,
        importeFacturado: 0,
      });
    }));
  it("ambiguous documentary links do not discard manual tasks or add them to debt totals", () =>
    fixture(async (f) => {
      await db.execute(
        sql`UPDATE account_movements SET reference='FA-00000254',payment_id=NULL WHERE id=${f.extras}`,
      );
      const invoice = await f.invoice(null, 108500, 254, 5);
      await f.invoice(null, 108500, 254, 6);
      const manual = await addCcManualTracking(
        {
          requestId: randomUUID(),
          salesInvoiceId: invoice,
          entityName: "Temporal",
          fecha: f.date,
          motivo: "Confirmar vínculo",
          observaciones: "Pendiente de revisar",
        },
        "test",
      );
      const rows = await f.rows();
      expect(rows.find((r: any) => r.manualId === manual.id)).toMatchObject({
        documentStatus: "manual",
        observaciones: "Pendiente de revisar",
        saldoPendiente: null,
      });
      expect(
        rows.reduce((sum: number, r: any) => sum + (r.saldoPendiente ?? 0), 0),
      ).toBe(693500);
    }));
  it("recognizes an explicit legacy payment invoice link regardless of the fiscal payment label, without listing unrelated cash invoices", () =>
    fixture(async (f) => {
      const extraInvoice = await f.invoice(null, 108500, 253);
      await db.execute(
        sql`UPDATE sales_invoices SET cash_forma_pago='mixto' WHERE id=${extraInvoice}`,
      );
      await db.execute(
        sql`UPDATE payments SET invoice_ref=${JSON.stringify({ id: extraInvoice })} WHERE id=${f.extraPayment}`,
      );
      const unrelated = await f.invoice(null, 2000, 254);
      await db.execute(
        sql`UPDATE sales_invoices SET cash_forma_pago='efectivo' WHERE id=${unrelated}`,
      );
      const rows = await f.rows();
      expect(rows).toHaveLength(2);
      expect(
        rows.find((r: any) => r.accountMovementIds?.includes(f.extras)),
      ).toMatchObject({
        salesInvoiceId: extraInvoice,
        documentStatus: "facturada",
        monto: 108500,
        saldoPendiente: 108500,
      });
    }));
});

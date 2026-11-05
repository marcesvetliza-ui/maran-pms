import { describe, expect, it, vi } from "vitest";
const { billingConfig } = vi.hoisted(()=>({billingConfig:vi.fn()}));
vi.mock("../db",()=>({db:{},pool:{}}));
vi.mock("../billing/billingConfig",()=>({getBillingConfig:billingConfig}));
import { storage } from "../db-storage";
import { emitirFactura } from "../billing/invoiceService";
describe("non-fiscal issuance collection guard",()=>{
 it.each(["cierre_habitacion","voucher_justo","voucher_pedidos_ya","voucher_room_service","voucher_consumo_interno","ticket","cierre_spa"])("rejects a noncash collection on %s before configuration, numbering or issuance",async type=>{
  billingConfig.mockClear();
  await expect(emitirFactura({tipoComprobante:type,cashFormaPago:"pago_dividido",cashFormaPagoDetalle:[{method:"cash",amount:10},{method:"tarjeta_credito",amount:20}]} as any)).rejects.toMatchObject({statusCode:400,message:expect.stringMatching(/efectivo/)});
  expect(billingConfig).not.toHaveBeenCalled();
 });
 it("rejects a noncash reservation collection before writing a payment or ledger entry",async()=>{
  await expect(storage.createReservationPaymentWithLedger({payment:{reservationId:"r",method:"credit_card",amount:"100",date:"2026-11-02"},sourceLabel:"Test",receiptType:"cierre_habitacion"})).rejects.toMatchObject({statusCode:400,message:expect.stringMatching(/efectivo/)});
 });
 it("does not restrict methods on fiscal invoices",async()=>{
  billingConfig.mockRejectedValueOnce(new Error("test configuration boundary"));
  await expect(emitirFactura({tipoComprobante:"FB",cashFormaPago:"transferencia"} as any)).rejects.toThrow("test configuration boundary");
 });
});

it("permite CC en cierre de habitación hasta el emisor, sin habilitar tarjetas",async()=>{
 billingConfig.mockRejectedValueOnce(new Error("test CC configuration boundary"));
 await expect(emitirFactura({tipoComprobante:"cierre_habitacion",cashFormaPago:"cuenta_corriente"} as any)).rejects.toThrow("test CC configuration boundary");
});

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CashDocumentBreakdown, printClosingSummary, printResumenDia } from "./cash-register";
import { cashDocumentSummary, classifyCashDocument, nonFiscalCollectionError } from "@shared/cash-document-classification";
afterEach(()=>{cleanup();vi.restoreAllMocks();});
const doc = (type:string,status="emitida",id=1) => ({id,type,status,pointOfSale:5,number:42});
const movement = (amount:number, documentClass:any,extra:any={}) => ({amount,documentClass,paymentMethod:"cash",movementType:"income",...extra});
describe("cash document provenance",()=>{
 it("separates the same physical cash and preserves the total without counting expenses, voids, cards or informational entries",()=>{
  const movements=[movement(240,"fiscal"),movement(2627.5,"non_fiscal"),movement(100,"pending"),movement(20,undefined),movement(30,"other"),movement(900,"non_fiscal",{anulado:true}),movement(800,"fiscal",{movementType:"expense"}),movement(700,"fiscal",{movementType:"informational"}),movement(600,"fiscal",{paymentMethod:"credit_card"})];
  render(<CashDocumentBreakdown movements={movements as any}/>);
  expect(screen.getByTestId("cash-document-total-fiscal")).toHaveTextContent("240,00");
  expect(screen.getByTestId("cash-document-total-non_fiscal")).toHaveTextContent("2.627,50");
  expect(screen.getByTestId("cash-document-total-pending")).toHaveTextContent("100,00");
  expect(cashDocumentSummary(movements).reduce((sum,row)=>sum+row.total,0)).toBe(3017.5);
 });
 it("prints the breakdown and linked document on both open-shift and day summaries, escaping customer text",()=>{
  const write=vi.fn();
  vi.spyOn(window,"open").mockReturnValue({document:{write,close:vi.fn()}} as any);
  const m={...movement(2627.5,"non_fiscal"),id:1,sourceType:"reservation",sourceLabel:"<img src=x>",createdAt:"2026-11-02T15:00:00Z",documentReference:"Cierre de habitación 0005-00000042"};
  printClosingSummary({id:"shift",area:"reception",shiftNumber:1,openedAt:"2026-11-02T14:00:00Z",status:"open"} as any,[m] as any,null,null);
  let html=String(write.mock.calls[0][0]);
  expect(html).toContain("Efectivo por comprobante");
  expect(html).toContain("Cierre de habitación 0005-00000042");
  expect(html).toContain("Comprobante / origen");
  expect(html).toContain("&lt;img src=x&gt;");
  printResumenDia("2026-11-02",{movimientos:[{...m,modulo:"reserva",metodo:"cash",monto:2627.5,referencia:m.documentReference,descripcion:"<img src=x>"}],totalPorMetodo:{cash:2627.5},porModulo:{reserva:2627.5},totalGeneral:2627.5});
  html=String(write.mock.calls[1][0]);
  expect(html).toContain("Comprobante no fiscal");
  expect(html).toContain("Cierre de habitación 0005-00000042");
  expect(html).toContain("&lt;img src=x&gt;");
  expect(html).not.toContain("<img src=x>");
 });
 it("requires an issued linked fiscal document, and does not infer a fiscal invoice from the requested receipt",()=>{
  expect(classifyCashDocument({receiptType:"factura_b"},[]).documentClass).toBe("pending");
  expect(classifyCashDocument({},[doc("FB","autorizacion_pendiente")]).documentClass).toBe("pending");
  expect(classifyCashDocument({},[doc("FB")])).toMatchObject({documentClass:"fiscal",documentReference:"Factura B 0005-00000042"});
  expect(classifyCashDocument({},[]).documentClass).toBe("unclassified");
 });
 it("recognizes nonfiscal room closures and keeps ambiguous document allocations visible",()=>{
  expect(classifyCashDocument({receiptType:"cierre_habitacion"},[]).documentClass).toBe("non_fiscal");
  expect(classifyCashDocument({},[doc("cierre_habitacion"),doc("FB","emitida",2)]).documentClass).toBe("unclassified");
  expect(classifyCashDocument({},[doc("FB"),doc("FB","emitida",2)]).documentClass).toBe("unclassified");
 });
 it.each(["cierre_habitacion","ticket","voucher_justo","voucher_pedidos_ya","voucher_room_service","voucher_consumo_interno","cierre_spa","cierre_spa_agustin","cierre_spa_cortesia"])("permits cash or no new collection for %s, but rejects mixed cash/card funding",type=>{
  expect(nonFiscalCollectionError(type,["cash"])).toBeNull();
  expect(nonFiscalCollectionError(type,[])).toBeNull();
  expect(nonFiscalCollectionError(type,["room_charge","gift_voucher","venta_previa"])).toBeNull();
  expect(nonFiscalCollectionError(type,["cash","credit_card"])).toMatch(/efectivo/);
  expect(nonFiscalCollectionError(type,["transferencia"])).toMatch(/efectivo/);
 });
 it("leaves fiscal methods unrestricted",()=>{
  expect(nonFiscalCollectionError("FB",["cash","credit_card","transferencia","cuenta_corriente"])).toBeNull();
 });
});

it("una baja de comprobante conserva el cobro como anticipo y no agrega un egreso",()=>{
 const preserved=classifyCashDocument({receiptType:"cierre_habitacion"},[doc("cierre_habitacion","anulada")]);
 expect(preserved).toMatchObject({documentClass:"pending"});expect(preserved.documentReference).toContain("cobro conservado");
 const notice=classifyCashDocument({sourceType:"non_fiscal_void",receiptType:"cierre_habitacion"},[]);
 const totals=cashDocumentSummary([movement(80,preserved.documentClass),movement(0,notice.documentClass,{movementType:"informational",paymentMethod:"sin_movimiento"})]);
 expect(totals.reduce((sum,row)=>sum+row.total,0)).toBe(80);
 expect(totals.find(row=>row.key==="pending")?.total).toBe(80);
 expect(totals.find(row=>row.key==="non_fiscal")?.total).toBe(0);
});

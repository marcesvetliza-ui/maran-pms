import { beforeEach, describe, expect, it } from "vitest";
import { createPrefacturaSubmission } from "./prefactura-submission";

describe("Prefactura persisted payment intent", () => {
  beforeEach(() => sessionStorage.clear());
  it("recovers an account checkout after reopening with the original entity, amount and operation", async () => {
    const submission=createPrefacturaSubmission(sessionStorage);
    const request={operationId:crypto.randomUUID(),entityType:"company",entityId:"original-company",expectedBalance:"70000.00",entityName:"Original account"};
    submission.prepareAccountCheckout("r",request);
    await expect(submission.run("r",async()=>{throw new Error("Lost response");})).rejects.toThrow("Lost response");
    const reopened=createPrefacturaSubmission(sessionStorage);
    expect(reopened.prepareAccountCheckout("r",{...request,entityId:"another-company",expectedBalance:"1.00"}).accountCheckout).toEqual(request);
    const writes:Array<{url:string;body:unknown}>=[];
    expect(await reopened.run("r",async(url,body)=>{writes.push({url,body});return {success:true};})).toMatchObject({checkoutCompleted:true});
    expect(writes).toEqual([{url:"/api/reservations/r/check-out-to-account",body:request}]);
  });
  it("rechaza solicitudes y pagos de otra reserva antes de escribir", () => {
    const submission = createPrefacturaSubmission(sessionStorage);
    expect(() => submission.prepare("202", { reservaId: "706" }, [])).toThrow("otra reserva");
    expect(() => submission.prepare("202", { reservaId: "202" }, [{ reservationId: "706" }])).toThrow("otra reserva");
    expect(submission.pending("202")).toBeNull();
  });
  it("detiene los pagos si la respuesta fiscal pertenece a otra reserva", async () => {
    const submission = createPrefacturaSubmission(sessionStorage);
    submission.prepare("202", { reservaId: "202" }, [{ reservationId: "202", amount: "1000" }]);
    const posts: string[] = [];
    await expect(submission.run("202", async url => { posts.push(url); return { id: 248, reserva_id: "706" }; })).rejects.toThrow("otra reserva");
    expect(posts).toEqual(["/api/billing/invoices"]);
    expect(submission.pending("202")!.invoice).toBeNull();
    expect(() => submission.acceptInvoice("202", { id: 248, reservaId: "706" })).toThrow("otra reserva");
  });
  it("conserva la factura de la reserva original pero no cobra si cambió la vista", async () => {
    const submission = createPrefacturaSubmission(sessionStorage);
    submission.prepare("202", { reservaId: "202" }, [{ reservationId: "202", amount: "1000" }]);
    let active = true;
    const posts: string[] = [];
    await expect(submission.run("202", async url => {
      posts.push(url); active = false; return { id: 248, reservaId: "202" };
    }, () => { if (!active) throw Error("vista anterior"); })).rejects.toThrow("vista anterior");
    expect(posts).toEqual(["/api/billing/invoices"]);
    expect(submission.pending("202")!.invoice).toMatchObject({ id: 248 });
  });
  it("mantiene las líneas y total de un intento pendiente aunque cambie la selección", () => {
    const submission = createPrefacturaSubmission(sessionStorage);
    const items = [{ descripcion: "Noche", subtotal: 150000 }, { descripcion: "Extra", subtotal: 1000 }];
    const original = submission.prepare("202", { reservaId: "202", items }, []);
    const retry = submission.prepare("202", { reservaId: "202", items: [items[1]] }, []);
    expect(retry).toEqual(original);
    expect(retry.invoiceRequest!.items).toEqual(items);
  });
  it("locks synchronously and never resets a pending operation on reopen", () => {
    const submission = createPrefacturaSubmission(sessionStorage);
    expect(submission.acquire()).toBe(true);
    expect(submission.acquire()).toBe(false);
    submission.release();
    expect(submission.acquire()).toBe(true);
  });
  it.each(["invoice", "net", "retention"])("retries a lost %s response without changing keys or payloads", async lost => {
    const submission = createPrefacturaSubmission(sessionStorage);
    const rows = [
      { amount: "98.00", method: "efectivo", date: "2026-10-05" },
      { amount: "2.00", method: "retencion_iibb", date: "2026-10-05", notes: '{"retencion":{"tipo":"iibb","monto":2,"neto":98}}' },
    ];
    const initial = submission.prepare("r", { creditOperationId: crypto.randomUUID() }, rows);
    const payments = new Map<string, unknown>();
    const invoices = new Map<string, unknown>();
    let lose = true;
    const post = async (url: string, body: Record<string, any>) => {
      const invoice = url.endsWith("invoices");
      const ledger = invoice ? invoices : payments;
      const id = invoice ? body.creditOperationId : body.paymentRequestId;
      if (ledger.has(id)) expect(ledger.get(id)).toEqual(body);
      ledger.set(id, structuredClone(body));
      if (lose && (invoice ? "invoice" : body.method === "efectivo" ? "net" : "retention") === lost) {
        lose = false;
        throw new Error("Response lost after commit");
      }
      return { id: invoice ? 77 : id, montoTotal: "100.00" };
    };
    await expect(submission.run("r", post)).rejects.toThrow("Response lost");
    const reopened = createPrefacturaSubmission(sessionStorage);
    // Current folio and date may have changed. Ignore all reconstructed inputs.
    expect(reopened.prepare("r", { creditOperationId: "different" }, [{ amount: "1", date: "2026-10-06" }]).payments.map(p => p.paymentRequestId))
      .toEqual(initial.payments.map(p => p.paymentRequestId));
    expect(await reopened.run("r", post)).toMatchObject({ paymentCount: 2, invoice: { id: 77 } });
    expect(invoices.size).toBe(1);
    expect(payments.size).toBe(2);
    for (const row of payments.values()) expect(row).toMatchObject({ date: "2026-10-05", invoiceData: { id: 77 } });
    reopened.complete("r");
    const next = reopened.prepare("r", null, rows);
    expect(next.payments[0].paymentRequestId).not.toBe(initial.payments[0].paymentRequestId);
  });
  it("fails before any financial write when persistence fails", () => {
    const submission = createPrefacturaSubmission({
      getItem: () => null, removeItem() {}, setItem() { throw new Error("Storage unavailable"); },
    });
    expect(() => submission.prepare("r", { creditOperationId: "operation" }, [])).toThrow("Storage unavailable");
  });
  it.each([400,403,409,500])("never discards an intent merely because a request fails (%s)", async status => {
    const submission = createPrefacturaSubmission(sessionStorage);
    const original = submission.prepare("r", { creditOperationId: crypto.randomUUID() }, []);
    await expect(submission.run("r", async () => { throw new Error(`${status}: Error`); })).rejects.toThrow();
    expect(submission.pending("r")).toEqual(original);
  });
  it.each([502,504])("retains the exact pending invoice and payment IDs after a numbering failure (%s)",async status=>{
    const submission=createPrefacturaSubmission(sessionStorage);
    const original=submission.prepare("reservation",{tipoComprobante:"FA",puntoVentaOverride:5,creditOperationId:crypto.randomUUID()},[{amount:"260000.00",method:"efectivo"}]);
    let calls=0;
    await expect(submission.run("reservation",async()=>{calls++;throw new Error(`${status}: No se pudo consultar ARCA`);})).rejects.toThrow("No se pudo consultar ARCA");
    expect(calls).toBe(1);
    const reopened=createPrefacturaSubmission(sessionStorage);
    expect(reopened.pending("reservation")).toEqual(original);
  });

});

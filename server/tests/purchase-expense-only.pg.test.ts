import express from "express";
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { verifyFinancialSchema } from "../migrate";

vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
  requireRole: (_roles: string[]) => (_req: any, _res: any, next: () => void) => next(),
  requirePermission: (_resourceKey: string) => (_req: any, _res: any, next: () => void) => next(),
}));
vi.mock("../audit", () => ({ audit: vi.fn() }));

const runWithPg = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;

runWithPg("registros de gasto de Compras", () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    await pool!.query("ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS special_details jsonb");
    await verifyFinancialSchema();
    const { registerRoutes } = await import("../routes");
    const app = express();
    app.use(express.json());
    server = http.createServer(app);
    await registerRoutes(server, app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Sin puerto de prueba");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    await pool?.end();
    const { pool: appPool } = await import("../db");
    await appPool.end();
  });

  async function request(path: string, method = "GET", body?: unknown) {
    const response = await fetch(baseUrl + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json() };
  }

  it('desglosa cargos, calcula IVA y protege duplicados concurrentes sin movimientos financieros', async()=>{
    const suffix=randomUUID().slice(0,8);
    const accounts:number[]=[];const records:number[]=[];
    let supplierId:number|undefined;
    try{
      for(const code of ['4.2.1.08.18','4.2.1.08.05.02']){
        const existing=await pool!.query('SELECT id FROM accounting_accounts WHERE codigo=$1 AND activo=true',[code]);
        if(!existing.rowCount){const a=await pool!.query("INSERT INTO accounting_accounts(codigo,nombre,tipo,activo)VALUES($1,'Prueba especial','egreso',true)RETURNING id",[code]);accounts.push(a.rows[0].id);}
      }
      supplierId=(await pool!.query("INSERT INTO accounting_suppliers(razon_social,cuit,condicion_iva)VALUES($1,$2,'responsable_inscripto')RETURNING id",['Especial '+suffix,'30'+suffix])).rows[0].id;
      const before=await request('/api/reports/estado-resultados?periodo=08/2026');
      const financialCounts=async()=> (await pool!.query("SELECT (SELECT count(*) FROM cash_movements) cash,(SELECT count(*) FROM account_movements) cc,(SELECT count(*) FROM stock_movements) stock,(SELECT count(*) FROM accounting_entries) ledger")).rows[0];
      const counts=await financialCounts();
      const payload={tipoComprobante:'RESUMEN-BANCO',numeroComprobante:'ESP-'+suffix,fechaEmision:'2026-08-20',specialDetails:{version:1,issuerType:'supplier',issuerId:String(supplierId),neto21:100,percepcionIva:5,ley25413:2}};
      expect((await request('/api/purchase-invoices','POST',{...payload,specialDetails:{...payload.specialDetails,neto21:-1}})).status).toBe(400);
      expect((await request('/api/purchase-invoices','POST',{...payload,specialDetails:{...payload.specialDetails,neto105:10}})).status).toBe(400);
      const concurrent=await Promise.all([request('/api/purchase-invoices','POST',payload),request('/api/purchase-invoices','POST',payload)]);
      expect(concurrent.map(r=>r.status).sort(),JSON.stringify(concurrent)).toEqual([201,409]);
      const bank=concurrent.find(r=>r.status===201)!.body;records.push(bank.id);
      expect(bank).toMatchObject({monto_neto:'100.00',monto_iva21:'21.00',monto_total:'128.00',estado:'registrado',asiento_id:null});
      const card=await request('/api/purchase-invoices','POST',{...payload,tipoComprobante:'LIQ-TARJETA',specialDetails:{version:1,issuerType:'supplier',issuerId:String(supplierId),neto21:100,neto105:200,retencionIibb:3,percepcionIva:4}});
      expect(card.status).toBe(201);records.push(card.body.id);
      expect(card.body).toMatchObject({monto_neto:'300.00',monto_iva21:'21.00',monto_iva105:'21.00',monto_total:'349.00'});
      expect(await financialCounts()).toEqual(counts);
      const report=await request('/api/reports/estado-resultados?periodo=08/2026');
      expect(report.status).toBe(200);
      expect(Number(report.body.gastosOperativos.gastosBancarios)-Number(before.body.gastosOperativos.gastosBancarios)).toBeCloseTo(100,2);
      expect(Number(report.body.gastosOperativos.gastosComerciales)-Number(before.body.gastosOperativos.gastosComerciales)).toBeCloseTo(300,2);
      expect(report.body.desgloseAdministrativo.registros.some((r:any)=>r.id===bank.id)).toBe(true);
    }finally{
      for(const id of records){await pool!.query("DELETE FROM audit_logs WHERE entity_type='special_purchase' AND entity_id=$1",[String(id)]);await pool!.query('DELETE FROM purchase_invoices WHERE id=$1',[id]);}
      if(supplierId)await pool!.query('DELETE FROM accounting_suppliers WHERE id=$1',[supplierId]);
      for(const id of accounts)await pool!.query('DELETE FROM accounting_accounts WHERE id=$1',[id]);
    }
  });

  it('recibe un certificado sin sumar IVA ni duplicar un cobro y valida su titular',async()=>{
    const suffix=randomUUID().slice(0,8);
    const company=(await pool!.query("INSERT INTO companies(razon_social,cuil_cuit)VALUES($1,$2)RETURNING id",['Agente '+suffix,'30'+suffix])).rows[0].id;
    const payment=(await pool!.query("INSERT INTO account_movements(entity_type,entity_id,date,type,description,amount)VALUES('company',$1,'2026-08-20','pago','Cobro prueba',-100)RETURNING id",[company])).rows[0].id;
    let accountId:number|undefined;let recordId:number|undefined;
    try{
      if(!(await pool!.query("SELECT id FROM accounting_accounts WHERE codigo='1.1.4.01.04.01' AND activo=true")).rowCount)accountId=(await pool!.query("INSERT INTO accounting_accounts(codigo,nombre,tipo,activo)VALUES('1.1.4.01.04.01','Retenciones IVA prueba','activo',true)RETURNING id")).rows[0].id;
      const payload={tipoComprobante:'RETENCION',numeroComprobante:'CERT-'+suffix,fechaEmision:'2026-08-20',specialDetails:{version:1,issuerType:'company',issuerId:company,subtipo:'iva',importe:50,paymentMovementId:payment}};
      expect((await request('/api/purchase-invoices','POST',{...payload,specialDetails:{...payload.specialDetails,neto21:10}})).status).toBe(400);
      expect((await request('/api/purchase-invoices','POST',{...payload,specialDetails:{...payload.specialDetails,paymentMovementId:randomUUID()}})).status).toBe(400);
      const created=await request('/api/purchase-invoices','POST',payload);
      expect(created.status,JSON.stringify(created.body)).toBe(201);recordId=created.body.id;
      expect(created.body).toMatchObject({supplier_id:null,monto_total:'50.00',monto_iva21:'0.00',subtipo_retencion:'iva',estado:'registrado',asiento_id:null});
      expect((await pool!.query('SELECT amount,retentions FROM account_movements WHERE id=$1',[payment])).rows[0]).toMatchObject({amount:'-100.00',retentions:null});
      const report=await request('/api/reports/estado-resultados?periodo=08/2026');
      expect(report.body.desgloseAdministrativo.registros.find((r:any)=>r.id===recordId).monto_total).toBe('50.00');
    }finally{
      if(recordId){await pool!.query("DELETE FROM audit_logs WHERE entity_type='special_purchase' AND entity_id=$1",[String(recordId)]);await pool!.query('DELETE FROM purchase_invoices WHERE id=$1',[recordId]);}
      await pool!.query('DELETE FROM account_movements WHERE id=$1',[payment]);await pool!.query('DELETE FROM companies WHERE id=$1',[company]);
      if(accountId)await pool!.query('DELETE FROM accounting_accounts WHERE id=$1',[accountId]);
    }
  });

  it.each(["RESUMEN-BANCO", "RETENCION", "LIQ-TARJETA"])("registra %s como gasto sin deuda, asiento ni stock", async type => {
    if (!pool) return;
    const suffix = randomUUID().replaceAll("-", "");
    const code = `4.2.1.08.18.${suffix.slice(0, 7)}`;
    const account = await pool.query<{ id: number }>(
      "INSERT INTO accounting_accounts (codigo, nombre, tipo, activo) VALUES ($1, $2, 'egreso', true) RETURNING id",
      [code, "Gasto prueba"],
    );
    const accountId = account.rows[0].id;
    const supplier = await pool.query<{ id: number }>(
      "INSERT INTO accounting_suppliers (razon_social, cuit, condicion_iva, cuenta_contable_id) VALUES ($1, $2, 'responsable_inscripto', $3) RETURNING id",
      [`Emisor ${suffix}`, `30${suffix.slice(0, 9)}`, accountId],
    );
    const supplierId = supplier.rows[0].id;
    const article = await pool.query<{ id: string }>(
      "INSERT INTO inventory_items (sku, name, current_stock, cost_price) VALUES ($1, $2, 17, 42) RETURNING id",
      [`VARIOS21-${suffix.slice(0, 12)}`, `VARIOS IVA21 ${suffix}`],
    );
    const itemId = article.rows[0].id;
    let recordId: number | null = null;
    try {
      const before = await request("/api/reports/estado-resultados?periodo=08/2026");
      expect(before.status,JSON.stringify(before.body)).toBe(200);
      const initialExpenses = Number(before.body.gastosOperativos.gastosBancarios);
      const payload = {
        tipoComprobante: type, supplierId, numeroComprobante: `G-${suffix.slice(0, 12)}`,
        fechaEmision: "2026-08-19", montoNeto: "127.45", observaciones: "Cargo mensual",
      };
      expect((await request("/api/purchase-invoices", "POST", { ...payload, stockItems: [{ itemId: "inventado" }] })).status).toBe(400);
      expect((await request("/api/purchase-invoices", "POST", { ...payload, expenseItems: [{ itemId, quantity: "1", unitPrice: "1", vatRate: "21" }] })).status).toBe(400);
      expect((await request("/api/purchase-invoices", "POST", { ...payload, expenseItems: [{ itemId: "inexistente", quantity: "1", unitPrice: "127.45", vatRate: "21" }] })).status).toBe(400);
      const created = await request("/api/purchase-invoices", "POST", {
        ...payload, cuentaContableId: 999999, condicionPago: "cuenta_corriente",
        retencionIibb: "20", montoIva21: "21",
        expenseItems: [{ itemId, quantity: "1", unitPrice: "127.45", vatRate: "21" }],
      });
      expect(created.status,JSON.stringify(created.body)).toBe(201);
      recordId = Number(created.body.id);
      expect((await request("/api/purchase-invoices", "POST", payload)).status).toBe(409);

      const stored = await pool.query(
        "SELECT estado, condicion_pago, supplier_id, cuenta_contable_id, monto_total, monto_iva21, retencion_iibb, asiento_id FROM purchase_invoices WHERE id = $1",
        [recordId],
      );
      expect(stored.rows[0]).toMatchObject({
        estado: "registrado", condicion_pago: "registro", supplier_id: supplierId,
        cuenta_contable_id: accountId, monto_total: "127.45", monto_iva21: "0.00",
        retencion_iibb: "0.00", asiento_id: null,
      });
      const stock = await pool.query("SELECT id FROM stock_movements WHERE source_type = 'purchase_invoice' AND source_id = $1", [String(recordId)]);
      const lines = await pool.query("SELECT item_id, quantity, unit_price, vat_rate, line_total FROM purchase_invoice_lines WHERE invoice_id = $1", [recordId]);
      const ledger = await pool.query("SELECT id FROM accounting_entries WHERE origen_tipo = 'purchase_invoice' AND origen_id = $1", [recordId]);
      expect([stock.rowCount, lines.rowCount, ledger.rowCount]).toEqual([0, 1, 0]);
      expect(lines.rows[0]).toMatchObject({ item_id: itemId, quantity: "1.000", unit_price: "127.45", vat_rate: "21", line_total: "127.45" });
      const unchanged = await pool.query("SELECT current_stock, cost_price FROM inventory_items WHERE id = $1", [itemId]);
      expect(unchanged.rows[0]).toMatchObject({ current_stock: "17.000", cost_price: "42.00" });
      const debt = await request(`/api/accounting-suppliers/${supplierId}/cuenta-corriente`);
      expect(debt.body.facturasPendientes).toEqual([]);
      const report = await request("/api/reports/estado-resultados?periodo=08/2026");
      expect(report.status).toBe(200);
      expect(Number(report.body.gastosOperativos.gastosBancarios) - initialExpenses).toBeCloseTo(127.45, 2);
      const exportResponse = await fetch(`${baseUrl}/api/exports/libro-iva-compras?periodo=08/2026&tipo=excel`);
      expect(exportResponse.status).toBe(200);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Buffer.from(await exportResponse.arrayBuffer()));
      const values = workbook.worksheets[0].getColumn(7).values.map(value => String(value));
      expect(values).not.toContain(payload.numeroComprobante);

      const cancelled = await request(`/api/purchase-invoices/${recordId}`, "DELETE");
      expect(cancelled.status).toBe(200);
      const result = await pool.query("SELECT estado FROM purchase_invoices WHERE id = $1", [recordId]);
      expect(result.rows[0].estado).toBe("anulado");
      const afterCancellation = await request("/api/reports/estado-resultados?periodo=08/2026");
      expect(Number(afterCancellation.body.gastosOperativos.gastosBancarios)).toBeCloseTo(initialExpenses, 2);
    } finally {
      if (recordId) await pool.query("DELETE FROM purchase_invoices WHERE id = $1", [recordId]);
      await pool.query("DELETE FROM inventory_items WHERE id = $1", [itemId]);
      await pool.query("DELETE FROM accounting_suppliers WHERE id = $1", [supplierId]);
      await pool.query("DELETE FROM accounting_accounts WHERE id = $1", [accountId]);
    }
  });
});

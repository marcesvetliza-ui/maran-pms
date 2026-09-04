import type { Express } from "express";
import { storage } from "../db-storage";
import { requireAuth } from "../auth";
import { assertFinancialSchemaReady } from "../migrate";
import { db, pool } from "../db";
import { guests, reservations, roomTypes as roomTypesTable, type AccountEntityType } from "../../shared/schema";
import { eq, and, inArray, gte, lte, sql } from "drizzle-orm";
import { getArgentinaOperationalDate } from "../utils/argentinaDateTime";

const PAYMENT_TOLERANCE = 0.01;

class AccountPaymentValidationError extends Error {}

function isAccountPaymentValidationError(error: unknown): error is Error {
  return error instanceof AccountPaymentValidationError || (error as { statusCode?: number } | null)?.statusCode === 400;
}

function normalizeGuestDocumentNumber(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "23505";
}

async function findGuestByDocumentNumber(documentNumber: string, excludeId?: string) {
  const conditions = [
    sql`BTRIM(${guests.documentNumber}) = ${documentNumber}`,
    ...(excludeId ? [sql`${guests.id} <> ${excludeId}`] : []),
  ];
  const [existing] = await db
    .select({
      id: guests.id,
      firstName: guests.firstName,
      lastName: guests.lastName,
      documentType: guests.documentType,
      documentNumber: guests.documentNumber,
    })
    .from(guests)
    .where(and(...conditions))
    .limit(1);
  return existing;
}

function sendDuplicateGuestResponse(
  res: Parameters<Parameters<Express["post"]>[1]>[1],
  documentNumber: string,
  existing?: { firstName: string; lastName: string; documentType: string | null; documentNumber: string | null },
) {
  const identity = existing ? ` (${existing.lastName}, ${existing.firstName})` : "";
  return res.status(409).json({
    error: `No se puede registrar el huésped: el documento ${documentNumber} ya está asociado a otro huésped${identity}.`,
    code: "DUPLICATE_DOCUMENT",
    existing,
  });
}

function parseAccountMoney(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;
  if (typeof value !== "string") return Number.NaN;

  const raw = value.trim().replace(/[$\s]/g, "");
  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  let normalized = raw;

  if (comma >= 0 && dot >= 0) {
    const decimalIndex = Math.max(comma, dot);
    const decimalSeparator = raw[decimalIndex];
    normalized = raw
      .replace(decimalSeparator === "," ? /\./g : /,/g, "")
      .replace(decimalSeparator, ".");
  } else if (comma >= 0 || dot >= 0) {
    const separator = comma >= 0 ? "," : ".";
    const fraction = raw.split(separator)[1] ?? "";
    normalized = fraction.length === 3 ? raw.replace(separator, "") : raw.replace(separator, ".");
  }

  return Number(normalized.replace(/[^\d.-]/g, ""));
}

type PreparedAccountPayment = {
  accountingAmount: number;
  retentions: { concepto: string; monto: number }[] | null;
  allocations: { cargoId: string; amount: string }[];
  paymentMethod: string | null;
  paymentDetails: { method: string; amount: number }[];
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  transferencia: "Transferencia",
  echeq: "eCheq",
  cheque: "Cheque",
  efectivo: "Efectivo",
  compensacion: "Compensación",
  tarjeta: "Tarjeta de crédito",
  otro: "Otro",
};

function describePaymentMethods(paymentDetails: { method: string; amount: number }[]): string {
  if (paymentDetails.length <= 1) return "";
  return ` (${paymentDetails
    .map(({ method, amount }) => `${PAYMENT_METHOD_LABELS[method] ?? method}: $${amount.toFixed(2)}`)
    .join(" + ")})`;
}

/**
 * Retentions settle a receivable even though they are not cash received.
 * Their amount is therefore added once to the persisted payment movement.
 */
async function prepareAccountPayment(
  entityType: AccountEntityType,
  entityId: string,
  body: any,
): Promise<PreparedAccountPayment> {
  const hasPaymentLines = Array.isArray(body.payments) && body.payments.length > 0;
  const rawPaymentLines = hasPaymentLines
    ? body.payments
    : [{ amount: body.amount, method: body.paymentMethod }];
  const paymentDetails: { method: string; amount: number }[] = rawPaymentLines.map((line: any) => {
    const amount = parseAccountMoney(line?.amount);
    const method = String(line?.method ?? line?.paymentMethod ?? "").trim();
    if (!Number.isFinite(amount) || amount <= 0 || !method) {
      throw new AccountPaymentValidationError("Hay un medio de pago con datos inválidos");
    }
    return { method, amount };
  });
  const paymentAmount = paymentDetails.reduce((sum, line) => sum + line.amount, 0);
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    throw new AccountPaymentValidationError("Monto inválido");
  }
  if (hasPaymentLines && body.amount !== undefined) {
    const declaredPaymentAmount = parseAccountMoney(body.amount);
    if (!Number.isFinite(declaredPaymentAmount) || Math.abs(declaredPaymentAmount - paymentAmount) > PAYMENT_TOLERANCE) {
      throw new AccountPaymentValidationError("El total de medios de pago no coincide con el importe declarado");
    }
  }

  const retentions: { concepto: string; monto: number }[] = Array.isArray(body.retentions)
    ? body.retentions
      .filter((row: any) => row?.concepto || row?.monto)
      .map((row: any) => {
        const amount = parseAccountMoney(row?.monto);
        if (!row?.concepto || !Number.isFinite(amount) || amount <= 0) {
          throw new AccountPaymentValidationError("Hay una retención con datos inválidos");
        }
        return { concepto: String(row.concepto), monto: amount };
      })
    : [];
  const accountingAmount = paymentAmount + retentions.reduce((sum, row) => sum + row.monto, 0);

  const rawAllocations = Array.isArray(body.allocations) ? body.allocations : [];
  const allocations: { cargoId: string; amount: string }[] = [];
  if (rawAllocations.length > 0) {
    const pendingCharges = await storage.getPendingCharges(entityType, entityId);
    const pendingById = new Map(pendingCharges.map((charge: any) => [String(charge.id), Number(charge.saldoPendiente)]));
    const usedCharges = new Set<string>();
    let allocationsTotal = 0;

    for (const allocation of rawAllocations) {
      const cargoId = String(allocation?.cargoId ?? "");
      const amount = parseAccountMoney(allocation?.amount);
      const pending = pendingById.get(cargoId);
      if (!cargoId || usedCharges.has(cargoId) || pending === undefined) {
        throw new AccountPaymentValidationError("Uno de los comprobantes seleccionados ya no está pendiente");
      }
      if (!Number.isFinite(amount) || amount <= 0 || amount > pending + PAYMENT_TOLERANCE) {
        throw new AccountPaymentValidationError("El importe aplicado supera el saldo pendiente del comprobante");
      }
      usedCharges.add(cargoId);
      allocationsTotal += amount;
      allocations.push({ cargoId, amount: amount.toFixed(2) });
    }

    if (Math.abs(allocationsTotal - accountingAmount) > PAYMENT_TOLERANCE) {
      throw new AccountPaymentValidationError("El total aplicado debe coincidir con los comprobantes seleccionados");
    }
  }

  return {
    accountingAmount,
    retentions: retentions.length > 0 ? retentions : null,
    allocations,
    paymentMethod: paymentDetails.length === 1 ? paymentDetails[0].method : "varios",
    paymentDetails,
  };
}

export function registerGuestsRoutes(app: Express) {
  // Companies
  app.get("/api/companies", async (req, res) => {
    try {
      const companies = await storage.getCompanies();
      res.json(companies);
    } catch (error) {
      res.status(500).json({ error: "Error fetching companies" });
    }
  });

  app.get("/api/companies/search", async (req, res) => {
    try {
      const query = req.query.q as string || "";
      const companies = await storage.searchCompanies(query);
      res.json(companies);
    } catch (error) {
      res.status(500).json({ error: "Error searching companies" });
    }
  });

  app.get("/api/companies/:id", async (req, res) => {
    try {
      const company = await storage.getCompany(req.params.id);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }
      res.json(company);
    } catch (error) {
      res.status(500).json({ error: "Error fetching company" });
    }
  });

  app.post("/api/companies", async (req, res) => {
    try {
      const company = await storage.createCompany(req.body);
      res.status(201).json(company);
    } catch (error) {
      res.status(500).json({ error: "Error creating company" });
    }
  });

  app.patch("/api/companies/:id", async (req, res) => {
    try {
      const company = await storage.updateCompany(req.params.id, req.body);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }
      res.json(company);
    } catch (error) {
      res.status(500).json({ error: "Error updating company" });
    }
  });

  app.delete("/api/companies/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteCompany(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Company not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting company" });
    }
  });

  // Agencies
  app.get("/api/agencies", async (req, res) => {
    try {
      const agencies = await storage.getAgencies();
      res.json(agencies);
    } catch (error) {
      res.status(500).json({ error: "Error fetching agencies" });
    }
  });

  app.get("/api/agencies/search", async (req, res) => {
    try {
      const query = req.query.q as string || "";
      const agencies = await storage.searchAgencies(query);
      res.json(agencies);
    } catch (error) {
      res.status(500).json({ error: "Error searching agencies" });
    }
  });

  app.get("/api/agencies/report", async (req, res) => {
    try {
      const from = req.query.from as string;
      const to = req.query.to as string;
      const allAgencies = await storage.getAgencies();
      const allReservations = await storage.getReservations();

      const report = allAgencies.map(agency => {
        let agencyReservations = allReservations.filter(r => r.agencyId === agency.id);
        if (from) agencyReservations = agencyReservations.filter(r => r.checkInDate >= from);
        if (to) agencyReservations = agencyReservations.filter(r => r.checkOutDate <= to);

        const totalRevenue = agencyReservations.reduce((sum, r) => sum + parseFloat(r.totalRoomAmount || "0"), 0);
        const commissionRate = parseFloat(agency.commissionRate || "0");
        const totalCommission = totalRevenue * (commissionRate / 100);

        return {
          agency,
          totalReservations: agencyReservations.length,
          totalRevenue,
          commissionRate,
          totalCommission,
          totalNights: agencyReservations.reduce((sum, r) => sum + (r.nights || 0), 0),
        };
      });

      res.json(report);
    } catch (error) {
      res.status(500).json({ error: "Error generating agency report" });
    }
  });

  app.get("/api/agencies/:id/stats", async (req, res) => {
    try {
      const agency = await storage.getAgency(req.params.id);
      if (!agency) {
        return res.status(404).json({ error: "Agency not found" });
      }
      const allReservations = await storage.getReservations();
      const agencyReservations = allReservations.filter(r => r.agencyId === agency.id);
      const totalRevenue = agencyReservations.reduce((sum, r) => sum + parseFloat(r.totalRoomAmount || "0"), 0);
      const commissionRate = parseFloat(agency.commissionRate || "0");
      const totalCommission = totalRevenue * (commissionRate / 100);

      res.json({
        totalReservations: agencyReservations.length,
        totalRevenue,
        commissionRate,
        totalCommission,
        totalNights: agencyReservations.reduce((sum, r) => sum + (r.nights || 0), 0),
        activeReservations: agencyReservations.filter(r => ["confirmed", "checked_in", "pending"].includes(r.status)).length,
      });
    } catch (error) {
      res.status(500).json({ error: "Error fetching agency stats" });
    }
  });

  app.get("/api/agencies/:id", async (req, res) => {
    try {
      const agency = await storage.getAgency(req.params.id);
      if (!agency) {
        return res.status(404).json({ error: "Agency not found" });
      }
      res.json(agency);
    } catch (error) {
      res.status(500).json({ error: "Error fetching agency" });
    }
  });

  app.post("/api/agencies", async (req, res) => {
    try {
      const agency = await storage.createAgency(req.body);
      res.status(201).json(agency);
    } catch (error) {
      res.status(500).json({ error: "Error creating agency" });
    }
  });

  app.patch("/api/agencies/:id", async (req, res) => {
    try {
      const agency = await storage.updateAgency(req.params.id, req.body);
      if (!agency) {
        return res.status(404).json({ error: "Agency not found" });
      }
      res.json(agency);
    } catch (error) {
      res.status(500).json({ error: "Error updating agency" });
    }
  });

  app.delete("/api/agencies/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteAgency(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Agency not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Error deleting agency" });
    }
  });

  // Account Movements (Cuenta Corriente)
  app.get("/api/guests/:id/account", async (req, res) => {
    try {
      const movements = await storage.getAccountMovements("guest", req.params.id);
      const balance = await storage.getAccountBalance("guest", req.params.id);
      res.json({ movements, balance });
    } catch (error) {
      res.status(500).json({ error: "Error fetching guest account" });
    }
  });

  app.get("/api/guests/:id/account/pending-charges", async (req, res) => {
    try {
      const pending = await storage.getPendingCharges("guest", req.params.id);
      res.json(pending);
    } catch (error) {
      res.status(500).json({ error: "Error fetching pending charges" });
    }
  });

  app.post("/api/guests/:id/account/payment", async (req, res) => {
    try {
      assertFinancialSchemaReady();
      const guest = await storage.getGuest(req.params.id);
      if (!guest) return res.status(404).json({ error: "Huésped no encontrado" });
      const { description, reference, date } = req.body;
      const payment = await prepareAccountPayment("guest", req.params.id, req.body);
      const { movement, allocations: createdAllocations } = await storage.createPaymentWithAllocations(
        "guest",
        req.params.id,
        {
          date: date || getArgentinaOperationalDate(),
          description: `${description || "Pago recibido"}${describePaymentMethods(payment.paymentDetails)}`,
          amount: (-payment.accountingAmount).toFixed(2),
          reference: reference || null,
          paymentMethod: payment.paymentMethod,
          retentions: payment.retentions,
          createdBy: req.body.createdBy || null,
          guestName: (guest as any).tipoPersona === "juridica" ? guest.firstName : `${guest.firstName} ${guest.lastName}`,
        },
        payment.allocations
      );
      res.json({ ...movement, allocations: createdAllocations });
    } catch (error) {
      console.error("Error registering guest payment:", error);
      if (isAccountPaymentValidationError(error)) {
        return res.status(400).json({ error: error.message });
      }
      res.status((error as { statusCode?: number })?.statusCode || 500).json({
        error: (error as Error)?.message || "Error registering payment",
      });
    }
  });

  app.get("/api/companies/:id/account", async (req, res) => {
    try {
      const companyId = req.params.id;

      // All CC movements (cargos + pagos) — used to display movement history
      const movements = await storage.getAccountMovements("company", companyId);

      // Balance = SUM de todos los account_movements (cargos positivos + pagos negativos).
      // Usamos account_movements como fuente de verdad para que el saldo coincida
      // exactamente con lo que se muestra en el listado de movimientos.
      const balResult = await db.execute(sql`
        SELECT COALESCE(SUM(amount::numeric), 0) AS total
        FROM account_movements
        WHERE entity_type = 'company' AND entity_id = ${companyId}
      `);
      const totalBalance = parseFloat((balResult.rows[0] as any)?.total ?? "0");

      res.json({ movements, balance: totalBalance, reservationBalance: totalBalance });
    } catch (error) {
      console.error("[company-account] Error:", error);
      res.status(500).json({ error: "Error fetching account" });
    }
  });

  app.get("/api/agencies/:id/account", async (req, res) => {
    try {
      const movements = await storage.getAccountMovements("agency", req.params.id);
      const balance = await storage.getAccountBalance("agency", req.params.id);
      res.json({ movements, balance });
    } catch (error) {
      res.status(500).json({ error: "Error fetching account" });
    }
  });

  app.get("/api/companies/:id/account/pending-charges", async (req, res) => {
    try {
      const companyId = req.params.id;

      // Find reservations with outstanding balances for this company
      const pendingRes = await db.execute(sql`
        SELECT r.id, r.reservation_code, r.check_in_date, r.check_out_date,
               r.total_room_amount::numeric AS room_amount,
               COALESCE(cs.tc, 0) AS extra_charges,
               COALESCE(ps.tp, 0) AS total_paid,
               g.first_name, g.last_name, ro.room_number
        FROM reservations r
        LEFT JOIN guests g ON g.id = r.guest_id
        LEFT JOIN rooms ro ON ro.id = r.room_id
        LEFT JOIN (
          SELECT reservation_id, SUM(amount::numeric) AS tc
          FROM charges WHERE status = 'active' GROUP BY reservation_id
        ) cs ON cs.reservation_id = r.id
        LEFT JOIN (
          SELECT reservation_id, SUM(amount::numeric) AS tp
          FROM payments WHERE status != 'anulado' GROUP BY reservation_id
        ) ps ON ps.reservation_id = r.id
        WHERE r.company_id = ${companyId}
          AND r.total_room_amount IS NOT NULL
          AND r.total_room_amount::numeric > 0
          AND (r.total_room_amount::numeric + COALESCE(cs.tc, 0) - COALESCE(ps.tp, 0)) > 0.009
        ORDER BY r.check_in_date
      `);

      // Auto-create cargo entries in account_movements for any reservation that doesn't have one yet
      for (const row of pendingRes.rows as any[]) {
        const outstanding = parseFloat(row.room_amount) + parseFloat(row.extra_charges) - parseFloat(row.total_paid);
        const existing = await storage.getAccountMovementsByReservation(row.id);
        const hasCompanyCargo = existing.some(
          (m) => m.entityType === "company" && m.entityId === companyId && m.type === "cargo"
        );
        if (!hasCompanyCargo) {
          const guestName = row.first_name ? `${row.first_name} ${row.last_name}` : "Huésped";
          const roomNum = row.room_number || "N/A";
          const checkInDate = row.check_in_date
            ? new Date(row.check_in_date).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })
            : getArgentinaOperationalDate();
          await storage.createAccountMovement({
            entityType: "company",
            entityId: companyId,
            date: checkInDate,
            type: "cargo",
            description: `Estadía ${row.reservation_code} — Hab. ${roomNum} — ${guestName}`,
            amount: outstanding.toFixed(2),
            reservationId: row.id,
            reservationCode: row.reservation_code,
            guestName,
          } as any);
        }
      }

      // Return pending charges (now with auto-created cargo entries)
      const pending = await storage.getPendingCharges("company", companyId);
      res.json(pending);
    } catch (error) {
      console.error("[company-pending-charges] Error:", error);
      res.status(500).json({ error: "Error fetching pending charges" });
    }
  });

  app.get("/api/agencies/:id/account/pending-charges", async (req, res) => {
    try {
      const pending = await storage.getPendingCharges("agency", req.params.id);
      res.json(pending);
    } catch (error) {
      res.status(500).json({ error: "Error fetching pending charges" });
    }
  });

  app.post("/api/companies/:id/account/payment", async (req, res) => {
    try {
      assertFinancialSchemaReady();
      const company = await storage.getCompany(req.params.id);
      if (!company) {
        return res.status(404).json({ error: "Empresa no encontrada" });
      }
      const { description, reference, date } = req.body;
      const payment = await prepareAccountPayment("company", req.params.id, req.body);
      const { movement, allocations: createdAllocations } = await storage.createPaymentWithAllocations(
        "company",
        req.params.id,
        {
          date: date || getArgentinaOperationalDate(),
          description: `${description || "Pago recibido"}${describePaymentMethods(payment.paymentDetails)}`,
          amount: (-payment.accountingAmount).toFixed(2),
          reference: reference || null,
          paymentMethod: payment.paymentMethod,
          retentions: payment.retentions,
          createdBy: req.body.createdBy || null,
        },
        payment.allocations
      );
      res.json({ ...movement, allocations: createdAllocations });
    } catch (error) {
      console.error("Error registering company payment:", error);
      if (isAccountPaymentValidationError(error)) {
        return res.status(400).json({ error: error.message });
      }
      res.status((error as { statusCode?: number })?.statusCode || 500).json({
        error: (error as Error)?.message || "Error registering payment",
      });
    }
  });

  app.post("/api/agencies/:id/account/payment", async (req, res) => {
    try {
      assertFinancialSchemaReady();
      const agency = await storage.getAgency(req.params.id);
      if (!agency) {
        return res.status(404).json({ error: "Agencia no encontrada" });
      }
      const { description, reference, date } = req.body;
      const payment = await prepareAccountPayment("agency", req.params.id, req.body);
      const { movement, allocations: createdAllocations } = await storage.createPaymentWithAllocations(
        "agency",
        req.params.id,
        {
          date: date || getArgentinaOperationalDate(),
          description: `${description || "Pago recibido"}${describePaymentMethods(payment.paymentDetails)}`,
          amount: (-payment.accountingAmount).toFixed(2),
          reference: reference || null,
          paymentMethod: payment.paymentMethod,
          retentions: payment.retentions,
          createdBy: req.body.createdBy || null,
        },
        payment.allocations
      );
      res.json({ ...movement, allocations: createdAllocations });
    } catch (error) {
      console.error("Error registering agency payment:", error);
      if (isAccountPaymentValidationError(error)) {
        return res.status(400).json({ error: error.message });
      }
      res.status((error as { statusCode?: number })?.statusCode || 500).json({
        error: (error as Error)?.message || "Error registering payment",
      });
    }
  });

  app.get("/api/account-summary", async (req, res) => {
    try {
      const summary = await storage.getAccountSummary();
      res.json(summary);
    } catch (error) {
      console.error("[account-summary] Error:", error);
      res.status(500).json({ error: "Error fetching summary", detail: String(error) });
    }
  });

  app.get("/api/account-movements/:entityType(company|agency|guest)/:entityId", async (req, res) => {
    try {
      const { entityType, entityId } = req.params as { entityType: string; entityId: string };
      const movements = await storage.getAccountMovements(entityType as any, entityId);
      res.json(movements);
    } catch (error) {
      console.error("Error fetching account movements:", error);
      res.status(500).json({ error: "Error fetching movements" });
    }
  });

  // Receipts list — only pago movements, with filters
  app.get("/api/account-movements/receipts", async (req, res) => {
    try {
      const { from, to, entityType, search } = req.query as { from?: string; to?: string; entityType?: string; search?: string };
      const summary = await storage.getAccountSummary();

      const movements: any[] = [];

      const pushEntity = async (entities: { id: string; name: string }[], typeName: string, typeKey: string) => {
        for (const e of entities) {
          if (entityType && entityType !== typeKey) continue;
          if (search && !e.name.toLowerCase().includes(search.toLowerCase())) continue;
          const ms = await storage.getAccountMovements(typeKey as any, e.id);
          ms
            .filter(m => m.type === "pago")
            .forEach(m => movements.push({ ...m, entityName: e.name, entityTypeName: typeName }));
        }
      };

      await pushEntity(summary.companies, "Empresa", "company");
      await pushEntity(summary.agencies, "Agencia", "agency");
      if (summary.guests) await pushEntity(summary.guests, "Huésped", "guest");

      const filtered = movements
        .filter(m => {
          if (from && m.date < from) return false;
          if (to && m.date > to) return false;
          return true;
        })
        .sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt)));

      res.json(filtered);
    } catch (error) {
      console.error("Error fetching receipts:", error);
      res.status(500).json({ error: "Error fetching receipts" });
    }
  });

  app.get("/api/account-movements/report", async (req, res) => {
    try {
      const { from, to } = req.query as { from?: string; to?: string };
      const summary = await storage.getAccountSummary();

      const movements: any[] = [];
      for (const c of summary.companies) {
        const ms = await storage.getAccountMovements("company", c.id);
        ms.forEach(m => movements.push({ ...m, entityName: c.name, entityTypeName: "Empresa" }));
      }
      for (const a of summary.agencies) {
        const ms = await storage.getAccountMovements("agency", a.id);
        ms.forEach(m => movements.push({ ...m, entityName: a.name, entityTypeName: "Agencia" }));
      }
      for (const g of summary.guests) {
        const ms = await storage.getAccountMovements("guest", g.id);
        ms.forEach(m => movements.push({ ...m, entityName: g.name, entityTypeName: "Huésped" }));
      }

      const filtered = movements.filter(m => {
        if (from && m.date < from) return false;
        if (to && m.date > to) return false;
        return true;
      }).sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt)));

      res.json(filtered);
    } catch (error) {
      console.error("Error fetching account movements report:", error);
      res.status(500).json({ error: "Error fetching report" });
    }
  });

  // ── INDEC statistical report ──────────────────────────────────────────────
  app.get("/api/reports/indec", requireAuth, async (req, res) => {
    try {
      const { from, to } = req.query as { from?: string; to?: string };
      const conditions: any[] = [
        sql`${reservations.status} = 'checked_out'`,
      ];
      if (from) conditions.push(gte(reservations.checkOutDate, from));
      if (to)   conditions.push(lte(reservations.checkOutDate, to));

      const rows = await db
        .select({
          nights:            reservations.nights,
          nationality:       guests.nationality,
          roomTypeName:      roomTypesTable.name,
          finalRatePerNight: reservations.finalRatePerNight,
          baseRatePerNight:  reservations.baseRatePerNight,
        })
        .from(reservations)
        .leftJoin(guests,         eq(reservations.guestId,   guests.id))
        .leftJoin(roomTypesTable, eq(reservations.roomTypeId, roomTypesTable.id))
        .where(and(...conditions));

      res.json(rows);
    } catch (error) {
      console.error("Error fetching INDEC report:", error);
      res.status(500).json({ error: "Error al generar reporte INDEC" });
    }
  });

  // Guests
  app.get("/api/guests", async (req, res) => {
    try {
      const guests = await storage.getGuests();
      res.json(guests);
    } catch (error) {
      res.status(500).json({ error: "Error fetching guests" });
    }
  });

  app.get("/api/guests/search", async (req, res) => {
    try {
      const query = req.query.q as string || "";
      const guests = await storage.searchGuests(query);
      res.json(guests);
    } catch (error) {
      res.status(500).json({ error: "Error searching guests" });
    }
  });

  app.get("/api/guests/:id", async (req, res) => {
    try {
      const guest = await storage.getGuest(req.params.id);
      if (!guest) {
        return res.status(404).json({ error: "Guest not found" });
      }
      res.json(guest);
    } catch (error) {
      res.status(500).json({ error: "Error fetching guest" });
    }
  });

  app.post("/api/guests", async (req, res) => {
    try {
      const documentNumber = normalizeGuestDocumentNumber(req.body.documentNumber);
      // If a document number is provided, check for an existing guest to avoid duplicates.
      if (documentNumber) {
        const existing = await findGuestByDocumentNumber(documentNumber);
        if (existing) {
          return sendDuplicateGuestResponse(res, documentNumber, existing);
        }
      }
      const guest = await storage.createGuest({
        ...req.body,
        ...(documentNumber ? { documentNumber } : {}),
      });
      res.status(201).json(guest);
    } catch (error) {
      if (isUniqueViolation(error)) {
        const documentNumber = normalizeGuestDocumentNumber(req.body.documentNumber);
        const existing = documentNumber ? await findGuestByDocumentNumber(documentNumber) : undefined;
        return sendDuplicateGuestResponse(res, documentNumber || "informado", existing);
      }
      res.status(500).json({ error: "Error creating guest" });
    }
  });

  app.patch("/api/guests/:id", async (req, res) => {
    try {
      const documentNumber = req.body.documentNumber === undefined
        ? ""
        : normalizeGuestDocumentNumber(req.body.documentNumber);
      if (documentNumber) {
        const existing = await findGuestByDocumentNumber(documentNumber, req.params.id);
        if (existing) return sendDuplicateGuestResponse(res, documentNumber, existing);
      }
      const guest = await storage.updateGuest(req.params.id, req.body);
      if (!guest) {
        return res.status(404).json({ error: "Guest not found" });
      }
      res.json(guest);
    } catch (error) {
      if (isUniqueViolation(error)) {
        const documentNumber = normalizeGuestDocumentNumber(req.body.documentNumber);
        const existing = documentNumber ? await findGuestByDocumentNumber(documentNumber, req.params.id) : undefined;
        return sendDuplicateGuestResponse(res, documentNumber || "informado", existing);
      }
      res.status(500).json({ error: "Error updating guest" });
    }
  });

  app.delete("/api/guests/:id", requireAuth, async (req, res) => {
    // Guests are NEVER deleted — only deactivated when they have no active stays.
    return res.status(403).json({ error: "Los huéspedes no pueden eliminarse. Use la opción Desactivar." });
  });

  app.patch("/api/guests/:id/deactivate", requireAuth, async (req, res) => {
    try {
      const guest = await storage.getGuest(req.params.id);
      if (!guest) return res.status(404).json({ error: "Huésped no encontrado" });

      // Block if there's an active reservation (checked_in or confirmed with future dates)
      const today = getArgentinaOperationalDate();
      const activeRes = await db
        .select({ id: reservations.id })
        .from(reservations)
        .where(
          and(
            eq(reservations.guestId, guest.id),
            inArray(reservations.status, ["checked_in", "confirmed", "pending"] as any),
            gte(reservations.checkOutDate, today)
          )
        )
        .limit(1);

      if (activeRes.length > 0) {
        return res.status(400).json({
          error: "No se puede desactivar un huésped con reservas activas o alojamiento en curso."
        });
      }

      await db.update(guests).set({ active: false }).where(eq(guests.id, guest.id));
      res.json({ success: true, message: "Huésped desactivado correctamente." });
    } catch (error) {
      res.status(500).json({ error: "Error al desactivar huésped" });
    }
  });

  // Bed Types
  app.get("/api/bed-types", async (req, res) => {
    try {
      const bedTypes = await storage.getBedTypes();
      res.json(bedTypes);
    } catch (error) {
      res.status(500).json({ error: "Error fetching bed types" });
    }
  });

  app.post("/api/bed-types", async (req, res) => {
    try {
      const bedType = await storage.createBedType(req.body);
      res.status(201).json(bedType);
    } catch (error) {
      res.status(500).json({ error: "Error creating bed type" });
    }
  });

  app.patch("/api/bed-types/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const bedType = await storage.updateBedType(id, req.body);
      if (!bedType) {
        return res.status(404).json({ error: "Bed type not found" });
      }
      res.json(bedType);
    } catch (error) {
      res.status(500).json({ error: "Error updating bed type" });
    }
  });

  app.delete("/api/bed-types/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const result = await storage.deleteBedType(id);
      if (!result) {
        return res.status(404).json({ error: "Bed type not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Error deleting bed type" });
    }
  });

  // Guest Preferences
  app.get("/api/guests/:guestId/preferences", async (req, res) => {
    try {
      const prefs = await storage.getGuestPreferences(req.params.guestId);
      res.json(prefs);
    } catch (error) {
      res.status(500).json({ error: "Error fetching preferences" });
    }
  });

  app.post("/api/guests/:guestId/preferences", requireAuth, async (req, res) => {
    try {
      const pref = await storage.createGuestPreference({ ...req.body, guestId: req.params.guestId });
      res.status(201).json(pref);
    } catch (error) {
      res.status(500).json({ error: "Error creating preference" });
    }
  });

  app.patch("/api/guests/:guestId/preferences/:prefId", requireAuth, async (req, res) => {
    try {
      const pref = await storage.updateGuestPreference(req.params.prefId, req.body);
      if (!pref) return res.status(404).json({ error: "Preference not found" });
      res.json(pref);
    } catch (error) {
      res.status(500).json({ error: "Error updating preference" });
    }
  });

  app.patch("/api/guests/:guestId/preferences/:prefId/toggle", requireAuth, async (req, res) => {
    try {
      const pref = await storage.toggleGuestPreference(req.params.prefId);
      if (!pref) return res.status(404).json({ error: "Preference not found" });
      res.json(pref);
    } catch (error) {
      res.status(500).json({ error: "Error toggling preference" });
    }
  });

  app.delete("/api/guests/:guestId/preferences/:prefId", requireAuth, async (req, res) => {
    try {
      const deleted = await storage.deleteGuestPreference(req.params.prefId);
      if (!deleted) return res.status(404).json({ error: "Preference not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Error deleting preference" });
    }
  });
}

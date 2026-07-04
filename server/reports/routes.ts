import type { Express } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../auth";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";

const FINANCE_ROLES = ["admin", "manager", "resp_administracion", "jefe_recepcion"] as [string, ...string[]];
const SPA_REPORT_ROLES = ["admin", "manager", "resp_administracion", "jefe_recepcion", "spa"] as [string, ...string[]];
const EVENTS_REPORT_ROLES = ["admin", "manager", "resp_administracion", "jefe_recepcion", "events"] as [string, ...string[]];

const TOTAL_ROOMS = 66;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function periodoToRange(periodo: string): { desde: string; hasta: string; dias: number } {
  const [mm, yyyy] = periodo.split("/");
  const year = parseInt(yyyy);
  const month = parseInt(mm) - 1;
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const desde = `${yyyy}-${mm.padStart(2, "0")}-01`;
  const hasta = `${yyyy}-${mm.padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;
  return { desde, hasta, dias: lastDay.getDate() };
}

function prevPeriodo(periodo: string): string {
  const [mm, yyyy] = periodo.split("/");
  const d = new Date(parseInt(yyyy), parseInt(mm) - 2, 1);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

const $n = (v: any) => parseFloat(v ?? 0) || 0;

function fPeso(n: number): string {
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fDate(d: string): string {
  const dt = new Date(d + "T12:00:00");
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
}

function pct(a: number, b: number): number {
  if (!b) return 0;
  return Math.round((a / b) * 1000) / 10;
}

// Query helpers
async function ingresosAlojamiento(desde: string, hasta: string): Promise<number> {
  const r = await db.execute(sql`
    SELECT COALESCE(SUM(p.amount::numeric), 0) AS total
    FROM payments p
    JOIN reservations r ON r.id = p.reservation_id
    WHERE p.date BETWEEN ${desde} AND ${hasta}
  `);
  return $n((r.rows[0] as any)?.total);
}

async function ingresosRestaurant(desde: string, hasta: string): Promise<number> {
  const r = await db.execute(sql`
    SELECT COALESCE(SUM(total::numeric), 0) AS total
    FROM restaurant_orders
    WHERE status = 'closed'
      AND DATE(closed_at) BETWEEN ${desde} AND ${hasta}
  `);
  return $n((r.rows[0] as any)?.total);
}

async function ingresosSpa(desde: string, hasta: string): Promise<number> {
  const r = await db.execute(sql`
    SELECT COALESCE(SUM(amount::numeric), 0) AS total
    FROM spa_payments
    WHERE DATE(created_at) BETWEEN ${desde} AND ${hasta}
  `);
  return $n((r.rows[0] as any)?.total);
}

async function costosCompras(desde: string, hasta: string): Promise<any[]> {
  const r = await db.execute(sql`
    SELECT
      aa.codigo,
      aa.nombre,
      COALESCE(SUM(pi.monto_total::numeric), 0) AS total
    FROM purchase_invoices pi
    LEFT JOIN accounting_accounts aa ON aa.id = pi.cuenta_contable_id
    WHERE pi.fecha_emision BETWEEN ${desde} AND ${hasta}
    GROUP BY aa.codigo, aa.nombre
    ORDER BY aa.codigo
  `);
  return r.rows as any[];
}

async function gastosAdminCash(desde: string, hasta: string): Promise<number> {
  const r = await db.execute(sql`
    SELECT COALESCE(SUM(importe::numeric), 0) AS total
    FROM admin_cash_movements
    WHERE signo = '-' AND anulado = false
      AND fecha BETWEEN ${desde} AND ${hasta}
      AND tipo NOT IN ('arqueo')
  `);
  return $n((r.rows[0] as any)?.total);
}

// ─── Route registration ───────────────────────────────────────────────────────

export function registerReportsRoutes(app: Express) {

  // ── Estado de Resultados ──────────────────────────────────────────────────
  app.get("/api/reports/estado-resultados", requireRole(FINANCE_ROLES), async (req, res) => {
    try {
      const periodo = (req.query.periodo as string) || `${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`;
      const { desde, hasta } = periodoToRange(periodo);

      const [aloj, rest, spa] = await Promise.all([
        ingresosAlojamiento(desde, hasta),
        ingresosRestaurant(desde, hasta),
        ingresosSpa(desde, hasta),
      ]);

      const costos = await costosCompras(desde, hasta);
      const gastosCaja = await gastosAdminCash(desde, hasta);

      // Classify costs by account code prefix
      const costByCode = (prefix: string | string[]) => {
        const prefixes = Array.isArray(prefix) ? prefix : [prefix];
        return costos
          .filter(c => prefixes.some(p => (c.codigo || "").startsWith(p)))
          .reduce((s, c) => s + $n(c.total), 0);
      };

      const alimentosYBebidas = costByCode(["4.2.1.08.27", "4.2.1.08.28", "4.2.1.08.29", "4.2.1.08.30", "4.2.1.08.31", "4.2.1.08.32", "4.2.1.08.33", "4.2.1.08.34", "4.2.1.08.35", "4.2.1.08.36"]);
      const housekeeping = costByCode("4.2.1.08.23");
      const totalCostos = alimentosYBebidas + housekeeping;

      const totalOtrosCostos = costos.reduce((s, c) => s + $n(c.total), 0);

      const personal = costByCode("4.2.1.08.10");
      const honorarios = costByCode("4.2.1.08.13");
      const luz = costByCode("4.2.1.08.11.01");
      const gas = costByCode("4.2.1.08.11.02");
      const telefono = costByCode("4.2.1.08.11.03");
      const cablevideo = costByCode("4.2.1.08.11.04");
      const mantenimiento = costByCode(["4.2.1.08.16", "4.2.1.08.22"]);
      const publicidad = costByCode("4.2.1.08.12");
      const gastosBancarios = costByCode("4.2.1.08.18");
      const gastosComerciales = costByCode("4.2.1.08.05");
      const gastosGenerales = costByCode(["4.2.1.08.09", "4.2.1.08.20"]);
      const otrosGastos = gastosCaja +
        (totalOtrosCostos - alimentosYBebidas - housekeeping - personal - honorarios -
         luz - gas - telefono - cablevideo - mantenimiento - publicidad - gastosBancarios - gastosComerciales - gastosGenerales);

      const totalGastosOp = personal + honorarios + luz + gas + telefono + cablevideo +
        mantenimiento + publicidad + gastosBancarios + gastosComerciales + gastosGenerales + otrosGastos;

      const totalIngresos = aloj + rest + spa;
      const utilidadBruta = totalIngresos - totalCostos;
      const ebitda = utilidadBruta - totalGastosOp;

      const iibbRetenciones = await db.execute(sql`
        SELECT COALESCE(SUM(importe_retenido::numeric), 0) AS total
        FROM iibb_retentions
        WHERE fecha_retencion BETWEEN ${desde} AND ${hasta} AND anulacion = false
      `);
      const iibb = $n((iibbRetenciones.rows[0] as any)?.total);

      res.json({
        periodo,
        desde,
        hasta,
        ingresos: { alojamiento: aloj, restaurant: rest, spa, otrosServicios: 0, totalIngresos },
        costosMercaderia: { alimentosYBebidas, housekeeping, totalCostos },
        utilidadBruta,
        margenBruto: pct(utilidadBruta, totalIngresos),
        gastosOperativos: {
          personal, honorarios,
          servicios: { luz, gas, telefono, cablevideo, total: luz + gas + telefono + cablevideo },
          mantenimiento, publicidad, gastosBancarios, gastosComerciales,
          gastosGenerales, otrosGastos,
          totalGastosOperativos: totalGastosOp,
        },
        ebitda,
        margenEbitda: pct(ebitda, totalIngresos),
        impuestos: { iibb, municipalidad: 0, total: iibb },
        resultadoNeto: ebitda - iibb,
        margenNeto: pct(ebitda - iibb, totalIngresos),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── KPIs Hoteleros ────────────────────────────────────────────────────────
  app.get("/api/reports/kpis", requireRole(FINANCE_ROLES), async (req, res) => {
    try {
      const periodo = (req.query.periodo as string) || `${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`;
      const { desde, hasta, dias } = periodoToRange(periodo);
      const prevP = prevPeriodo(periodo);
      const { desde: prevDesde, hasta: prevHasta } = periodoToRange(prevP);

      // Occupied room-nights: count reservation overlap with period
      const ocup = await db.execute(sql`
        SELECT COUNT(*) AS noches_ocupadas,
               SUM(number_of_guests) AS total_huespedes
        FROM (
          SELECT r.id, r.number_of_guests,
                 LEAST(r.check_out_date::date, ${hasta}::date) - GREATEST(r.check_in_date::date, ${desde}::date) AS noches
          FROM reservations r
          WHERE r.status IN ('checked_in','checked_out')
            AND r.check_out_date > ${desde}
            AND r.check_in_date < ${hasta}
        ) sub
        WHERE noches > 0
      `);

      const nochesOcupadas = $n((ocup.rows[0] as any)?.noches_ocupadas);
      const totalHuespedes = $n((ocup.rows[0] as any)?.total_huespedes);

      const habitacionesDisponibles = TOTAL_ROOMS * dias;
      const ocupacionPct = pct(nochesOcupadas, habitacionesDisponibles);

      const ingrAloj = await ingresosAlojamiento(desde, hasta);
      const adr = nochesOcupadas > 0 ? ingrAloj / nochesOcupadas : 0;
      const revpar = habitacionesDisponibles > 0 ? ingrAloj / habitacionesDisponibles : 0;

      // Previous period comparison
      const prevOcup = await db.execute(sql`
        SELECT COUNT(*) AS noches_ocupadas FROM (
          SELECT LEAST(r.check_out_date::date, ${prevHasta}::date) - GREATEST(r.check_in_date::date, ${prevDesde}::date) AS noches
          FROM reservations r
          WHERE r.status IN ('checked_in','checked_out')
            AND r.check_out_date > ${prevDesde}
            AND r.check_in_date < ${prevHasta}
        ) sub WHERE noches > 0
      `);
      const prevNochesOcupadas = $n((prevOcup.rows[0] as any)?.noches_ocupadas);
      const prevDias = periodoToRange(prevP).dias;
      const prevDisp = TOTAL_ROOMS * prevDias;
      const prevOcupPct = pct(prevNochesOcupadas, prevDisp);
      const prevIngrAloj = await ingresosAlojamiento(prevDesde, prevHasta);
      const prevAdr = prevNochesOcupadas > 0 ? prevIngrAloj / prevNochesOcupadas : 0;
      const prevRevpar = prevDisp > 0 ? prevIngrAloj / prevDisp : 0;

      // Avg stay
      const estanciaRes = await db.execute(sql`
        SELECT AVG(nights::numeric) AS avg_stay FROM reservations
        WHERE status IN ('checked_in','checked_out')
          AND check_out_date > ${desde} AND check_in_date < ${hasta}
      `);
      const estanciaPromedio = Math.round($n((estanciaRes.rows[0] as any)?.avg_stay) * 10) / 10;

      // Canal distribution
      const canales = await db.execute(sql`
        SELECT
          COALESCE(NULLIF(r.source,''), 'Directo') AS canal,
          COUNT(*) AS reservas,
          COALESCE(SUM(p.amount::numeric), 0) AS ingresos
        FROM reservations r
        LEFT JOIN payments p ON p.reservation_id = r.id AND p.date BETWEEN ${desde} AND ${hasta}
        WHERE r.status IN ('checked_in','checked_out')
          AND r.check_out_date > ${desde} AND r.check_in_date < ${hasta}
        GROUP BY COALESCE(NULLIF(r.source,''), 'Directo')
        ORDER BY ingresos DESC
        LIMIT 8
      `);

      const totalReservas = (canales.rows as any[]).reduce((s, c) => s + $n(c.reservas), 0);
      const distribucionCanal = (canales.rows as any[]).map(c => ({
        canal: c.canal,
        reservas: $n(c.reservas),
        porcentaje: pct($n(c.reservas), totalReservas),
        ingresos: $n(c.ingresos),
      }));

      // Ocupación por día del mes (for sparkline)
      const porDia: any[] = [];
      const d0 = new Date(desde + "T12:00:00");
      const d1 = new Date(hasta + "T12:00:00");
      for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) {
        const dStr = d.toISOString().split("T")[0];
        const dayOcup = await db.execute(sql`
          SELECT COUNT(*) AS ocupadas FROM reservations
          WHERE status IN ('checked_in','checked_out')
            AND check_in_date <= ${dStr} AND check_out_date > ${dStr}
        `);
        porDia.push({
          fecha: dStr,
          ocupadas: $n((dayOcup.rows[0] as any)?.ocupadas),
          pct: pct($n((dayOcup.rows[0] as any)?.ocupadas), TOTAL_ROOMS),
        });
      }

      res.json({
        periodo,
        diasEnPeriodo: dias,
        habitacionesTotal: TOTAL_ROOMS,
        habitacionesDisponibles,
        habitacionesOcupadas: nochesOcupadas,
        ocupacion: ocupacionPct,
        tarifaMedia: Math.round(adr),
        revpar: Math.round(revpar),
        totalHuespedes,
        promedioHuespedesPorNoche: Math.round(totalHuespedes / dias * 10) / 10,
        estanciaPromedio,
        distribucionCanal,
        porDia,
        vsMessAnterior: {
          ocupacion: Math.round((ocupacionPct - prevOcupPct) * 10) / 10,
          tarifaMedia: Math.round(adr - prevAdr),
          revpar: Math.round(revpar - prevRevpar),
        },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Análisis de Ocupación ─────────────────────────────────────────────────
  app.get("/api/reports/ocupacion", requireRole(FINANCE_ROLES), async (req, res) => {
    try {
      const desde = (req.query.desde as string) || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
      const hasta = (req.query.hasta as string) || new Date().toISOString().split("T")[0];

      // Por día
      const dayRows = await db.execute(sql`
        SELECT
          day_series::date AS fecha,
          (SELECT COUNT(*) FROM reservations r
           WHERE r.status IN ('checked_in','checked_out')
             AND r.check_in_date <= day_series::date
             AND r.check_out_date > day_series::date) AS ocupadas,
          (SELECT COALESCE(SUM(p.amount::numeric),0) FROM payments p
           WHERE p.date = day_series::date) AS ingresos
        FROM generate_series(${desde}::date, ${hasta}::date, '1 day'::interval) AS day_series
        ORDER BY day_series
      `);

      const porDia = (dayRows.rows as any[]).map(r => ({
        fecha: r.fecha,
        ocupadas: $n(r.ocupadas),
        disponibles: TOTAL_ROOMS,
        porcentaje: pct($n(r.ocupadas), TOTAL_ROOMS),
        ingresos: $n(r.ingresos),
      }));

      // Por tipo habitación
      const porTipo = await db.execute(sql`
        SELECT
          rt.name AS tipo,
          COUNT(DISTINCT rt.id) AS total_habitaciones,
          SUM(GREATEST(
            LEAST(r.check_out_date::date, ${hasta}::date) - GREATEST(r.check_in_date::date, ${desde}::date),
            0
          )) AS noches_ocupadas,
          COALESCE(AVG(r.final_rate_per_night::numeric), 0) AS tarifa_media
        FROM reservations r
        JOIN room_types rt ON rt.id = r.room_type_id
        WHERE r.status IN ('checked_in','checked_out')
          AND r.check_out_date > ${desde} AND r.check_in_date < ${hasta}
        GROUP BY rt.name
        ORDER BY noches_ocupadas DESC
      `);

      const totalRooms = await db.execute(sql`SELECT COUNT(*) AS c FROM rooms`);
      const totalR = $n((totalRooms.rows[0] as any)?.c) || TOTAL_ROOMS;
      const totalDays = Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 86400000) + 1;

      const porTipoHabitacion = (porTipo.rows as any[]).map(r => ({
        tipo: r.tipo,
        nochesOcupadas: $n(r.noches_ocupadas),
        ocupacion: pct($n(r.noches_ocupadas), totalDays * totalR),
        tarifaMedia: Math.round($n(r.tarifa_media)),
      }));

      // Por piso
      const porPiso = await db.execute(sql`
        SELECT
          rm.floor AS piso,
          COUNT(DISTINCT rm.id) AS habitaciones,
          COUNT(DISTINCT CASE WHEN r.status IN ('checked_in','checked_out')
            AND r.check_out_date > ${desde} AND r.check_in_date < ${hasta}
            THEN r.id END) AS reservas
        FROM rooms rm
        LEFT JOIN reservations r ON r.room_id = rm.id
        GROUP BY rm.floor
        ORDER BY rm.floor
      `);

      const topDias = [...porDia].sort((a, b) => b.porcentaje - a.porcentaje).slice(0, 5);
      const bottomDias = [...porDia].sort((a, b) => a.porcentaje - b.porcentaje).slice(0, 5);

      res.json({
        desde,
        hasta,
        porDia,
        porTipoHabitacion,
        porPiso: (porPiso.rows as any[]).map(r => ({
          piso: r.piso,
          habitaciones: $n(r.habitaciones),
          ocupacion: pct($n(r.reservas), $n(r.habitaciones) * totalDays),
        })),
        topDias: topDias.map(d => ({ fecha: d.fecha, ocupacion: d.porcentaje })),
        bottomDias: bottomDias.map(d => ({ fecha: d.fecha, ocupacion: d.porcentaje })),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Ingresos por Área ─────────────────────────────────────────────────────
  app.get("/api/reports/ingresos", requireRole(FINANCE_ROLES), async (req, res) => {
    try {
      const periodo = (req.query.periodo as string) || `${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`;
      const { desde, hasta } = periodoToRange(periodo);
      const prevP = prevPeriodo(periodo);
      const { desde: prevDesde, hasta: prevHasta } = periodoToRange(prevP);

      const [aloj, rest, spa, prevAloj, prevRest, prevSpa] = await Promise.all([
        ingresosAlojamiento(desde, hasta),
        ingresosRestaurant(desde, hasta),
        ingresosSpa(desde, hasta),
        ingresosAlojamiento(prevDesde, prevHasta),
        ingresosRestaurant(prevDesde, prevHasta),
        ingresosSpa(prevDesde, prevHasta),
      ]);

      const varPct = (actual: number, prev: number) => prev > 0 ? Math.round(((actual - prev) / prev) * 1000) / 10 : 0;
      const total = aloj + rest + spa;
      const prevTotal = prevAloj + prevRest + prevSpa;

      // Alojamiento por tipo de habitación
      const alojTipo = await db.execute(sql`
        SELECT rt.name AS tipo,
               COUNT(*) AS noches,
               COALESCE(SUM(p.amount::numeric), 0) AS ingresos,
               COALESCE(AVG(r.final_rate_per_night::numeric), 0) AS tarifa_media
        FROM reservations r
        JOIN room_types rt ON rt.id = r.room_type_id
        LEFT JOIN payments p ON p.reservation_id = r.id AND p.date BETWEEN ${desde} AND ${hasta}
        WHERE r.status IN ('checked_in','checked_out')
          AND r.check_out_date > ${desde} AND r.check_in_date < ${hasta}
        GROUP BY rt.name
        ORDER BY ingresos DESC
      `);

      // Top 10 empresas facturadas (FA)
      const topEmpresas = await db.execute(sql`
        SELECT cliente_razon_social AS razon_social, cliente_cuit AS cuit,
               SUM(monto_total::numeric) AS total_facturado,
               COUNT(*) AS cantidad_facturas
        FROM sales_invoices
        WHERE tipo_comprobante = 'FA'
          AND fecha_emision BETWEEN ${desde} AND ${hasta}
          AND estado = 'emitida'
        GROUP BY cliente_razon_social, cliente_cuit
        ORDER BY total_facturado DESC
        LIMIT 10
      `);

      // Por día
      const porDia = await db.execute(sql`
        SELECT
          day_series::date AS fecha,
          COALESCE((SELECT SUM(p.amount::numeric) FROM payments p WHERE p.date = day_series::date), 0) AS alojamiento,
          COALESCE((SELECT SUM(ro.total::numeric) FROM restaurant_orders ro WHERE ro.status='closed' AND DATE(ro.closed_at) = day_series::date), 0) AS restaurant,
          COALESCE((SELECT SUM(sp.amount::numeric) FROM spa_payments sp WHERE DATE(sp.created_at) = day_series::date), 0) AS spa
        FROM generate_series(${desde}::date, ${hasta}::date, '1 day'::interval) AS day_series
        ORDER BY day_series
      `);

      res.json({
        periodo,
        areas: [
          { nombre: "Alojamiento", ingresos: aloj, porcentaje: pct(aloj, total), variacionMesAnterior: varPct(aloj, prevAloj), color: "#3B82F6" },
          { nombre: "Restaurant", ingresos: rest, porcentaje: pct(rest, total), variacionMesAnterior: varPct(rest, prevRest), color: "#F59E0B" },
          { nombre: "Spa", ingresos: spa, porcentaje: pct(spa, total), variacionMesAnterior: varPct(spa, prevSpa), color: "#10B981" },
        ],
        totalIngresos: total,
        variacionTotal: varPct(total, prevTotal),
        alojamientoPorTipo: (alojTipo.rows as any[]).map(r => ({
          tipo: r.tipo,
          noches: $n(r.noches),
          ingresos: $n(r.ingresos),
          tarifaMedia: Math.round($n(r.tarifa_media)),
        })),
        topEmpresas: (topEmpresas.rows as any[]).map(r => ({
          razonSocial: r.razon_social,
          cuit: r.cuit,
          totalFacturado: $n(r.total_facturado),
          cantidadFacturas: $n(r.cantidad_facturas),
        })),
        porDia: (porDia.rows as any[]).map(r => ({
          fecha: r.fecha,
          alojamiento: $n(r.alojamiento),
          restaurant: $n(r.restaurant),
          spa: $n(r.spa),
          total: $n(r.alojamiento) + $n(r.restaurant) + $n(r.spa),
        })),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Costos por Departamento ───────────────────────────────────────────────
  app.get("/api/reports/costos", requireRole(FINANCE_ROLES), async (req, res) => {
    try {
      const periodo = (req.query.periodo as string) || `${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`;
      const { desde, hasta } = periodoToRange(periodo);
      const prevP = prevPeriodo(periodo);
      const { desde: prevDesde, hasta: prevHasta } = periodoToRange(prevP);

      const costos = await costosCompras(desde, hasta);
      const prevCostos = await costosCompras(prevDesde, prevHasta);
      const prevMap: Record<string, number> = {};
      prevCostos.forEach(c => { prevMap[c.codigo || c.nombre] = $n(c.total); });

      const DEPTOS: { nombre: string; prefixes: string[] }[] = [
        { nombre: "Restaurant / Cocina",   prefixes: ["4.2.1.08.27","4.2.1.08.28","4.2.1.08.29","4.2.1.08.30","4.2.1.08.31","4.2.1.08.32","4.2.1.08.33","4.2.1.08.34","4.2.1.08.35","4.2.1.08.36","4.2.1.08.37","4.2.1.08.38","4.2.1.08.39"] },
        { nombre: "Housekeeping",          prefixes: ["4.2.1.08.23"] },
        { nombre: "Administración",        prefixes: ["4.2.1.08.06","4.2.1.08.07","4.2.1.08.08","4.2.1.08.09","4.2.1.08.10","4.2.1.08.13","4.2.1.08.14","4.2.1.08.15","4.2.1.08.18"] },
        { nombre: "Mantenimiento",         prefixes: ["4.2.1.08.16","4.2.1.08.22"] },
        { nombre: "Servicios Públicos",    prefixes: ["4.2.1.08.11"] },
        { nombre: "Comercial / Publicidad", prefixes: ["4.2.1.08.05","4.2.1.08.12"] },
      ];

      let totalGeneral = 0;
      const departamentos = DEPTOS.map(depto => {
        const cuentasDeDepto = costos.filter(c =>
          depto.prefixes.some(p => (c.codigo || "").startsWith(p))
        );
        const totalDepto = cuentasDeDepto.reduce((s, c) => s + $n(c.total), 0);
        totalGeneral += totalDepto;

        const prevTotalDepto = prevCostos
          .filter(c => depto.prefixes.some(p => (c.codigo || "").startsWith(p)))
          .reduce((s, c) => s + $n(c.total), 0);

        return {
          nombre: depto.nombre,
          cuentas: cuentasDeDepto.map(c => ({
            codigo: c.codigo || "—",
            nombre: c.nombre || "Sin clasificar",
            monto: $n(c.total),
            porcentajeDelDepto: pct($n(c.total), totalDepto),
          })),
          totalDepto,
          variacionMesAnterior: prevTotalDepto > 0
            ? Math.round(((totalDepto - prevTotalDepto) / prevTotalDepto) * 1000) / 10
            : 0,
        };
      });

      // Add % of total after total is known
      departamentos.forEach(d => {
        (d as any).porcentajeDelTotal = pct(d.totalDepto, totalGeneral);
      });

      // Caja chica gastos
      const cajaChicaRows = await db.execute(sql`
        SELECT concepto, importe FROM admin_cash_movements
        WHERE signo = '-' AND anulado = false AND tipo = 'egreso_gasto'
          AND fecha BETWEEN ${desde} AND ${hasta}
      `);
      const totalCajaChica = (cajaChicaRows.rows as any[]).reduce((s, r) => s + $n(r.importe), 0);
      if (totalCajaChica > 0) {
        departamentos.push({
          nombre: "Caja Chica / Gastos Menores",
          cuentas: (cajaChicaRows.rows as any[]).map(r => ({
            codigo: "—",
            nombre: r.concepto,
            monto: $n(r.importe),
            porcentajeDelDepto: pct($n(r.importe), totalCajaChica),
          })),
          totalDepto: totalCajaChica,
          variacionMesAnterior: 0,
          porcentajeDelTotal: pct(totalCajaChica, totalGeneral + totalCajaChica),
        } as any);
        totalGeneral += totalCajaChica;
      }

      res.json({ periodo, departamentos, totalGeneral });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Ranking de Proveedores ────────────────────────────────────────────────
  app.get("/api/reports/proveedores", requireRole(FINANCE_ROLES), async (req, res) => {
    try {
      const periodo = (req.query.periodo as string) || `${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`;
      const top = parseInt(req.query.top as string) || 10;
      const { desde, hasta } = periodoToRange(periodo);
      const prevP = prevPeriodo(periodo);
      const { desde: prevDesde, hasta: prevHasta } = periodoToRange(prevP);

      const ranking = await db.execute(sql`
        SELECT
          s.razon_social AS proveedor,
          s.cuit AS cuit,
          COUNT(pi.id) AS cantidad_facturas,
          COALESCE(SUM(pi.monto_total::numeric), 0) AS total_comprado
        FROM purchase_invoices pi
        JOIN accounting_suppliers s ON s.id = pi.supplier_id
        WHERE pi.fecha_emision BETWEEN ${desde} AND ${hasta}
        GROUP BY s.razon_social, s.cuit
        ORDER BY total_comprado DESC
        LIMIT ${top}
      `);

      const totalCompras = (ranking.rows as any[]).reduce((s, r) => s + $n(r.total_comprado), 0);

      const prevCompras = await db.execute(sql`
        SELECT s.razon_social AS proveedor,
               COALESCE(SUM(pi.monto_total::numeric), 0) AS total
        FROM purchase_invoices pi JOIN accounting_suppliers s ON s.id = pi.supplier_id
        WHERE pi.fecha_emision BETWEEN ${prevDesde} AND ${prevHasta}
        GROUP BY s.razon_social
      `);
      const prevMap: Record<string, number> = {};
      (prevCompras.rows as any[]).forEach(r => { prevMap[r.proveedor] = $n(r.total); });

      const cantProveedoresActivos = (await db.execute(sql`
        SELECT COUNT(DISTINCT supplier_id) AS c FROM purchase_invoices
        WHERE fecha_emision BETWEEN ${desde} AND ${hasta}
      `)).rows[0] as any;

      const varByProv = (ranking.rows as any[]).map(r => ({
        proveedor: r.proveedor,
        variacion: prevMap[r.proveedor]
          ? Math.round(($n(r.total_comprado) - prevMap[r.proveedor]) / prevMap[r.proveedor] * 1000) / 10
          : 0,
      }));

      res.json({
        periodo,
        ranking: (ranking.rows as any[]).map((r, i) => ({
          posicion: i + 1,
          proveedor: r.proveedor,
          cuit: r.cuit,
          cantidadFacturas: $n(r.cantidad_facturas),
          totalComprado: $n(r.total_comprado),
          porcentajeDelTotal: pct($n(r.total_comprado), totalCompras),
        })),
        totalComprasDelPeriodo: totalCompras,
        cantidadProveedoresActivos: $n(cantProveedoresActivos?.c),
        mayorAlza: varByProv.filter(v => v.variacion > 0).sort((a, b) => b.variacion - a.variacion).slice(0, 3),
        mayorBaja: varByProv.filter(v => v.variacion < 0).sort((a, b) => a.variacion - b.variacion).slice(0, 3),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Comparativo Mensual ───────────────────────────────────────────────────
  app.get("/api/reports/comparativo", requireRole(FINANCE_ROLES), async (req, res) => {
    try {
      const año = parseInt((req.query.año || req.query.anio || req.query.year) as string) || new Date().getFullYear();
      const mesesNombre = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
      const today = new Date();

      const meses = await Promise.all(
        Array.from({ length: 12 }, (_, i) => i).map(async (m) => {
          const mm = String(m + 1).padStart(2, "0");
          const periodo = `${mm}/${año}`;
          const { desde, hasta, dias } = periodoToRange(periodo);

          // Skip future months
          const isPast = new Date(hasta) <= today;
          if (!isPast && año === today.getFullYear() && m > today.getMonth()) {
            return { mes: mesesNombre[m], ocupacion: null, revpar: null, ingresoTotal: null, costoTotal: null, ebitda: null, margenEbitda: null };
          }

          const [aloj, rest, spa] = await Promise.all([
            ingresosAlojamiento(desde, hasta),
            ingresosRestaurant(desde, hasta),
            ingresosSpa(desde, hasta),
          ]);
          const ingresoTotal = aloj + rest + spa;

          const costos = await costosCompras(desde, hasta);
          const costoTotal = costos.reduce((s, c) => s + $n(c.total), 0) + await gastosAdminCash(desde, hasta);
          const ebitda = ingresoTotal - costoTotal;

          const ocupRes = await db.execute(sql`
            SELECT COUNT(*) AS noches FROM (
              SELECT LEAST(check_out_date::date, ${hasta}::date) - GREATEST(check_in_date::date, ${desde}::date) AS noches
              FROM reservations WHERE status IN ('checked_in','checked_out')
              AND check_out_date > ${desde} AND check_in_date < ${hasta}
            ) sub WHERE noches > 0
          `);
          const noches = $n((ocupRes.rows[0] as any)?.noches);
          const ocupacion = pct(noches, TOTAL_ROOMS * dias);
          const revpar = TOTAL_ROOMS * dias > 0 ? Math.round(aloj / (TOTAL_ROOMS * dias)) : 0;

          return {
            mes: mesesNombre[m],
            ocupacion,
            revpar,
            ingresoTotal,
            costoTotal,
            ebitda,
            margenEbitda: pct(ebitda, ingresoTotal),
          };
        })
      );

      const validMeses = meses.filter(m => m.ingresoTotal !== null);
      const acumulado = {
        ocupacionPromedio: validMeses.length
          ? Math.round(validMeses.reduce((s, m) => s + (m.ocupacion ?? 0), 0) / validMeses.length * 10) / 10
          : 0,
        ingresoTotal: validMeses.reduce((s, m) => s + (m.ingresoTotal ?? 0), 0),
        costoTotal: validMeses.reduce((s, m) => s + (m.costoTotal ?? 0), 0),
        ebitda: validMeses.reduce((s, m) => s + (m.ebitda ?? 0), 0),
      };

      res.json({ año, meses, acumulado });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Reporte de Spa ────────────────────────────────────────────────────────
  app.get("/api/reports/spa", requireRole(SPA_REPORT_ROLES), async (req, res) => {
    try {
      const periodo = (req.query.periodo as string) || `${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`;
      const { desde, hasta } = periodoToRange(periodo);

      const [ingresos, porEstado, porProfesional, porTratamiento, porCabina] = await Promise.all([
        db.execute(sql`
          SELECT COALESCE(SUM(amount::numeric), 0) AS total, COUNT(*) AS cantidad
          FROM spa_payments
          WHERE status = 'active' AND DATE(created_at) BETWEEN ${desde} AND ${hasta}
        `),
        db.execute(sql`
          SELECT status, COUNT(*) AS cantidad
          FROM spa_appointments
          WHERE appointment_date BETWEEN ${desde} AND ${hasta}
          GROUP BY status
        `),
        db.execute(sql`
          SELECT COALESCE(p.name || ' ' || COALESCE(p.last_name, ''), 'Sin asignar') AS profesional,
                 COUNT(a.id) AS turnos,
                 COUNT(a.id) FILTER (WHERE a.status = 'completed') AS completados,
                 COUNT(a.id) FILTER (WHERE a.status IN ('cancelled','no_show')) AS cancelados
          FROM spa_appointments a
          LEFT JOIN spa_professionals p ON p.id = a.professional_id
          WHERE a.appointment_date BETWEEN ${desde} AND ${hasta}
          GROUP BY profesional
          ORDER BY turnos DESC
        `),
        db.execute(sql`
          SELECT t.name AS tratamiento, COUNT(a.id) AS cantidad,
                 COALESCE(SUM(t.price::numeric), 0) AS ingresoEstimado
          FROM spa_appointments a
          JOIN spa_treatments t ON t.id = a.treatment_id
          WHERE a.appointment_date BETWEEN ${desde} AND ${hasta}
            AND a.status IN ('completed','confirmed','in_progress')
          GROUP BY t.name
          ORDER BY cantidad DESC
          LIMIT 10
        `),
        db.execute(sql`
          SELECT cabin_id, COUNT(*) AS turnos
          FROM spa_appointments
          WHERE appointment_date BETWEEN ${desde} AND ${hasta}
          GROUP BY cabin_id
          ORDER BY turnos DESC
        `),
      ]);

      const estadoRow = (porEstado.rows as any[]);
      const totalTurnos = estadoRow.reduce((s, r) => s + $n(r.cantidad), 0);
      const noShows = estadoRow.find(r => r.status === 'no_show');
      const cancelados = estadoRow.find(r => r.status === 'cancelled');
      const completados = estadoRow.find(r => r.status === 'completed');

      res.json({
        periodo,
        ingresosTotales: $n((ingresos.rows[0] as any)?.total),
        cantidadPagos: $n((ingresos.rows[0] as any)?.cantidad),
        totalTurnos,
        turnosCompletados: $n(completados?.cantidad),
        turnosCancelados: $n(cancelados?.cantidad),
        turnosNoShow: $n(noShows?.cantidad),
        tasaAsistencia: pct($n(completados?.cantidad), totalTurnos),
        porEstado: estadoRow.map(r => ({ estado: r.status, cantidad: $n(r.cantidad) })),
        porProfesional: (porProfesional.rows as any[]).map(r => ({
          profesional: r.profesional,
          turnos: $n(r.turnos),
          completados: $n(r.completados),
          cancelados: $n(r.cancelados),
        })),
        tratamientosMasSolicitados: (porTratamiento.rows as any[]).map(r => ({
          tratamiento: r.tratamiento,
          cantidad: $n(r.cantidad),
          ingresoEstimado: $n(r.ingresoestimado ?? r.ingresoEstimado),
        })),
        ocupacionPorCabina: (porCabina.rows as any[]).map(r => ({
          cabina: r.cabin_id,
          turnos: $n(r.turnos),
        })),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Reporte de Eventos ────────────────────────────────────────────────────
  app.get("/api/reports/events", requireRole(EVENTS_REPORT_ROLES), async (req, res) => {
    try {
      const periodo = (req.query.periodo as string) || `${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`;
      const { desde, hasta } = periodoToRange(periodo);

      const [eventos, porEstado, porTipo, pagos] = await Promise.all([
        db.execute(sql`
          SELECT id, event_code, name, event_type, status, start_date, end_date,
                 attendees, total_amount, total_paid
          FROM events
          WHERE start_date BETWEEN ${desde} AND ${hasta}
          ORDER BY start_date
        `),
        db.execute(sql`
          SELECT status, COUNT(*) AS cantidad
          FROM events
          WHERE start_date BETWEEN ${desde} AND ${hasta}
          GROUP BY status
        `),
        db.execute(sql`
          SELECT event_type, COUNT(*) AS cantidad,
                 COALESCE(SUM(total_amount::numeric), 0) AS total
          FROM events
          WHERE start_date BETWEEN ${desde} AND ${hasta}
          GROUP BY event_type
          ORDER BY total DESC
        `),
        db.execute(sql`
          SELECT COALESCE(SUM(amount::numeric), 0) AS total
          FROM event_payments
          WHERE DATE(created_at) BETWEEN ${desde} AND ${hasta}
        `),
      ]);

      const eventosRows = eventos.rows as any[];
      const totalFacturado = eventosRows.reduce((s, r) => s + $n(r.total_amount), 0);
      const totalCobrado = eventosRows.reduce((s, r) => s + $n(r.total_paid), 0);

      res.json({
        periodo,
        cantidadEventos: eventosRows.length,
        totalFacturado,
        totalCobrado,
        saldoPendiente: totalFacturado - totalCobrado,
        cobrosDelPeriodo: $n((pagos.rows[0] as any)?.total),
        porEstado: (porEstado.rows as any[]).map(r => ({ estado: r.status, cantidad: $n(r.cantidad) })),
        porTipo: (porTipo.rows as any[]).map(r => ({
          tipo: r.event_type,
          cantidad: $n(r.cantidad),
          total: $n(r.total),
        })),
        eventos: eventosRows.map(r => ({
          id: r.id,
          codigo: r.event_code,
          nombre: r.name,
          tipo: r.event_type,
          estado: r.status,
          fechaInicio: r.start_date,
          fechaFin: r.end_date,
          asistentes: $n(r.attendees),
          totalFacturado: $n(r.total_amount),
          totalCobrado: $n(r.total_paid),
          saldo: $n(r.total_amount) - $n(r.total_paid),
        })),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Reporte de Mantenimiento ──────────────────────────────────────────────
  app.get("/api/reports/maintenance", requireRole(FINANCE_ROLES.concat(["maintenance"]) as [string, ...string[]]), async (req, res) => {
    try {
      const periodo = (req.query.periodo as string) || `${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`;
      const { desde, hasta } = periodoToRange(periodo);

      const [porEstado, porCategoria, porPrioridad, costos, tiempoResolucion, ubicacionesRecurrentes, porTecnico] = await Promise.all([
        db.execute(sql`SELECT status, COUNT(*) AS cantidad FROM work_orders WHERE reported_at::date BETWEEN ${desde} AND ${hasta} GROUP BY status`),
        db.execute(sql`SELECT category, COUNT(*) AS cantidad FROM work_orders WHERE reported_at::date BETWEEN ${desde} AND ${hasta} GROUP BY category ORDER BY cantidad DESC`),
        db.execute(sql`SELECT priority, COUNT(*) AS cantidad FROM work_orders WHERE reported_at::date BETWEEN ${desde} AND ${hasta} GROUP BY priority`),
        db.execute(sql`SELECT COALESCE(SUM(actual_cost::numeric), 0) AS total, COALESCE(SUM(estimated_cost::numeric), 0) AS estimado FROM work_orders WHERE reported_at::date BETWEEN ${desde} AND ${hasta}`),
        db.execute(sql`
          SELECT AVG(EXTRACT(EPOCH FROM (completed_at - reported_at)) / 3600) AS horas_promedio
          FROM work_orders
          WHERE status = 'completed' AND completed_at IS NOT NULL AND reported_at::date BETWEEN ${desde} AND ${hasta}
        `),
        db.execute(sql`
          SELECT COALESCE(r.room_number, wo.location, 'Sin ubicación') AS ubicacion, COUNT(*) AS cantidad
          FROM work_orders wo
          LEFT JOIN rooms r ON r.id = wo.room_id
          WHERE wo.reported_at::date BETWEEN ${desde} AND ${hasta}
          GROUP BY ubicacion
          ORDER BY cantidad DESC
          LIMIT 10
        `),
        db.execute(sql`
          SELECT COALESCE(u.full_name, 'Sin asignar') AS tecnico,
                 COUNT(wo.id) AS asignadas,
                 COUNT(wo.id) FILTER (WHERE wo.status = 'completed') AS completadas
          FROM work_orders wo
          LEFT JOIN system_users u ON u.id = wo.assigned_to_id
          WHERE wo.reported_at::date BETWEEN ${desde} AND ${hasta}
          GROUP BY tecnico
          ORDER BY asignadas DESC
        `),
      ]);

      const estadoRows = porEstado.rows as any[];
      const totalOrdenes = estadoRows.reduce((s, r) => s + $n(r.cantidad), 0);

      res.json({
        periodo,
        totalOrdenes,
        costoTotal: $n((costos.rows[0] as any)?.total),
        costoEstimado: $n((costos.rows[0] as any)?.estimado),
        horasPromedioResolucion: Math.round(($n((tiempoResolucion.rows[0] as any)?.horas_promedio) || 0) * 10) / 10,
        porEstado: estadoRows.map(r => ({ estado: r.status, cantidad: $n(r.cantidad) })),
        porCategoria: (porCategoria.rows as any[]).map(r => ({ categoria: r.category, cantidad: $n(r.cantidad) })),
        porPrioridad: (porPrioridad.rows as any[]).map(r => ({ prioridad: r.priority, cantidad: $n(r.cantidad) })),
        ubicacionesRecurrentes: (ubicacionesRecurrentes.rows as any[]).map(r => ({ ubicacion: r.ubicacion, cantidad: $n(r.cantidad) })),
        porTecnico: (porTecnico.rows as any[]).map(r => ({ tecnico: r.tecnico, asignadas: $n(r.asignadas), completadas: $n(r.completadas) })),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Reporte de Inventario General ─────────────────────────────────────────
  app.get("/api/reports/inventory", requireRole(FINANCE_ROLES.concat(["resp_deposito"]) as [string, ...string[]]), async (req, res) => {
    try {
      const periodo = (req.query.periodo as string) || `${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`;
      const { desde, hasta } = periodoToRange(periodo);

      const [valorizacion, bajoMinimo, porTipoMovimiento, sinMovimiento, topValor] = await Promise.all([
        db.execute(sql`SELECT COALESCE(SUM(current_stock::numeric * cost_price::numeric), 0) AS total FROM inventory_items WHERE is_active = 'true'`),
        db.execute(sql`
          SELECT id, sku, name, current_stock, min_stock, unit
          FROM inventory_items
          WHERE is_active = 'true' AND current_stock::numeric <= min_stock::numeric
          ORDER BY (current_stock::numeric - min_stock::numeric) ASC
          LIMIT 20
        `),
        db.execute(sql`
          SELECT movement_type, COUNT(*) AS cantidad, COALESCE(SUM(quantity::numeric), 0) AS cantidad_total
          FROM stock_movements
          WHERE created_at::date BETWEEN ${desde} AND ${hasta}
          GROUP BY movement_type
        `),
        db.execute(sql`
          SELECT i.id, i.sku, i.name, i.current_stock, i.unit
          FROM inventory_items i
          WHERE i.is_active = 'true'
            AND NOT EXISTS (
              SELECT 1 FROM stock_movements sm WHERE sm.item_id = i.id AND sm.created_at::date BETWEEN ${desde} AND ${hasta}
            )
          ORDER BY i.current_stock::numeric * i.cost_price::numeric DESC
          LIMIT 20
        `),
        db.execute(sql`
          SELECT sku, name, current_stock, cost_price, (current_stock::numeric * cost_price::numeric) AS valor_total
          FROM inventory_items
          WHERE is_active = 'true'
          ORDER BY valor_total DESC
          LIMIT 10
        `),
      ]);

      res.json({
        periodo,
        valorTotalStock: $n((valorizacion.rows[0] as any)?.total),
        itemsBajoMinimo: (bajoMinimo.rows as any[]).map(r => ({
          id: r.id, sku: r.sku, nombre: r.name, stockActual: $n(r.current_stock), stockMinimo: $n(r.min_stock), unidad: r.unit,
        })),
        porTipoMovimiento: (porTipoMovimiento.rows as any[]).map(r => ({
          tipo: r.movement_type, cantidad: $n(r.cantidad), cantidadTotal: $n(r.cantidad_total),
        })),
        itemsSinMovimiento: (sinMovimiento.rows as any[]).map(r => ({
          id: r.id, sku: r.sku, nombre: r.name, stockActual: $n(r.current_stock), unidad: r.unit,
        })),
        topValorStock: (topValor.rows as any[]).map(r => ({
          sku: r.sku, nombre: r.name, stockActual: $n(r.current_stock), costoUnitario: $n(r.cost_price), valorTotal: $n(r.valor_total),
        })),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Reporte de Costo de Comida (CMV) - Restaurant ─────────────────────────
  app.get("/api/reports/restaurant-cmv", requireRole(FINANCE_ROLES.concat(["restaurant"]) as [string, ...string[]]), async (req, res) => {
    try {
      const periodo = (req.query.periodo as string) || `${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`;
      const { desde, hasta } = periodoToRange(periodo);

      const [totales, porPlato] = await Promise.all([
        db.execute(sql`
          SELECT
            COALESCE(SUM(oi.subtotal::numeric), 0) AS ingresos,
            COALESCE(SUM(oi.quantity * COALESCE(ric.costo_receta, 0)), 0) AS costo
          FROM order_items oi
          JOIN restaurant_orders ro ON ro.id = oi.order_id
          LEFT JOIN (
            SELECT r.menu_item_id, SUM(ri.quantity::numeric * ri.unit_cost::numeric) AS costo_receta
            FROM recipes r
            JOIN recipe_ingredients ri ON ri.recipe_id = r.id
            GROUP BY r.menu_item_id
          ) ric ON ric.menu_item_id = oi.menu_item_id
          WHERE ro.closed_at::date BETWEEN ${desde} AND ${hasta} AND ro.status != 'cancelled'
        `),
        db.execute(sql`
          SELECT
            mi.name AS plato,
            SUM(oi.quantity) AS cantidad_vendida,
            COALESCE(SUM(oi.subtotal::numeric), 0) AS ingresos,
            COALESCE(SUM(oi.quantity * ric.costo_receta), 0) AS costo
          FROM order_items oi
          JOIN restaurant_orders ro ON ro.id = oi.order_id
          JOIN menu_items mi ON mi.id = oi.menu_item_id
          LEFT JOIN (
            SELECT r.menu_item_id, SUM(ri.quantity::numeric * ri.unit_cost::numeric) AS costo_receta
            FROM recipes r
            JOIN recipe_ingredients ri ON ri.recipe_id = r.id
            GROUP BY r.menu_item_id
          ) ric ON ric.menu_item_id = oi.menu_item_id
          WHERE ro.closed_at::date BETWEEN ${desde} AND ${hasta} AND ro.status != 'cancelled'
          GROUP BY mi.id, mi.name
          ORDER BY ingresos DESC
          LIMIT 20
        `),
      ]);

      const ingresos = $n((totales.rows[0] as any)?.ingresos);
      const costo = $n((totales.rows[0] as any)?.costo);
      const cmvPct = ingresos > 0 ? Math.round((costo / ingresos) * 1000) / 10 : 0;

      res.json({
        periodo,
        ingresos,
        costo,
        margen: ingresos - costo,
        cmvPorcentaje: cmvPct,
        porPlato: (porPlato.rows as any[]).map(r => {
          const ing = $n(r.ingresos);
          const cst = $n(r.costo);
          return {
            plato: r.plato,
            cantidadVendida: $n(r.cantidad_vendida),
            ingresos: ing,
            costo: cst,
            cmvPorcentaje: ing > 0 ? Math.round((cst / ing) * 1000) / 10 : 0,
          };
        }),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Reporte de Productividad de Camareras - Housekeeping ──────────────────
  app.get("/api/reports/housekeeping-productivity", requireRole(FINANCE_ROLES.concat(["housekeeping"]) as [string, ...string[]]), async (req, res) => {
    try {
      const periodo = (req.query.periodo as string) || `${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`;
      const { desde, hasta } = periodoToRange(periodo);

      const [porCamarera, porTipo] = await Promise.all([
        db.execute(sql`
          SELECT
            COALESCE(u.full_name, 'Sin asignar') AS camarera,
            COUNT(ht.id) AS total_tareas,
            COUNT(ht.id) FILTER (WHERE ht.status IN ('completed', 'inspected')) AS completadas,
            AVG(EXTRACT(EPOCH FROM (ht.completed_at - ht.started_at)) / 60) FILTER (WHERE ht.completed_at IS NOT NULL AND ht.started_at IS NOT NULL) AS minutos_promedio
          FROM housekeeping_tasks ht
          LEFT JOIN system_users u ON u.id = ht.assigned_to
          WHERE ht.scheduled_date BETWEEN ${desde} AND ${hasta}
          GROUP BY camarera
          ORDER BY completadas DESC
        `),
        db.execute(sql`
          SELECT task_type, COUNT(*) AS cantidad
          FROM housekeeping_tasks
          WHERE scheduled_date BETWEEN ${desde} AND ${hasta}
          GROUP BY task_type
          ORDER BY cantidad DESC
        `),
      ]);

      res.json({
        periodo,
        porCamarera: (porCamarera.rows as any[]).map(r => ({
          camarera: r.camarera,
          totalTareas: $n(r.total_tareas),
          completadas: $n(r.completadas),
          minutosPromedio: Math.round(($n(r.minutos_promedio) || 0) * 10) / 10,
        })),
        porTipoTarea: (porTipo.rows as any[]).map(r => ({ tipo: r.task_type, cantidad: $n(r.cantidad) })),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Reporte de Pronóstico / Pickup y Cancelaciones - Hotelería ────────────
  app.get("/api/reports/forecast", requireRole(FINANCE_ROLES), async (req, res) => {
    try {
      const dias = parseInt((req.query.dias as string) || "30");
      const hoy = new Date().toISOString().slice(0, 10);
      const limite = new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);

      const [porDia, cancelaciones] = await Promise.all([
        db.execute(sql`
          SELECT
            r.check_in_date AS fecha,
            COUNT(*) AS reservas,
            COALESCE(SUM(r.total_room_amount::numeric), 0) AS ingresos_previstos
          FROM reservations r
          WHERE r.check_in_date BETWEEN ${hoy} AND ${limite}
            AND r.status NOT IN ('cancelled')
          GROUP BY r.check_in_date
          ORDER BY r.check_in_date ASC
        `),
        db.execute(sql`
          SELECT COUNT(*) AS cantidad, COALESCE(SUM(total_amount::numeric), 0) AS monto_total
          FROM cancelled_reservation_logs
          WHERE cancellation_date::date BETWEEN ${hoy} AND ${limite}
        `),
      ]);

      const rows = porDia.rows as any[];
      const totalReservas = rows.reduce((s, r) => s + $n(r.reservas), 0);
      const totalIngresos = rows.reduce((s, r) => s + $n(r.ingresos_previstos), 0);

      res.json({
        dias,
        desde: hoy,
        hasta: limite,
        totalReservasPrevistas: totalReservas,
        ingresosPrevistos: totalIngresos,
        cancelacionesRecientes: $n((cancelaciones.rows[0] as any)?.cantidad),
        montoCancelacionesRecientes: $n((cancelaciones.rows[0] as any)?.monto_total),
        porDia: rows.map(r => ({
          fecha: r.fecha,
          reservas: $n(r.reservas),
          ingresosPrevistos: $n(r.ingresos_previstos),
        })),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── PDF Export (generic) ──────────────────────────────────────────────────
  app.get("/api/reports/export-pdf/:tipo", requireRole(FINANCE_ROLES), async (req, res) => {
    try {
      const tipo = req.params.tipo;
      const queryStr = new URLSearchParams(req.query as any).toString();

      // Fetch data from own API
      const dataRes = await fetch(`http://localhost:5000/api/reports/${tipo}?${queryStr}`, {
        headers: { cookie: req.headers.cookie || "" },
      });
      const data = await dataRes.json() as any;

      const pdfBuf = await new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument({ margin: 40, size: "A4" });
        const chunks: Buffer[] = [];
        doc.on("data", (c: Buffer) => chunks.push(c));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);

        const x0 = 40;
        let y = 40;

        doc.font("Helvetica-Bold").fontSize(10)
          .text("Hotel Maran Suites & Towers — Maran S.A.", x0, y, { align: "center", width: 515 });
        doc.font("Helvetica-Bold").fontSize(13)
          .text(tipo.replace(/-/g, " ").toUpperCase(), x0, y + 16, { align: "center", width: 515 });
        if (data.periodo) {
          doc.font("Helvetica").fontSize(9)
            .text(`Período: ${data.periodo}`, x0, y + 34, { align: "center", width: 515 });
        }
        y += 60;

        // Generic JSON rendering
        const render = (obj: any, depth = 0) => {
          if (typeof obj !== "object" || obj === null) return;
          for (const [key, value] of Object.entries(obj)) {
            if (y > 750) { doc.addPage(); y = 50; }
            if (Array.isArray(value)) {
              doc.font("Helvetica-Bold").fontSize(8).text(key, x0 + depth * 10, y);
              y += 12;
              value.slice(0, 30).forEach(item => {
                if (typeof item === "object") render(item, depth + 2);
                else { doc.font("Helvetica").fontSize(7.5).text(String(item), x0 + depth * 10 + 10, y); y += 10; }
              });
            } else if (typeof value === "object" && value !== null) {
              doc.font("Helvetica-Bold").fontSize(8).text(key, x0 + depth * 10, y); y += 12;
              render(value, depth + 1);
            } else {
              const valStr = typeof value === "number" ? `$${fPeso(value)}` : String(value ?? "—");
              doc.font("Helvetica").fontSize(7.5)
                .text(key, x0 + depth * 10, y, { width: 250 })
                .text(valStr, x0 + depth * 10 + 260, y, { align: "right", width: 200 });
              y += 10;
            }
          }
        };
        render(data);
        doc.end();
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="reporte_${tipo}_${data.periodo ?? "export"}.pdf"`);
      res.send(pdfBuf);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Excel Export ──────────────────────────────────────────────────────────
  app.get("/api/reports/export-excel/:tipo", requireRole(FINANCE_ROLES), async (req, res) => {
    try {
      const tipo = req.params.tipo;
      const queryStr = new URLSearchParams(req.query as any).toString();

      const dataRes = await fetch(`http://localhost:5000/api/reports/${tipo}?${queryStr}`, {
        headers: { cookie: req.headers.cookie || "" },
      });
      const data = await dataRes.json() as any;

      const wb = new ExcelJS.Workbook();
      wb.creator = "Maran Suite System";
      const ws = wb.addWorksheet(tipo);

      ws.addRow(["Hotel Maran Suites & Towers"]);
      ws.addRow([tipo.replace(/-/g, " ").toUpperCase()]);
      if (data.periodo) ws.addRow([`Período: ${data.periodo}`]);
      ws.addRow([]);

      const flatten = (obj: any, prefix = ""): [string, any][] => {
        const rows: [string, any][] = [];
        for (const [k, v] of Object.entries(obj)) {
          const key = prefix ? `${prefix}.${k}` : k;
          if (Array.isArray(v)) {
            v.slice(0, 500).forEach((item, i) => {
              if (typeof item === "object" && item !== null) {
                flatten(item, `${key}[${i}]`).forEach(r => rows.push(r));
              } else {
                rows.push([`${key}[${i}]`, item]);
              }
            });
          } else if (typeof v === "object" && v !== null) {
            flatten(v, key).forEach(r => rows.push(r));
          } else {
            rows.push([key, v]);
          }
        }
        return rows;
      };

      const flatData = flatten(data);
      ws.addRow(["Campo", "Valor"]);
      flatData.forEach(([k, v]) => ws.addRow([k, v]));

      const buf = await wb.xlsx.writeBuffer();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="reporte_${tipo}.xlsx"`);
      res.send(buf);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}

import type { NextFunction, Request, Response } from "express";

/**
 * Fase 6 del ambiente piloto (ver docs/pilot-environment-plan.md secciones 6
 * y 18): rol de acceso limitado para usuarios externos (ej. vendedor de
 * Channel Manager en una demo). Decisión de producto: el piloto corre con
 * datos 100% ficticios, así que este rol puede VER todo dentro de los
 * módulos habilitados — el control acá no es de privacidad de datos, es
 * para no romper el ambiente entre demos (evitar anulaciones, cierres de
 * caja, notas de crédito/débito, etc.) y para no exponer configuración
 * sensible del sistema (administración, facturación/ARCA, integraciones).
 *
 * Diseño: default-deny. Solo se permite lo que matchea ALLOW_RULES, y
 * dentro de eso, DENY_RULES tiene prioridad absoluta (se evalúa primero)
 * para las acciones puntuales que quedan explícitamente bloqueadas aunque
 * vivan dentro de un módulo permitido.
 *
 * Este middleware NO reemplaza a `requireAuth`/`requireRole` existentes —
 * se agrega antes de todas las rutas de negocio (ver server/routes.ts) y
 * solo actúa quando el usuario autenticado tiene role === PILOT_EXTERNAL_ROLE.
 * Cualquier otro rol sigue el flujo normal, sin cambios.
 */
export const PILOT_EXTERNAL_ROLE = "piloto_externo";

interface PathRule {
  methods: string[];
  pattern: RegExp;
  reason: string;
}

// Convierte "/api/reservations/:id" en el cuerpo de regex
// "/api/reservations/[^/]+" (sin anclas ^ $, para poder reutilizarlo tanto
// en matches exactos como en prefijos).
function pathToRegexBody(path: string): string {
  return path
    .split("/")
    .map((segment) => (segment.startsWith(":") ? "[^/]+" : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("/");
}

function exact(methods: string | string[], path: string, reason: string): PathRule {
  return {
    methods: (Array.isArray(methods) ? methods : [methods]).map((m) => m.toUpperCase()),
    pattern: new RegExp(`^${pathToRegexBody(path)}$`),
    reason,
  };
}

function prefix(methods: string | string[], path: string, reason: string): PathRule {
  return {
    methods: (Array.isArray(methods) ? methods : [methods]).map((m) => m.toUpperCase()),
    pattern: new RegExp(`^${pathToRegexBody(path)}(/.*)?$`),
    reason,
  };
}

// Acciones explícitamente bloqueadas, evaluadas ANTES que ALLOW_RULES —
// tienen prioridad aunque el path esté dentro de un prefijo permitido.
const DENY_RULES: PathRule[] = [
  // Anular pagos o reservas (bloqueo explícito del alcance de Fase 6)
  exact("POST", "/api/reservations/:id/cancel", "anular reserva"),
  exact("DELETE", "/api/reservations/:id", "borrado físico de reserva"),
  exact("PATCH", "/api/charges/:id/anular", "anular cargo"),
  exact("DELETE", "/api/charges/:id", "borrado físico de cargo"),
  exact("PATCH", "/api/payments/:id/anular", "anular pago"),
  exact("DELETE", "/api/payments/:id", "borrado físico de pago"),
  // Facturación/ARCA disparada desde pagos — vive bajo /api/payments pero
  // es facturación, explícitamente fuera de alcance del rol
  exact("PATCH", "/api/payments/:id/invoice", "vincular pago a facturación (ARCA)"),
  exact("POST", "/api/payments/:id/resume-invoice", "reintentar facturación (ARCA)"),
  exact("PATCH", "/api/payments/:id/invoice-reapplication", "refacturación (ARCA)"),
  exact("PATCH", "/api/payments/:id/invoice-link-failed", "marcar facturación fallida (ARCA)"),
  // Borrado físico de huésped y cuenta corriente — vive bajo /api/guests
  // pero no es "ficha de huésped", es cuenta corriente/facturación
  exact("DELETE", "/api/guests/:id", "borrado físico de huésped"),
  exact("GET", "/api/guests/:id/account", "cuenta corriente de huésped"),
  exact("GET", "/api/guests/:id/account/pending-charges", "cuenta corriente de huésped"),
  exact("POST", "/api/guests/:id/account/payment", "pago contra cuenta corriente de huésped"),
  // Agregados/estadísticas de folios (no son "ver un folio" puntual) — el
  // patrón /api/folios/:entityType/:entityId de ALLOW_RULES matchearía
  // estas rutas literales de dos segmentos si no se excluyen acá.
  exact("GET", "/api/folios/stats/by-entity-type", "estadísticas agregadas de folios"),
  exact("GET", "/api/folios/stats/summary", "estadísticas agregadas de folios"),
  exact("GET", "/api/folios/movements/by-date", "movimientos agregados de folios por fecha"),
];

// Módulos permitidos (Fase 6): Reservas, Huéspedes, Check-in/out, Folios y
// Caja. DENY_RULES arriba tiene prioridad sobre estas reglas.
const ALLOW_RULES: PathRule[] = [
  // Reservas: listado, detalle, planning, crear/editar, check-in/out y
  // operaciones normales de uso diario (transferencias, deshacer, etc.)
  prefix("*", "/api/reservations", "módulo reservas"),
  prefix("*", "/api/charges", "cargos de reserva"),
  exact("GET", "/api/charge-types", "catálogo de tipos de cargo (solo lectura)"),
  exact("GET", "/api/charge-types/all", "catálogo de tipos de cargo (solo lectura)"),
  prefix("*", "/api/payments", "pagos de reserva"),
  exact("GET", "/api/cancelled-reservations", "listado de reservas canceladas (solo lectura)"),

  // Huéspedes: listado, ficha, crear/editar, preferencias
  prefix(["GET", "POST", "PATCH", "DELETE"], "/api/guests", "módulo huéspedes"),

  // Folios: ver folio completo, cargos y pagos (solo lectura + bootstrap)
  exact("GET", "/api/folios", "listado de folios"),
  exact("GET", "/api/folios/:entityType/:entityId", "ver folio"),
  exact("GET", "/api/folios/:entityType/:entityId/pdf", "ver folio (pdf)"),
  exact("POST", "/api/folios/:entityType/:entityId/ensure", "asegurar existencia de folio (bootstrap, sin efecto financiero)"),

  // Caja: ver movimientos y resumen, registrar un cobro (vía /api/payments
  // arriba). Abrir turno es parte de la operación diaria normal; cerrar
  // turno queda explícitamente bloqueado (no está en ALLOW_RULES).
  exact("GET", "/api/cash/shifts", "ver turnos de caja"),
  exact("GET", "/api/cash/shifts/current", "ver turno actual de caja"),
  exact("GET", "/api/cash/shifts/:id", "ver turno de caja"),
  exact("GET", "/api/cash/shifts/autocreados", "ver turnos autocreados"),
  exact("POST", "/api/cash/shifts/open", "abrir turno de caja"),
  exact("GET", "/api/cash/movements", "ver movimientos de caja"),
  exact("GET", "/api/cash/summary", "ver resumen de caja"),
];

function matches(rules: PathRule[], method: string, path: string): PathRule | null {
  for (const rule of rules) {
    if (!rule.methods.includes("*") && !rule.methods.includes(method)) continue;
    if (rule.pattern.test(path)) return rule;
  }
  return null;
}

/**
 * Middleware a registrar con `app.use("/api", ...)` DESPUÉS de requireAuth
 * (necesita req.user ya poblado por Passport) y ANTES de registrar
 * cualquier ruta de negocio. No hace nada para roles distintos de
 * PILOT_EXTERNAL_ROLE.
 */
export function authorizePilotExternalRole(req: Request, res: Response, next: NextFunction): void {
  const user = req.user as Express.User | undefined;
  if (!user || user.role !== PILOT_EXTERNAL_ROLE) {
    return next();
  }

  const method = req.method.toUpperCase();
  // Registrado con app.use("/api", ...): Express recorta el prefijo de
  // montaje de req.path (req.path === "/reservations/123" para una
  // request a "/api/reservations/123"), así que reconstruimos el path
  // completo para poder escribir las reglas con el mismo "/api/..." que
  // aparece en los archivos de rutas.
  const path = req.baseUrl + req.path;

  if (matches(DENY_RULES, method, path)) {
    res.status(403).json({ message: "No autorizado para esta acción" });
    return;
  }

  if (matches(ALLOW_RULES, method, path)) {
    return next();
  }

  res.status(403).json({ message: "No autorizado para esta acción" });
}

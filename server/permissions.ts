import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { rolePermissions, type SystemUserRole } from "@shared/schema";

/**
 * Etapa 1 del ABM de usuarios (permisos granulares): reemplaza los arrays de
 * roles hardcodeados del sidebar (client/src/components/app-sidebar.tsx) —
 * y, para 4 rutas puntuales, también los guards de client/src/App.tsx — por
 * filas de la tabla role_permissions. Este catálogo es SOLO el seed inicial
 * (ver server/migrate.ts, paso "role_permissions (seed)"): una vez sembrada
 * la tabla, ella es la fuente de verdad — este objeto no se vuelve a leer en
 * producción salvo para sembrar un resourceKey nuevo más adelante.
 *
 * Cada entrada "sidebar:<href>" reproduce 1:1 el array de roles que hoy usa
 * ese ítem del menú. Los ítems que además tienen un guard de ruta en
 * App.tsx (AdminRoute/RoleRoute) comparten el mismo resourceKey — así el
 * sidebar y la ruta quedan atados a una sola fuente, no pueden volver a
 * divergir.
 *
 * Se confirmaron con el usuario 3 correcciones sobre 3 inconsistencias
 * reales ya existentes hoy entre lo que el sidebar mostraba y lo que la
 * ruta realmente permitía (marcadas "CORRECCIÓN" abajo, en el rol que se
 * agrega o se saca) — el resto reproduce el comportamiento actual tal cual.
 */
export const INITIAL_ROLE_PERMISSIONS: Record<string, SystemUserRole[]> = {
  // ── MÓDULO 1: PMS Core ──────────────────────────────────────────────────
  "sidebar:/": [
    "admin", "manager", "ama_de_llaves", "spa", "restaurant", "events", "reception",
    "resp_deposito", "resp_administracion", "responsable_area", "jefe_recepcion", "comercial",
  ],
  "sidebar:/planning": [
    "admin", "manager", "ama_de_llaves", "housekeeping", "restaurant", "events", "reception",
    "resp_administracion", "responsable_area", "jefe_recepcion", "comercial",
  ],
  "sidebar:/reservations": ["admin", "reception", "responsable_area", "jefe_recepcion", "comercial"],
  "sidebar:/new-reservation": ["admin", "reception", "responsable_area", "jefe_recepcion", "comercial"],
  "sidebar:/check-in": [
    "admin", "manager", "ama_de_llaves", "housekeeping", "events", "reception",
    "responsable_area", "jefe_recepcion", "comercial",
  ],
  "sidebar:/check-out": [
    "admin", "manager", "ama_de_llaves", "housekeeping", "events", "reception",
    "responsable_area", "jefe_recepcion", "comercial",
  ],
  "sidebar:/rooms": [
    "admin", "manager", "ama_de_llaves", "housekeeping", "reception",
    "responsable_area", "jefe_recepcion", "comercial",
  ],
  // "Reportes" (grupo de Recepción, sin href propio) + sus 3 subítems.
  "sidebar:group/reportes-recepcion": [
    "admin", "manager", "ama_de_llaves", "housekeeping", "reception",
    "responsable_area", "jefe_recepcion", "comercial", "spa",
  ],
  "sidebar:/rooms?tab=ocupadas": [
    "admin", "manager", "ama_de_llaves", "housekeeping", "reception",
    "responsable_area", "jefe_recepcion", "comercial", "spa",
  ],
  "sidebar:/daily-report": [
    "admin", "manager", "ama_de_llaves", "housekeeping", "reception",
    "responsable_area", "jefe_recepcion", "comercial", "spa",
  ],
  "sidebar:/admin/indec": [
    "admin", "manager", "resp_deposito", "resp_administracion", "responsable_area", "jefe_recepcion",
  ],
  "sidebar:/rate-plans": [
    "admin", "manager", "ama_de_llaves", "reception", "resp_administracion",
    "responsable_area", "jefe_recepcion", "comercial",
  ],
  "sidebar:/guests": ["admin", "events", "reception", "responsable_area", "jefe_recepcion", "comercial"],
  "sidebar:/billing": ["admin", "reception", "responsable_area", "jefe_recepcion", "comercial"],

  // ── MÓDULO 2: Comercial ─────────────────────────────────────────────────
  "sidebar:/admin/booking-engine": ["admin", "reception", "responsable_area", "jefe_recepcion", "comercial"],
  "sidebar:/ota-channels": ["admin", "reception", "responsable_area", "jefe_recepcion", "comercial"],
  "sidebar:/channex": ["admin", "reception", "responsable_area", "jefe_recepcion", "comercial"],
  "sidebar:/groups": ["admin", "reception", "responsable_area", "jefe_recepcion", "comercial"],
  "sidebar:/companies": ["admin", "reception", "responsable_area", "jefe_recepcion", "comercial"],
  "sidebar:/agencies": ["admin", "reception", "responsable_area", "jefe_recepcion", "comercial"],
  "sidebar:/packages": ["admin", "spa", "reception", "responsable_area", "jefe_recepcion", "comercial"],
  "sidebar:/presupuestos": [
    "admin", "manager", "ama_de_llaves", "spa", "events", "reception",
    "resp_administracion", "responsable_area", "jefe_recepcion", "comercial",
  ],

  // ── MÓDULO 3: Servicios ─────────────────────────────────────────────────
  "sidebar:/restaurant": [
    "admin", "manager", "ama_de_llaves", "restaurant", "events", "reception",
    "resp_deposito", "responsable_area", "jefe_recepcion", "comercial",
  ],
  "sidebar:/spa": [
    "admin", "manager", "ama_de_llaves", "spa", "reception", "responsable_area", "jefe_recepcion", "comercial",
  ],
  "sidebar:/spa-clients": ["admin", "manager", "ama_de_llaves", "spa", "responsable_area"],
  "sidebar:/events": [
    "admin", "manager", "ama_de_llaves", "spa", "restaurant", "events", "reception",
    "resp_deposito", "resp_administracion", "responsable_area", "jefe_recepcion", "comercial",
  ],
  "sidebar:/gift-vouchers": [
    "admin", "manager", "ama_de_llaves", "spa", "reception", "responsable_area", "jefe_recepcion", "comercial",
  ],

  // ── MÓDULO 4: Operaciones ───────────────────────────────────────────────
  "sidebar:/housekeeping": [
    "admin", "manager", "ama_de_llaves", "housekeeping", "reception",
    "responsable_area", "jefe_recepcion", "comercial",
  ],
  "sidebar:/maintenance": [
    "admin", "manager", "ama_de_llaves", "housekeeping", "reception",
    "responsable_area", "jefe_recepcion", "comercial",
  ],
  "sidebar:/inventory": [
    "admin", "manager", "ama_de_llaves", "spa", "resp_deposito", "resp_administracion", "responsable_area",
  ],
  "sidebar:/restaurant/recetas": ["admin", "manager", "ama_de_llaves", "events", "resp_deposito", "responsable_area"],
  // Comparte resourceKey con el RoleRoute de App.tsx ("/operaciones/emitir-comprobante")
  // — CORRECCIÓN: el guard de ruta no incluía "responsable_area", el sidebar sí.
  "sidebar:/operaciones/emitir-comprobante": [
    "admin", "manager", "reception", "restaurant", "spa", "events",
    "resp_deposito", "resp_administracion", "responsable_area", "jefe_recepcion", "comercial",
  ],

  // ── MÓDULO 5: Experiencia al Huésped ────────────────────────────────────
  "sidebar:/hospitality": [
    "admin", "manager", "ama_de_llaves", "spa", "housekeeping", "restaurant", "events", "reception",
    "responsable_area", "jefe_recepcion", "comercial",
  ],
  "sidebar:/chatbot": ["admin", "reception", "responsable_area", "jefe_recepcion", "comercial"],
  "sidebar:/reviews": [
    "admin", "manager", "ama_de_llaves", "reception", "responsable_area", "jefe_recepcion", "comercial",
  ],

  // ── MÓDULO 6: Administración ────────────────────────────────────────────
  "sidebar:/admin": ["admin", "manager", "resp_deposito", "resp_administracion", "responsable_area", "jefe_recepcion"],
  "sidebar:/admin/cuentas": ["admin", "manager", "resp_administracion", "responsable_area", "jefe_recepcion", "comercial"],
  "sidebar:/cash-register": [
    "admin", "manager", "restaurant", "spa", "events", "reception",
    "resp_administracion", "responsable_area", "jefe_recepcion", "comercial",
  ],
  "sidebar:/admin/accounting-accounts": ["admin", "resp_administracion", "responsable_area"],
  "sidebar:/admin/cost-centers": ["admin", "resp_administracion", "responsable_area"],
  // Comparte resourceKey con el RoleRoute de App.tsx ("/admin/spa-fiscal-review")
  // — CORRECCIÓN: el guard de ruta no incluía "responsable_area", el sidebar sí.
  "sidebar:/admin/spa-fiscal-review": ["admin", "manager", "resp_administracion", "responsable_area"],

  // ── MÓDULO 7: Gerencia & Revenue ────────────────────────────────────────
  "sidebar:/operaciones": [
    "admin", "manager", "ama_de_llaves", "resp_administracion", "responsable_area", "jefe_recepcion", "comercial",
  ],
  "sidebar:/executive": [
    "admin", "manager", "ama_de_llaves", "resp_administracion", "responsable_area", "jefe_recepcion", "comercial",
  ],
  "sidebar:/reports": [
    "admin", "manager", "ama_de_llaves", "resp_administracion", "responsable_area", "jefe_recepcion", "comercial",
  ],

  // ── CONFIGURACIÓN ────────────────────────────────────────────────────────
  // Comparte resourceKey con el AdminRoute de App.tsx ("/administration") —
  // CORRECCIÓN: AdminRoute dejaba pasar también a "manager"; el sidebar
  // siempre lo mostró solo a "admin", igual que el resto de esta sección
  // (Correo & Backup, Países ARCA, etc.) — se angosta la ruta para que
  // coincida con lo que el sidebar siempre pretendió.
  "sidebar:/administration": ["admin"],
  // Comparte resourceKey con el AdminRoute de App.tsx — ya coincidían
  // (admin + manager en los dos lados), sin corrección.
  "sidebar:/admin/room-types/integrity": ["admin", "manager"],
  "sidebar:/email-config": ["admin"],
  "sidebar:/admin/countries": ["admin"],
  "sidebar:/config/presupuestos": ["admin"],
  "sidebar:/pos-configs": ["admin", "resp_administracion"],
  "sidebar:/seguridad": ["admin"],
  // devOnly además de esto — se sigue chequeando aparte en el cliente, no
  // forma parte del modelo de permisos.
  "sidebar:/source-code": ["admin"],
};

/**
 * Etapa 3 del ABM de usuarios: resourceKey propios (prefijo "api:", no
 * ligados a ningún ítem del sidebar) para endpoints del servidor cuyo
 * requireRole([...]) no coincidía exactamente con ningún resourceKey de
 * INITIAL_ROLE_PERMISSIONS. Reusar un resourceKey del sidebar hubiera
 * acoplado su acceso al de un ítem de menú no relacionado; en cambio cada
 * uno de estos queda controlable de forma independiente desde la pantalla
 * de administración de permisos. Cada entrada preserva EXACTAMENTE el
 * array de roles que ese endpoint ya tenía — cero cambio de comportamiento
 * al migrar — salvo que el comentario de la entrada diga lo contrario.
 * Se siembra vía resource_permission_seeds (ver server/migrate.ts), igual
 * que cualquier resourceKey agregado después del seed inicial.
 */
export const API_RESOURCE_PERMISSIONS: Record<string, SystemUserRole[]> = {
  // server/routes/channex.ts — antes CHANNEX_CONFIG_ROLES, 6 endpoints de
  // conexiones y mapeos (crear/editar/borrar/sincronizar catálogo).
  "api:channex:config": ["admin", "manager", "resp_administracion", "jefe_recepcion"],

  // server/billing/routes.ts — antes FINANCE_RECONCILIATION_ROLES, 3
  // endpoints de conciliación de Notas de Crédito pendientes.
  "api:billing:nc-reconciliation": ["admin", "manager", "resp_administracion", "jefe_recepcion"],

  // server/routes/spa.ts (7 endpoints) + server/billing/routes.ts (1 chequeo
  // inline dentro de POST /api/billing/invoices) — antes SPA_ACCESS_ROLES /
  // SPA_INVOICE_ROLES, acciones de escritura sobre turnos/cuentas/pagos de Spa.
  "api:spa:write": ["admin", "manager", "ama_de_llaves", "spa", "reception", "jefe_recepcion", "comercial"],

  // server/routes/spa.ts — antes SPA_FISCAL_REVIEW_ROLES, 2 endpoints de
  // revisión de borradores fiscales de Spa. NOTA: el resourceKey del sidebar
  // "sidebar:/admin/spa-fiscal-review" (misma pantalla) SÍ incluye
  // "responsable_area" desde la corrección de Etapa 1 — este endpoint nunca
  // tuvo esa corrección y se preserva tal cual está hoy; si se decide que
  // debería alinearse, es un cambio de comportamiento aparte, no de esta migración.
  "api:spa:fiscal-review": ["admin", "manager", "resp_administracion"],

  // server/routes/rooms.ts — antes ROOMS_WRITE_ROLES, 5 endpoints de
  // escritura de tipos de habitación y habitaciones concretas.
  "api:rooms:write": ["admin", "manager", "ama_de_llaves", "resp_deposito", "resp_administracion", "jefe_recepcion", "comercial"],

  // server/routes/rooms.ts — antes RATES_WRITE_ROLES, 3 endpoints de
  // escritura de planes de tarifas.
  "api:rates:write": ["admin", "manager", "jefe_recepcion"],

  // server/routes/inventory.ts — antes INVENTORY_WRITE_ROLES, 15 endpoints
  // de escritura de categorías/artículos/depósitos/movimientos/conteos.
  "api:inventory:write": ["admin", "manager", "restaurant", "resp_deposito", "resp_administracion"],
};

/**
 * Etiquetas legibles para la pantalla de administración de permisos (Etapa 2).
 * Reproduce label + sección de menuSections (client/src/components/app-sidebar.tsx)
 * para cada resourceKey de INITIAL_ROLE_PERMISSIONS — se mantiene a mano en vez
 * de importar el array del cliente para no acoplar este módulo del servidor a
 * componentes/íconos de React; un test cruza las claves de ambos objetos para
 * detectar faltantes.
 */
export const RESOURCE_KEY_LABELS: Record<string, { label: string; section: string }> = {
  "sidebar:/": { label: "Dashboard", section: "PMS — Recepción" },
  "sidebar:/planning": { label: "Planning", section: "PMS — Recepción" },
  "sidebar:/reservations": { label: "Reservas", section: "PMS — Recepción" },
  "sidebar:/new-reservation": { label: "Reserva rápida", section: "PMS — Recepción" },
  "sidebar:/check-in": { label: "Check in", section: "PMS — Recepción" },
  "sidebar:/check-out": { label: "Check out", section: "PMS — Recepción" },
  "sidebar:/rooms": { label: "Habitaciones", section: "PMS — Recepción" },
  "sidebar:group/reportes-recepcion": { label: "Reportes", section: "PMS — Recepción" },
  "sidebar:/rooms?tab=ocupadas": { label: "Hab. Ocupadas", section: "PMS — Recepción" },
  "sidebar:/daily-report": { label: "Planilla Diaria", section: "PMS — Recepción" },
  "sidebar:/admin/indec": { label: "Reporte INDEC", section: "PMS — Recepción" },
  "sidebar:/rate-plans": { label: "Tarifas", section: "PMS — Recepción" },
  "sidebar:/guests": { label: "Huéspedes", section: "PMS — Recepción" },
  "sidebar:/billing": { label: "Facturación", section: "PMS — Recepción" },

  "sidebar:/admin/booking-engine": { label: "Motor de Reservas", section: "Comercial" },
  "sidebar:/ota-channels": { label: "Canales OTAs", section: "Comercial" },
  "sidebar:/channex": { label: "Channex (prueba)", section: "Comercial" },
  "sidebar:/groups": { label: "Grupos", section: "Comercial" },
  "sidebar:/companies": { label: "Empresas", section: "Comercial" },
  "sidebar:/agencies": { label: "Agencias", section: "Comercial" },
  "sidebar:/packages": { label: "Paquetes", section: "Comercial" },
  "sidebar:/presupuestos": { label: "Presupuestos", section: "Comercial" },

  "sidebar:/restaurant": { label: "Restaurant", section: "Servicios" },
  "sidebar:/spa": { label: "Spa", section: "Servicios" },
  "sidebar:/spa-clients": { label: "Clientes Spa", section: "Servicios" },
  "sidebar:/events": { label: "Eventos", section: "Servicios" },
  "sidebar:/gift-vouchers": { label: "Vouchers Regalo", section: "Servicios" },

  "sidebar:/housekeeping": { label: "Housekeeping", section: "Operaciones" },
  "sidebar:/maintenance": { label: "Mantenimiento", section: "Operaciones" },
  "sidebar:/inventory": { label: "Inventario", section: "Operaciones" },
  "sidebar:/restaurant/recetas": { label: "Recetas y Costos", section: "Operaciones" },
  "sidebar:/operaciones/emitir-comprobante": { label: "Emitir Comprobante", section: "Operaciones" },

  "sidebar:/hospitality": { label: "Hospitalidad", section: "Experiencia al Huésped" },
  "sidebar:/chatbot": { label: "MARA Chatbot", section: "Experiencia al Huésped" },
  "sidebar:/reviews": { label: "Reseñas", section: "Experiencia al Huésped" },

  "sidebar:/admin": { label: "Administración", section: "Administración" },
  "sidebar:/admin/cuentas": { label: "Cuentas Corrientes", section: "Administración" },
  "sidebar:/cash-register": { label: "Caja", section: "Administración" },
  "sidebar:/admin/accounting-accounts": { label: "Plan de Cuentas", section: "Administración" },
  "sidebar:/admin/cost-centers": { label: "Centros de Costo", section: "Administración" },
  "sidebar:/admin/spa-fiscal-review": { label: "Revisión fiscal SPA", section: "Administración" },

  "sidebar:/operaciones": { label: "Operaciones", section: "Gerencia & Revenue" },
  "sidebar:/executive": { label: "Ejecutivo", section: "Gerencia & Revenue" },
  "sidebar:/reports": { label: "Reportes", section: "Gerencia & Revenue" },

  "sidebar:/administration": { label: "Configuración", section: "Configuración" },
  "sidebar:/admin/room-types/integrity": { label: "Reparar tipos de habitación", section: "Configuración" },
  "sidebar:/email-config": { label: "Correo & Backup", section: "Configuración" },
  "sidebar:/admin/countries": { label: "Países (ARCA)", section: "Configuración" },
  "sidebar:/config/presupuestos": { label: "Conf. Presupuestos", section: "Configuración" },
  "sidebar:/pos-configs": { label: "Puntos de Venta", section: "Configuración" },
  "sidebar:/seguridad": { label: "Seguridad de claves", section: "Configuración" },
  "sidebar:/source-code": { label: "Código fuente", section: "Configuración" },
  // Agregado en Etapa 2, después del seed inicial — no forma parte de
  // INITIAL_ROLE_PERMISSIONS (registro histórico de lo sembrado una sola
  // vez); se siembra con su propio paso puntual en migrate.ts.
  "sidebar:/admin/permisos": { label: "Permisos por Rol", section: "Configuración" },

  // Etapa 3 — resourceKey de API_RESOURCE_PERMISSIONS, agrupados en
  // secciones "API — ..." propias para no mezclarse en la matriz con los
  // permisos que controlan el sidebar.
  "api:channex:config": { label: "Configurar conexiones y mapeos", section: "API — Channex" },
  "api:billing:nc-reconciliation": { label: "Conciliar Notas de Crédito pendientes", section: "API — Facturación" },
  "api:spa:write": { label: "Turnos, cuentas y pagos de Spa", section: "API — Spa" },
  "api:spa:fiscal-review": { label: "Revisión de borradores fiscales de Spa", section: "API — Spa" },
  "api:rooms:write": { label: "Alta y edición de habitaciones y tipos", section: "API — Habitaciones" },
  "api:rates:write": { label: "Alta y edición de planes de tarifas", section: "API — Habitaciones" },
  "api:inventory:write": { label: "Categorías, artículos, depósitos y conteos", section: "API — Inventario" },
};

/** Los 14 roles del sistema (SystemUserRole), en el orden en que se muestran en la matriz. */
export const ALL_SYSTEM_ROLES: SystemUserRole[] = [
  "admin", "manager", "ama_de_llaves", "reception", "housekeeping", "maintenance",
  "restaurant", "spa", "events", "resp_deposito", "resp_administracion",
  "responsable_area", "jefe_recepcion", "comercial",
];

let cache: Map<SystemUserRole, Set<string>> | null = null;

/**
 * Carga (o recarga) el snapshot en memoria de role_permissions. Se llama una
 * vez al arrancar el proceso; la Etapa 2 (ABM editable) deberá llamarla de
 * nuevo después de cualquier cambio para invalidar el caché.
 */
export async function loadRolePermissionsCache(): Promise<void> {
  const rows = await db.select({ role: rolePermissions.role, resourceKey: rolePermissions.resourceKey }).from(rolePermissions);
  const next = new Map<SystemUserRole, Set<string>>();
  for (const row of rows) {
    const role = row.role as SystemUserRole;
    if (!next.has(role)) next.set(role, new Set());
    next.get(role)!.add(row.resourceKey);
  }
  cache = next;
}

function requireCache(): Map<SystemUserRole, Set<string>> {
  if (!cache) {
    throw new Error("role_permissions cache no inicializado — llamar a loadRolePermissionsCache() al arrancar el proceso.");
  }
  return cache;
}

/** ¿El rol tiene el resourceKey dado? Lee del caché en memoria, no de la DB. */
export function hasPermission(role: SystemUserRole | string, resourceKey: string): boolean {
  return requireCache().get(role as SystemUserRole)?.has(resourceKey) ?? false;
}

/** Todos los resourceKey habilitados para un rol — para exponer "mis permisos" al cliente. */
export function permissionsForRole(role: SystemUserRole | string): string[] {
  return [...(requireCache().get(role as SystemUserRole) ?? [])];
}

/** Solo para tests: fuerza el contenido del caché sin tocar la base. */
export function setRolePermissionsCacheForTests(entries: Array<{ role: SystemUserRole; resourceKey: string }>): void {
  const next = new Map<SystemUserRole, Set<string>>();
  for (const { role, resourceKey } of entries) {
    if (!next.has(role)) next.set(role, new Set());
    next.get(role)!.add(resourceKey);
  }
  cache = next;
}

export async function grantPermission(role: SystemUserRole, resourceKey: string): Promise<void> {
  await db.insert(rolePermissions).values({ role, resourceKey }).onConflictDoNothing();
  await loadRolePermissionsCache();
}

export async function revokePermission(role: SystemUserRole, resourceKey: string): Promise<void> {
  await db.delete(rolePermissions).where(and(eq(rolePermissions.role, role), eq(rolePermissions.resourceKey, resourceKey)));
  await loadRolePermissionsCache();
}

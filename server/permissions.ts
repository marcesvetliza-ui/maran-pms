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
// Preserve the existing demo access after the granular-permissions migration.
export const PILOT_EXTERNAL_RESOURCE_KEYS = ["sidebar:/", "sidebar:/planning", "sidebar:/reservations", "sidebar:/new-reservation", "sidebar:/check-in", "sidebar:/check-out", "sidebar:/rooms", "sidebar:/guests", "sidebar:/rate-plans", "sidebar:/admin/booking-engine", "sidebar:/ota-channels", "sidebar:/groups", "sidebar:/companies", "sidebar:/agencies", "sidebar:/restaurant", "sidebar:/spa", "sidebar:/spa-clients", "sidebar:/events", "sidebar:/gift-vouchers", "sidebar:/cash-register"] as const;

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
  "api:billing:nc-reconciliation": ["admin", "manager", "resp_administracion", "jefe_recepcion", "reception"],

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
  "api:inventory:read": ["admin", "manager", "resp_deposito", "resp_administracion", "restaurant", "spa", "ama_de_llaves", "responsable_area"],
  "api:inventory:catalog": ["admin", "manager", "resp_deposito", "resp_administracion"],
  "api:inventory:operate": ["admin", "manager", "resp_deposito", "resp_administracion", "restaurant"],
  "api:inventory:adjust": ["admin", "manager", "resp_deposito", "resp_administracion"],
  "api:inventory:cost": ["admin", "manager", "resp_deposito", "resp_administracion"],
  "api:inventory:write": ["admin", "manager", "restaurant", "resp_deposito", "resp_administracion"],

  // server/reports/routes.ts — un resourceKey por informe (antes FINANCE_ROLES
  // y variantes .concat(...) con un rol de área agregado), para poder
  // habilitar/deshabilitar cada informe de forma independiente aunque hoy
  // varios compartan el mismo conjunto de roles.
  "api:reports:estado-resultados": ["admin", "manager", "resp_administracion", "jefe_recepcion"],
  "api:reports:kpis": ["admin", "manager", "resp_administracion", "jefe_recepcion"],
  "api:reports:ocupacion": ["admin", "manager", "resp_administracion", "jefe_recepcion"],
  "api:reports:ingresos": ["admin", "manager", "resp_administracion", "jefe_recepcion"],
  "api:reports:costos": ["admin", "manager", "resp_administracion", "jefe_recepcion"],
  "api:reports:proveedores": ["admin", "manager", "resp_administracion", "jefe_recepcion"],
  "api:reports:comparativo": ["admin", "manager", "resp_administracion", "jefe_recepcion"],
  "api:reports:spa": ["admin", "manager", "resp_administracion", "jefe_recepcion", "spa"],
  "api:reports:spa-por-profesional": ["admin", "manager", "resp_administracion", "jefe_recepcion", "spa"],
  "api:reports:events": ["admin", "manager", "resp_administracion", "jefe_recepcion", "events"],
  "api:reports:maintenance": ["admin", "manager", "resp_administracion", "jefe_recepcion", "maintenance"],
  "api:reports:inventory": ["admin", "manager", "resp_administracion", "jefe_recepcion", "resp_deposito"],
  "api:reports:restaurant-cmv": ["admin", "manager", "resp_administracion", "jefe_recepcion", "restaurant"],
  "api:reports:housekeeping-productivity": ["admin", "manager", "resp_administracion", "jefe_recepcion", "housekeeping"],
  "api:reports:forecast": ["admin", "manager", "resp_administracion", "jefe_recepcion"],
  "api:reports:export-pdf": ["admin", "manager", "resp_administracion", "jefe_recepcion"],
  "api:reports:export-excel": ["admin", "manager", "resp_administracion", "jefe_recepcion"],

  // server/routes.ts — GET /api/dashboard/breakfasts, lista de desayunos.
  "api:dashboard:breakfasts": ["admin", "manager", "ama_de_llaves", "restaurant", "reception", "jefe_recepcion"],

  // server/routes.ts — 3 endpoints de alta/edición/baja de Facturas de Compra.
  "api:purchase-invoices:write": ["admin", "manager", "resp_deposito", "resp_administracion"],

  // server/routes.ts — POST /api/night-audit/run.
  "api:night-audit:run": ["admin", "manager", "reception", "jefe_recepcion"],

  // ── Bucket A del relevamiento: sitios cuyo array de roles coincidía EXACTO
  // con algún resourceKey del sidebar, pero por una página no relacionada
  // (ej. "GET /api/admin/users" coincidía con ["admin"] solo porque
  // sidebar:/administration también es admin-only, no porque sean la misma
  // pantalla). Reusar esas claves hubiera acoplado su acceso al de un ítem
  // de menú sin relación real; cada uno recibe su propio resourceKey, igual
  // que los "ambiguos" de más arriba. Los que SÍ eran la misma pantalla
  // (Centros de Costo, Países ARCA POST/PATCH/DELETE, integridad de tipos
  // de habitación) ya reusan su resourceKey del sidebar desde antes.
  "api:admin:users": ["admin"],
  "api:admin:security": ["admin"],
  "api:admin:backup": ["admin"],
  "api:admin:setup-utilities": ["admin"],
  "api:admin:guests-cleanup": ["admin"],
  "api:admin:clean-data": ["admin"],
  "api:incidents:delete": ["admin"],
  "api:admin:chatbot-secret": ["admin"],
  "api:admin:purchase-invoices-truncate": ["admin"],
  "api:spa:reset-nc": ["admin"],
  "api:events:reset-nc": ["admin"],

  "api:admin:countries-list": ["admin", "manager"],
  "api:account-movements:void": ["admin", "manager"],
  "api:admin:audit-logs": ["admin", "manager"],
  // Recorre TODO el historial de pagos en Cta. Cte. y puede crear muchos
  // movimientos de golpe (ver incidente del 6/10) — restringido a admin.
  "api:admin:reconcile-cc-payments": ["admin"],
  "api:cash:configs-write": ["admin", "manager"],
  "api:cash:payment-links-audit": ["admin", "manager"],
  "api:cash:repair-movements": ["admin", "manager"],
  "api:cash:force-anular": ["admin", "manager"],

  "api:accounting-accounts:write": ["admin", "resp_administracion"],

  // ── Checks de rol sueltos del cliente, migrados a hasPermission() ──────────
  // Cada uno preserva EXACTAMENTE el array que tenía el chequeo hardcodeado
  // que reemplaza (ver comentarios en el archivo del cliente correspondiente).
  "api:housekeeping:supervisor-view": ["admin", "manager", "ama_de_llaves", "responsable_area"],
  "api:restaurant:edit-layout": ["admin", "manager", "responsable_area"],
  "api:cash:area-admin": ["admin", "manager", "jefe_recepcion", "resp_administracion"],
  "api:cash:global-view": ["admin", "manager", "resp_administracion", "jefe_recepcion"],

  // Emitir Comprobante: qué áreas ve cada rol dentro de la pantalla (antes
  // AREAS[].roles en el propio archivo del cliente). ROLES_VEN_TODO =
  // admin/manager/responsable_area/resp_administracion/comercial, más el rol
  // propio de cada área.
  "api:emitir-comprobante:recepcion": ["admin", "manager", "responsable_area", "resp_administracion", "comercial", "reception", "jefe_recepcion"],
  "api:emitir-comprobante:restaurant": ["admin", "manager", "responsable_area", "resp_administracion", "comercial", "restaurant"],
  "api:emitir-comprobante:spa": ["admin", "manager", "responsable_area", "resp_administracion", "comercial", "spa"],
  "api:emitir-comprobante:events": ["admin", "manager", "responsable_area", "resp_administracion", "comercial", "events"],
  "api:emitir-comprobante:compras": ["admin", "manager", "responsable_area", "resp_administracion", "comercial", "resp_deposito"],
  "api:emitir-comprobante:inventario": ["admin", "manager", "responsable_area", "resp_administracion", "comercial", "resp_deposito"],
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
  "api:inventory:read": {label: "Consultar Inventario", section: "API — Inventario"},
  "api:inventory:catalog": {label: "Editar catálogo y depósitos", section: "API — Inventario"},
  "api:inventory:operate": {label: "Operar stock y elaboraciones", section: "API — Inventario"},
  "api:inventory:adjust": {label: "Ajustar, anular y cerrar conteos", section: "API — Inventario"},
  "api:inventory:cost": {label: "Consultar y modificar costos", section: "API — Inventario"},
  "api:inventory:write": { label: "Permiso anterior (reemplazado por permisos específicos)", section: "API — Inventario" },

  "api:reports:estado-resultados": { label: "Estado de Resultados", section: "API — Reportes" },
  "api:reports:kpis": { label: "KPIs", section: "API — Reportes" },
  "api:reports:ocupacion": { label: "Ocupación", section: "API — Reportes" },
  "api:reports:ingresos": { label: "Ingresos", section: "API — Reportes" },
  "api:reports:costos": { label: "Costos", section: "API — Reportes" },
  "api:reports:proveedores": { label: "Proveedores", section: "API — Reportes" },
  "api:reports:comparativo": { label: "Comparativo", section: "API — Reportes" },
  "api:reports:spa": { label: "Informe de Spa", section: "API — Reportes" },
  "api:reports:spa-por-profesional": { label: "Informe de Spa por profesional", section: "API — Reportes" },
  "api:reports:events": { label: "Informe de Eventos", section: "API — Reportes" },
  "api:reports:maintenance": { label: "Informe de Mantenimiento", section: "API — Reportes" },
  "api:reports:inventory": { label: "Informe de Inventario", section: "API — Reportes" },
  "api:reports:restaurant-cmv": { label: "CMV de Restaurant", section: "API — Reportes" },
  "api:reports:housekeeping-productivity": { label: "Productividad de Housekeeping", section: "API — Reportes" },
  "api:reports:forecast": { label: "Forecast", section: "API — Reportes" },
  "api:reports:export-pdf": { label: "Exportar informe a PDF", section: "API — Reportes" },
  "api:reports:export-excel": { label: "Exportar informe a Excel", section: "API — Reportes" },
  "api:dashboard:breakfasts": { label: "Lista de desayunos", section: "API — Operaciones" },
  "api:purchase-invoices:write": { label: "Alta, edición y baja de Facturas de Compra", section: "API — Operaciones" },
  "api:night-audit:run": { label: "Ejecutar auditoría nocturna", section: "API — Operaciones" },

  "api:admin:users": { label: "Alta, edición y baja de usuarios del sistema", section: "API — Administración" },
  "api:admin:security": { label: "Seguridad: intentos fallidos, bloqueos, rotar sesión", section: "API — Administración" },
  "api:admin:backup": { label: "Backup: descarga, logs, config, restaurar", section: "API — Administración" },
  "api:admin:setup-utilities": { label: "Utilidades de inicialización (habitaciones, cajas)", section: "API — Administración" },
  "api:admin:guests-cleanup": { label: "Huéspedes fantasma: detectar y limpiar", section: "API — Administración" },
  "api:admin:clean-data": { label: "Limpiar datos del sistema", section: "API — Administración" },
  "api:incidents:delete": { label: "Eliminar incidentes", section: "API — Administración" },
  "api:admin:chatbot-secret": { label: "Ver el secreto del webhook del chatbot", section: "API — Administración" },
  "api:admin:purchase-invoices-truncate": { label: "Vaciar todas las Facturas de Compra", section: "API — Administración" },
  "api:spa:reset-nc": { label: "Restablecer estado de NC de una cuenta de Spa", section: "API — Spa" },
  "api:events:reset-nc": { label: "Restablecer estado de NC de un evento o mesa", section: "API — Operaciones" },

  "api:admin:countries-list": { label: "Ver el listado completo de Países (ARCA)", section: "API — Administración" },
  "api:account-movements:void": { label: "Anular movimientos de cuenta corriente", section: "API — Administración" },
  "api:admin:audit-logs": { label: "Ver el registro de auditoría", section: "API — Administración" },
  "api:admin:reconcile-cc-payments": { label: "Reconciliar pagos de Cuenta Corriente", section: "API — Administración" },
  "api:cash:configs-write": { label: "Editar configuración de Caja por área", section: "API — Administración" },
  "api:cash:payment-links-audit": { label: "Auditoría de vínculos de pago huérfanos/duplicados", section: "API — Administración" },
  "api:cash:repair-movements": { label: "Reparar movimientos de Caja faltantes", section: "API — Administración" },
  "api:cash:force-anular": { label: "Forzar anulación de movimientos en turnos cerrados", section: "API — Administración" },

  "api:accounting-accounts:write": { label: "Alta, edición y listado completo de Plan de Cuentas", section: "API — Administración" },

  "api:housekeeping:supervisor-view": { label: "Vista de supervisor en Housekeeping", section: "API — Operaciones" },
  "api:restaurant:edit-layout": { label: "Editar el layout de mesas de Restaurant", section: "API — Operaciones" },
  "api:cash:area-admin": { label: "Administración de Caja por área (movimientos manuales, anular ajenos)", section: "API — Administración" },
  "api:cash:global-view": { label: "Ver todas las áreas de Caja + historial + resumen + Night Audit", section: "API — Administración" },

  "api:emitir-comprobante:recepcion": { label: "Emitir Comprobante — área Recepción", section: "API — Operaciones" },
  "api:emitir-comprobante:restaurant": { label: "Emitir Comprobante — área Restaurant", section: "API — Operaciones" },
  "api:emitir-comprobante:spa": { label: "Emitir Comprobante — área Spa", section: "API — Operaciones" },
  "api:emitir-comprobante:events": { label: "Emitir Comprobante — área Eventos", section: "API — Operaciones" },
  "api:emitir-comprobante:compras": { label: "Emitir Comprobante — área Compras", section: "API — Operaciones" },
  "api:emitir-comprobante:inventario": { label: "Emitir Comprobante — área Inventario", section: "API — Operaciones" },
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

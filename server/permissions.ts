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

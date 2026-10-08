import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Etapa 1 del ABM de usuarios: role_permissions reemplaza los arrays de
 * roles hardcodeados del sidebar. Estos tests cubren el helper de caché en
 * memoria (hasPermission/permissionsForRole) y, como red de seguridad
 * contra errores de transcripción, que el catálogo inicial (INITIAL_ROLE_PERMISSIONS)
 * reproduzca exactamente los ~52 ítems del sidebar de hoy — incluidas las 3
 * correcciones confirmadas con el usuario sobre inconsistencias reales entre
 * el sidebar y los guards de ruta de App.tsx.
 */

const dbState = vi.hoisted(() => ({ rows: [] as Array<{ role: string; resourceKey: string }> }));

vi.mock("../db", () => ({
  db: {
    select: () => ({
      from: () => Promise.resolve(dbState.rows),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => Promise.resolve(),
      }),
    }),
    delete: () => ({
      where: () => Promise.resolve(),
    }),
  },
}));

const {
  hasPermission,
  permissionsForRole,
  loadRolePermissionsCache,
  setRolePermissionsCacheForTests,
  grantPermission,
  revokePermission,
  INITIAL_ROLE_PERMISSIONS,
  RESOURCE_KEY_LABELS,
  ALL_SYSTEM_ROLES,
  API_RESOURCE_PERMISSIONS,
} = await import("../permissions");

afterEach(() => {
  dbState.rows = [];
  // Cada test deja el caché en un estado conocido para el siguiente.
  setRolePermissionsCacheForTests([]);
});

describe("hasPermission / permissionsForRole", () => {
  it("hasPermission es false para un resourceKey no otorgado", () => {
    setRolePermissionsCacheForTests([{ role: "reception", resourceKey: "sidebar:/reservations" }]);
    expect(hasPermission("reception", "sidebar:/admin")).toBe(false);
  });

  it("hasPermission es true para un resourceKey otorgado a ese rol", () => {
    setRolePermissionsCacheForTests([{ role: "reception", resourceKey: "sidebar:/reservations" }]);
    expect(hasPermission("reception", "sidebar:/reservations")).toBe(true);
  });

  it("no cruza permisos entre roles distintos", () => {
    setRolePermissionsCacheForTests([{ role: "reception", resourceKey: "sidebar:/reservations" }]);
    expect(hasPermission("housekeeping", "sidebar:/reservations")).toBe(false);
  });

  it("permissionsForRole devuelve todos los resourceKey de ese rol, ninguno de otro", () => {
    setRolePermissionsCacheForTests([
      { role: "admin", resourceKey: "sidebar:/administration" },
      { role: "admin", resourceKey: "sidebar:/seguridad" },
      { role: "reception", resourceKey: "sidebar:/reservations" },
    ]);
    expect(permissionsForRole("admin").sort()).toEqual(["sidebar:/administration", "sidebar:/seguridad"]);
    expect(permissionsForRole("reception")).toEqual(["sidebar:/reservations"]);
  });

  it("permissionsForRole devuelve [] para un rol sin ningún permiso otorgado", () => {
    setRolePermissionsCacheForTests([{ role: "admin", resourceKey: "sidebar:/administration" }]);
    expect(permissionsForRole("maintenance")).toEqual([]);
  });
});

describe("loadRolePermissionsCache", () => {
  it("carga el caché desde la base y hasPermission ya lo refleja", async () => {
    dbState.rows = [
      { role: "spa", resourceKey: "sidebar:/spa" },
      { role: "spa", resourceKey: "sidebar:/spa-clients" },
    ];
    await loadRolePermissionsCache();
    expect(hasPermission("spa", "sidebar:/spa")).toBe(true);
    expect(hasPermission("spa", "sidebar:/admin")).toBe(false);
  });
});

describe("grantPermission / revokePermission", () => {
  it("grantPermission recarga el caché después de insertar", async () => {
    setRolePermissionsCacheForTests([]);
    dbState.rows = [{ role: "events", resourceKey: "sidebar:/events" }];
    await grantPermission("events" as any, "sidebar:/events");
    expect(hasPermission("events", "sidebar:/events")).toBe(true);
  });

  it("revokePermission recarga el caché después de borrar", async () => {
    setRolePermissionsCacheForTests([{ role: "events" as any, resourceKey: "sidebar:/events" }]);
    dbState.rows = [];
    await revokePermission("events" as any, "sidebar:/events");
    expect(hasPermission("events", "sidebar:/events")).toBe(false);
  });
});

describe("INITIAL_ROLE_PERMISSIONS — catálogo inicial del sidebar", () => {
  it("tiene exactamente los 52 resourceKey del sidebar de hoy (14 secciones/ítems, incluidos subítems)", () => {
    expect(Object.keys(INITIAL_ROLE_PERMISSIONS)).toHaveLength(52);
  });

  it("CORE_RECEPCION se aplica igual a los 10 ítems que lo comparten hoy", () => {
    const coreRecepcionKeys = [
      "sidebar:/reservations", "sidebar:/new-reservation", "sidebar:/billing",
      "sidebar:/admin/booking-engine", "sidebar:/ota-channels", "sidebar:/channex",
      "sidebar:/groups", "sidebar:/companies", "sidebar:/agencies", "sidebar:/chatbot",
    ];
    const expected = ["admin", "reception", "responsable_area", "jefe_recepcion", "comercial"].sort();
    for (const key of coreRecepcionKeys) {
      expect(INITIAL_ROLE_PERMISSIONS[key].slice().sort(), key).toEqual(expected);
    }
  });

  it("CORRECCIÓN: emitir-comprobante incluye responsable_area (App.tsx no lo tenía)", () => {
    expect(INITIAL_ROLE_PERMISSIONS["sidebar:/operaciones/emitir-comprobante"]).toContain("responsable_area");
  });

  it("CORRECCIÓN: spa-fiscal-review incluye responsable_area (App.tsx no lo tenía)", () => {
    expect(INITIAL_ROLE_PERMISSIONS["sidebar:/admin/spa-fiscal-review"]).toContain("responsable_area");
  });

  it("CORRECCIÓN: /administration queda admin-only (App.tsx dejaba pasar también a manager)", () => {
    expect(INITIAL_ROLE_PERMISSIONS["sidebar:/administration"]).toEqual(["admin"]);
  });

  it("/admin/room-types/integrity no necesitó corrección: admin + manager en ambos lados", () => {
    expect(INITIAL_ROLE_PERMISSIONS["sidebar:/admin/room-types/integrity"].slice().sort()).toEqual(["admin", "manager"]);
  });

  it("no incluye los roles fantasma (gobernanta, administracion) en ningún resourceKey", () => {
    const allRoles = new Set(Object.values(INITIAL_ROLE_PERMISSIONS).flat());
    expect(allRoles.has("gobernanta" as any)).toBe(false);
    expect(allRoles.has("administracion" as any)).toBe(false);
  });
});

describe("RESOURCE_KEY_LABELS / ALL_SYSTEM_ROLES — catálogo de la pantalla de Etapa 2", () => {
  it("tiene una etiqueta para cada resourceKey del seed inicial (los 52 de Etapa 1)", () => {
    for (const key of Object.keys(INITIAL_ROLE_PERMISSIONS)) {
      expect(RESOURCE_KEY_LABELS[key], key).toBeDefined();
    }
  });

  it("incluye el resourceKey de la propia pantalla de permisos (sembrado aparte, fuera del seed masivo)", () => {
    expect(RESOURCE_KEY_LABELS["sidebar:/admin/permisos"]).toEqual({
      label: "Permisos por Rol",
      section: "Configuración",
    });
    expect(INITIAL_ROLE_PERMISSIONS["sidebar:/admin/permisos"]).toBeUndefined();
  });

  it("cada etiqueta tiene label y section no vacíos", () => {
    for (const [key, meta] of Object.entries(RESOURCE_KEY_LABELS)) {
      expect(meta.label.length, key).toBeGreaterThan(0);
      expect(meta.section.length, key).toBeGreaterThan(0);
    }
  });

  it("ALL_SYSTEM_ROLES tiene los 14 roles del sistema, sin duplicados", () => {
    expect(ALL_SYSTEM_ROLES).toHaveLength(14);
    expect(new Set(ALL_SYSTEM_ROLES).size).toBe(14);
  });
});

describe("API_RESOURCE_PERMISSIONS — resourceKey propios de Etapa 3 (no ligados al sidebar)", () => {
  it("tiene una etiqueta para cada resourceKey en RESOURCE_KEY_LABELS", () => {
    for (const key of Object.keys(API_RESOURCE_PERMISSIONS)) {
      expect(RESOURCE_KEY_LABELS[key], key).toBeDefined();
    }
  });

  it("no pisa ningún resourceKey de INITIAL_ROLE_PERMISSIONS (namespaces distintos: api: vs sidebar:)", () => {
    const initialKeys = new Set(Object.keys(INITIAL_ROLE_PERMISSIONS));
    for (const key of Object.keys(API_RESOURCE_PERMISSIONS)) {
      expect(initialKeys.has(key), key).toBe(false);
      expect(key.startsWith("api:")).toBe(true);
    }
  });

  it("cada entrada preserva un array de roles no vacío", () => {
    for (const [key, roles] of Object.entries(API_RESOURCE_PERMISSIONS)) {
      expect(roles.length, key).toBeGreaterThan(0);
    }
  });

  it("preserva exactamente los arrays de roles que tenían los endpoints migrados en este lote", () => {
    expect(API_RESOURCE_PERMISSIONS["api:channex:config"].slice().sort()).toEqual(
      ["admin", "jefe_recepcion", "manager", "resp_administracion"].sort(),
    );
    expect(API_RESOURCE_PERMISSIONS["api:billing:nc-reconciliation"].slice().sort()).toEqual(
      ["admin", "jefe_recepcion", "manager", "resp_administracion", "reception"].sort(),
    );
    expect(API_RESOURCE_PERMISSIONS["api:spa:write"].slice().sort()).toEqual(
      ["admin", "ama_de_llaves", "comercial", "jefe_recepcion", "manager", "reception", "spa"].sort(),
    );
    expect(API_RESOURCE_PERMISSIONS["api:spa:fiscal-review"].slice().sort()).toEqual(
      ["admin", "manager", "resp_administracion"].sort(),
    );
    expect(API_RESOURCE_PERMISSIONS["api:rooms:write"].slice().sort()).toEqual(
      ["admin", "manager", "ama_de_llaves", "resp_deposito", "resp_administracion", "jefe_recepcion", "comercial"].sort(),
    );
    expect(API_RESOURCE_PERMISSIONS["api:rates:write"].slice().sort()).toEqual(
      ["admin", "manager", "jefe_recepcion"].sort(),
    );
    expect(API_RESOURCE_PERMISSIONS["api:inventory:write"].slice().sort()).toEqual(
      ["admin", "manager", "restaurant", "resp_deposito", "resp_administracion"].sort(),
    );
  });

  it("preserva los arrays de roles de los 17 informes migrados", () => {
    const FINANCE_ROLES = ["admin", "manager", "resp_administracion", "jefe_recepcion"];
    const plainFinanceKeys = [
      "api:reports:estado-resultados", "api:reports:kpis", "api:reports:ocupacion",
      "api:reports:ingresos", "api:reports:costos", "api:reports:proveedores",
      "api:reports:comparativo", "api:reports:forecast", "api:reports:export-pdf", "api:reports:export-excel",
    ];
    for (const key of plainFinanceKeys) {
      expect(API_RESOURCE_PERMISSIONS[key].slice().sort(), key).toEqual(FINANCE_ROLES.slice().sort());
    }
    expect(API_RESOURCE_PERMISSIONS["api:reports:spa"].slice().sort()).toEqual([...FINANCE_ROLES, "spa"].sort());
    expect(API_RESOURCE_PERMISSIONS["api:reports:spa-por-profesional"].slice().sort()).toEqual([...FINANCE_ROLES, "spa"].sort());
    expect(API_RESOURCE_PERMISSIONS["api:reports:events"].slice().sort()).toEqual([...FINANCE_ROLES, "events"].sort());
    expect(API_RESOURCE_PERMISSIONS["api:reports:maintenance"].slice().sort()).toEqual([...FINANCE_ROLES, "maintenance"].sort());
    expect(API_RESOURCE_PERMISSIONS["api:reports:inventory"].slice().sort()).toEqual([...FINANCE_ROLES, "resp_deposito"].sort());
    expect(API_RESOURCE_PERMISSIONS["api:reports:restaurant-cmv"].slice().sort()).toEqual([...FINANCE_ROLES, "restaurant"].sort());
    expect(API_RESOURCE_PERMISSIONS["api:reports:housekeeping-productivity"].slice().sort()).toEqual([...FINANCE_ROLES, "housekeeping"].sort());
  });

  it("preserva los arrays de roles de los 5 endpoints sueltos migrados en server/routes.ts", () => {
    expect(API_RESOURCE_PERMISSIONS["api:dashboard:breakfasts"].slice().sort()).toEqual(
      ["admin", "manager", "ama_de_llaves", "restaurant", "reception", "jefe_recepcion"].sort(),
    );
    expect(API_RESOURCE_PERMISSIONS["api:purchase-invoices:write"].slice().sort()).toEqual(
      ["admin", "manager", "resp_deposito", "resp_administracion"].sort(),
    );
    expect(API_RESOURCE_PERMISSIONS["api:night-audit:run"].slice().sort()).toEqual(
      ["admin", "manager", "reception", "jefe_recepcion"].sort(),
    );
  });

  it("preserva los arrays de roles del Bucket A (matches exactos con un resourceKey de otra pantalla, migrados con clave propia)", () => {
    const adminOnlyKeys = [
      "api:admin:users", "api:admin:security", "api:admin:backup",
      "api:admin:setup-utilities", "api:admin:guests-cleanup", "api:admin:clean-data",
      "api:incidents:delete", "api:admin:chatbot-secret", "api:admin:purchase-invoices-truncate",
      "api:spa:reset-nc", "api:events:reset-nc",
      // Recorre TODO el historial de pagos en Cta. Cte. y puede crear muchos
      // movimientos de golpe (ver incidente del 6/10) — restringido a admin.
      "api:admin:reconcile-cc-payments",
    ];
    for (const key of adminOnlyKeys) {
      expect(API_RESOURCE_PERMISSIONS[key], key).toEqual(["admin"]);
    }
    const adminManagerKeys = [
      "api:admin:countries-list", "api:account-movements:void", "api:admin:audit-logs",
      "api:cash:configs-write", "api:cash:payment-links-audit",
      "api:cash:repair-movements", "api:cash:force-anular",
    ];
    for (const key of adminManagerKeys) {
      expect(API_RESOURCE_PERMISSIONS[key].slice().sort(), key).toEqual(["admin", "manager"].sort());
    }
    expect(API_RESOURCE_PERMISSIONS["api:accounting-accounts:write"].slice().sort()).toEqual(
      ["admin", "resp_administracion"].sort(),
    );
  });

  it("todo resourceKey de API_RESOURCE_PERMISSIONS tiene una etiqueta con label y section no vacíos", () => {
    for (const key of Object.keys(API_RESOURCE_PERMISSIONS)) {
      const meta = RESOURCE_KEY_LABELS[key];
      expect(meta, key).toBeDefined();
      expect(meta.label.length, key).toBeGreaterThan(0);
      expect(meta.section.length, key).toBeGreaterThan(0);
    }
  });
});

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
      ["admin", "jefe_recepcion", "manager", "resp_administracion"].sort(),
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
});

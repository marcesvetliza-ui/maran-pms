import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { queryClient } from "@/lib/queryClient";
import { SidebarProvider } from "@/components/ui/sidebar";

/**
 * Etapa 1 del ABM de usuarios: el sidebar dejó de decidir qué mostrar con
 * arrays de roles hardcodeados (DASHBOARD_ROLES, CORE_RECEPCION, etc.) y
 * ahora consulta hasPermission(resourceKey) desde useAuth() — ver
 * server/permissions.ts para el catálogo. Estos tests verifican que el
 * filtrado en sí (ítems de nivel superior, subítems, devOnly) sigue
 * funcionando igual, mockeando useAuth() directamente en vez de levantar
 * todo el fetch de /api/permissions/mine.
 */

const authState = vi.hoisted(() => ({
  hasPermission: ((_resourceKey: string) => true) as (resourceKey: string) => boolean,
}));

vi.mock("@/App", () => ({
  useAuth: () => ({
    user: { id: "u1", username: "tester", email: "t@t.com", fullName: "Tester", role: "reception", department: null },
    hasPermission: authState.hasPermission,
  }),
}));

const { AppSidebar } = await import("./app-sidebar");

function renderSidebar() {
  return render(
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    </QueryClientProvider>,
  );
}

describe("AppSidebar — filtrado por resourceKey", () => {
  beforeEach(() => {
    queryClient.clear();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })));
    // SidebarProvider usa useIsMobile(), que llama matchMedia — jsdom no lo trae.
    window.matchMedia = window.matchMedia || ((query: string) => ({
      matches: false, media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })) as any;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("muestra un ítem de nivel superior cuando hasPermission da true para su resourceKey", () => {
    authState.hasPermission = (key) => key === "sidebar:/reservations";
    renderSidebar();
    expect(screen.getByText("Reservas")).toBeInTheDocument();
  });

  it("oculta un ítem de nivel superior cuando hasPermission da false para su resourceKey", () => {
    authState.hasPermission = () => false;
    renderSidebar();
    expect(screen.queryByText("Reservas")).not.toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("una sección entera desaparece si ningún ítem suyo tiene permiso", () => {
    authState.hasPermission = () => false;
    renderSidebar();
    expect(screen.queryByText("Gerencia & Revenue")).not.toBeInTheDocument();
  });

  it("filtra subítems independientemente del padre (Reportes: INDEC solo para quien lo tenga)", () => {
    authState.hasPermission = (key) =>
      key === "sidebar:group/reportes-recepcion" ||
      key === "sidebar:/rooms?tab=ocupadas" ||
      key === "sidebar:/daily-report";
    // sidebar:/admin/indec deliberadamente sin permiso.
    renderSidebar();
    expect(screen.getByText("Hab. Ocupadas")).toBeInTheDocument();
    expect(screen.getByText("Planilla Diaria")).toBeInTheDocument();
    expect(screen.queryByText("Reporte INDEC")).not.toBeInTheDocument();
  });

  it("con todos los permisos otorgados, se ven los 8 módulos completos", () => {
    authState.hasPermission = () => true;
    renderSidebar();
    expect(screen.getByText("PMS — Recepción")).toBeInTheDocument();
    expect(screen.getByText("Comercial")).toBeInTheDocument();
    expect(screen.getByText("Servicios")).toBeInTheDocument();
    // "Operaciones" es ambiguo: es a la vez el título de MÓDULO 4 y un ítem
    // dentro de Gerencia & Revenue — se comprueba con un ítem propio de cada uno.
    expect(screen.getByText("Housekeeping")).toBeInTheDocument();
    expect(screen.getByText("Experiencia al Huésped")).toBeInTheDocument();
    // "Administración" también es ambiguo: título de MÓDULO 6 y uno de sus
    // propios ítems (href /admin) — se comprueba con "Caja", único de esa sección.
    expect(screen.getByText("Caja")).toBeInTheDocument();
    expect(screen.getByText("Gerencia & Revenue")).toBeInTheDocument();
    expect(screen.getByText("Ejecutivo")).toBeInTheDocument();
    // Mismo caso: "Configuración" es el título de la última sección y uno
    // de sus propios ítems (href /administration) — se usa "Seguridad de
    // claves", único de esa sección.
    expect(screen.getByText("Seguridad de claves")).toBeInTheDocument();
  });

  it("devOnly sigue aplicándose además de hasPermission (no se movió al modelo de permisos)", () => {
    authState.hasPermission = () => false;
    renderSidebar();
    // Con hasPermission siempre false, "Código fuente" no debería verse pase
    // lo que pase con devOnly — confirma que el resourceKey se sigue
    // respetando incluso en el único ítem que además tiene una condición
    // extra (devOnly) por fuera del modelo de permisos.
    expect(screen.queryByText("Código fuente")).not.toBeInTheDocument();
  });
});

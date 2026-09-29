import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminPermisosPage from "./admin-permisos";
import { queryClient } from "@/lib/queryClient";

/**
 * Etapa 2 del ABM de usuarios: matriz de permisos rol × resourceKey. El GET
 * ya trae labels/sección (server/permissions.ts, RESOURCE_KEY_LABELS) y los
 * grants actuales; cada checkbox llama a /grant o /revoke según corresponda.
 */

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));

vi.mock("@/lib/queryClient", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queryClient")>("@/lib/queryClient");
  return { ...actual, apiRequest: apiRequestMock };
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const catalogResponse = {
  roles: ["admin", "reception"],
  catalog: [
    { resourceKey: "sidebar:/reservations", label: "Reservas", section: "PMS — Recepción" },
    { resourceKey: "sidebar:/admin/permisos", label: "Permisos por Rol", section: "Configuración" },
  ],
  grants: [{ role: "reception", resourceKey: "sidebar:/reservations" }],
};

function renderPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminPermisosPage />
    </QueryClientProvider>,
  );
}

describe("pantalla de administración de permisos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    apiRequestMock.mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(catalogResponse)));
  });

  it("muestra la matriz con el estado actual de los checkboxes", async () => {
    renderPage();
    expect(await screen.findByText("Reservas")).toBeInTheDocument();
    const row = screen.getByTestId("row-permiso-sidebar:/reservations");
    expect(within(row).getByTestId("checkbox-permiso-reception-sidebar:/reservations")).toHaveAttribute("data-state", "checked");
    expect(within(row).getByTestId("checkbox-permiso-admin-sidebar:/reservations")).toHaveAttribute("data-state", "unchecked");
  });

  it("tildar un checkbox llama a /grant con el rol y resourceKey correctos", async () => {
    const user = userEvent.setup();
    renderPage();
    const row = await screen.findByTestId("row-permiso-sidebar:/reservations");
    await user.click(within(row).getByTestId("checkbox-permiso-admin-sidebar:/reservations"));
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith("POST", "/api/admin/role-permissions/grant", {
        role: "admin",
        resourceKey: "sidebar:/reservations",
      });
    });
  });

  it("destildar un checkbox ya otorgado llama a /revoke", async () => {
    const user = userEvent.setup();
    renderPage();
    const row = await screen.findByTestId("row-permiso-sidebar:/reservations");
    await user.click(within(row).getByTestId("checkbox-permiso-reception-sidebar:/reservations"));
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith("POST", "/api/admin/role-permissions/revoke", {
        role: "reception",
        resourceKey: "sidebar:/reservations",
      });
    });
  });

  it("el buscador filtra por label y por sección", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Reservas");
    expect(screen.getByTestId("row-permiso-sidebar:/admin/permisos")).toBeInTheDocument();

    await user.type(screen.getByTestId("input-filtro-permisos"), "reservas");
    expect(screen.getByText("Reservas")).toBeInTheDocument();
    expect(screen.queryByTestId("row-permiso-sidebar:/admin/permisos")).not.toBeInTheDocument();
  });
});

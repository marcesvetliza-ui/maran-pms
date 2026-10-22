import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const userPermissions = [{
  id: "user-reception",
  username: "recepcion.test",
  fullName: "Recepción de prueba",
  role: "reception",
  override: null as boolean | null,
  inherited: true,
  canEdit: true,
}];

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
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === "GET" && url === "/api/admin/accommodation-permissions") {
        return jsonResponse(userPermissions);
      }
      if (method === "POST" && /^\/api\/admin\/role-permissions\/(grant|revoke)$/.test(url)) {
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected API request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/admin/role-permissions") return jsonResponse(catalogResponse);
      throw new Error(`Unexpected fetch: ${url}`);
    }));
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    vi.unstubAllGlobals();
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

  it("carga los permisos individuales sin confundirlos con el catálogo por rol", async () => {
    renderPage();
    expect(await screen.findByText("recepcion.test")).toBeInTheDocument();
    expect(await screen.findByTestId("row-permiso-sidebar:/reservations")).toBeInTheDocument();
    expect(screen.getByLabelText("Editar alojamiento: recepcion.test")).toHaveValue("inherit");
    expect(screen.getByText("Puede editar")).toBeInTheDocument();
  });

  it.each([
    ["un objeto en lugar de una lista", catalogResponse],
    ["una fila inválida", [{ id: "incomplete-user" }]],
  ])("muestra un error sin romper la matriz si recibe %s", async (_label, payload) => {
    apiRequestMock.mockImplementation(async () => jsonResponse(payload));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar los permisos");
    expect(await screen.findByTestId("row-permiso-sidebar:/reservations")).toBeInTheDocument();
    expect(screen.queryByLabelText("Editar alojamiento: recepcion.test")).not.toBeInTheDocument();
  });

  it("permite reintentar una consulta fallida sin perder la matriz de roles", async () => {
    const user = userEvent.setup();
    apiRequestMock.mockRejectedValueOnce(new Error("503: Servicio no disponible"));
    renderPage();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByTestId("row-permiso-sidebar:/reservations")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("recepcion.test")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([
    ["allow", true],
    ["deny", false],
    ["inherit", null],
  ] as const)("guarda el permiso individual %s y vuelve a consultar su resultado", async (value, allowed) => {
    const user = userEvent.setup();
    let saved = { ...userPermissions[0], override: false, canEdit: false } as typeof userPermissions[number];
    apiRequestMock.mockImplementation(async (method: string, url: string, body?: { allowed: boolean | null }) => {
      if (method === "GET" && url === "/api/admin/accommodation-permissions") return jsonResponse([saved]);
      if (method === "PUT" && url === "/api/admin/accommodation-permissions/user-reception") {
        saved = { ...saved, override: body!.allowed, canEdit: body!.allowed ?? saved.inherited };
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected API request: ${method} ${url}`);
    });
    renderPage();
    const select = await screen.findByLabelText("Editar alojamiento: recepcion.test");
    // Start from a different value so each case exercises an actual change.
    if (value === "deny") {
      await user.selectOptions(select, "allow");
      await waitFor(() => expect(select).toBeEnabled());
      apiRequestMock.mockClear();
    }
    await user.selectOptions(select, value);
    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith(
      "PUT", "/api/admin/accommodation-permissions/user-reception", { allowed },
    ));
    await waitFor(() => {
      expect(select).toHaveValue(value);
      expect(screen.getByText((allowed ?? true) ? "Puede editar" : "Sólo lectura de alojamiento")).toBeInTheDocument();
    });
  });
});

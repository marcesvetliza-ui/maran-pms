import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SpecialPurchaseForm } from "./special-purchase-form";
import { matchesIssuer } from "@/lib/issuer-search";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
const companies = [
  {
    id: "company-1",
    razonSocial: "Empresa Compartida",
    cuilCuit: "30-12345678-9",
  },
  {
    id: "company-2",
    razonSocial: "Empresa Compartida",
    cuilCuit: "30-99887766-5",
  },
];
function mount(tipo: string) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: {
              retry: false,
              queryFn: async ({ queryKey }) =>
                (await fetch(String(queryKey[0]))).json(),
            },
          },
        })
      }
    >
      <SpecialPurchaseForm
        tipo={tipo}
        suppliers={companies.map((c) => ({
          id: c.id,
          razonSocial: c.razonSocial,
          cuit: c.cuilCuit.replace(/\D/g, ""),
        }))}
        accounts={[]}
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (input: string) =>
        new Response(
          JSON.stringify(
            input === "/api/companies"
              ? companies
              : input === "/api/agencies"
                ? [
                    {
                      id: "agency-1",
                      razonSocial: "Agencia Prueba",
                      cuilCuit: "30-12345678-9",
                    },
                  ]
                : [],
          ),
          { headers: { "Content-Type": "application/json" } },
        ),
    ),
  );
});
describe("Emisor por CUIT en comprobantes de compras", () => {
  it.each([
    ["RETENCION", "Empresa / Agencia que retuvo", "30123456789"],
    ["RETENCION", "Empresa / Agencia que retuvo", "30-12345678-9"],
    ["RESUMEN-BANCO", "Banco", "30-12345678-9"],
    ["LIQ-TARJETA", "Tarjeta / Procesadora", "30 12345678 9"],
  ])(
    "filtra %s por CUIT y conserva la entidad seleccionada",
    async (tipo, label, query) => {
      const user = userEvent.setup();
      mount(tipo);
      await user.click(screen.getByRole("combobox", { name: label }));
      await user.type(
        screen.getByPlaceholderText("Nombre o CUIT, con o sin guiones…"),
        query,
      );
      const options = await screen.findAllByRole("option");
      expect(options).toHaveLength(1);
      expect(options[0]).toHaveTextContent("Empresa Compartida");
      await user.keyboard("{ArrowDown}{Enter}");
      expect(screen.getByRole("combobox", { name: label })).toHaveTextContent(
        "Empresa Compartida",
      );
      expect(screen.queryByRole("option")).not.toBeInTheDocument();
      if (tipo === "RETENCION")
        await waitFor(() =>
          expect(
            vi
              .mocked(fetch)
              .mock.calls.some(([url]) =>
                String(url).includes("entityId=company-1"),
              ),
          ).toBe(true),
        );
      expect(
        vi
          .mocked(fetch)
          .mock.calls.every(
            ([, init]) => !init?.method || init.method === "GET",
          ),
      ).toBe(true);
    },
  );
  it("permite buscar agencias y no reutiliza el emisor del tipo anterior", async () => {
    const user = userEvent.setup();
    mount("RETENCION");
    await user.click(
      screen.getByRole("combobox", { name: "Empresa / Agencia que retuvo" }),
    );
    await user.type(
      screen.getByPlaceholderText("Nombre o CUIT, con o sin guiones…"),
      "30123456789",
    );
    await user.click(await screen.findByRole("option"));
    await user.click(screen.getByRole("combobox", { name: "Tipo de agente" }));
    await user.click(screen.getByRole("option", { name: "Agencia" }));
    expect(
      screen.getByRole("combobox", { name: "Empresa / Agencia que retuvo" }),
    ).toHaveTextContent("Buscar por nombre o CUIT");
    await user.click(
      screen.getByRole("combobox", { name: "Empresa / Agencia que retuvo" }),
    );
    await user.type(
      screen.getByPlaceholderText("Nombre o CUIT, con o sin guiones…"),
      "30123456789",
    );
    await user.click(
      await screen.findByRole("option", { name: /Agencia Prueba/ }),
    );
    await waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some(([url]) =>
            String(url).includes("entityType=agency&entityId=agency-1"),
          ),
      ).toBe(true),
    );
  });
  it("mantiene búsqueda por nombre y no confunde texto vacío con un CUIT", () => {
    expect(matchesIssuer("Banco Córdoba", null, "cordoba")).toBe(true);
    expect(matchesIssuer("Empresa", "30-12345678-9", "12345678")).toBe(true);
    expect(matchesIssuer("Empresa", null, "30123456789")).toBe(false);
    expect(matchesIssuer("Empresa", "30-12345678-9", "---")).toBe(false);
  });
});

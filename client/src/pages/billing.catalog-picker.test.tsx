/**
 * Tests for EmitirFacturaDialog — "Agregar desde catálogo"
 *
 * Instead of only free-text item rows, Venta offers an optional catalog
 * picker next to "Agregar ítem" with all three sources always available —
 * a fixed "Alojamiento en Hotel Maran" entry, the restaurant menu (Café
 * Justo), and spa treatments — grouped by origin, regardless of cashArea.
 * Billing often mixes departments on one invoice (a room charge with a spa
 * treatment, a restaurant order billed from recepción, etc.), so the picker
 * isn't restricted to the current area. Picking an entry fills the
 * description + price; it's additive — manual entry still works exactly as
 * before.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type React from "react";
import { queryClient } from "@/lib/queryClient";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }),
}));

const { EmitirFacturaDialog } = await import("./billing");

const FAKE_CONFIG = { arcaAmbiente: "ficticio" };

const MENU_ITEMS = [
  { id: "mi-1", name: "Café Justo", price: "2500.00", inventoryItemId: "inv-mi-1", isAvailable: "true", isActive: "true" },
  { id: "mi-2", name: "Medialunas (x3)", price: "1800.00", isAvailable: "true", isActive: "true" },
  { id: "mi-3", name: "Plato fuera de carta", price: "9999.00", isAvailable: "false", isActive: "true" },
];

const SPA_TREATMENTS = [
  { id: "tr-1", name: "Masaje Relajante 60min", price: "15000.00", isActive: "true" },
  { id: "tr-2", name: "Circuito Spa", price: "22000.00", isActive: "true" },
];

function buildFetchMock() {
  return vi.fn(async (url: string | URL | Request) => {
    const strUrl = url.toString();
    if (strUrl.endsWith("/api/restaurant/menu/items")) {
      return new Response(JSON.stringify(MENU_ITEMS), { status: 200 });
    }
    if (strUrl.endsWith("/api/spa/treatments")) {
      return new Response(JSON.stringify(SPA_TREATMENTS), { status: 200 });
    }
    if (strUrl.endsWith("/api/inventory/items")) {
      return new Response(JSON.stringify([{ id: "inv-mi-1", sku: "JUSTO-CAF-01", name: "Café Justo" }]), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  });
}

function renderDialog(props: Partial<React.ComponentProps<typeof EmitirFacturaDialog>> = {}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <EmitirFacturaDialog embedded open onClose={vi.fn()} config={FAKE_CONFIG} {...props} />
    </QueryClientProvider>,
  );
}

describe("EmitirFacturaDialog — Agregar desde catálogo", () => {
  beforeEach(() => {
    queryClient.clear();
    vi.stubGlobal("fetch", buildFetchMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ofrece las tres fuentes juntas (alojamiento, carta, spa) sin importar cashArea", async () => {
    const user = userEvent.setup();
    // Facturando desde recepción, pero igual puede agregar un ítem de spa o de restaurant.
    renderDialog({ allowedTipos: ["FA"], cashArea: "recepcion" });

    await user.click(await screen.findByTestId("btn-add-item-from-catalog"));
    await waitFor(() => {
      expect(screen.getByTestId("catalog-item-alojamiento")).toBeInTheDocument();
      expect(screen.getByTestId("catalog-item-mi-1")).toBeInTheDocument();
      expect(screen.getByTestId("catalog-item-tr-2")).toBeInTheDocument();
    });
    // El ítem no disponible (isAvailable: "false") no aparece.
    expect(screen.queryByTestId("catalog-item-mi-3")).not.toBeInTheDocument();
  });

  it("elegir un ítem de spa desde una factura de recepción precarga descripción y precio", async () => {
    const user = userEvent.setup();
    renderDialog({ allowedTipos: ["FA"], cashArea: "recepcion" });

    await user.click(await screen.findByTestId("btn-add-item-from-catalog"));
    await user.click(await screen.findByTestId("catalog-item-tr-2"));

    const row = screen.getByTestId("item-row-0");
    expect(within(row).getByTestId("item-description-0")).toHaveValue("Circuito Spa");
    expect(within(row).getByTestId("item-price-0")).toHaveValue(22000);
  });

  it("el ítem fijo de Alojamiento carga en la primera fila vacía", async () => {
    const user = userEvent.setup();
    renderDialog({ allowedTipos: ["FA"], cashArea: "spa" });

    await user.click(await screen.findByTestId("btn-add-item-from-catalog"));
    await user.click(await screen.findByTestId("catalog-item-alojamiento"));

    const row = screen.getByTestId("item-row-0");
    expect(within(row).getByTestId("item-description-0")).toHaveValue("Alojamiento en Hotel Maran");
    // Sigue habiendo una sola fila — se completó la que ya estaba, no se agregó otra.
    expect(screen.queryByTestId("item-row-1")).not.toBeInTheDocument();
  });

  it("elegir un segundo ítem del catálogo agrega una fila nueva en vez de pisar la ya cargada", async () => {
    const user = userEvent.setup();
    renderDialog({ allowedTipos: ["FA"], cashArea: "restaurant" });

    await user.click(await screen.findByTestId("btn-add-item-from-catalog"));
    await user.click(await screen.findByTestId("catalog-item-mi-1"));

    await user.click(await screen.findByTestId("btn-add-item-from-catalog"));
    await user.click(await screen.findByTestId("catalog-item-mi-2"));

    expect(within(screen.getByTestId("item-row-0")).getByTestId("item-description-0")).toHaveValue("Café Justo");
    expect(within(screen.getByTestId("item-row-1")).getByTestId("item-description-1")).toHaveValue("Medialunas (x3)");
  });

  it("buscar filtra las opciones del catálogo por nombre en todas las fuentes", async () => {
    const user = userEvent.setup();
    renderDialog({ allowedTipos: ["FA"], cashArea: "restaurant" });

    await user.click(await screen.findByTestId("btn-add-item-from-catalog"));
    await waitFor(() => expect(screen.getByTestId("catalog-item-mi-2")).toBeInTheDocument());

    await user.type(screen.getByTestId("input-catalog-search"), "café");

    await waitFor(() => {
      expect(screen.getByTestId("catalog-item-mi-1")).toBeInTheDocument();
      expect(screen.queryByTestId("catalog-item-mi-2")).not.toBeInTheDocument();
      expect(screen.queryByTestId("catalog-item-tr-1")).not.toBeInTheDocument();
      expect(screen.queryByTestId("catalog-item-alojamiento")).not.toBeInTheDocument();
    });
  });

  it("encuentra un plato por el SKU de su artículo espejo sin ofrecer artículos de stock sueltos", async () => {
    const user = userEvent.setup();
    renderDialog({ allowedTipos: ["FA"], cashArea: "restaurant" });
    await user.click(await screen.findByTestId("btn-add-item-from-catalog"));
    await user.type(screen.getByTestId("input-catalog-search"), "justo-caf-01");
    await waitFor(() => {
      expect(screen.getByTestId("catalog-item-mi-1")).toHaveTextContent("JUSTO-CAF-01");
      expect(screen.queryByTestId("catalog-item-mi-2")).not.toBeInTheDocument();
      expect(screen.queryByTestId("catalog-item-inv-mi-1")).not.toBeInTheDocument();
    });
    await user.click(screen.getByTestId("catalog-item-mi-1"));
    expect(screen.getByTestId("item-description-0")).toHaveValue("Café Justo");
  });

  it("también aparece cuando no hay cashArea (ítems libres)", async () => {
    renderDialog({ allowedTipos: ["FA", "FB"] });
    await waitFor(() => expect(screen.getByTestId("btn-add-item-from-catalog")).toBeInTheDocument());
  });

  it("el botón de agregar ítem manual sigue funcionando igual que antes", async () => {
    const user = userEvent.setup();
    renderDialog({ allowedTipos: ["FA"], cashArea: "restaurant" });
    await waitFor(() => expect(screen.getByTestId("btn-add-item")).toBeInTheDocument());

    await user.click(screen.getByTestId("btn-add-item"));
    expect(screen.getByTestId("item-row-1")).toBeInTheDocument();
  });

  describe("Turnos vendidos — el comprobante recuerda qué tratamiento fue", () => {
    // Elegir un tratamiento del catálogo de Spa (a diferencia de alojamiento o
    // restaurant) manda su id en el comprobante, para que el servidor pueda
    // registrar la venta como pendiente de agendar.
    function buildCaptureFetchMock(capture: { body: any }) {
      return vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
        const strUrl = url.toString();
        const method = options?.method?.toUpperCase() ?? "GET";
        if (strUrl.endsWith("/api/restaurant/menu/items")) {
          return new Response(JSON.stringify(MENU_ITEMS), { status: 200 });
        }
        if (strUrl.endsWith("/api/spa/treatments")) {
          return new Response(JSON.stringify(SPA_TREATMENTS), { status: 200 });
        }
        if (strUrl.includes("/api/billing/invoices") && method === "POST") {
          capture.body = JSON.parse(String(options?.body ?? "{}"));
          return new Response(JSON.stringify({
            id: 900, tipo_comprobante: "FB", punto_venta: 1, numero: 1,
            cae: "12345678901234", estado: "emitida", monto_total: "22000.00",
          }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });
    }

    it("manda spaTreatmentId cuando el ítem viene del catálogo de Spa", async () => {
      const capture: { body: any } = { body: undefined };
      vi.stubGlobal("fetch", buildCaptureFetchMock(capture));
      vi.stubGlobal("open", vi.fn());
      const user = userEvent.setup();
      renderDialog({ allowedTipos: ["FB"], cashArea: "spa", showPaymentMethod: true });

      await user.click(await screen.findByTestId("btn-add-item-from-catalog"));
      await user.click(await screen.findByTestId("catalog-item-tr-2"));

      await user.type(screen.getByTestId("input-razon-social"), "Cliente de Prueba");
      await user.click(screen.getByTestId("btn-emitir-confirmar"));
      await user.click(screen.getByTestId("btn-confirmar-emitir"));

      await waitFor(() => expect(capture.body).toBeTruthy());
      expect(capture.body.items[0]).toMatchObject({ descripcion: "Circuito Spa", spaTreatmentId: "tr-2" });
    });

    it("un ítem manual (no elegido del catálogo) no manda spaTreatmentId", async () => {
      const capture: { body: any } = { body: undefined };
      vi.stubGlobal("fetch", buildCaptureFetchMock(capture));
      vi.stubGlobal("open", vi.fn());
      const user = userEvent.setup();
      renderDialog({ allowedTipos: ["FB"], cashArea: "spa", showPaymentMethod: true });

      await user.type(screen.getByTestId("input-razon-social"), "Cliente de Prueba");
      await user.type(screen.getByTestId("item-description-0"), "Masaje a mano alzada");
      await user.type(screen.getByTestId("item-price-0"), "10000");
      await user.click(screen.getByTestId("btn-emitir-confirmar"));
      await user.click(screen.getByTestId("btn-confirmar-emitir"));

      await waitFor(() => expect(capture.body).toBeTruthy());
      expect(capture.body.items[0].spaTreatmentId).toBeUndefined();
    });

    describe("Voucher por prestación — marcar un ítem de Spa como regalo", () => {
      it("el toggle 'Es un regalo' sólo aparece en ítems con spaTreatmentId", async () => {
        const user = userEvent.setup();
        renderDialog({ allowedTipos: ["FB"], cashArea: "spa", showPaymentMethod: true });

        // Fila manual inicial — sin spaTreatmentId, sin toggle.
        expect(screen.queryByTestId("checkbox-item-is-gift-0")).not.toBeInTheDocument();

        await user.click(await screen.findByTestId("btn-add-item-from-catalog"));
        await user.click(await screen.findByTestId("catalog-item-tr-2"));

        expect(screen.getByTestId("checkbox-item-is-gift-0")).toBeInTheDocument();
      });

      it("tildarlo pide el nombre del beneficiario y lo manda como giftBeneficiaryName", async () => {
        const capture: { body: any } = { body: undefined };
        vi.stubGlobal("fetch", buildCaptureFetchMock(capture));
        vi.stubGlobal("open", vi.fn());
        const user = userEvent.setup();
        renderDialog({ allowedTipos: ["FB"], cashArea: "spa", showPaymentMethod: true });

        await user.click(await screen.findByTestId("btn-add-item-from-catalog"));
        await user.click(await screen.findByTestId("catalog-item-tr-2"));
        await user.click(screen.getByTestId("checkbox-item-is-gift-0"));
        await user.type(screen.getByTestId("item-gift-beneficiary-0"), "María Gómez");

        await user.type(screen.getByTestId("input-razon-social"), "Cliente de Prueba");
        await user.click(screen.getByTestId("btn-emitir-confirmar"));
        await user.click(screen.getByTestId("btn-confirmar-emitir"));

        await waitFor(() => expect(capture.body).toBeTruthy());
        expect(capture.body.items[0]).toMatchObject({
          descripcion: "Circuito Spa", spaTreatmentId: "tr-2", giftBeneficiaryName: "María Gómez",
        });
      });

      it("tildarlo sin cargar el beneficiario bloquea el envío", async () => {
        const user = userEvent.setup();
        renderDialog({ allowedTipos: ["FB"], cashArea: "spa", showPaymentMethod: true });

        await user.click(await screen.findByTestId("btn-add-item-from-catalog"));
        await user.click(await screen.findByTestId("catalog-item-tr-2"));
        await user.click(screen.getByTestId("checkbox-item-is-gift-0"));

        await user.type(screen.getByTestId("input-razon-social"), "Cliente de Prueba");
        await user.click(screen.getByTestId("btn-emitir-confirmar"));

        expect(screen.queryByTestId("btn-confirmar-emitir")).not.toBeInTheDocument();
        expect(screen.getByText("Nombre del beneficiario requerido")).toBeInTheDocument();
      });

      it("un ítem de spa sin tildar 'Es un regalo' no manda giftBeneficiaryName", async () => {
        const capture: { body: any } = { body: undefined };
        vi.stubGlobal("fetch", buildCaptureFetchMock(capture));
        vi.stubGlobal("open", vi.fn());
        const user = userEvent.setup();
        renderDialog({ allowedTipos: ["FB"], cashArea: "spa", showPaymentMethod: true });

        await user.click(await screen.findByTestId("btn-add-item-from-catalog"));
        await user.click(await screen.findByTestId("catalog-item-tr-2"));

        await user.type(screen.getByTestId("input-razon-social"), "Cliente de Prueba");
        await user.click(screen.getByTestId("btn-emitir-confirmar"));
        await user.click(screen.getByTestId("btn-confirmar-emitir"));

        await waitFor(() => expect(capture.body).toBeTruthy());
        expect(capture.body.items[0].giftBeneficiaryName).toBeUndefined();
      });
    });
  });
});

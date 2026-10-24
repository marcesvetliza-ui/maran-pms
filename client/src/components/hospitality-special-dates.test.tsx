import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { HospitalitySpecialDates } from "./hospitality-special-dates";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { defaultBirthdayTemplate } from "@shared/hospitalitySpecialDates";
vi.mock("@/lib/queryClient", async (original) => ({
  ...(await original<typeof import("@/lib/queryClient")>()),
  apiRequest: vi.fn(),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
const guest = {
  id: "guest",
  firstName: "María",
  lastName: "Pérez",
  birthday: "1980-02-29",
  phone: "+5493435000000",
  email: "guest@example.invalid",
  validEmail: "guest@example.invalid",
  excluded: false,
  exclusionReason: "",
  contacts: [],
  emailAvailable: true,
};
let ready = true,
  contacts: any[] = [],
  settings = { template: defaultBirthdayTemplate, version: 0 };
const setup = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <HospitalitySpecialDates />
    </QueryClientProvider>,
  );
beforeEach(() => {
  queryClient.clear();
  ready = true;
  contacts = [];
  settings = { template: defaultBirthdayTemplate, version: 0 };
  queryClient.setQueryData(
    ["/api/hospitality/special-dates/settings"],
    settings,
  );
  vi.mocked(apiRequest)
    .mockReset()
    .mockImplementation(async (method, path, body: any) => {
      let data: any = {};
      if (method === "GET")
        data = {
          year: 2026,
          month: 2,
          guests: [{ ...guest, contacts }],
          emailReady: {
            ok: ready,
            reason: ready ? undefined : "Correo desactivado",
          },
        };
      if (path.endsWith("/preview"))
        data = {
          id: "draft",
          year: 2026,
          month: 2,
          messages: [
            {
              guestId: "guest",
              name: "Pérez María",
              recipient: guest.email,
              birthday: guest.birthday,
              subject: "Hola María",
              body: "Beneficio personalizado para María",
            },
          ],
          skipped: [],
        };
      if (path.endsWith("/confirm")) data = { queued: 1, skipped: [] };
      if (method === "PUT" && path.endsWith("/settings")) {
        settings = { template: body.template, version: 1 };
        data = settings;
      }
      return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
      });
    });
});
describe("Special dates communication workflow", () => {
  it("lists the birthday and current contacts, and changing month clears selection", async () => {
    setup();
    expect(await screen.findByText("Pérez María")).toBeInTheDocument();
    expect(screen.getByText("29/02")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Seleccionar María Pérez" }),
    );
    expect(
      screen.getByRole("button", { name: "Preparar 1 emails" }),
    ).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Mes"), { target: { value: "3" } });
    expect(
      screen.getByRole("button", { name: "Preparar 0 emails" }),
    ).toBeDisabled();
  });
  it("previews an individual email and cancellation never queues a send", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Email" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Revisar envío de cumpleaños",
    });
    expect(dialog).toHaveTextContent("guest@example.invalid");
    expect(
      vi
        .mocked(apiRequest)
        .mock.calls.some(([, path]) => path.endsWith("/confirm")),
    ).toBe(false);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Cancelar sin enviar" }),
    );
    expect(
      vi
        .mocked(apiRequest)
        .mock.calls.some(([, path]) => path.endsWith("/confirm")),
    ).toBe(false);
  });
  it("queues only after the operator confirms the preview", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Email" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Confirmar envío de 1 correos",
      }),
    );
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        "POST",
        "/api/hospitality/special-dates/drafts/draft/confirm",
      ),
    );
  });
  it("opening WhatsApp does not mark contact; explicit manual confirmation does", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    try {
      setup();
      fireEvent.click(
        await screen.findByRole("button", { name: "WhatsApp / copiar" }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Abrir WhatsApp" }));
      expect(open).toHaveBeenCalledWith(
        expect.stringContaining("https://wa.me/5493435000000?text="),
        "_blank",
        "noopener,noreferrer",
      );
      expect(
        vi
          .mocked(apiRequest)
          .mock.calls.some(([, path]) => path.endsWith("/whatsapp-contact")),
      ).toBe(false);
      fireEvent.click(
        screen.getByRole("button", { name: "Ya lo envié · marcar contactado" }),
      );
      await waitFor(() =>
        expect(apiRequest).toHaveBeenCalledWith(
          "POST",
          "/api/hospitality/special-dates/whatsapp-contact",
          expect.objectContaining({
            guestId: "guest",
            recipient: "+5493435000000",
          }),
        ),
      );
    } finally {
      open.mockRestore();
    }
  });
  it("prevents a queue confirmation when system email is disabled", async () => {
    ready = false;
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Email" }));
    expect(
      await screen.findByRole("button", {
        name: "Confirmar envío de 1 correos",
      }),
    ).toBeDisabled();
  });
  it("requires a reason to change communication preferences", async () => {
    setup();
    fireEvent.click(
      await screen.findByRole("button", { name: "Excluir de promociones" }),
    );
    expect(
      screen.getByRole("button", { name: "Guardar preferencia" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motivo"), {
      target: { value: "Pedido del huésped" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Guardar preferencia" }),
    );
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        "PUT",
        "/api/hospitality/special-dates/guests/guest/exclusion",
        { blocked: true, reason: "Pedido del huésped" },
      ),
    );
  });
  it("requires saving template edits before preparing messages", async () => {
    setup();
    await screen.findByText("Pérez María");
    fireEvent.click(
      screen.getByText(
        "Mensaje de cumpleaños · editar asunto, beneficio y condiciones",
      ),
    );
    fireEvent.change(screen.getByLabelText("Beneficio"), {
      target: { value: "Promoción de prueba" },
    });
    expect(screen.getByRole("button", { name: "Email" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar mensaje" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Email" })).toBeEnabled(),
    );
    expect(apiRequest).toHaveBeenCalledWith(
      "PUT",
      "/api/hospitality/special-dates/settings",
      expect.objectContaining({
        template: expect.objectContaining({ benefit: "Promoción de prueba" }),
      }),
    );
  });
  it("shows uncertainty without enabling a repeat email", async () => {
    contacts = [
      {
        id: "contact",
        status: "unknown",
        channel: "email",
        actorName: "Operador",
        createdAt: "2026-02-01T15:00:00Z",
        error: "No se confirmó",
      },
    ];
    vi.mocked(apiRequest).mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            guests: [{ ...guest, contacts, emailAvailable: false }],
            emailReady: { ok: true },
          }),
        ),
    );
    setup();
    expect(
      await screen.findByText(/Resultado incierto: revisar/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Email" })).toBeDisabled();
  });
});

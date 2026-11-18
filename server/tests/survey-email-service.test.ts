import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const state = vi.hoisted(() => ({
  cfg: {} as any,
  reservation: {} as any,
  guest: {} as any,
}));
vi.mock("../db", () => ({
  db: {
    select: () => ({
      from: (table: any) => ({
        where: async () => {
          const { getTableName } = await import("drizzle-orm");
          const name = getTableName(table);
          return name === "email_config"
            ? [state.cfg]
            : name === "reservations"
              ? [state.reservation]
              : name === "guests"
                ? [state.guest]
                : name === "survey_tokens"
                  ? [{ completed: false }]
                  : [{ roomNumber: "506" }];
        },
      }),
    }),
  },
}));
import { sendSurveyInvitationEmail } from "../email-service";
beforeEach(() => {
  vi.stubEnv("SITE_BASE_URL", "https://hotel.example.invalid/ignored-path");
  state.cfg = {
    globalEnabled: true,
    checkoutEnabled: true,
    provider: "resend",
    apiKey: "synthetic",
    fromName: "Hotel",
    fromEmail: "hotel@example.invalid",
    checkoutSubject: "Gracias {nombre_huesped}",
    checkoutBody: "Hola {nombre_huesped}",
    googleMapsUrl: null,
  };
  state.reservation = {
    id: "reservation",
    status: "checked_out",
    guestId: "guest",
    roomId: "room",
    checkInDate: "2026-11-17",
    checkOutDate: "2026-11-19",
  };
  state.guest = {
    firstName: "<script>Prueba</script>",
    lastName: "Huésped",
    email: "survey@example.invalid",
  };
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("Correo posestadía: transporte simulado, enlace público y texto seguro", () => {
  it("incluye el enlace aunque la plantilla guardada no tenga la variable y usa clave de idempotencia", async () => {
    const sender = vi
      .fn()
      .mockResolvedValue(
        new Response('{"id":"synthetic-id"}', { status: 200 }),
      );
    vi.stubGlobal("fetch", sender);
    expect(
      (
        await sendSurveyInvitationEmail(
          "reservation",
          "synthetic-token",
          "survey@example.invalid",
          "dispatch/1",
        )
      ).status,
    ).toBe("sent");
    const request = sender.mock.calls[0][1],
      message = JSON.parse(request.body);
    expect(request.headers["Idempotency-Key"]).toBe("dispatch/1");
    expect(message.text).toContain(
      "https://hotel.example.invalid/encuesta/synthetic-token",
    );
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;script&gt;");
    expect(message.to).toEqual(["survey@example.invalid"]);
  });
  it.each(["checked_in", "cancelled", "no_show"])(
    "no contacta al proveedor para una reserva %s",
    async (status) => {
      state.reservation.status = status;
      const sender = vi.fn();
      vi.stubGlobal("fetch", sender);
      expect(
        (
          await sendSurveyInvitationEmail(
            "reservation",
            "token",
            "survey@example.invalid",
            "key",
          )
        ).status,
      ).toBe("failed");
      expect(sender).not.toHaveBeenCalled();
    },
  );
  it("no envía con la opción posestadía apagada ni a un email que cambió", async () => {
    const sender = vi.fn();
    vi.stubGlobal("fetch", sender);
    state.cfg.checkoutEnabled = false;
    await sendSurveyInvitationEmail(
      "reservation",
      "token",
      "survey@example.invalid",
      "key",
    );
    state.cfg.checkoutEnabled = true;
    await sendSurveyInvitationEmail(
      "reservation",
      "token",
      "different@example.invalid",
      "key",
    );
    expect(sender).not.toHaveBeenCalled();
  });
});

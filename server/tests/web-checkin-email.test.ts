import { describe, expect, it, vi } from "vitest";
vi.mock("../db", () => ({ db: {}, withDatabaseTransaction: vi.fn() }));
import { publicHotelBaseUrl, webCheckinExpiry } from "../lib/webCheckinAccess";
import { withWebCheckinInvitation } from "../lib/webCheckinEmail";

describe("Web check-in email invitation", () => {
  it("adds the invitation to already saved text without replacing it", () => {
    const original = "Hola {nombre_huesped},\nTexto personalizado del hotel.";
    const rendered = withWebCheckinInvitation(original, "https://hotel.invalid/web-checkin/test");
    expect(rendered.startsWith(original)).toBe(true);
    expect(rendered.match(/\{link_webcheckin\}/g)).toHaveLength(1);
    expect(rendered).toContain("el ingreso a la habitación se realiza en recepción");
  });
  it("honors the position of the placeholder and never appends a second invitation", () => {
    const original = "Hola\nCompletá tus datos: {link_webcheckin}\nSaludos";
    expect(withWebCheckinInvitation(original, "https://hotel.invalid/checkin")).toBe(original);
  });
  it("does not ask for already submitted data", () => {
    expect(withWebCheckinInvitation("Hola", "")).toBe("Hola");
    expect(withWebCheckinInvitation("Acceso: {link_webcheckin}", "", true)).toContain("ya fue completado");
    expect(withWebCheckinInvitation("Acceso: {link_webcheckin}", "", true)).not.toContain("{link_webcheckin}");
  });
  it.each(["2027-01-01", "2028-02-29", "2026-12-31"])("keeps %s valid through the entire arrival day in Argentina", day => {
    const midnight = new Date(`${day}T00:00:00-03:00`);
    expect(webCheckinExpiry(day).getTime() - midnight.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(webCheckinExpiry(day).getUTCHours()).toBe(3);
  });
  it("uses the public configured origin without duplicate slashes", () => {
    vi.stubEnv("SITE_BASE_URL", "https://hotel.invalid/");
    try { expect(publicHotelBaseUrl("https://fallback.invalid")).toBe("https://hotel.invalid"); }
    finally { vi.unstubAllEnvs(); }
  });
});

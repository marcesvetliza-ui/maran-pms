/**
 * nodemailer (desde la v8) resuelve tanto la IPv4 como la IPv6 del host SMTP
 * y elige una AL AZAR — la vieja opción "family: 4" que se usaba en varios
 * lugares del código para forzar IPv4 no hace nada con esta versión, lo que
 * causaba ENETUNREACH de forma intermitente en entornos sin salida IPv6
 * (backups, emails de reserva, emails de prueba). createIpv4SmtpTransport
 * resuelve el host nosotros mismos y se conecta directo por esa IP.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const resolve4Mock = vi.fn();
const createTransportMock = vi.fn(() => ({ sendMail: vi.fn() }));

vi.mock("dns", () => ({
  default: { promises: { resolve4: (...args: unknown[]) => resolve4Mock(...args) } },
  promises: { resolve4: (...args: unknown[]) => resolve4Mock(...args) },
}));

vi.mock("nodemailer", () => ({
  default: { createTransport: (...args: unknown[]) => createTransportMock(...args) },
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("createIpv4SmtpTransport", () => {
  it("resuelve el host a una IPv4 y conecta por esa IP, con servername = hostname original", async () => {
    resolve4Mock.mockResolvedValue(["142.250.0.109"]);
    const { createIpv4SmtpTransport } = await import("../lib/smtpTransport");

    await createIpv4SmtpTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user: "hotel@gmail.com", pass: "xxxx" },
    } as any);

    expect(resolve4Mock).toHaveBeenCalledWith("smtp.gmail.com");
    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "142.250.0.109",
        servername: "smtp.gmail.com",
        port: 587,
      }),
    );
  });

  it("si el host ya es una IP literal, no resuelve DNS ni agrega servername", async () => {
    const { createIpv4SmtpTransport } = await import("../lib/smtpTransport");

    await createIpv4SmtpTransport({ host: "142.250.0.109", port: 587 } as any);

    expect(resolve4Mock).not.toHaveBeenCalled();
    expect(createTransportMock).toHaveBeenCalledWith(
      expect.not.objectContaining({ servername: expect.anything() }),
    );
  });

  it("si falla la resolución IPv4, sigue con el hostname original en vez de romper el envío", async () => {
    resolve4Mock.mockRejectedValue(new Error("ENOTFOUND"));
    const { createIpv4SmtpTransport } = await import("../lib/smtpTransport");

    await createIpv4SmtpTransport({ host: "smtp.ejemplo.com", port: 587 } as any);

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: "smtp.ejemplo.com" }),
    );
  });
});

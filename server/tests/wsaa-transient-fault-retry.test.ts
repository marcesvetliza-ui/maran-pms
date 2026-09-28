/**
 * Un checkout real falló con "WSAA HTTP 500 ... cms.sign.invalid: Firma
 * inválida, algoritmo no soportado" al emitir la factura. Investigado: no es
 * un bug de nuestro código de firma (SHA256 es el algoritmo correcto y
 * esperado por WSAA), sino un fault que la comunidad de desarrolladores
 * argentinos reporta como esporádico del lado de AFIP — se resuelve
 * reintentando con un TRA (ticket de acceso) nuevo. getTokenAuth ahora hace
 * ese único reintento automático antes de mostrarle el error al usuario.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalFetch = global.fetch;

vi.mock("../db", () => ({
  db: {
    select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) })),
    update: vi.fn(() => ({ set: () => ({ where: async () => undefined }) })),
  },
}));

const CERT_PEM = fs.readFileSync(
  path.join(__dirname, "fixtures", "wsaa-test-cert.pem"),
  "utf8",
);
const KEY_PEM = fs.readFileSync(
  path.join(__dirname, "fixtures", "wsaa-test-key.pem"),
  "utf8",
);

function fakeResponse(opts: { ok: boolean; status: number; body: string }) {
  return { ok: opts.ok, status: opts.status, text: async () => opts.body } as Response;
}

const FAULT_XML = (faultcode: string, faultstring: string) =>
  `<?xml version="1.0" encoding="utf-8"?><soapenv:Envelope><soapenv:Body><soapenv:Fault>` +
  `<faultcode>${faultcode}</faultcode><faultstring>${faultstring}</faultstring>` +
  `</soapenv:Fault></soapenv:Body></soapenv:Envelope>`;

const SUCCESS_XML =
  `<?xml version="1.0" encoding="utf-8"?><soapenv:Envelope><soapenv:Body>` +
  `<loginCmsResponse><loginCmsReturn>&lt;loginTicketResponse&gt;&lt;credentials&gt;` +
  `&lt;token&gt;tok-123&lt;/token&gt;&lt;sign&gt;sign-abc&lt;/sign&gt;` +
  `&lt;/credentials&gt;&lt;/loginTicketResponse&gt;</loginCmsReturn></loginCmsResponse>` +
  `</soapenv:Body></soapenv:Envelope>`;

afterEach(() => {
  global.fetch = originalFetch;
  vi.resetModules();
});

describe("getTokenAuth — reintento ante fault transitorio de WSAA", () => {
  it("reintenta una vez con TRA nuevo ante 'algoritmo no soportado' y devuelve el token del segundo intento", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(fakeResponse({ ok: false, status: 500, body: FAULT_XML("ns1:cms.sign.invalid", "Firma inválida, algoritmo no soportado") }))
      .mockResolvedValueOnce(fakeResponse({ ok: true, status: 200, body: SUCCESS_XML }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { getTokenAuth } = await import("../billing/wsaaClient");
    const result = await getTokenAuth(CERT_PEM, KEY_PEM, "homologacion");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ token: "tok-123", sign: "sign-abc" });
  });

  it("no reintenta ante un fault que no es transitorio (ej. certificado no confiable)", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(fakeResponse({ ok: false, status: 500, body: FAULT_XML("ns1:cms.cert.untrusted", "Certificado no emitido por AC de confianza") }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { getTokenAuth } = await import("../billing/wsaaClient");
    await expect(getTokenAuth(CERT_PEM, KEY_PEM, "homologacion")).rejects.toThrow(/no emitido por AC de confianza/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("si el reintento también falla, propaga el error (no reintenta más de una vez)", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(fakeResponse({ ok: false, status: 500, body: FAULT_XML("ns1:cms.sign.invalid", "algoritmo no soportado") }))
      .mockResolvedValueOnce(fakeResponse({ ok: false, status: 500, body: FAULT_XML("ns1:cms.sign.invalid", "algoritmo no soportado") }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { getTokenAuth } = await import("../billing/wsaaClient");
    await expect(getTokenAuth(CERT_PEM, KEY_PEM, "homologacion")).rejects.toThrow(/algoritmo no soportado/);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

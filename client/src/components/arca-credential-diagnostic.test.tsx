import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArcaCredentialDiagnosticPanel } from "./arca-credential-diagnostic";
import type { ArcaCredentialDiagnostic } from "@shared/arcaCredentialDiagnostic";

const state = vi.hoisted(() => ({ role: "admin" as string | null, request: vi.fn() }));
vi.mock("@/App", () => ({ useAuth: () => ({ user: state.role ? { role: state.role } : null }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: (...args: any[]) => state.request(...args) }));

const report: ArcaCredentialDiagnostic = {
  scope: "local-only", arcaContacted: false, ticketRequested: false,
  checkedAt: "2026-10-02T15:00:00Z", ok: true, environment: "ficticio",
  productionPointOfSale: 1, homologationPointOfSale: 5,
  certificate: {
    present: true, parseable: true, validity: "valid",
    validFrom: "2025-01-01T00:00:00Z", validTo: "2030-01-01T00:00:00Z",
    issuerCommonName: "Computadores Testing", suggestedEnvironment: "homologacion",
    publicKeyType: "rsa", rsaBits: 2048,
  },
  privateKey: { present: true, parseable: true }, pairMatches: true, signerCompatible: true,
  issues: [], warnings: ["La revisión no valida la autorización WSFE ni el punto de venta."],
};

function mount() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><ArcaCredentialDiagnosticPanel /></QueryClientProvider>);
}

beforeEach(() => {
  state.role = "admin";
  state.request.mockReset();
  state.request.mockResolvedValue({ json: async () => report });
});

describe("safe ARCA credential diagnostic panel", () => {
  it.each(["reception", "manager", null])("hides diagnostic for %s and makes no requests", role => {
    state.role = role;
    mount();
    expect(screen.queryByTestId("arca-credential-diagnostic")).toBeNull();
    expect(state.request).not.toHaveBeenCalled();
  });

  it("checks only on click, works in ficticio, and states that saved credentials and local results are not ARCA approval", async () => {
    mount();
    expect(state.request).not.toHaveBeenCalled();
    expect(screen.getByText(/Los archivos seleccionados sin guardar/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Comprobar certificado y clave" }));
    expect(await screen.findByText("Revisión local correcta")).toBeTruthy();
    expect(state.request).toHaveBeenCalledExactlyOnceWith("GET", "/api/billing/credential-diagnostic");
    expect(screen.getByText("Certificado y clave coinciden")).toBeTruthy();
    expect(screen.getByText(/Homologación: 5/)).toBeTruthy();
    expect(screen.getByText("ficticio")).toBeTruthy();
    expect(screen.getByText(/Este resultado no confirma/)).toBeTruthy();
  });

  it("displays a mismatched pair as an error, not a connection success", async () => {
    state.request.mockResolvedValue({ json: async () => ({
      ...report, ok: false, pairMatches: false, issues: ["El certificado y la clave privada no corresponden al mismo par."],
    }) });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Comprobar certificado y clave" }));
    expect(await screen.findByText("Certificado y clave NO coinciden")).toBeTruthy();
    expect(screen.queryByText("Revisión local correcta")).toBeNull();
  });

  it("reports errors without showing raw error details and can retry", async () => {
    state.request.mockRejectedValueOnce(new Error("SENSITIVE_EXCEPTION"));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Comprobar certificado y clave" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText(/SENSITIVE_EXCEPTION/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Comprobar certificado y clave" }));
    expect(await screen.findByText("Revisión local correcta")).toBeTruthy();
    expect(state.request).toHaveBeenCalledTimes(2);
  });

  it("disables duplicate clicks while the check is pending", async () => {
    let resolve!: (value: any) => void;
    state.request.mockReturnValue(new Promise(r => { resolve = r; }));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Comprobar certificado y clave" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Comprobando..." }) as HTMLButtonElement).disabled).toBe(true));
    resolve({ json: async () => report });
    expect(await screen.findByText("Revisión local correcta")).toBeTruthy();
  });
});
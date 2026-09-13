import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PilotEnvironmentBanner } from "./pilot-environment-banner";

function renderBanner() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <PilotEnvironmentBanner />
    </QueryClientProvider>,
  );
}

describe("PilotEnvironmentBanner", () => {
  it("no muestra nada mientras no se sabe si es piloto", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    renderBanner();
    expect(screen.queryByTestId("banner-pilot-environment")).not.toBeInTheDocument();
  });

  it("no muestra el banner cuando /api/health responde isPilot=false", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ appEnv: "production", isPilot: false })));
    renderBanner();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/health"));
    expect(screen.queryByTestId("banner-pilot-environment")).not.toBeInTheDocument();
  });

  it("muestra el banner cuando /api/health responde isPilot=true", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ appEnv: "pilot", isPilot: true })));
    renderBanner();
    const banner = await screen.findByTestId("banner-pilot-environment");
    expect(banner).toHaveTextContent(/Ambiente piloto/i);
  });

  it("no muestra el banner si la petición a /api/health falla", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));
    renderBanner();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/health"));
    expect(screen.queryByTestId("banner-pilot-environment")).not.toBeInTheDocument();
  });
});

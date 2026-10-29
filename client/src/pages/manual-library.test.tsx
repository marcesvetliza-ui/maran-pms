import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MANUAL_TOPICS } from "@shared/manual-library";
const state = vi.hoisted(() => ({ topics: [] as any[], error: null as any }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: state.topics, isLoading: false, error: state.error, refetch: vi.fn() }) }));
import ManualLibraryPage from "./manual-library";
afterEach(() => { cleanup(); state.error = null; });
describe("manual library", () => {
  it("searches accents and keywords, opens the reader and keeps download links", () => {
    state.topics = MANUAL_TOPICS.filter(t => !t.restricted);
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    render(<ManualLibraryPage />);
    expect(screen.getByText("16 temas disponibles. La búsqueda incluye títulos y palabras clave.")).toBeInTheDocument();
    expect(screen.queryByText("Técnica y contingencias")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Buscar manuales"), { target: { value: "recepcion" } });
    expect(screen.getByText("Recepción")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Buscar manuales"), { target: { value: "camaje" } });
    expect(screen.getByText("Housekeeping")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guía rápida · 3 pág." }));
    expect(screen.getByTitle("Housekeeping · Guía rápida")).toHaveAttribute("src", "/api/manuals/10-housekeeping/guia-rapida");
    expect(screen.getByRole("link", { name: "Descargar" })).toHaveAttribute("href", "/api/manuals/10-housekeeping/guia-rapida?download=1");
    fireEvent.click(screen.getByLabelText("Cerrar lector"));
    expect(screen.queryByTitle("Housekeeping · Guía rápida")).not.toBeInTheDocument();
  });
  it("shows an actionable load error", () => {
    state.topics = []; state.error = new Error("offline");
    render(<ManualLibraryPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});

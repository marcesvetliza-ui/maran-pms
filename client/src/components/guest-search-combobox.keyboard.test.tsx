import { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuestSearchCombobox } from "./guest-search-combobox";

const guests = [{ id: "fake-guest", firstName: "Prueba", lastName: "Teclado" }];
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function setup() {
  const select = vi.fn(), submit = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(guests))));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <form onSubmit={e => { e.preventDefault(); submit(); }}>
      <input aria-label="Anterior" /><GuestSearchCombobox onGuestSelect={select} />
      <input aria-label="Siguiente" />
    </form>
  </QueryClientProvider>);
  return { select, submit };
}
describe("Búsqueda de clientes: navegación sin efectos financieros", () => {
  it("seleccionar y quitar el cliente mantiene el foco en el propio control", async () => {
    function Controlled() {
      const [guest, setGuest] = useState<typeof guests[number] | null>(null);
      return <GuestSearchCombobox onGuestSelect={setGuest} selectedGuestId={guest?.id}
        selectedGuestName={guest ? `${guest.firstName} ${guest.lastName}` : undefined} onClear={() => setGuest(null)} />;
    }
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(guests))));
    const user = userEvent.setup();
    render(<QueryClientProvider client={new QueryClient()}><Controlled /></QueryClientProvider>);
    await user.type(screen.getByRole("combobox"), "Prueba");
    await screen.findByRole("listbox");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByRole("button", { name: "Quitar cliente seleccionado" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("combobox")).toHaveFocus();
  });
  it.each([false, true])("sale con TAB sin elegir ni borrar texto, inverso=%s", async backwards => {
    const user = userEvent.setup(), { select, submit } = setup();
    const input = screen.getByRole("combobox");
    await user.type(input, "Prueba");
    await screen.findByRole("option", { name: "Prueba Teclado" });
    await user.keyboard("{ArrowDown}");
    await user.tab({ shift: backwards });
    expect(screen.getByRole("textbox", { name: backwards ? "Anterior" : "Siguiente" })).toHaveFocus();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveValue("Prueba");
    expect(select).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });
  it("confirma solo con Enter tras navegar y Escape no borra la búsqueda", async () => {
    const user = userEvent.setup(), { select, submit } = setup();
    const input = screen.getByRole("combobox");
    await user.type(input, "Prueba");
    await screen.findByRole("listbox");
    await user.keyboard("{Escape}");
    expect(input).toHaveValue("Prueba");
    expect(select).not.toHaveBeenCalled();
    await user.click(screen.getByRole("textbox", { name: "Anterior" }));
    await user.click(input);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(select).toHaveBeenCalledExactlyOnceWith(guests[0]);
    expect(submit).not.toHaveBeenCalled();
  });
  it("una respuesta tardía no reabre la lista después de TAB", async () => {
    const user = userEvent.setup(); setup();
    await user.type(screen.getByRole("combobox"), "Prueba");
    await user.tab();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Siguiente" })).toHaveFocus();
  });
});

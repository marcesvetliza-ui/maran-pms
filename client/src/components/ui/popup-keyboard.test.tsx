import { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Command, CommandInput, CommandList, CommandItem } from "./command";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "./dialog";
import { Input } from "./input";
import { InlineSearch } from "../inline-search";

afterEach(async () => { cleanup(); await new Promise(resolve => setTimeout(resolve, 20)); });

function Picker({ onSelect = vi.fn(), command = true }: { onSelect?: () => void; command?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  return <><Input aria-label="Anterior" />
    <Popover open={open} onOpenChange={setOpen}><PopoverTrigger>Buscar artículo</PopoverTrigger>
      <PopoverContent>{command ? <Command><CommandInput value={query} onValueChange={setQuery} placeholder="Buscar" />
        <CommandList><CommandItem onSelect={() => { onSelect(); setOpen(false); }}>Harina</CommandItem></CommandList>
      </Command> : <><button>Mes anterior</button><button>Día 15</button></>}</PopoverContent>
    </Popover><Input aria-label="Siguiente" /></>;
}

describe("Buscadores Command dentro de Popover", () => {
  it.each([false, true])("TAB cierra y sale sin confirmar; inverso=%s", async backwards => {
    const user = userEvent.setup(), select = vi.fn();
    render(<Dialog defaultOpen><DialogContent aria-describedby={undefined}><DialogTitle>Compra</DialogTitle>
      <Picker onSelect={select} /></DialogContent></Dialog>);
    await user.click(screen.getByRole("button", { name: "Buscar artículo" }));
    await user.type(screen.getByPlaceholderText("Buscar"), "Ha");
    await user.tab({ shift: backwards });
    await waitFor(() => expect(screen.getByRole("textbox", { name: backwards ? "Anterior" : "Siguiente" })).toHaveFocus());
    expect(select).not.toHaveBeenCalled();
    // Search is owned by the form, not reset by the navigation layer.
    await user.click(screen.getByRole("button", { name: "Buscar artículo" }));
    expect(screen.getByPlaceholderText("Buscar")).toHaveValue("Ha");
  });

  it("mantiene flechas y Enter y no envía el formulario", async () => {
    const user = userEvent.setup(), select = vi.fn(), submit = vi.fn();
    render(<form onSubmit={e => { e.preventDefault(); submit(); }}><Picker onSelect={select} /></form>);
    await user.click(screen.getByRole("button", { name: "Buscar artículo" }));
    await user.keyboard("{ArrowDown}{Enter}");
    expect(select).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
  });

  it("Escape solo cierra la lista, no el formulario modal", async () => {
    const user = userEvent.setup();
    render(<Dialog defaultOpen><DialogContent aria-describedby={undefined}><DialogTitle>Compra</DialogTitle><Picker /></DialogContent></Dialog>);
    const trigger = screen.getByRole("button", { name: "Buscar artículo" });
    await user.click(trigger); await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.getByRole("heading", { name: "Compra" })).toBeInTheDocument();
  });

  it("no altera el TAB interno de calendarios u otros popovers", async () => {
    const user = userEvent.setup(); render(<Picker command={false} />);
    await user.click(screen.getByRole("button", { name: "Buscar artículo" }));
    await user.click(screen.getByRole("button", { name: "Mes anterior" }));
    await user.tab();
    expect(screen.getByRole("button", { name: "Día 15" })).toHaveFocus();
  });
});

describe("Diálogos", () => {
  it("recupera el disparador de diálogos controlados sin DialogTrigger", async () => {
    function Controlled() {
      const [open, setOpen] = useState(false);
      return <><button onClick={() => setOpen(true)}>Abrir</button><Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby={undefined}><DialogTitle>Edición</DialogTitle><Input aria-label="Dato" /></DialogContent>
      </Dialog></>;
    }
    const user = userEvent.setup(); render(<Controlled />);
    await user.click(screen.getByRole("button", { name: "Abrir" }));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByRole("button", { name: "Abrir" })).toHaveFocus());
  });

  it("recupera foco del diálogo anidado y mantiene el ciclo del padre", async () => {
    const user = userEvent.setup();
    render(<Dialog defaultOpen><DialogContent aria-describedby={undefined}><DialogTitle>Principal</DialogTitle>
      <Input aria-label="Primero" /><Dialog><DialogTrigger>Abrir hijo</DialogTrigger>
        <DialogContent aria-describedby={undefined}><DialogTitle>Hijo</DialogTitle><Input aria-label="Dentro" /></DialogContent>
      </Dialog><button>Último</button></DialogContent></Dialog>);
    await user.click(screen.getByRole("button", { name: "Abrir hijo" }));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByRole("button", { name: "Abrir hijo" })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Close" }));
    // Principal may close only after explicitly activating its close button.
    expect(screen.queryByRole("heading", { name: "Principal" })).not.toBeInTheDocument();
  });
});

describe("Buscador inline", () => {
  function Inline() {
    const [open, setOpen] = useState(true);
    const [value, setValue] = useState("Har");
    return <><Input aria-label="Previo" /><InlineSearch open={open} onOpenChange={setOpen}>
      <Input aria-label="Buscar insumo" value={value} onChange={e => setValue(e.target.value)} />
      {open && <button type="button" data-search-option onClick={() => { setValue("Harina"); setOpen(false); }}>Harina</button>}
    </InlineSearch><Input aria-label="Cantidad" /></>;
  }
  it.each([false, true])("sale conservando búsqueda sin confirmar, inverso=%s", async backwards => {
    const user = userEvent.setup(); render(<Inline />);
    await user.click(screen.getByRole("textbox", { name: "Buscar insumo" }));
    await user.tab({ shift: backwards });
    await waitFor(() => expect(screen.getByRole("textbox", { name: backwards ? "Previo" : "Cantidad" })).toHaveFocus());
    expect(screen.getByRole("textbox", { name: "Buscar insumo" })).toHaveValue("Har");
  });
  it("permite seleccionar por flechas y Enter", async () => {
    const user = userEvent.setup(); render(<Inline />);
    await user.click(screen.getByRole("textbox", { name: "Buscar insumo" }));
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByRole("textbox", { name: "Buscar insumo" })).toHaveValue("Harina");
  });
});

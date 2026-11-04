import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "./dialog";
import { Input } from "./input";

afterEach(async () => {
  cleanup();
  // Radix schedules focus-scope cleanup at the end of the event loop.
  await new Promise(resolve => setTimeout(resolve, 20));
});

function Fields({ onChange = vi.fn(), controlled = false, onSubmit = vi.fn() }: {
  onChange?: (value: string) => void; controlled?: boolean; onSubmit?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return <form onSubmit={e => { e.preventDefault(); onSubmit(); }}>
    <Input aria-label="Nombre" defaultValue="Prueba" />
    <Select defaultValue="kg" onValueChange={onChange} {...(controlled ? { open, onOpenChange: setOpen } : {})}>
      <SelectTrigger aria-label="Unidad"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="kg">Kilogramos</SelectItem><SelectItem value="g">Gramos</SelectItem></SelectContent>
    </Select>
    <Input aria-label="Deshabilitado" disabled />
    <Input aria-label="Oculto" hidden />
    <div style={{ display: "none" }}><Input aria-label="Sección cerrada" /></div>
    <Input aria-label="Costo" defaultValue="123.45" />
    <button type="submit">Guardar</button>
  </form>;
}

function Form(props: React.ComponentProps<typeof Fields>) {
  return <Dialog defaultOpen><DialogContent aria-describedby={undefined}><DialogTitle>Alta de prueba</DialogTitle>
    <Fields {...props} />
  </DialogContent></Dialog>;
}

describe("TAB en selectores de carga", () => {
  it.each([false, true])("cierra la lista y avanza sin seleccionar ni enviar, controlado=%s", async controlled => {
    const user = userEvent.setup(), change = vi.fn(), submit = vi.fn();
    render(<Form controlled={controlled} onChange={change} onSubmit={submit} />);
    await user.click(screen.getByRole("combobox", { name: "Unidad" }));
    await user.keyboard("{ArrowDown}");
    await user.tab();
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Costo" })).toHaveFocus());
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Nombre" })).toHaveValue("Prueba");
    expect(screen.getByRole("textbox", { name: "Costo" })).toHaveValue("123.45");
  });

  it("retrocede desde una lista abierta", async () => {
    const user = userEvent.setup(); render(<Form />);
    await user.click(screen.getByRole("combobox", { name: "Unidad" }));
    await user.tab({ shift: true });
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Nombre" })).toHaveFocus());
  });

  it("conserva TAB nativo cuando la lista está cerrada", async () => {
    const user = userEvent.setup(); render(<Form />);
    await user.click(screen.getByRole("textbox", { name: "Nombre" }));
    await user.tab(); expect(screen.getByRole("combobox", { name: "Unidad" })).toHaveFocus();
    await user.tab(); expect(screen.getByRole("textbox", { name: "Costo" })).toHaveFocus();
  });

  it("conserva flechas, Enter y recuperación del foco", async () => {
    const user = userEvent.setup(), change = vi.fn(); render(<Form onChange={change} />);
    const trigger = screen.getByRole("combobox", { name: "Unidad" });
    await user.click(trigger);
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(screen.getByRole("option", { name: "Gramos" })).toHaveFocus());
    await user.keyboard("{Enter}");
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(change).toHaveBeenCalledExactlyOnceWith("g");
  });

  it("Escape no confirma la opción resaltada", async () => {
    const user = userEvent.setup(), change = vi.fn(); render(<Form onChange={change} />);
    const trigger = screen.getByRole("combobox", { name: "Unidad" });
    await user.click(trigger); await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(screen.getByRole("option", { name: "Gramos" })).toHaveFocus());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(change).not.toHaveBeenCalled();
  });

  it("funciona sin diálogo y con valor controlado", async () => {
    const user = userEvent.setup();
    render(<><Input aria-label="Anterior" /><Select value="kg" onValueChange={vi.fn()}>
      <SelectTrigger aria-label="Unidad"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="kg">Kilogramos</SelectItem></SelectContent>
    </Select><Input aria-label="Siguiente" /></>);
    await user.click(screen.getByRole("combobox", { name: "Unidad" })); await user.tab();
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Siguiente" })).toHaveFocus());
  });

  it("respeta los eventos personalizados que cancelan TAB", async () => {
    const user = userEvent.setup(), key = vi.fn(e => e.key === "Tab" && e.preventDefault());
    render(<Select defaultOpen><SelectTrigger>Unidad</SelectTrigger><SelectContent onKeyDown={key}>
      <SelectItem value="kg">Kilogramos</SelectItem></SelectContent></Select>);
    await user.tab();
    expect(key).toHaveBeenCalled();
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("no intercepta atajos del navegador", async () => {
    const user = userEvent.setup(); render(<Form />);
    await user.click(screen.getByRole("combobox", { name: "Unidad" }));
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Tab", ctrlKey: true, shiftKey: true });
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("mantiene el ciclo modal y devuelve el foco al cerrar", async () => {
    const user = userEvent.setup();
    render(<Dialog><DialogTrigger>Abrir formulario</DialogTrigger>
      <DialogContent aria-describedby={undefined}><DialogTitle>Prueba</DialogTitle><Fields /></DialogContent>
    </Dialog>);
    const trigger = screen.getByRole("button", { name: "Abrir formulario" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

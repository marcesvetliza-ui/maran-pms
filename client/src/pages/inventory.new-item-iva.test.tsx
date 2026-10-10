vi.mock('@/App',()=>({useAuth:()=>({hasPermission:()=>true,permissionsReady:true})}));
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Alícuota de IVA en el alta de artículo (Inventario): se guarda en el
 * artículo (no en la categoría, que puede mezclar tasas distintas) y sirve
 * para precargar el renglón de la factura de Compras — ver
 * purchase-invoices.iva-warehouse-suggestion.test.tsx.
 */

const { NewItemForm } = await import("./inventory");

const categories = [{ id:"group-1",name:"Insumos",area:"general",isGroup:true,isActive:"true" }, { id: "cat-1", name: "Varios", area: "general", isGroup: false, parentId: "group-1", isActive: "true" }] as any;
const suppliers = [{ id: 1, razonSocial: "Proveedor Uno", razon_social: "Proveedor Uno", cuit: "20111111111", activo: true }] as any;

function renderForm(onSubmit = vi.fn()) {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <NewItemForm
        categories={categories}
        brands={[]}
        suppliers={suppliers}
        existingItems={[]}
        onSubmit={onSubmit}
        isPending={false}
        onCancel={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return onSubmit;
}

/** Completa los demás datos obligatorios del alta (subagrupamiento, proveedor, stock crítico) sin tocar la alícuota. */
async function fillOtherRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("select-category"));
  await user.click(await screen.findByRole("option", { name: "Varios" }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Proveedor Uno/ }));
  await user.clear(screen.getByTestId("input-min-stock"));
  await user.type(screen.getByTestId("input-min-stock"), "2");
  await user.type(screen.getByTestId("input-critical-stock"), "1");
}

describe("NewItemForm — alícuota de IVA", () => {
  it("arranca en 21% por defecto (un artículo nuevo no puede quedar sin alícuota)", () => {
    renderForm();
    expect(screen.getByTestId("select-item-iva")).toHaveTextContent("21%");
  });

  it("bloquea Guardar si se elige explícitamente \"Sin definir\"", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();
    await user.type(screen.getByTestId("input-item-name"), "Artículo Genérico");
    await fillOtherRequiredFields(user);

    await user.click(screen.getByTestId("select-item-iva"));
    await user.click(await screen.findByRole("option", { name: "— Sin definir —" }));

    expect(screen.getByTestId("button-save-item")).toBeDisabled();
    expect(screen.getByTestId("text-missing-required-fields")).toHaveTextContent("Alícuota de IVA");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("guarda la alícuota por defecto si no se toca el selector", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();
    await user.type(screen.getByTestId("input-item-name"), "Artículo Genérico");
    await fillOtherRequiredFields(user);

    await user.click(screen.getByTestId("button-save-item"));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ ivaRate: "21" }));
  });

  it("guarda la alícuota elegida", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();
    await user.type(screen.getByTestId("input-item-name"), "Aceite de Oliva");
    await fillOtherRequiredFields(user);

    await user.click(screen.getByTestId("select-item-iva"));
    await user.click(await screen.findByRole("option", { name: "10,5%" }));

    await user.click(screen.getByTestId("button-save-item"));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ ivaRate: "10.5" }));
  });
});

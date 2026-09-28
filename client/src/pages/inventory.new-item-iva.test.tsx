import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

/**
 * Alícuota de IVA en el alta de artículo (Inventario): se guarda en el
 * artículo (no en la categoría, que puede mezclar tasas distintas) y sirve
 * para precargar el renglón de la factura de Compras — ver
 * purchase-invoices.iva-warehouse-suggestion.test.tsx.
 */

const { NewItemForm } = await import("./inventory");

function renderForm(onSubmit = vi.fn()) {
  render(
    <NewItemForm
      categories={[]}
      suppliers={[]}
      existingItems={[]}
      onSubmit={onSubmit}
      isPending={false}
      onCancel={vi.fn()}
    />,
  );
  return onSubmit;
}

describe("NewItemForm — alícuota de IVA", () => {
  it("arranca sin alícuota definida", () => {
    renderForm();
    expect(screen.getByTestId("select-item-iva")).toHaveTextContent("Sin definir");
  });

  it("guarda null si no se elige alícuota", async () => {
    const onSubmit = renderForm();
    await userEvent.type(screen.getByTestId("input-item-name"), "Artículo Genérico");
    await userEvent.click(screen.getByTestId("button-save-item"));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ ivaRate: null }));
  });

  it("guarda la alícuota elegida", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();
    await user.type(screen.getByTestId("input-item-name"), "Aceite de Oliva");

    await user.click(screen.getByTestId("select-item-iva"));
    await user.click(await screen.findByRole("option", { name: "10,5%" }));

    await user.click(screen.getByTestId("button-save-item"));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ ivaRate: "10.5" }));
  });
});

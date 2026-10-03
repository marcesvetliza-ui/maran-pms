import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LostFoundItem } from "@shared/schema";
import { DeliveryDialog } from "./lost-found-delivery-dialog";

const item = {
  id: "lost-1",
  description: "Bufanda azul",
  codigo: "LF-104",
  category: "ropa",
  location: "Lobby",
  foundDate: "2025-03-01",
  foundBy: "Recepción",
  status: "contactado",
  claimedBy: "María López",
  claimedDate: "2025-03-03",
  deliveryType: null,
  deliveredBy: null,
  notes: null,
  shippingDetails: null,
  storageLocation: null,
  guestId: null,
  reservationId: null,
  createdAt: null,
  updatedAt: null,
} as unknown as LostFoundItem;

function renderDialog(currentItem: LostFoundItem, onConfirm = vi.fn()) {
  const result = render(
    <DeliveryDialog item={currentItem} open onOpenChange={vi.fn()} onConfirm={onConfirm} isPending={false} />,
  );
  return { ...result, onConfirm };
}

async function choose(user: ReturnType<typeof userEvent.setup>, testId: string, option: string) {
  await user.click(screen.getByTestId(testId));
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("Lost & Found delivery dialog", () => {
  it("submits unpaid shipping using the recipient without requiring a duplicate pickup name", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog({ ...item, claimedBy: null });
    await choose(user, "select-delivery-type", "Envío");
    for (const [testId, value] of [
      ["input-shipping-full-name", "Destinatario de prueba"],
      ["input-shipping-address", "Calle de prueba 1"],
      ["input-shipping-province", "Córdoba"],
      ["input-shipping-postal-code", "X5000"],
      ["input-shipping-city", "Córdoba"],
    ]) {
      await user.type(screen.getByTestId(testId), value);
    }
    await user.click(screen.getByTestId("button-delivery-confirm"));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      claimedBy: "Destinatario de prueba",
      shippingDetails: expect.objectContaining({ paymentStatus: "no_pagado", postalCode: "X5000" }),
    }));
  });

  it("resets unsaved delivery details when reopening for another object", async () => {
    const user = userEvent.setup();
    const { rerender, onConfirm } = renderDialog(item);
    await choose(user, "select-delivery-type", "Envío");
    await user.type(screen.getByTestId("input-shipping-address"), "No conservar");
    rerender(<DeliveryDialog item={item} open={false} onOpenChange={vi.fn()} onConfirm={onConfirm} isPending={false} />);
    rerender(<DeliveryDialog item={{ ...item, id: "otro", claimedBy: "Otra persona" }} open onOpenChange={vi.fn()} onConfirm={onConfirm} isPending={false} />);
    expect(screen.getByTestId("input-delivery-claimed-by")).toHaveValue("Otra persona");
    expect(screen.queryByTestId("shipping-fields")).not.toBeInTheDocument();
    await choose(user, "select-delivery-type", "Envío");
    expect(screen.getByTestId("input-shipping-address")).toHaveValue("");
    expect(screen.getByTestId("input-shipping-full-name")).toHaveValue("Otra persona");
  });

  it("shows conditional shipping fields, validates required values, and submits paid international shipping with string CP", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderDialog(item, onConfirm);

    expect(screen.queryByTestId("shipping-fields")).not.toBeInTheDocument();
    await choose(user, "select-delivery-type", "Envío");
    expect(screen.getByTestId("shipping-fields")).toBeInTheDocument();
    const confirm = screen.getByTestId("button-delivery-confirm");
    expect(confirm).toBeDisabled();

    await user.type(screen.getByTestId("input-shipping-address"), "12 Rue des Écoles");
    await user.type(screen.getByTestId("input-shipping-province"), "Île-de-France");
    await user.type(screen.getByTestId("input-shipping-postal-code"), "00501");
    await user.type(screen.getByTestId("input-shipping-city"), "Paris");
    await user.clear(screen.getByTestId("input-shipping-country"));
    await user.type(screen.getByTestId("input-shipping-country"), "France");
    await choose(user, "select-shipping-payment", "Pagado");
    expect(confirm).toBeEnabled();

    await user.click(confirm);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      status: "entregado",
      deliveryType: "envio",
      shippingDetails: {
        fullName: "María López",
        address: "12 Rue des Écoles",
        province: "Île-de-France",
        postalCode: "00501",
        city: "Paris",
        country: "France",
        paymentStatus: "pagado",
      },
    })));
    expect(typeof onConfirm.mock.calls[0][0].shippingDetails.postalCode).toBe("string");
  });

  it("defaults payment to unpaid and sends null shipping details after switching to hotel pickup", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderDialog(item, onConfirm);

    await choose(user, "select-delivery-type", "Envío");
    expect(screen.getByTestId("select-shipping-payment")).toHaveTextContent("No pagado");
    await user.type(screen.getByTestId("input-shipping-full-name"), "María López");
    await user.type(screen.getByTestId("input-shipping-address"), "Av. Santa Fe 100");
    await user.type(screen.getByTestId("input-shipping-province"), "Buenos Aires");
    await user.type(screen.getByTestId("input-shipping-postal-code"), "C1000");
    await user.type(screen.getByTestId("input-shipping-city"), "Buenos Aires");

    await choose(user, "select-delivery-type", "Retiro en hotel");
    expect(screen.queryByTestId("shipping-fields")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("button-delivery-confirm"));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      deliveryType: "retiro_hotel",
      shippingDetails: null,
    })));
  });

  it("prefills delivered shipping records on reopening and keeps recipient editable separately", async () => {
    const deliveredItem = {
      ...item,
      status: "entregado",
      deliveryType: "envio",
      claimedBy: "Persona que recibió",
      shippingDetails: {
        fullName: "Destinatario distinto",
        address: "Calle 9",
        province: "Mendoza",
        postalCode: "00550",
        city: "Mendoza",
        country: "Argentina",
        paymentStatus: "no_pagado",
      },
    } as unknown as LostFoundItem;
    renderDialog(deliveredItem);

    await waitFor(() => {
      expect(screen.getByTestId("input-delivery-claimed-by")).toHaveValue("Persona que recibió");
      expect(screen.getByTestId("input-shipping-full-name")).toHaveValue("Destinatario distinto");
      expect(screen.getByTestId("input-shipping-postal-code")).toHaveValue("00550");
    });
    expect(screen.getByTestId("button-delivery-confirm")).toHaveTextContent("Guardar cambios");
  });
});
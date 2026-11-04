import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RestaurantMoveDestination } from "./restaurant-move-destination";

describe("Comanda destino al dividir una mesa", () => {
  it("offers a new comanda and explains the empty list when the source is the only active order", () => {
    const onChange = vi.fn();
    render(<RestaurantMoveDestination orders={[{id:"source",status:"open",orderNumber:"ORD-1"}]} sourceId="source" value="" onChange={onChange} />);
    expect(screen.getByText(/No hay otras comandas activas/)).toBeVisible();
    expect(screen.queryByRole("option", {name:"ORD-1"})).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", {name:"Comanda destino"}), {target:{value:"new"}});
    expect(onChange).toHaveBeenCalledWith("new");
  });
  it("lets the user select open, preparing and served destinations without showing closed or cancelled orders", () => {
    const onChange = vi.fn();
    render(<RestaurantMoveDestination orders={[
      {id:"open",status:"open",orderNumber:"Abierta"},
      {id:"prep",status:"in_progress",orderNumber:"Preparación",table:{tableNumber:"5"}},
      {id:"served",status:"served",orderNumber:"Servida"},
      {id:"closed",status:"closed",orderNumber:"Cerrada"},
      {id:"cancelled",status:"cancelled",orderNumber:"Anulada"},
    ]} value="" onChange={onChange} />);
    expect(screen.getByRole("option", {name:"Abierta"})).toBeInTheDocument();
    expect(screen.getByRole("option", {name:"Preparación — Mesa 5"})).toBeInTheDocument();
    expect(screen.getByRole("option", {name:"Servida"})).toBeInTheDocument();
    expect(screen.queryByRole("option", {name:"Cerrada"})).not.toBeInTheDocument();
    expect(screen.queryByRole("option", {name:"Anulada"})).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), {target:{value:"prep"}});
    expect(onChange).toHaveBeenCalledWith("prep");
  });
});

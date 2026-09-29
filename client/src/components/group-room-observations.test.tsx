import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GroupRoomObservations } from "./group-room-observations";

describe("observaciones de habitaciones grupales", () => {
  it("muestra la nota del grupo sin sustituir la nota propia de la habitación", () => {
    const { rerender } = render(
      <GroupRoomObservations groupNotes="Llegan en combi" roomNotes="Cama extra" />,
    );
    expect(screen.getByTestId("group-room-observations-group")).toHaveTextContent("Grupo: Llegan en combi");
    expect(screen.getByTestId("group-room-observations-room")).toHaveTextContent("Habitación: Cama extra");

    rerender(<GroupRoomObservations groupNotes="Llegan a las 18 hs" roomNotes="Cama extra" />);
    expect(screen.getByTestId("group-room-observations-group")).toHaveTextContent("Grupo: Llegan a las 18 hs");
    expect(screen.getByTestId("group-room-observations-room")).toHaveTextContent("Habitación: Cama extra");
  });

  it("también muestra la nota grupal en una habitación sin observaciones propias", () => {
    render(<GroupRoomObservations groupNotes="Desayuno temprano" roomNotes={null} />);
    expect(screen.getByTestId("group-room-observations-group")).toHaveTextContent("Desayuno temprano");
    expect(screen.queryByTestId("group-room-observations-room")).not.toBeInTheDocument();
  });
});
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GroupRoomObservations } from "./group-room-observations";

describe("observaciones de habitaciones grupales", () => {
  it("muestra la nota del grupo sin sustituir la nota propia de la habitación", () => {
    const { rerender } = render(
      <GroupRoomObservations groupNotes="Llegan en combi" roomNotes="Cama extra" />,
    );
    expect(screen.getByTestId("group-room-observations-group")).toHaveTextContent(/^Llegan en combi$/);
    expect(screen.getByTestId("group-room-observations-room")).toHaveTextContent("Habitación: Cama extra");

    rerender(<GroupRoomObservations groupNotes="Llegan a las 18 hs" roomNotes="Cama extra" />);
    expect(screen.getByTestId("group-room-observations-group")).toHaveTextContent(/^Llegan a las 18 hs$/);
    expect(screen.getByTestId("group-room-observations-room")).toHaveTextContent("Habitación: Cama extra");
  });

  it("también muestra la nota grupal en una habitación sin observaciones propias", () => {
    render(<GroupRoomObservations groupNotes="Desayuno temprano" roomNotes={null} />);
    expect(screen.getByTestId("group-room-observations-group")).toHaveTextContent("Desayuno temprano");
    expect(screen.queryByTestId("group-room-observations-room")).not.toBeInTheDocument();
  });
  it("shows the current commercial agreement independently of editable notes", () => {
    const {rerender}=render(<GroupRoomObservations groupMasterFolioConfig="accommodation" groupNotes="Llegan en combi" roomNotes="Cama extra"/>);
    expect(screen.getByTestId('group-commercial-agreement')).toHaveTextContent('El organizador paga alojamiento; cada huésped paga sus consumos.');
    rerender(<GroupRoomObservations groupMasterFolioConfig="none" groupNotes="Llegan en combi" roomNotes="Cama extra"/>);
    expect(screen.getByTestId('group-commercial-agreement')).toHaveTextContent('Cada huésped paga su alojamiento y sus consumos.');
    expect(screen.getByTestId('group-room-observations-group')).toHaveTextContent(/^Llegan en combi$/);
    expect(screen.getByTestId('group-room-observations-room')).toHaveTextContent('Habitación: Cama extra');
  });

});
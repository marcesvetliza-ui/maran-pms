import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { AccountMovementReference } from "./account-movement-reference";
const base = { reservationId: "stay-a", reservationCode: null, guestName: null, reference: "credit-operation:e5f0f631-56bd-407f-874b-64294111931d" };
afterEach(cleanup);

it("identifica el anticipo por huésped y estadía, con la referencia técnica solo como ayuda", () => {
  const { container } = render(<AccountMovementReference movement={{ ...base, reservationDisplay: { guestName: "Pérez, Ana", checkInDate: "2026-11-20", checkOutDate: "2026-11-22" } }} />);
  expect(screen.getByText("Pérez, Ana")).toBeInTheDocument();
  expect(screen.getByText("Estadía: 20/11/2026 → 22/11/2026")).toBeInTheDocument();
  expect(container.textContent).not.toContain("credit-operation"); expect(container.firstElementChild).toHaveAttribute("title", base.reference);
});
it("usa los datos vinculados actuales antes que el nombre histórico del movimiento", () => {
  render(<AccountMovementReference movement={{ ...base, reservationCode: "RES-1788973054690-614", guestName: "Nombre anterior", reservationDisplay: { guestName: "Gómez, Bruno", checkInDate: "2026-12-02", checkOutDate: "2026-12-05" } }} />);
  expect(screen.getByText("Gómez, Bruno")).toBeInTheDocument(); expect(screen.queryByText("Nombre anterior")).not.toBeInTheDocument();
  expect(screen.queryByText("RES-1788973054690-614")).not.toBeInTheDocument();
});
it("conserva las referencias documentales de movimientos sin reserva", () => {
  render(<AccountMovementReference movement={{ ...base, reservationId: null, reference: "FA-0005-00001234" }} />);
  expect(screen.getByText("FA-0005-00001234")).toBeInTheDocument();
});
it("no inventa una reserva a partir de un identificador interno sin datos", () => {
  const { container } = render(<AccountMovementReference movement={{ ...base, reservationId: null }} />);
  expect(screen.getByText("Sin reserva vinculada")).toBeInTheDocument(); expect(container.textContent).not.toContain("credit-operation");
});
it("conserva el nombre histórico cuando falta el perfil y muestra una sola fecha en estadías del día", () => {
  render(<AccountMovementReference movement={{ ...base, guestName: "Pérez, Ana", reservationDisplay: { guestName: null, checkInDate: "2026-11-20", checkOutDate: "2026-11-20" } }} />);
  expect(screen.getByText("Pérez, Ana")).toBeInTheDocument(); expect(screen.getByText("Estadía: 20/11/2026")).toBeInTheDocument();
});

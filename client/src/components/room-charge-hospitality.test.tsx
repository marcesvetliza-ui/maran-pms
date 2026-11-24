import { useState } from "react";
import {
  render,
  screen,
  renderHook,
  act,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { it, expect, vi } from "vitest";
import {
  RoomChargeInclusionEditor,
  RoomChargeHospitalityPreview,
  useRoomChargeHospitality,
  roomChargeHospitalityFields,
} from "./room-charge-hospitality";
import type { InclusionRule } from "@shared/hospitalityInclusions";
const rule: InclusionRule = {
  id: "2c4cd1fe-a784-48f4-bb90-ee4a55c7da95",
  area: "restaurant",
  service: "Cena de media pensión",
  quantity: 1,
  basis: "stay",
  conditions: "Sin bebidas",
  readyWhen: "arrival",
};
it("permite configurar el aviso por unidad y quitarlo sin guardar otra venta", async () => {
  const changed = vi.fn();
  function Editor() {
    const [rules, setRules] = useState<InclusionRule[]>([]);
    return (
      <RoomChargeInclusionEditor
        value={rules}
        onChange={(value) => {
          changed(value);
          setRules(value);
        }}
      />
    );
  }
  render(<Editor />);
  const user = userEvent.setup();
  expect(screen.queryByLabelText("Servicio 1")).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Genera aviso en Hospitalidad" }),
  );
  await user.type(
    screen.getByLabelText("Servicio 1", { exact: true }),
    "Cena de media pensión",
  );
  expect(
    screen.getByLabelText("Cálculo 1", { exact: true }),
  ).toHaveDisplayValue("Por unidad del cargo");
  expect(changed.mock.calls.at(-1)?.[0][0]).toMatchObject({
    area: "restaurant",
    service: "Cena de media pensión",
    basis: "stay",
    quantity: 1,
  });
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Genera aviso en Hospitalidad" }),
  );
  expect(changed.mock.calls.at(-1)?.[0]).toEqual([]);
});
it("muestra exactamente las prestaciones que habilita la cantidad elegida", () => {
  render(
    <RoomChargeHospitalityPreview
      preset={{ id: "pension", hospitalityRules: [rule] }}
      quantity={4}
    />,
  );
  expect(screen.getByTestId("charge-hospitality-preview")).toHaveTextContent(
    "Restaurant · Cena de media pensión: 4",
  );
});
it("reutiliza el intento al reintentar y genera otro para una venta nueva confirmada", () => {
  const { result } = renderHook(() => useRoomChargeHospitality());
  const body = {
      reservationId: "stay",
      description: "Media pensión",
      amount: "40.00",
      category: "restaurant",
      date: "2026-11-24",
    },
    preset = { id: "pension", hospitalityRules: [rule] };
  const first = result.current.payload(body, preset, 4);
  expect(result.current.payload(body, preset, 4)).toEqual(first);
  expect(first).toMatchObject({
    chargeTypeId: "pension",
    quantity: 4,
    hospitalityExpectedRules: [rule],
  });
  act(() => result.current.reset());
  expect(result.current.payload(body, preset, 4).hospitalityRequestId).not.toBe(
    first.hospitalityRequestId,
  );
});
it("un cargo sin aviso conserva el cuerpo habitual y no interpreta su nombre", () => {
  const body = { description: "Media pensión", amount: "40.00" };
  expect(
    roomChargeHospitalityFields(
      { id: "ordinary", hospitalityRules: [] },
      4,
      "attempt",
    ),
  ).toEqual({});
  const { result } = renderHook(() => useRoomChargeHospitality());
  expect(
    result.current.payload(body, { id: "ordinary", hospitalityRules: [] }, 4),
  ).toEqual(body);
});

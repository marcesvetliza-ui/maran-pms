import { beforeEach, expect, it, vi } from "vitest";
const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("../db", () => ({ db: { execute } }));
import { guardGroupGuestReplacement, withReviewedGroupGuestReplacement } from "../groupGuestReplacement";
const reservation = { id: "reservation", guestId: "old", status: "checked_in" };
beforeEach(() => { execute.mockReset(); });
it("dirige el cambio de titular de un grupo en casa a su corrección auditada", async () => {
  execute.mockResolvedValue({ rows: [{ group_id: "group", codigo: "REAL" }] });
  await expect(guardGroupGuestReplacement(reservation, "new")).rejects.toMatchObject({ statusCode: 409, response: { code: "GROUP_INHOUSE_HOLDER_CORRECTION_REQUIRED", error: expect.stringContaining("Cambiar titular") } });
});
it("el permiso de reemplazo previo al ingreso no evita la corrección de una estadía en casa", async () => {
  execute.mockResolvedValue({ rows: [{ group_id: "group", codigo: "REAL" }] });
  await expect(withReviewedGroupGuestReplacement(reservation.id, () => guardGroupGuestReplacement(reservation, "new"))).rejects.toMatchObject({ response: { code: "GROUP_INHOUSE_HOLDER_CORRECTION_REQUIRED" } });
});
it("guardar el mismo titular no modifica la identidad ni exige una corrección", async () => {
  await guardGroupGuestReplacement(reservation, "old"); expect(execute).not.toHaveBeenCalled();
});
it("conserva el comportamiento de las reservas individuales", async () => {
  execute.mockResolvedValue({ rows: [] });
  await expect(guardGroupGuestReplacement(reservation, "new")).resolves.toBeUndefined();
});
it("conserva el reemplazo previo al ingreso con revisión expresa", async () => {
  execute.mockResolvedValue({ rows: [{ group_id: "group", codigo: "REAL" }] });
  await expect(withReviewedGroupGuestReplacement(reservation.id, () => guardGroupGuestReplacement({ ...reservation, status: "confirmed" }, "new"))).resolves.toBeUndefined();
});
it("conserva el control de anticipos personales al asignar un cupo", async () => {
  execute.mockResolvedValueOnce({ rows: [{ group_id: "group", codigo: "GROUP-group" }] }).mockResolvedValueOnce({ rows: [{ id: "advance" }] });
  await expect(guardGroupGuestReplacement({ ...reservation, status: "confirmed" }, "new")).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining("anticipo personal") });
});

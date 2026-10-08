import { describe, it, expect, vi, afterEach } from "vitest";
import { apiRequestWithGroupInventoryWarning } from "./queryClient";
import { confirmHousekeepingMove } from "./confirm-housekeeping-move";
vi.mock("./confirm-housekeeping-move", () => ({
  confirmHousekeepingMove: vi.fn(),
}));
afterEach(() => vi.unstubAllGlobals());
describe("confirmación de preparación especial", () => {
  it("cancelar no vuelve a enviar ni modifica la reserva", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            code: "HOUSEKEEPING_PREPARATION_WARNING",
            canOverride: true,
            error: "Cuna preparada",
            preparationVersion: "v1",
          }),
          { status: 409 },
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    vi.mocked(confirmHousekeepingMove).mockResolvedValue(false);
    await expect(
      apiRequestWithGroupInventoryWarning("PATCH", "/api/reservations/1", {
        roomId: "2",
      }),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("conserva la confirmación de Housekeeping al confirmar también una advertencia de grupo", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: "HOUSEKEEPING_PREPARATION_WARNING",
            canOverride: true,
            error: "Cuna preparada",
            preparationVersion: "v1",
          }),
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: "GROUP_BLOCK_WARNING", canOverride: true }),
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    vi.mocked(confirmHousekeepingMove).mockResolvedValue(true);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    expect(
      (
        await apiRequestWithGroupInventoryWarning(
          "PATCH",
          "/api/reservations/1",
          { roomId: "2" },
        )
      ).status,
    ).toBe(200);
    const payload = JSON.parse(fetcher.mock.calls[2][1].body);
    expect(payload).toMatchObject({
      roomId: "2",
      acknowledgeHousekeepingPreparation: "v1",
      overrideTentativeGroupWarning: true,
    });
  });
});

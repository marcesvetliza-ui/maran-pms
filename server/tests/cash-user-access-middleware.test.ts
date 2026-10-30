import { describe, expect, it, vi } from "vitest";
import { cashShiftAccess, requireCashView } from "../cash-user-access";

async function check(username: string, method: string, path: string, body = {}, storedArea: string | null = "spa") {
  const req = { user: { username }, method, path, body } as any;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
  const next = vi.fn();
  const loadArea = vi.fn().mockResolvedValue(storedArea ?? undefined);
  await cashShiftAccess(loadArea)(req, res, next);
  return { res, next, loadArea };
}
describe("cash authorization at API boundary", () => {
  it("does not trust supplied operator identity", async () => {
    const { res, next } = await check("new-admin", "POST", "/shifts/open", { area: "reception", openedBy: "admin" });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
  it.each([["POST", "close"], ["PATCH", "tomar"]])("checks stored area on %s %s, not spoofed body", async (method, action) => {
    const { res, next, loadArea } = await check("recepcion1", method, `/shifts/shift-123/${action}`, { area: "reception", operador: "admin" });
    expect(loadArea).toHaveBeenCalledWith("shift-123");
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
  it("allows reception aliases and the approved Events staff exception", async () => {
    for (const [username, area] of [["recepcion1", "recepcion"], ["martin.gimenez", "restaurant"]]) {
      const { next } = await check(username, "POST", "/shifts/open", { area });
      expect(next).toHaveBeenCalledWith();
    }
  });
  it("also guards Express case-insensitive and trailing-slash route variants", async () => {
    expect((await check("other", "POST", "/SHIFTS/OPEN/", { area: "spa" })).res.status).toHaveBeenCalledWith(403);
    expect((await check("recepcion1", "PATCH", "/SHIFTS/shift-123/TOMAR/")).res.status).toHaveBeenCalledWith(403);
    expect((await check("other", "POST", "/INIT-SHIFTS/")).res.status).toHaveBeenCalledWith(403);
  });
  it("does not allow initializer bypass", async () => {
    expect((await check("spa1", "POST", "/init-shifts")).res.status).toHaveBeenCalledWith(403);
    expect((await check("admin", "POST", "/init-shifts")).next).toHaveBeenCalledWith();
  });
  it("permits read-only requests and rejects missing shifts", async () => {
    expect((await check("other", "GET", "/shifts")).next).toHaveBeenCalledWith();
    expect((await check("admin", "POST", "/shifts/missing/close", {}, null)).res.status).toHaveBeenCalledWith(404);
  });
  it("blocks excluded actors from cash reads, even with an admin role", () => {
    const next = vi.fn();
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    requireCashView({ user: { username: "Jose Pablo Mant", role: "admin" } } as any, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

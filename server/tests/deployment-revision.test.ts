import { describe, it, expect, vi } from "vitest";
import { waitForRevision } from "../../scripts/wait-for-revision.js";
const revision = "a".repeat(40);
describe("Verificación del despliegue exacto", () => {
  it("no acepta una versión anterior aunque esté sana", async () => {
    const fetcher = vi.fn(async () => Response.json({ status: "ok", database: "ok", revision: "b".repeat(40) }));
    await expect(waitForRevision("https://example.test", revision, { fetcher, pause: async () => {}, attempts: 2 })).rejects.toThrow("versión sana");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("espera la revisión correcta con migraciones completas", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ status: "ok", database: "ok", revision, financialReady: false }))
      .mockResolvedValueOnce(Response.json({ status: "ok", database: "ok", revision, financialReady: true }));
    expect(await waitForRevision("https://example.test", revision, { fetcher, pause: async () => {}, attempts: 2 })).toMatchObject({ revision, financialReady: true });
  });
});

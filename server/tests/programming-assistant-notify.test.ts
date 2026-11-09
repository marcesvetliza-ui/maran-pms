import { it, expect, vi } from "vitest";
import { notifyReady } from "../../services/programming-assistant/notify";
it("sends only a generic opt-in notification with no diagnosis content", async () => {
  const send = vi.fn(async () => new Response("{}", { status: 200 }));
  await notifyReady(
    {
      apiKey: "mock-key",
      from: "sender@example.test",
      to: "owner@example.test",
    },
    "11111111-1111-1111-1111-111111111111",
    send as typeof fetch,
  );
  const body = JSON.parse(
    (send.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
  );
  expect(body.text).toContain("demo.maranpms.com.ar/programming-support");
  expect(Object.keys(body).sort()).toEqual(["from", "subject", "text", "to"]);
});
it('includes the bounded problem, cause and proposal only when explicitly requested',async()=>{
 const send=vi.fn(async()=>new Response('{}',{status:200}));
 const report={summary:'Corrección: Problema de mensaje',cause:'Se oculta el error',proposal:'Mostrar el detalle',certainty:'sustentado_en_codigo',dataRepair:':null',proposedTests:[],questions:[],limitations:[],evidence:[]} as any;
 await notifyReady({apiKey:'mock-key',from:'sender@example.test',to:'owner@example.test',includeSummary:true},'11111111-1111-1111-1111-111111111111',send as typeof fetch,'report-test',report);
 const body=JSON.parse((send.mock.calls[0] as unknown as [string,RequestInit])[1].body as string);
 expect(body.subject).toContain('Xenia');expect(body.text).toContain('Problema: Problema de mensaje');expect(body.text).toContain('Causa: Se oculta el error');expect(body.text).toContain('Propuesta: Mostrar el detalle');expect(body.text).toContain('No se aplicaron cambios');expect(body.text).not.toContain(':null');
});

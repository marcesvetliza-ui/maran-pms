import { randomUUID } from "node:crypto";
import pg from "pg";
import { describe, it, expect,vi } from "vitest";
import { createService } from "../../services/programming-assistant/service";
import type {SupportDiagnosis} from "../../shared/programming-support";

(process.env.DATABASE_URL ? describe : describe.skip)(
  "persistent assistant service",
  () => {
    it.each([2,10,20])("authenticates, isolates owners, keeps retries idempotent and enforces daily budget %i", async (dailyLimit) => {
      const url = new URL(process.env.DATABASE_URL!);
      const schema = "assistant_test_" + randomUUID().replaceAll("-", "");
      const admin = new pg.Client({
        connectionString: process.env.DATABASE_URL,
      });
      await admin.connect();
      await admin.query(`CREATE SCHEMA "${schema}"`);
      url.searchParams.set("options", `-c search_path=${schema}`);
      const secret = "synthetic-secret-".repeat(3);
      const version = "a".repeat(40);
      const report: SupportDiagnosis = {
        summary: "Diagnóstico de prueba",
        certainty: "hipotesis" as const,
        cause: "Simulación",
        proposal: "Revisar",
        proposedTests: [],
        questions: ["¿Querés revisar otro circuito?"],
        dataRepair: "",
        limitations: [],
        evidence: [],
      };
      const service = await createService(
        {
          databaseUrl: url.toString(),
          secret,
          version,
          sourceRoot: process.cwd(),
          apiKey: "mock-only",
          model: "mock",
          dailyLimit,
        },
        async () => ({
          report,
          tokens: 0,
          calls: 0,
          readFiles: [],
          searches: [],
        }),
      );
      const server = service.app.listen(0, "127.0.0.1");
      await new Promise<void>((resolve) => server.on("listening", resolve));
      const base = `http://127.0.0.1:${(server.address() as any).port}`;
      async function request(
        endpoint: string,
        body?: unknown,
        owner = "owner1",
        overrideVersion = version,
      ) {
        return fetch(base + endpoint, {
          method: body ? "POST" : "GET",
          headers: {
            Authorization: `Bearer ${secret}`,
            "Content-Type": "application/json",
            "X-Support-User": owner,
            "X-Support-Version": overrideVersion,
          },
          body: body ? JSON.stringify(body) : undefined,
        });
      }
      try {
        expect((await fetch(base + "/cases")).status).toBe(401);
        const body = {
          requestId: randomUUID(),
          title: "Consulta de prueba",
          module: "inventario",
          actual: "El stock parece incorrecto",
          expected: "Mostrar el saldo correcto",
        };
        const ticket = await (await request("/cases", body)).json();
        const duplicate = await (await request("/cases", body)).json();
        expect(duplicate.id).toBe(ticket.id);
        expect(
          await (await request("/cases", undefined, "owner2")).json(),
        ).toEqual([]);
        expect(
          (
            await request(
              `/cases/${ticket.id}/analyze`,
              { requestId: randomUUID() },
              "owner2",
            )
          ).status,
        ).toBe(404);
        expect(
          (
            await request(
              `/cases/${ticket.id}/analyze`,
              { requestId: randomUUID() },
              "owner1",
              "b".repeat(40),
            )
          ).status,
        ).toBe(409);
        // Cases created before a deployment can be retried against the current revision.
        await service.pool.query("UPDATE support_cases SET data=jsonb_set(data, '{version}', to_jsonb($2::text)) WHERE id=$1", [ticket.id, "c".repeat(40)]);
        const run = { requestId: randomUUID() };
        expect((await request(`/cases/${ticket.id}/analyze`, run)).status).toBe(
          200,
        );
        expect((await request(`/cases/${ticket.id}/analyze`, run)).status).toBe(
          200,
        );
        await service.tick();
        const updated = await (await request("/cases")).json();
        expect(updated[0].status).toBe("proposal_ready");
        expect(updated[0].version).toBe(version);
        expect(updated[0].execution).toMatchObject({revision:version,outcome:'complete',tokens:0,calls:0,stages:[]});
        const feedback={requestId:randomUUID(),reportId:updated[0].reportId,outcome:"unresolved"};
        expect((await request(`/cases/${ticket.id}/feedback`,feedback,"owner2")).status).toBe(404);
        const evaluations=await Promise.all([request(`/cases/${ticket.id}/feedback`,feedback),request(`/cases/${ticket.id}/feedback`,feedback)]);
        expect(evaluations.map(response=>response.status)).toEqual([200,200]);
        const evaluated=await (await request("/cases")).json();
        expect(evaluated[0].status).toBe("proposal_ready");
        expect(evaluated[0].feedback).toHaveLength(1);
        expect(evaluated[0].feedback[0]).toMatchObject(feedback);
        expect(evaluated[0].messages.filter((message:any)=>message.text.includes("sigue el problema"))).toHaveLength(1);
        expect((await request(`/cases/${ticket.id}/feedback`,{...feedback,outcome:"resolved"})).status).toBe(409);
        report.certainty = "falta_informacion";
        expect((await request(`/cases/${ticket.id}/analyze`, {requestId:randomUUID()})).status).toBe(200);
        await service.tick();
        expect((await (await request("/cases")).json())[0].status).toBe("needs_info");
        expect((await request(`/cases/${ticket.id}/feedback`,{...feedback,requestId:randomUUID()})).status).toBe(409);
        const current=await (await request("/cases")).json();
        expect(current[0].reportId).not.toBe(feedback.reportId);
        expect(current[0].feedback).toHaveLength(1);
        const count = await service.pool.query(
          "SELECT count(*)::int AS count FROM support_runs WHERE kind='analyze'",
        );
        expect(count.rows[0].count).toBe(2);
        await service.pool.query(
          "INSERT INTO support_runs(id,owner,request_id,case_id,kind) SELECT gen_random_uuid(),'owner1',gen_random_uuid(),$1,'analyze' FROM generate_series(1,$2::int)",
          [ticket.id,dailyLimit-2],
        );
        expect(
          (
            await request(`/cases/${ticket.id}/analyze`, {
              requestId: randomUUID(),
            })
          ).status,
        ).toBe(429);
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((e) => (e ? reject(e) : resolve())),
        );
        await service.stop();
        await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
        await admin.end();
      }
    });
  },
);

(process.env.DATABASE_URL ? it : it.skip)('persists safe partial and failed run details across reloads without another investigation',async()=>{
 const admin=new pg.Client({connectionString:process.env.DATABASE_URL});await admin.connect();
 const schema='assistant_execution_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA "${schema}"`);
 const url=new URL(process.env.DATABASE_URL!);url.searchParams.set('options',`-c search_path=${schema}`);
 const version='a'.repeat(40),secret='test-execution-secret-'.repeat(3);let attempts=0;
 const privateDraft:SupportDiagnosis={summary:'UNAPPROVED_ONLY',cause:'Causa propuesta',proposal:'Propuesta sin validar',certainty:'hipotesis',proposedTests:[],questions:[],dataRepair:'',limitations:[],evidence:[]};
 const service=await createService({databaseUrl:url.toString(),secret,version,sourceRoot:process.cwd(),apiKey:'mock-only',model:'mock'},async()=>{
   attempts++;
   if(attempts===2)throw Object.assign(new Error('PRIVATE PROVIDER MESSAGE'),{code:'evidence_semantic_rejected',rejectedReviews:[{audit:1,draft:privateDraft,issues:[{statementId:'proposal_1_1',problem:'Revisar la inferencia',correction:'Acotar la conclusión'}]},{audit:2,draft:{...privateDraft,proposal:'Corrección insuficiente'},issues:[{statementId:'proposal_1_1',problem:'Todavía sin respaldo',correction:'Verificar la evidencia'}]}],stages:[{stage:'reaudit',outcome:'rejected',tokens:400,totalTokens:42000,elapsedMs:0,issueCount:1,privateText:'PRIVATE'}]});
   if(attempts===3)throw Object.assign(new Error('PRIVATE PROVIDER MESSAGE'),{code:'evidence_audit_invalid',semanticAudits:1,auditReason:'invalid_schema',auditSchemaIssues:[{path:'checks.item.codeQuote',code:'too_big',message:'PRIVATE'}],stages:[{stage:'audit',outcome:'invalid',tokens:400,totalTokens:56841,elapsedMs:0},{stage:'audit',outcome:'failed',tokens:0,totalTokens:56841,elapsedMs:0}]});
   return {report:{summary:'Parcial',validationStatus:'incomplete',certainty:'hipotesis',cause:'',proposal:'Completar revisión',proposedTests:[],questions:[],dataRepair:'',limitations:[],evidence:[]},tokens:65000,calls:4,semanticAudits:0,readFiles:[],searches:[],partialReason:'correction_reserve',stages:[{stage:'audit',outcome:'blocked',tokens:0,totalTokens:65000,elapsedMs:0,reason:'budget',availableTokens:35000,reservedTokens:40000}]};
 });
 const server=service.app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.on('listening',resolve));
 const base=`http://127.0.0.1:${(server.address() as any).port}`;
 const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});
 const request=(path:string,body?:unknown,owner='owner1')=>fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json','X-Support-User':owner,'X-Support-Version':version},body:body?JSON.stringify(body):undefined});
 try{
   const ticket=await(await request('/cases',{requestId:randomUUID(),title:'Caso de ejecución sintético',module:'inventario',actual:'Error genérico de receta',expected:'Revisar el mensaje'})).json();
   await request(`/cases/${ticket.id}/analyze`,{requestId:randomUUID()});await service.tick();
   const first=(await(await request('/cases')).json())[0];
   expect(first.status).toBe('validation_incomplete');expect(first.execution).toMatchObject({outcome:'incomplete',partialReason:'correction_reserve',tokens:65000,semanticAudits:0});
   expect(first.execution.stages[0]).toMatchObject({availableTokens:35000,reservedTokens:40000});
   expect((await(await request('/cases')).json())[0].execution).toEqual(first.execution);expect(attempts).toBe(1);
   expect(await(await request('/cases',undefined,'other-owner')).json()).toEqual([]);
   const queued=await(await request(`/cases/${ticket.id}/analyze`,{requestId:randomUUID()})).json();expect(queued.execution).toBeUndefined();
   await service.tick();const failed=(await(await request('/cases')).json())[0];
   expect(failed.status).toBe('failed');expect(failed.execution).toMatchObject({outcome:'failed',failureCode:'diagnosis_coherence',stages:[{stage:'reaudit',outcome:'rejected',issueCount:1}]});
   expect(JSON.stringify(failed)).not.toContain('PRIVATE');expect(failed.execution.partialReason).toBeUndefined();expect(attempts).toBe(2);
   expect(failed.report).toBeNull();expect(failed.rejectedReviews).toHaveLength(2);expect(failed.rejectedReviews[0].draft).toMatchObject({summary:'UNAPPROVED_ONLY',validationStatus:'incomplete'});
   expect((await(await request('/cases')).json())[0].rejectedReviews).toEqual(failed.rejectedReviews);expect(attempts).toBe(2);
   expect(await(await request('/cases',undefined,'other-owner')).json()).toEqual([]);expect(JSON.stringify(warning.mock.calls)).not.toContain('UNAPPROVED_ONLY');
   const thirdQueued=await(await request(`/cases/${ticket.id}/analyze`,{requestId:randomUUID()})).json();expect(thirdQueued.rejectedReviews).toBeUndefined();await service.tick();
   const auditFailed=(await(await request('/cases')).json())[0];expect(auditFailed.execution).toMatchObject({outcome:'failed',failureCode:'diagnosis_audit',semanticAudits:1,auditReason:'invalid_schema',auditSchemaIssues:[{path:'checks.item.codeQuote',code:'too_big'}]});
   expect(JSON.stringify(auditFailed)).not.toContain('PRIVATE');expect(attempts).toBe(3);
 }finally{
   warning.mockRestore();
   await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await service.stop();await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();
 }
});

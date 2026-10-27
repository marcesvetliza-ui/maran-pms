import type { Pool, PoolClient } from "pg";
import { FundingError, type Scope } from "./contracts";

export class FundingStore {
  constructor(readonly pool: Pool) {}
  async transaction<T>(scope: Scope, operationId: string | null, run: (client: PoolClient) => Promise<T>,
    beforeBegin?: (client: PoolClient) => Promise<void>, scopeLock: "wait" | "try" = "wait"): Promise<T> {
    const client = await this.pool.connect();
    let begun = false;
    try {
      // Optional preflight owns this SAME loan, before any financial locks or
      // BEGIN. External authentication can commit independently of later SQL.
      await beforeBegin?.(client);
      await client.query("BEGIN");
      begun = true;
      await client.query("SET LOCAL lock_timeout='3s'");
      await client.query("SET LOCAL statement_timeout='10s'");
      if (operationId) await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`funding-operation:${operationId}`]);
      if(scopeLock==="try") {
        const result=await client.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked",[`funding-scope:${scope.kind}:${scope.id}`]);
        if(!result.rows[0]?.locked)throw new FundingError("CONCURRENT_CHANGE","Hay otra operación en el folio. Reintentá la misma operación.",409,true);
      } else {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`funding-scope:${scope.kind}:${scope.id}`]);
      }
      const result = await run(client);
      await client.query("COMMIT");
      begun = false;
      return result;
    } catch (error: any) {
      if (begun) await client.query("ROLLBACK").catch(() => {});
      if (["55P03","40P01","40001"].includes(error.code)) throw new FundingError("CONCURRENT_CHANGE", "Hay otra operación financiera en curso. Reintente la misma operación.", 409, true);
      if (error.code === "23514") throw new FundingError(String(error.message).split("\n")[0], "La operación viola una garantía financiera; no se aplicó ningún cambio.", 409);
      if (error.code === "23505") throw new FundingError("DUPLICATE_CLAIM", "Ya existe una operación o vínculo financiero con esa identidad.", 409);
      throw error;
    } finally { client.release(); }
  }
  async operation(id: string) {
    const { rows } = await this.pool.query("SELECT * FROM payment_funding.operations WHERE id=$1", [id]);
    if (!rows[0]) throw new FundingError("NOT_FOUND", "Operación no encontrada.", 404);
    return rows[0];
  }
  async event(client: PoolClient, operationId: string | null, key: string, kind: string, payload: any, actorId: string) {
    await client.query(`INSERT INTO payment_funding.events(operation_id,event_key,kind,payload,actor_id) VALUES($1,$2,$3,$4,$5)`,
      [operationId,key,kind,JSON.stringify(payload),actorId]);
  }
  async assertAdopted(client: PoolClient, scope: Scope) {
    const r = await client.query("SELECT 1 FROM payment_funding.scopes WHERE kind=$1 AND id=$2", [scope.kind,scope.id]);
    if (!r.rowCount) throw new FundingError("SCOPE_NOT_ADOPTED", "Falta conciliar y adoptar este folio completo; no se infieren vínculos históricos.", 409);
  }
}

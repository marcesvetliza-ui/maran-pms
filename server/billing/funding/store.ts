import type { Pool, PoolClient } from "pg";
import { FundingError, type Scope } from "./contracts";

export class FundingStore {
  constructor(readonly pool: Pool) {}
  async transaction<T>(scope: Scope, operationId: string | null, run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout='3s'");
      await client.query("SET LOCAL statement_timeout='10s'");
      if (operationId) await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`funding-operation:${operationId}`]);
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`funding-scope:${scope.kind}:${scope.id}`]);
      const result = await run(client);
      await client.query("COMMIT");
      return result;
    } catch (error: any) {
      await client.query("ROLLBACK").catch(() => {});
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

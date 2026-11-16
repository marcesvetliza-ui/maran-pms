import { describe, expect, it, vi } from "vitest";
import { legacyFundingScopes } from "../billing/funding/legacyFence";

describe("propietario heredado de una corrección de Nota de Débito", () => {
  it("protege el folio SPA asociado a la factura original aunque la ND no guarde spa_account_id", async () => {
    const query = vi.fn(async (statement: string, parameters: any[]) => {
      if (statement.startsWith("WITH RECURSIVE ancestors")) return { rows: [{ id: '42' }, { id: '12' }] };
      // The SPA owner belongs only to original invoice12. A lookup with the
      // debit42 alone must not infer it from a browser-supplied scope.
      if (statement.includes("payment_funding.receipts")) return { rows: parameters[0].includes('12') ? [{ kind: 'spa', id: 'original-spa-account' }] : [] };
      throw Error('Unexpected owner lookup');
    });
    const scopes = await legacyFundingScopes({ query } as any, { path: '/billing/debit-notes/42/annul', method: 'POST', body: {} } as any, 'public');
    expect(scopes).toEqual([{ kind: 'spa', id: 'original-spa-account' }]);
    expect(query).toHaveBeenCalledTimes(2);
  });
  it("conserva la consulta existente para el resto de los escritores", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    expect(await legacyFundingScopes({ query } as any, { path: '/billing/invoices/12', method: 'PATCH', body: {} } as any, 'public')).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });
});

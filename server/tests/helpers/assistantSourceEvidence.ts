import { readFileSync } from "node:fs";
import path from "node:path";

/** Live-code tests locate a statement, never pin a stale line from another revision. */
export function sourceRange(file: string, anchor: string, before = 0, after = 8) {
  const lines = readFileSync(path.join(process.cwd(), file), "utf8").split("\n");
  const index = lines.findIndex(line => line.includes(anchor));
  if (index < 0) throw new Error(`Missing test evidence anchor in ${file}: ${anchor}`);
  return { path: file, start: Math.max(1, index + 1 - before), end: Math.min(lines.length, index + 1 + after) };
}

/** Keep the received diagnosis verbatim while binding citations to live statements. */
export function bindFiscalRecoveryEvidence<T extends {evidence: Array<{path:string;start:number;end:number}>}>(report:T):T {
  return {...report,evidence:report.evidence.map(ref=>ref.path === "server/billing/routes.ts"
    ? {...ref,...sourceRange(ref.path,'app.post("/api/billing/credit-notes/:id/reconcile"',0,58)}
    : ref.path === "server/billing/invoiceService.ts"
      ? {...ref,...sourceRange(ref.path,"const fecha = String(pendingInvoice",0,51)} : ref)};
}

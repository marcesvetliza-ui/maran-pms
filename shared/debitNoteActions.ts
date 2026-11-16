const CREDIT_BY_DEBIT: Readonly<Record<string, string>> = {
  NDA: "NCA", NDB: "NCB", NDC: "NCC", NDT: "NCT", NDM: "NCM", NDMB: "NCMB",
};

export function creditTypeForDebitNote(type: unknown): string | undefined {
  return typeof type === "string" && Object.hasOwn(CREDIT_BY_DEBIT, type) ? CREDIT_BY_DEBIT[type] : undefined;
}

export function isDebitAnnulmentCredit(note: any): boolean {
  return String(note?.tipo_comprobante ?? note?.tipoComprobante ?? "").startsWith("NC") && !!debitNoteCorrectionTag(note);
}

export function debitNoteCorrectionTag(note: any): { targetId: number; fingerprint: string; operationKey: string } | null {
  const match = typeof note?.observaciones === "string" && note.observaciones.match(/\[annul-debit:(\d+):([a-f0-9]{64})\] \[debit-operation:((?:debit-annul|debit-restore):\d+:[a-f0-9-]{36})\]$/i);
  return match ? { targetId: Number(match[1]), fingerprint: match[2], operationKey: match[3] } : null;
}

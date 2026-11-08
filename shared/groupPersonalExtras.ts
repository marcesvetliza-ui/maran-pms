/** A general room payment covers lodging first; explicitly scoped extras
 * receipts always cover extras. Never count a lodging receipt twice. */
export function calculateGroupPersonalExtrasCap(input: {
  config: unknown; extras: unknown; directPaid: unknown; groupFunds: unknown; groupLodging: unknown;
  lodging?: unknown; personalPaid?: unknown;
}): number {
  if (input.config !== 'accommodation') return 0;
  const cents=(raw:unknown)=>{const amount=Number(raw);return Number.isFinite(amount)?Math.round(amount*100):0;};
  const personalPaid=Math.max(0,cents(input.personalPaid));
  const generalPaid=Math.max(0,cents(input.directPaid)-personalPaid);
  const generalPaidForExtras=Math.max(0,generalPaid-Math.max(0,cents(input.lodging)));
  const masterExcess=Math.max(0,cents(input.groupFunds)-cents(input.groupLodging));
  return Math.max(0,cents(input.extras)-personalPaid-generalPaidForExtras-masterExcess)/100;
}

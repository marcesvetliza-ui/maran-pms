export type CheckoutDiscountInput = { type: "percent" | "fixed"; value: number; reason: string };
export type CheckoutDiscount = CheckoutDiscountInput & {
  amount: number;
  originalTotal: number;
  sourceAmounts: Record<string, number>;
};

/** Money is allocated in cents; rounding cannot invent or lose a cent. */
export function calculateCheckoutDiscount(sources: Record<string, number>, input: CheckoutDiscountInput): CheckoutDiscount {
  const entries = Object.entries(sources);
  const cents = entries.map(([, value]) => Math.round(value * 100));
  const total = cents.reduce((sum, value) => sum + value, 0);
  if (!entries.length || cents.some(value => !Number.isSafeInteger(value) || value <= 0) || !Number.isSafeInteger(total)) {
    throw new Error("El total del descuento no es válido.");
  }
  if (!["percent", "fixed"].includes(input.type) || !Number.isFinite(input.value) || input.value <= 0 ||
      (input.type === "percent" && input.value > 100)) throw new Error("Ingresá un descuento válido.");
  const reason = String(input.reason || "").trim();
  if (!reason || reason.length > 500) throw new Error("Ingresá el motivo del descuento (hasta 500 caracteres).");
  const amount = Math.round(input.type === "percent" ? total * input.value / 100 : input.value * 100);
  if (amount <= 0 || amount >= total) throw new Error("El descuento debe ser mayor a cero y menor al total a facturar.");
  const allocated = cents.map(value => Math.floor(amount * value / total));
  const order = cents.map((value, index) => ({ index, remainder: amount * value / total - allocated[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0, missing = amount - allocated.reduce((a, b) => a + b, 0); i < missing; i++) allocated[order[i].index]++;
  if (allocated.some((value, index) => value >= cents[index])) throw new Error("El descuento deja un cargo sin importe; reducí el descuento.");
  return { type: input.type, value: input.value, reason, amount: amount / 100, originalTotal: total / 100,
    sourceAmounts: Object.fromEntries(entries.map(([id], index) => [id, allocated[index] / 100])) };
}

export function checkoutDiscountFromInvoice(invoice: any): CheckoutDiscount | null {
  let intent = invoice?.credit_reapplication_intent ?? invoice?.creditReapplicationIntent;
  if (typeof intent === "string") { try { intent = JSON.parse(intent); } catch { return null; } }
  return intent?.checkoutDiscount ?? null;
}

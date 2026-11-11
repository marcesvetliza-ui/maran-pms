// Runs on every startup. Only legacy plans without a currency need a default.
// Never relabel saved USD amounts as ARS: this does not convert prices.
export const RATE_PLAN_MISSING_CURRENCY_SQL = `
  UPDATE rate_plans SET currency = 'ARS'
  WHERE currency IS NULL OR btrim(currency) = ''
`;

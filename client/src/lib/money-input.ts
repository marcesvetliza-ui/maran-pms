/**
 * Parses monetary values entered in either Argentine or standard decimal
 * notation without applying display formatting while the user is typing.
 */
export function parseMoneyInput(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;

  const raw = String(value).trim().replace(/[$\s]/g, "");
  if (!raw) return 0;

  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  let normalized = raw;

  if (comma >= 0 && dot >= 0) {
    // The last separator is the decimal one: 45.657,50 or 45,657.50.
    const decimalIndex = Math.max(comma, dot);
    const decimalSeparator = raw[decimalIndex];
    const thousandsSeparator = decimalSeparator === "," ? /\./g : /,/g;
    normalized = raw.replace(thousandsSeparator, "").replace(decimalSeparator, ".");
  } else if (comma >= 0 || dot >= 0) {
    const separator = comma >= 0 ? "," : ".";
    const [, fraction = ""] = raw.split(separator);
    // A single separator followed by 3 digits is conventionally a thousands
    // separator in the Argentine UI; otherwise it is the decimal separator.
    normalized = fraction.length === 3
      ? raw.replace(separator, "")
      : raw.replace(separator, ".");
  }

  const amount = Number(normalized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

export function moneyInputValue(value: number): string {
  if (!Number.isFinite(value)) return "";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function moneyPayload(value: string | number | null | undefined): string {
  return parseMoneyInput(value).toFixed(2);
}
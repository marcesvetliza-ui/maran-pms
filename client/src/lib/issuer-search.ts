function nameText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Formatting is ignored only for CUIT lookup; selection always retains the entity ID. */
export function matchesIssuer(
  name: unknown,
  cuit: unknown,
  search: string,
): boolean {
  const query = search.trim();
  if (!query) return true;
  if (nameText(name).includes(nameText(query))) return true;
  if (!/^[\d\s.\-–—]+$/.test(query)) return false;
  const digits = query.replace(/\D/g, "");
  return (
    !!digits &&
    String(cuit ?? "")
      .replace(/\D/g, "")
      .includes(digits)
  );
}

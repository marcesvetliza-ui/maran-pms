/** Active warehouse contract shared by purchases and consumption screens. */
export function isActiveWarehouse(warehouse: { id?: string; is_active?: string | boolean | null; isActive?: string | boolean | null }): boolean {
  return !!warehouse.id && String(warehouse.is_active ?? warehouse.isActive) === "true";
}

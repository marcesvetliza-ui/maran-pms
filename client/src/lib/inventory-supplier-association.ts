type InventorySupplierRef = {
  id: number;
  isPreferred?: boolean;
};

export function buildInventorySupplierUpdate(
  currentSuppliers: InventorySupplierRef[],
  invoiceSupplierId: number | null,
  costPrice: string,
): {
  costPrice?: string;
  accountingSupplierIds?: number[];
  preferredAccountingSupplierId?: number;
} {
  const update: {
    costPrice?: string;
    accountingSupplierIds?: number[];
    preferredAccountingSupplierId?: number;
  } = {};

  if (parseFloat(costPrice) > 0) update.costPrice = costPrice;
  if (invoiceSupplierId === null) return update;

  const currentSupplierIds = currentSuppliers.map((supplier) => Number(supplier.id));
  update.accountingSupplierIds = [...new Set([...currentSupplierIds, invoiceSupplierId])];
  update.preferredAccountingSupplierId =
    currentSuppliers.find((supplier) => supplier.isPreferred)?.id ?? invoiceSupplierId;
  return update;
}
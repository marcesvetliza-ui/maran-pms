export const PAYMENT_ORDER_METHODS = [
  { value: "transferencia", label: "Transferencia" },
  { value: "efectivo", label: "Efectivo" },
  { value: "cheque", label: "Cheque" },
  { value: "dep_bancario", label: "Depósito bancario" },
] as const;

export type PaymentOrderEdit = {
  id: number;
  numero: string;
  supplier_nombre: string;
  fecha: string;
  forma_pago: string;
  observaciones: string | null;
  total_abonado: string;
  edit_version: string;
  non_fiscal: boolean;
};

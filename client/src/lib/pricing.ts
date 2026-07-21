const IVA_RATE = 0.21;

export function calcNeto(precioConIva: number): number {
  return parseFloat((precioConIva / (1 + IVA_RATE)).toFixed(2));
}

export function calcIva21(precioConIva: number): number {
  const neto = calcNeto(precioConIva);
  return parseFloat(fmtMoney(precioConIva - neto));
}

export function desglosarIva(precioConIva: number): {
  total: number;
  neto: number;
  iva: number;
  alicuota: "21";
} {
  const neto = calcNeto(precioConIva);
  const iva = parseFloat(fmtMoney(precioConIva - neto));
  return { total: precioConIva, neto, iva, alicuota: "21" };
}

export function prepararItemsParaARCA(items: {
  descripcion: string;
  cantidad: number;
  precioUnitarioConIva: number;
}[]): {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotalNeto: number;
  alicuotaIva: "21";
  subtotal: number;
}[] {
  return items.map((item) => {
    const totalConIva = item.precioUnitarioConIva * item.cantidad;
    const { neto, total } = desglosarIva(totalConIva);
    const precioUnitarioNeto = parseFloat(fmtMoney(neto / item.cantidad));
    return {
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      precioUnitario: precioUnitarioNeto,
      subtotalNeto: neto,
      alicuotaIva: "21",
      subtotal: total,
    };
  });
}
import { fmtMoney } from "@/lib/utils";

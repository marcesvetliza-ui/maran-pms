export const IVA_RATE = 0.21;

export const calcNeto = (total: number): number =>
  parseFloat((total / (1 + IVA_RATE)).toFixed(2));

export const calcIva21 = (total: number): number =>
  parseFloat((total - calcNeto(total)).toFixed(2));

export const desglosarIva = (total: number) => ({
  total,
  neto: calcNeto(total),
  iva: calcIva21(total),
});

export type TarifaConvenio = "mayorista" | "minorista";

export const TARIFA_CONVENIO_LABEL: Record<TarifaConvenio, string> = {
  mayorista: "Mayorista",
  minorista: "Minorista",
};

export const TARIFA_CONVENIO_SHORT: Record<TarifaConvenio, string> = {
  mayorista: "May",
  minorista: "Min",
};

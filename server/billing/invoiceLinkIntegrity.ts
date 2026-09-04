type LinkableInvoice = Record<string, any>;

export function assertInvoiceEmittedForLink(invoice: LinkableInvoice | null | undefined) {
  if (!invoice) {
    throw Object.assign(new Error("El comprobante indicado no existe en el sistema"), { statusCode: 400 });
  }
  const estado = invoice.estado;
  if (estado !== "emitida") {
    throw Object.assign(
      new Error(
        estado === "autorizacion_pendiente"
          ? "La factura todavía no está autorizada para vincular"
          : "Sólo se puede vincular una factura emitida vigente",
      ),
      { statusCode: 409 },
    );
  }
}

/** Only database fields may become fiscal proof in an operational link. */
export function canonicalInvoiceReference(invoice: LinkableInvoice) {
  return {
    id: Number(invoice.id),
    tipoComprobante: invoice.tipoComprobante ?? invoice.tipo_comprobante,
    puntoVenta: Number(invoice.puntoVenta ?? invoice.punto_venta),
    numero: Number(invoice.numero),
    cae: invoice.cae ?? null,
    caeFechaVto: invoice.caeFechaVto ?? invoice.cae_fecha_vto ?? null,
    montoTotal: invoice.montoTotal ?? invoice.monto_total,
    estado: invoice.estado,
  };
}

export function canonicalPaymentLinkState(invoice: LinkableInvoice) {
  const canonical = canonicalInvoiceReference(invoice);
  return {
    invoice: canonical,
    invoiceRef: JSON.stringify(canonical),
    invoiceLinkFailed: false,
    reconciliationStatus: "conciliada" as const,
    reconciliationError: null,
  };
}
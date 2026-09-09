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

function invoiceIdentity(value: LinkableInvoice) {
  return {
    id: Number(value?.id),
    type: String(value?.tipoComprobante ?? value?.tipo_comprobante ?? ""),
    point: Number(value?.puntoVenta ?? value?.punto_venta),
    number: Number(value?.numero),
  };
}

function hasInvoiceIdentity(value: LinkableInvoice): boolean {
  const identity = invoiceIdentity(value);
  return Number.isInteger(identity.id) && identity.id > 0 &&
    Boolean(identity.type) && Number.isFinite(identity.point) && Number.isFinite(identity.number);
}

/** Established fiscal provenance is immutable; retries may only enrich metadata. */
export function assertSameOriginalInvoice(existing: LinkableInvoice, candidate: LinkableInvoice): void {
  if (!hasInvoiceIdentity(existing)) return;
  const left = invoiceIdentity(existing);
  const right = invoiceIdentity(candidate);
  const candidateHasId = candidate?.id !== undefined && candidate?.id !== null;
  const candidateHasType = candidate?.tipoComprobante !== undefined || candidate?.tipo_comprobante !== undefined;
  const candidateHasPoint = candidate?.puntoVenta !== undefined || candidate?.punto_venta !== undefined;
  const candidateHasNumber = candidate?.numero !== undefined && candidate?.numero !== null;
  if ((candidateHasId && left.id !== right.id) ||
      (candidateHasType && left.type !== right.type) ||
      (candidateHasPoint && left.point !== right.point) ||
      (candidateHasNumber && left.number !== right.number)) {
    throw Object.assign(
      new Error("El pago ya conserva otro comprobante fiscal original y no puede reemplazarse"),
      { statusCode: 409 },
    );
  }
}
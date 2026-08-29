export type GroupInvoiceCompositionKind = "accommodation" | "room_charge" | "group_charge";

export type GroupInvoiceCompositionSource = {
  id: string;
  kind: GroupInvoiceCompositionKind;
  concept: string;
  destination: string;
  reservationCode?: string | null;
  roomNumber?: string | null;
};

export type GroupInvoiceCompositionLine = GroupInvoiceCompositionSource & {
  amount: number;
};

export type GroupInvoiceCompositionSection = {
  kind: GroupInvoiceCompositionKind;
  label: string;
  total: number;
  lines: GroupInvoiceCompositionLine[];
};

export type GroupInvoiceComposition = {
  sections: GroupInvoiceCompositionSection[];
  total: number;
  unavailableReason?: string;
};

const SECTION_LABELS: Record<GroupInvoiceCompositionKind, string> = {
  accommodation: "Alojamiento",
  room_charge: "Consumos por habitación",
  group_charge: "Cargos grupales",
};

const SECTION_ORDER: GroupInvoiceCompositionKind[] = [
  "accommodation",
  "room_charge",
  "group_charge",
];

const cents = (value: unknown) => Math.round((Number(value) || 0) * 100);

function fallbackSource(sourceId: string): GroupInvoiceCompositionSource {
  if (sourceId.startsWith("group-charge:")) {
    return {
      id: sourceId,
      kind: "group_charge",
      concept: "Cargo grupal",
      destination: "Grupo",
    };
  }
  if (sourceId.endsWith(":accommodation")) {
    return {
      id: sourceId,
      kind: "accommodation",
      concept: "Alojamiento",
      destination: "Habitación / reserva",
    };
  }
  return {
    id: sourceId,
    kind: "room_charge",
    concept: "Consumo",
    destination: "Habitación / reserva",
  };
}

/**
 * Builds the human-readable breakdown of a group fiscal document from its
 * exact persisted source map. Amounts are never recomputed from current folio
 * balances, so the displayed total keeps the approved fiscal cents.
 */
export function buildGroupInvoiceComposition(
  sources: GroupInvoiceCompositionSource[],
  sourceAmounts: Record<string, number>,
): GroupInvoiceComposition {
  const byId = new Map(sources.map((source) => [source.id, source]));
  const grouped = new Map<GroupInvoiceCompositionKind, GroupInvoiceCompositionLine[]>();

  for (const [sourceId, rawAmount] of Object.entries(sourceAmounts)) {
    const amountCents = cents(rawAmount);
    if (!sourceId || amountCents <= 0) continue;
    const source = byId.get(sourceId) || fallbackSource(sourceId);
    const lines = grouped.get(source.kind) || [];
    lines.push({ ...source, amount: amountCents / 100 });
    grouped.set(source.kind, lines);
  }

  const sections = SECTION_ORDER.flatMap((kind) => {
    const lines = grouped.get(kind);
    if (!lines?.length) return [];
    const sortedLines = [...lines].sort((a, b) =>
      a.destination.localeCompare(b.destination, "es") ||
      a.concept.localeCompare(b.concept, "es") ||
      a.id.localeCompare(b.id)
    );
    const totalCents = sortedLines.reduce((sum, line) => sum + cents(line.amount), 0);
    return [{
      kind,
      label: SECTION_LABELS[kind],
      total: totalCents / 100,
      lines: sortedLines,
    }];
  });

  return {
    sections,
    total: sections.reduce((sum, section) => sum + cents(section.total), 0) / 100,
  };
}

export function buildUnavailableGroupInvoiceComposition(
  fiscalTotal: unknown,
): GroupInvoiceComposition {
  return {
    sections: [],
    total: cents(fiscalTotal) / 100,
    unavailableReason: "Este comprobante histórico no conserva el mapa fiscal por concepto.",
  };
}
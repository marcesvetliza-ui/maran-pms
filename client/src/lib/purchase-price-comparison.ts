export function comparePurchasePrices(rows: any[]) {
  const previous = new Map<string, number>();
  return rows.map(row => {
    // Compare only recorded stock units, without inventing historical conversions.
    const comparable = Number(row.stock_quantity) > 0 && !!row.stock_unit;
    const price = comparable ? Number(row.unit_price) * Number(row.quantity) / Number(row.stock_quantity) : null;
    const key = `${row.item_id}:${row.stock_unit}:${row.tipo_comprobante === 'FACT-B' ? 'final' : 'neto'}`;
    const before = comparable ? previous.get(key) ?? null : null;
    const free = Number(row.unit_price) === 0;
    const delta = !free && price !== null && before !== null ? price - before : null;
    if (!free && price !== null) previous.set(key, price);
    return {...row, price, before, free, delta, percent: delta !== null && before ? delta / before * 100 : null};
  });
}

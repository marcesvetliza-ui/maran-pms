/** A group invoice must identify all original source cents before a room can be invoiced independently. */
export function hasProvableGroupCoverage(invoice: any): boolean {
    let amounts = invoice.source_charge_amounts;
    try {
        if (typeof amounts === 'string')
            amounts = JSON.parse(amounts);
    }
    catch {
        return false;
    }
    const rows = amounts && typeof amounts === 'object' && !Array.isArray(amounts) ? Object.entries(amounts) : [];
    return rows.length > 0 && rows.every(([id, value]) => (id.startsWith('reservation:') || id.startsWith('group-charge:')) && Number.isFinite(Number(value)) && Number(value) > 0) && rows.reduce((sum, [, v]) => sum + Math.round(Number(v) * 100), 0) === Math.round(Number(invoice.monto_total) * 100);
}

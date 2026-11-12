export function groupMoneyCents(value: unknown): number {
    const text = String(value ?? '');
    if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(text))
        throw Object.assign(new Error('El importe debe ser positivo y tener hasta dos decimales.'), { statusCode: 400 });
    const [whole, fraction = ''] = text.split('.');
    return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
export function allocateGroupMoney(input: unknown): Record<string, number> {
    if (!input || typeof input !== 'object' || Array.isArray(input))
        throw Object.assign(new Error('Seleccioná la distribución del anticipo.'), { statusCode: 400 });
    const rows = Object.entries(input);
    if (!rows.length || rows.length > 200)
        throw Object.assign(new Error('Seleccioná entre una y 200 habitaciones.'), { statusCode: 400 });
    return Object.fromEntries(rows.map(([id, value]) => { const cents = groupMoneyCents(value); if (!id || id.startsWith('__') || cents <= 0)
        throw Object.assign(new Error('Cada asignación debe identificar una habitación y un importe positivo.'), { statusCode: 400 }); return [id, cents]; }));
}

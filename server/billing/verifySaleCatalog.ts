import { sql } from "drizzle-orm";
import { db } from "../db";

type CatalogRow = {
  descripcion?: unknown;
  catalogItem?: { source?: unknown; id?: unknown };
  spaTreatmentId?: unknown;
};

/** Verifica el origen de cada concepto antes de autorizar una venta del Centro. */
export async function verifySaleCatalog(items: unknown): Promise<string | null> {
  if (!Array.isArray(items) || items.length === 0) return "Elegí al menos un concepto del catálogo";

  for (const [index, raw] of items.entries()) {
    const item = raw as CatalogRow | null;
    const source = item?.catalogItem?.source;
    const id = item?.catalogItem?.id;
    if (typeof id !== "string" || !id.trim()) return `El concepto ${index + 1} debe elegirse del catálogo`;

    let name: string | undefined;
    if (source === "accommodation" && id === "alojamiento") {
      name = "Alojamiento en Hotel Maran";
    } else if (source === "restaurant") {
      const result = await db.execute(sql`SELECT name FROM menu_items WHERE id = ${id} AND is_available IS DISTINCT FROM 'false' AND is_active IS DISTINCT FROM 'false' LIMIT 1`);
      name = (result.rows[0] as { name?: string } | undefined)?.name;
    } else if (source === "spa") {
      const result = await db.execute(sql`SELECT name FROM spa_treatments WHERE id = ${id} AND is_active IS DISTINCT FROM 'false' LIMIT 1`);
      name = (result.rows[0] as { name?: string } | undefined)?.name;
    }
    if (!name) return `El concepto ${index + 1} ya no está disponible en el catálogo`;
    if (item?.descripcion !== name) return `El concepto ${index + 1} no coincide con el catálogo; volvé a seleccionarlo`;
    if (source === "spa" ? item.spaTreatmentId !== id : !!item?.spaTreatmentId) {
      return `El concepto ${index + 1} no coincide con el tratamiento seleccionado`;
    }
  }
  return null;
}

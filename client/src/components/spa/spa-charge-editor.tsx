import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { centsToInput, fundingMoney, pesosToCents } from "@/lib/paymentFunding";
type Entry = {
  id: string;
  source: "restaurant" | "spa" | "inventory";
  area: "restaurant" | "spa";
  name: string;
  priceCents: number | null;
};
const key = (p: Entry) => `${p.source}:${p.id}`;
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function SpaChargeEditor({
  entries,
  loading,
  error,
  locked,
  onSave,
}: {
  entries: Entry[];
  loading: boolean;
  error: boolean;
  locked: boolean;
  onSave: (request: unknown) => void;
}) {
  const [manual, setManual] = useState(false),
    [search, setSearch] = useState(""),
    [area, setArea] = useState("all"),
    [selected, setSelected] = useState("");
  const [description, setDescription] = useState(""),
    [price, setPrice] = useState(""),
    [quantity, setQuantity] = useState("1");
  const product = entries.find((p) => key(p) === selected),
    matches = entries.filter(
      (p) =>
        (area === "all" || p.area === area) &&
        normalize(p.name).includes(normalize(search.trim())),
    );
  let unitCents = 0;
  try {
    unitCents = pesosToCents(price);
  } catch {}
  const count = Number(quantity),
    valid =
      Number.isInteger(count) &&
      count > 0 &&
      count <= 9999 &&
      unitCents > 0 &&
      Number.isSafeInteger(count * unitCents) &&
      count * unitCents <= 9999999999 &&
      !!description.trim() &&
      (manual || !!product);
  function clear() {
    setSelected("");
    setDescription("");
    setPrice("");
  }
  return (
    <div className="space-y-3">
      <h4 className="font-semibold">Agregar cargo</h4>
      <div className="flex flex-wrap gap-2">
        <Button
          variant={!manual ? "default" : "outline"}
          disabled={locked}
          onClick={() => {
            setManual(false);
            clear();
          }}
        >
          Desde el catálogo
        </Button>
        <Button
          variant={manual ? "default" : "outline"}
          disabled={locked}
          onClick={() => {
            setManual(true);
            clear();
          }}
        >
          Cargo manual
        </Button>
      </div>
      {!manual && (
        <>
          <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
            <label>
              Buscar producto
              <Input
                aria-label="Buscar producto"
                placeholder="Ej.: gaseosa, agua, crema…"
                value={search}
                disabled={locked}
                onChange={(e) => {
                  setSearch(e.target.value);
                  clear();
                }}
              />
            </label>
            <label>
              Área
              <select
                aria-label="Área del catálogo"
                className="block min-h-9 w-full rounded border bg-background p-2"
                value={area}
                disabled={locked}
                onChange={(e) => {
                  setArea(e.target.value);
                  clear();
                }}
              >
                <option value="all">Todos</option>
                <option value="restaurant">Restaurant</option>
                <option value="spa">SPA</option>
              </select>
            </label>
          </div>
          <label className="block">
            Producto
            <select
              aria-label="Producto del cargo"
              className="block min-h-10 w-full rounded border bg-background p-2"
              disabled={locked || loading || error}
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                const p = entries.find((p) => key(p) === e.target.value);
                setDescription(p?.name ?? "");
                setPrice(
                  p?.priceCents != null && p.priceCents > 0
                    ? centsToInput(p.priceCents)
                    : "",
                );
              }}
            >
              <option value="">
                {loading ? "Cargando catálogo…" : "Elegir producto…"}
              </option>
              {matches.map((p) => (
                <option key={key(p)} value={key(p)}>
                  {p.name} · {p.area === "restaurant" ? "Restaurant" : "SPA"}
                  {p.priceCents != null
                    ? ` · ${fundingMoney(p.priceCents)}`
                    : " · Ingresar precio de venta"}
                </option>
              ))}
            </select>
          </label>
          {error && (
            <p role="alert" className="text-destructive">
              No se pudo consultar el catálogo. Cerrá y volvé a abrir Agregar
              cargo.
            </p>
          )}
          {!loading && !error && !matches.length && (
            <p className="text-sm text-muted-foreground">
              No se encontraron productos con esa búsqueda.
            </p>
          )}
          {product && product.priceCents == null && (
            <p className="text-sm text-muted-foreground">
              Este artículo no tiene precio de venta en el catálogo. Ingresá el
              precio acordado; el costo de inventario no es el precio de venta.
            </p>
          )}
        </>
      )}
      <label className="block">
        Descripción
        <Input
          value={description}
          disabled={locked}
          readOnly={!manual}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          Cantidad
          <Input
            aria-label="Cantidad"
            type="number"
            min="1"
            max="9999"
            step="1"
            value={quantity}
            disabled={locked}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
        <label>
          Precio unitario
          <Input
            aria-label="Precio unitario"
            inputMode="decimal"
            value={price}
            disabled={locked}
            readOnly={!manual && product?.priceCents != null}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
        <div className="self-end rounded border bg-muted/30 px-3 py-2 text-sm">
          Subtotal
          <strong className="block">
            {valid ? fundingMoney(count * unitCents) : "—"}
          </strong>
        </div>
      </div>
      <Button
        disabled={locked || !valid}
        onClick={() =>
          onSave({
            action: "add-charge",
            description,
            quantity: count,
            unitCents,
            ...(!manual && product
              ? { catalogItem: { source: product.source, id: product.id } }
              : {}),
          })
        }
      >
        Guardar cargo
      </Button>
    </div>
  );
}

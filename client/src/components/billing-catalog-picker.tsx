import { Button } from "@/components/ui/button";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { fmtMoney } from "@/lib/utils";

export type CatalogArea = "recepcion" | "restaurant" | "spa" | "all";
export function defaultCatalogArea(area?: string): CatalogArea {
  return area === "recepcion" || area === "restaurant" || area === "spa"
    ? area
    : "all";
}
export type SaleCatalogOption = {
  id: string;
  source: "accommodation" | "charge_type" | "restaurant" | "spa";
  descripcion: string;
  label?: string;
  precioUnitario: number;
  codigo?: string;
  spaTreatmentId?: string;
  variable?: boolean;
  referencePrice?: number;
};
export type SaleCatalogGroup = {
  label: string;
  area: Exclude<CatalogArea, "all">;
  options: SaleCatalogOption[];
};
const areas: { id: CatalogArea; label: string }[] = [
  { id: "recepcion", label: "Recepción" },
  { id: "restaurant", label: "Restaurante" },
  { id: "spa", label: "SPA" },
  { id: "all", label: "Todos" },
];
const searchable = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Browsing another sector does not change the invoice's operating area. */
export function BillingCatalogPicker({
  groups,
  area,
  onAreaChange,
  search,
  onSearchChange,
  onSelect,
  rowIndex,
}: {
  groups: SaleCatalogGroup[];
  area: CatalogArea;
  onAreaChange: (area: CatalogArea) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (option: SaleCatalogOption) => void;
  rowIndex?: number;
}) {
  const term = searchable(search.trim());
  return (
    <>
      <div
        className="grid grid-cols-4 gap-1 p-2 border-b"
        role="group"
        aria-label="Área del catálogo"
      >
        {areas.map((option) => (
          <Button
            key={option.id}
            type="button"
            size="sm"
            variant={area === option.id ? "secondary" : "ghost"}
            className="h-8 px-1 text-xs"
            aria-pressed={area === option.id}
            onClick={() => onAreaChange(option.id)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Buscar por nombre o código..."
          value={search}
          onValueChange={onSearchChange}
          data-testid={
            rowIndex === undefined
              ? "input-catalog-search"
              : `input-item-catalog-search-${rowIndex}`
          }
        />
        <CommandList>
          <CommandEmpty>
            Sin resultados.
            {area !== "all" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="block mx-auto underline"
                onClick={() => onAreaChange("all")}
              >
                Buscar en todas las áreas
              </Button>
            )}
          </CommandEmpty>
          {groups
            .filter((group) => area === "all" || group.area === area)
            .map((group) => {
              const matches = group.options.filter(
                (option) =>
                  !term ||
                  searchable(
                    [option.label, option.descripcion, option.codigo]
                      .filter(Boolean)
                      .join(" "),
                  ).includes(term),
              );
              if (!matches.length) return null;
              return (
                <CommandGroup key={group.label} heading={group.label}>
                  {matches.slice(0, 50).map((option) => (
                    <CommandItem
                      key={`${option.source}:${option.id}`}
                      value={`${option.source}:${option.id}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onSelect={() => onSelect(option)}
                      data-testid={
                        rowIndex === undefined
                          ? `catalog-item-${option.id}`
                          : `item-catalog-option-${rowIndex}-${option.id}`
                      }
                    >
                      <span className="min-w-0 flex-1 break-words">
                        {option.label || option.descripcion}
                        {option.label &&
                          option.label !== option.descripcion && (
                            <span className="block text-xs text-muted-foreground">
                              {option.descripcion}
                            </span>
                          )}
                        {option.codigo && (
                          <span className="block text-xs text-muted-foreground">
                            Código: {option.codigo}
                          </span>
                        )}
                      </span>
                      {option.variable ? (
                        <span className="ml-2 text-right text-xs text-muted-foreground">
                          Variable
                          {(option.referencePrice || 0) > 0 && (
                            <span className="block">
                              ref. ${fmtMoney(option.referencePrice!)}
                            </span>
                          )}
                        </span>
                      ) : (
                        option.precioUnitario > 0 && (
                          <span className="text-xs text-muted-foreground ml-2">
                            ${fmtMoney(option.precioUnitario)}
                          </span>
                        )
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
        </CommandList>
      </Command>
    </>
  );
}

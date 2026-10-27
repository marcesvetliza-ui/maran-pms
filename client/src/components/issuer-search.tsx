import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { matchesIssuer } from "@/lib/issuer-search";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";

export function IssuerSearch({
  items,
  value,
  onChange,
  label,
}: {
  items: Array<{ id: string; name: string; cuit?: string | null }>;
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState("");
  const selected = items.find((item) => item.id === value);
  const filtered = items.filter((item) =>
    matchesIssuer(item.name, item.cuit, search),
  );
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          className="h-auto min-h-9 w-full justify-between whitespace-normal text-left font-normal"
        >
          <span className="min-w-0 break-words">
            {selected
              ? `${selected.name} · ${selected.cuit || "CUIT no registrado"}`
              : "Buscar por nombre o CUIT"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0"
      >
        <Command shouldFilter={false} label="Buscar emisor por nombre o CUIT">
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Nombre o CUIT, con o sin guiones…"
          />
          <CommandList>
            <CommandEmpty>No se encontraron emisores.</CommandEmpty>
            <CommandGroup>
              {filtered.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.id}
                  onSelect={() => {
                    onChange(item.id);
                    setOpen(false);
                    setSearch("");
                  }}
                  className="items-start gap-2 py-3"
                >
                  <Check
                    className={`mt-1 h-4 w-4 shrink-0 ${value === item.id ? "opacity-100" : "opacity-0"}`}
                  />
                  <span className="min-w-0">
                    <span className="block break-words font-medium">
                      {item.name}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      CUIT: {item.cuit || "No registrado"}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROVINCIAS, getCiudades } from "@/lib/argentina-geo";

interface ProvinciaCiudadSelectProps {
  provincia: string;
  localidad: string;
  onProvinciaChange: (value: string) => void;
  onLocalidadChange: (value: string) => void;
  testIdProvincia?: string;
  testIdLocalidad?: string;
}

const OTRA = "__otra__";

function ProvinciaCombobox({
  value,
  onChange,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = PROVINCIAS.filter((p) =>
    p.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          data-testid={testId}
        >
          <span className="truncate">{value || "Seleccionar..."}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar provincia..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>Sin resultados</CommandEmpty>
            <CommandGroup>
              {filtered.map((p) => (
                <CommandItem
                  key={p}
                  value={p}
                  onMouseDown={(e) => e.preventDefault()}
                  onSelect={() => {
                    onChange(p);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value === p ? "opacity-100" : "opacity-0")}
                  />
                  {p}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function CiudadCombobox({
  provincia,
  value,
  onChange,
  testId,
}: {
  provincia: string;
  value: string;
  onChange: (v: string) => void;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ciudades = getCiudades(provincia);
  const ciudadEsConocida = ciudades.includes(value);
  const showOtra = !ciudadEsConocida && value !== "";

  const filtered = ciudades.filter((c) =>
    c.toLowerCase().includes(search.toLowerCase())
  );

  const displayValue = ciudadEsConocida
    ? value
    : showOtra
    ? `${value} (personalizada)`
    : "Seleccionar...";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={!provincia}
          className="w-full justify-between font-normal"
          data-testid={testId}
        >
          <span className="truncate">{!provincia ? "Seleccionar provincia primero" : displayValue}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar localidad..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>Sin resultados</CommandEmpty>
            <CommandGroup>
              {filtered.map((c) => (
                <CommandItem
                  key={c}
                  value={c}
                  onMouseDown={(e) => e.preventDefault()}
                  onSelect={() => {
                    onChange(c);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value === c ? "opacity-100" : "opacity-0")}
                  />
                  {c}
                </CommandItem>
              ))}
              <CommandItem
                value={OTRA}
                onMouseDown={(e) => e.preventDefault()}
                onSelect={() => {
                  onChange("");
                  setOpen(false);
                  setSearch("");
                }}
              >
                <Check className="mr-2 h-4 w-4 opacity-0" />
                Otra localidad...
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function ProvinciaCiudadSelect({
  provincia,
  localidad,
  onProvinciaChange,
  onLocalidadChange,
  testIdProvincia = "select-provincia",
  testIdLocalidad = "select-localidad",
}: ProvinciaCiudadSelectProps) {
  const ciudades = getCiudades(provincia);
  const ciudadEsConocida = provincia && ciudades.includes(localidad);
  const [customCiudad, setCustomCiudad] = useState(!ciudadEsConocida ? localidad : "");
  const [showCustom, setShowCustom] = useState(false);

  useEffect(() => {
    if (!ciudadEsConocida && localidad) {
      setCustomCiudad(localidad);
      setShowCustom(true);
    } else if (ciudadEsConocida) {
      setShowCustom(false);
    }
  }, [localidad, ciudadEsConocida]);

  const handleCiudadChange = (val: string) => {
    if (val === "") {
      setShowCustom(true);
      setCustomCiudad("");
      onLocalidadChange("");
    } else {
      setShowCustom(false);
      onLocalidadChange(val);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="grid gap-2">
        <Label>Provincia</Label>
        <ProvinciaCombobox
          value={provincia}
          onChange={(val) => {
            onProvinciaChange(val);
            onLocalidadChange("");
            setCustomCiudad("");
            setShowCustom(false);
          }}
          testId={testIdProvincia}
        />
      </div>

      <div className="grid gap-2">
        <Label>Ciudad / Localidad</Label>
        <CiudadCombobox
          provincia={provincia}
          value={localidad}
          onChange={handleCiudadChange}
          testId={testIdLocalidad}
        />
        {showCustom && (
          <Input
            placeholder="Escribir localidad"
            value={customCiudad}
            onChange={(e) => {
              setCustomCiudad(e.target.value);
              onLocalidadChange(e.target.value);
            }}
            data-testid={`${testIdLocalidad}-custom`}
            className="mt-1"
          />
        )}
      </div>
    </div>
  );
}

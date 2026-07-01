import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { PROVINCIAS, getCiudades } from "@/lib/argentina-geo";

interface ProvinciaCiudadSelectProps {
  provincia: string;
  localidad: string;
  onProvinciaChange: (value: string) => void;
  onLocalidadChange: (value: string) => void;
  testIdProvincia?: string;
  testIdLocalidad?: string;
}

function GeoDropdown({
  value,
  options,
  placeholder,
  disabled,
  onChange,
  testId,
  extraOption,
  onExtraOption,
}: {
  value: string;
  options: string[];
  placeholder: string;
  disabled?: boolean;
  onChange: (v: string) => void;
  testId?: string;
  extraOption?: string;
  onExtraOption?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (v: string) => {
    onChange(v);
    setSearch("");
    setOpen(false);
  };

  return (
    <div className="relative">
      {/* Show selected value as button, click to re-open */}
      {value && !open ? (
        <button
          type="button"
          className="w-full h-9 px-3 text-left text-sm border border-input rounded-md bg-background flex items-center justify-between gap-2 hover:bg-accent/50"
          onClick={() => { setSearch(""); setOpen(true); }}
          data-testid={testId}
          disabled={disabled}
        >
          <span className="truncate">{value}</span>
          <span className="text-muted-foreground text-xs shrink-0">✕</span>
        </button>
      ) : (
        <Input
          placeholder={disabled ? "Seleccionar provincia primero" : placeholder}
          value={search}
          disabled={disabled}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 300)}
          className="h-9 text-sm"
          data-testid={testId}
          autoComplete="off"
        />
      )}

      {open && !disabled && (
        <div className="absolute z-[200] w-full mt-1 border rounded-md bg-popover shadow-lg max-h-52 overflow-y-auto">
          {filtered.length === 0 && !extraOption && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</div>
          )}
          {filtered.map((o) => (
            <button
              key={o}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(o)}
            >
              <span className={`text-primary text-xs ${value === o ? "opacity-100" : "opacity-0"}`}>✓</span>
              {o}
            </button>
          ))}
          {extraOption && onExtraOption && (
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent text-muted-foreground italic"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onExtraOption(); setOpen(false); setSearch(""); }}
            >
              {extraOption}
            </button>
          )}
        </div>
      )}
    </div>
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
  const ciudadEsConocida = provincia !== "" && ciudades.includes(localidad);
  const [showCustom, setShowCustom] = useState(false);
  const [customCiudad, setCustomCiudad] = useState("");

  useEffect(() => {
    if (!ciudadEsConocida && localidad) {
      setCustomCiudad(localidad);
      setShowCustom(true);
    } else if (ciudadEsConocida) {
      setShowCustom(false);
    }
  }, [localidad, ciudadEsConocida]);

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="grid gap-2">
        <Label>Provincia</Label>
        <GeoDropdown
          value={provincia}
          options={PROVINCIAS}
          placeholder="Buscar provincia..."
          onChange={(v) => {
            onProvinciaChange(v);
            onLocalidadChange("");
            setShowCustom(false);
            setCustomCiudad("");
          }}
          testId={testIdProvincia}
        />
      </div>

      <div className="grid gap-2">
        <Label>Ciudad / Localidad</Label>
        <GeoDropdown
          value={ciudadEsConocida ? localidad : ""}
          options={ciudades}
          placeholder="Buscar localidad..."
          disabled={!provincia}
          onChange={(v) => {
            setShowCustom(false);
            onLocalidadChange(v);
          }}
          extraOption="Otra localidad..."
          onExtraOption={() => {
            setShowCustom(true);
            setCustomCiudad("");
            onLocalidadChange("");
          }}
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

import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (!ciudadEsConocida) {
      setCustomCiudad(localidad);
    }
  }, [localidad, ciudadEsConocida]);

  const handleProvinciaChange = (val: string) => {
    onProvinciaChange(val);
    onLocalidadChange("");
    setCustomCiudad("");
  };

  const handleCiudadSelectChange = (val: string) => {
    if (val === "__otra__") {
      onLocalidadChange("");
      setCustomCiudad("");
    } else {
      onLocalidadChange(val);
      setCustomCiudad("");
    }
  };

  const selectValue = ciudadEsConocida ? localidad : (localidad === "" && customCiudad === "" ? "" : "__otra__");

  const selectClass =
    "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="grid gap-2">
        <Label>Provincia</Label>
        <select
          className={selectClass}
          value={provincia || ""}
          onChange={(e) => handleProvinciaChange(e.target.value)}
          data-testid={testIdProvincia}
        >
          <option value="">Seleccionar...</option>
          {PROVINCIAS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      <div className="grid gap-2">
        <Label>Ciudad / Localidad</Label>
        {provincia ? (
          <>
            <select
              className={selectClass}
              value={selectValue}
              onChange={(e) => handleCiudadSelectChange(e.target.value)}
              data-testid={testIdLocalidad}
            >
              <option value="">Seleccionar...</option>
              {ciudades.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
              <option value="__otra__">Otra localidad...</option>
            </select>
            {selectValue === "__otra__" && (
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
          </>
        ) : (
          <Input
            placeholder="Seleccionar provincia primero"
            value={localidad}
            onChange={(e) => onLocalidadChange(e.target.value)}
            data-testid={testIdLocalidad}
            disabled={!provincia}
          />
        )}
      </div>
    </div>
  );
}

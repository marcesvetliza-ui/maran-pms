import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="grid gap-2">
        <Label>Provincia</Label>
        <Select value={provincia || ""} onValueChange={handleProvinciaChange}>
          <SelectTrigger data-testid={testIdProvincia}>
            <SelectValue placeholder="Seleccionar..." />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {PROVINCIAS.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label>Ciudad / Localidad</Label>
        {provincia ? (
          <>
            <Select value={selectValue} onValueChange={handleCiudadSelectChange}>
              <SelectTrigger data-testid={testIdLocalidad}>
                <SelectValue placeholder="Seleccionar..." />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {ciudades.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
                <SelectItem value="__otra__">Otra localidad...</SelectItem>
              </SelectContent>
            </Select>
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

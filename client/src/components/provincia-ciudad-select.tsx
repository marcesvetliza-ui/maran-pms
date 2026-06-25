import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PROVINCIAS, getCiudades } from "@/lib/argentina-geo";

interface ProvinciaCiudadSelectProps {
  provincia: string;
  localidad: string;
  onProvinciaChange: (value: string) => void;
  onLocalidadChange: (value: string) => void;
  testIdProvincia?: string;
  testIdLocalidad?: string;
}

const NONE = "__none__";
const OTRA = "__otra__";

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
    if (val === NONE) return;
    onProvinciaChange(val);
    onLocalidadChange("");
    setCustomCiudad("");
  };

  const handleCiudadSelectChange = (val: string) => {
    if (val === NONE) return;
    if (val === OTRA) {
      onLocalidadChange("");
      setCustomCiudad("");
    } else {
      onLocalidadChange(val);
      setCustomCiudad("");
    }
  };

  const selectValue = ciudadEsConocida
    ? localidad
    : localidad === "" && customCiudad === ""
    ? NONE
    : OTRA;

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="grid gap-2">
        <Label>Provincia</Label>
        <Select
          value={provincia || NONE}
          onValueChange={handleProvinciaChange}
        >
          <SelectTrigger data-testid={testIdProvincia}>
            <SelectValue placeholder="Seleccionar..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE} disabled>Seleccionar...</SelectItem>
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
            <Select
              value={selectValue}
              onValueChange={handleCiudadSelectChange}
            >
              <SelectTrigger data-testid={testIdLocalidad}>
                <SelectValue placeholder="Seleccionar..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE} disabled>Seleccionar...</SelectItem>
                {ciudades.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
                <SelectItem value={OTRA}>Otra localidad...</SelectItem>
              </SelectContent>
            </Select>
            {selectValue === OTRA && (
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

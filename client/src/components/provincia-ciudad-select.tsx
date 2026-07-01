import { useState, useEffect } from "react";
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

const OTRA_SENTINEL = "__otra__";

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
  const [showCustom, setShowCustom] = useState(!ciudadEsConocida && localidad !== "");
  const [customCiudad, setCustomCiudad] = useState(!ciudadEsConocida ? localidad : "");

  useEffect(() => {
    if (!ciudadEsConocida && localidad) {
      setCustomCiudad(localidad);
      setShowCustom(true);
    } else if (ciudadEsConocida) {
      setShowCustom(false);
    }
  }, [localidad, ciudadEsConocida]);

  const handleProvinciaChange = (v: string) => {
    onProvinciaChange(v);
    onLocalidadChange("");
    setShowCustom(false);
    setCustomCiudad("");
  };

  const handleLocalidadChange = (v: string) => {
    if (v === OTRA_SENTINEL) {
      setShowCustom(true);
      setCustomCiudad("");
      onLocalidadChange("");
    } else {
      setShowCustom(false);
      onLocalidadChange(v);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="grid gap-2">
        <Label>Provincia</Label>
        <Select value={provincia || "__empty__"} onValueChange={(v) => handleProvinciaChange(v === "__empty__" ? "" : v)}>
          <SelectTrigger data-testid={testIdProvincia}>
            <SelectValue placeholder="Seleccionar..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__empty__">Seleccionar...</SelectItem>
            {PROVINCIAS.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label>Ciudad / Localidad</Label>
        <Select
          value={ciudadEsConocida ? localidad : showCustom ? OTRA_SENTINEL : "__empty__"}
          onValueChange={handleLocalidadChange}
          disabled={!provincia}
        >
          <SelectTrigger data-testid={testIdLocalidad}>
            <SelectValue placeholder={!provincia ? "Seleccionar provincia primero" : "Seleccionar..."} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__empty__">Seleccionar...</SelectItem>
            {ciudades.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
            <SelectItem value={OTRA_SENTINEL}>Otra localidad...</SelectItem>
          </SelectContent>
        </Select>
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

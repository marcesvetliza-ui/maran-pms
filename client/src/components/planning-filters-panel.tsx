import { Search, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { PlanningCellStatus } from "@shared/schema";

export type PlanningFilter = {
  showEmpty: boolean;
  showOccupied: boolean;
  showReub: boolean;
  roomTypeIds: string[];
  floorFilter: string;
  statusFilter: PlanningCellStatus | "";
  guestSearch: string;
  compareRoom1: string;
  compareRoom2: string;
};

export const DEFAULT_PLANNING_FILTER: PlanningFilter = {
  showEmpty: true,
  showOccupied: true,
  showReub: true,
  roomTypeIds: [],
  floorFilter: "",
  statusFilter: "",
  guestSearch: "",
  compareRoom1: "",
  compareRoom2: "",
};

export function countActiveFilters(filters: PlanningFilter): number {
  return [
    filters.floorFilter,
    filters.roomTypeIds.length > 0,
    filters.statusFilter,
    !filters.showEmpty,
    !filters.showOccupied,
    !filters.showReub,
    filters.guestSearch,
    filters.compareRoom1,
    filters.compareRoom2,
  ].filter(Boolean).length;
}

interface PlanningFiltersPanelProps {
  filters: PlanningFilter;
  setFilters: (updater: (f: PlanningFilter) => PlanningFilter) => void;
  availableFloors: string[];
  availableRoomTypes: { id: string; name: string }[];
  onClose?: () => void;
}

export function PlanningFiltersPanel({
  filters,
  setFilters,
  availableFloors,
  availableRoomTypes,
  onClose,
}: PlanningFiltersPanelProps) {
  const activeCount = countActiveFilters(filters);
  const isCompareMode = !!(filters.compareRoom1 || filters.compareRoom2);

  return (
    <div className="flex flex-col gap-4 w-72">

      {/* Guest search */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Cliente / Alojado</Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar por nombre..."
            value={filters.guestSearch}
            onChange={e => setFilters(f => ({ ...f, guestSearch: e.target.value }))}
            className="pl-8 pr-8 h-8 text-sm"
            data-testid="filter-guest-search"
            autoFocus
          />
          {filters.guestSearch && (
            <button
              onClick={() => setFilters(f => ({ ...f, guestSearch: "" }))}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <Separator />

      {/* Compare rooms */}
      <div className="flex flex-col gap-2">
        <Label className="text-xs font-medium text-muted-foreground">Comparar habitaciones</Label>
        <p className="text-[10px] text-muted-foreground leading-tight -mt-1">
          Muestra solo esas habitaciones. Tocá REUB para mostrarlo/ocultarlo.
        </p>
        <div className="flex gap-2 items-center">
          {/* Room 1 */}
          <div className="relative flex-1">
            <Input
              placeholder="Hab. 1"
              value={filters.compareRoom1}
              onChange={e => setFilters(f => ({ ...f, compareRoom1: e.target.value.trim() }))}
              className="h-8 text-sm pr-6 text-center font-mono"
              data-testid="filter-compare-room1"
            />
            {filters.compareRoom1 && (
              <button
                onClick={() => setFilters(f => ({ ...f, compareRoom1: "" }))}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {/* Room 2 */}
          <div className="relative flex-1">
            <Input
              placeholder="Hab. 2"
              value={filters.compareRoom2}
              onChange={e => setFilters(f => ({ ...f, compareRoom2: e.target.value.trim() }))}
              className="h-8 text-sm pr-6 text-center font-mono"
              data-testid="filter-compare-room2"
            />
            {filters.compareRoom2 && (
              <button
                onClick={() => setFilters(f => ({ ...f, compareRoom2: "" }))}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {/* REUB toggle */}
          <button
            onClick={() => setFilters(f => ({ ...f, showReub: !f.showReub }))}
            title={filters.showReub ? "Ocultar fila REUB" : "Mostrar fila REUB"}
            data-testid="filter-toggle-reub"
            className={`flex-1 h-8 flex items-center justify-center rounded-md border-2 text-xs font-bold transition-colors select-none cursor-pointer ${
              filters.showReub
                ? "border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400"
                : "border-muted bg-muted/30 text-muted-foreground line-through"
            }`}
          >
            REUB
          </button>
        </div>
      </div>

      <Separator />

      {/* Room type — only when NOT in compare mode */}
      {!isCompareMode && availableRoomTypes.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Tipo de habitación</Label>
          <Select
            value={filters.roomTypeIds[0] || "__all__"}
            onValueChange={v => setFilters(f => ({ ...f, roomTypeIds: v === "__all__" ? [] : [v] }))}
          >
            <SelectTrigger className="h-8 text-sm" data-testid="filter-roomtype">
              <SelectValue placeholder="Todas las categorías" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas las categorías</SelectItem>
              {availableRoomTypes.filter(rt => rt.id).map(rt => (
                <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Floor — only when NOT in compare mode */}
      {!isCompareMode && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Piso</Label>
          <Select
            value={filters.floorFilter || "__all__"}
            onValueChange={v => setFilters(f => ({ ...f, floorFilter: v === "__all__" ? "" : v }))}
          >
            <SelectTrigger className="h-8 text-sm" data-testid="filter-floor">
              <SelectValue placeholder="Todos los pisos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos los pisos</SelectItem>
              {availableFloors.map(fl => (
                <SelectItem key={fl} value={fl}>Piso {fl}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Room status — only when NOT in compare mode */}
      {!isCompareMode && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Estado</Label>
          <Select
            value={filters.statusFilter || "__all__"}
            onValueChange={v => setFilters(f => ({ ...f, statusFilter: v === "__all__" ? "" : v as PlanningCellStatus }))}
          >
            <SelectTrigger className="h-8 text-sm" data-testid="filter-status">
              <SelectValue placeholder="Todos los estados" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos los estados</SelectItem>
              <SelectItem value="dirty">Sucias</SelectItem>
              <SelectItem value="cleaning">Limpias</SelectItem>
              <SelectItem value="checked_in">Ocupadas (in house)</SelectItem>
              <SelectItem value="available">Libres</SelectItem>
              <SelectItem value="booked">Reservadas</SelectItem>
              <SelectItem value="checkin_today">Check In hoy</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Show/hide toggles — only when NOT in compare mode */}
      {!isCompareMode && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Mostrar habitaciones</Label>
          <div className="flex gap-2">
            <button
              onClick={() => setFilters(f => ({ ...f, showOccupied: !f.showOccupied }))}
              className={`flex-1 text-sm py-1.5 rounded-md border transition-colors ${filters.showOccupied ? "bg-blue-100 dark:bg-blue-900/40 border-blue-300 text-blue-800 dark:text-blue-200 font-medium" : "bg-muted border-border text-muted-foreground line-through"}`}
              data-testid="filter-show-occupied"
            >
              Ocupadas
            </button>
            <button
              onClick={() => setFilters(f => ({ ...f, showEmpty: !f.showEmpty }))}
              className={`flex-1 text-sm py-1.5 rounded-md border transition-colors ${filters.showEmpty ? "bg-zinc-100 dark:bg-zinc-800 border-zinc-300 text-zinc-700 dark:text-zinc-300 font-medium" : "bg-muted border-border text-muted-foreground line-through"}`}
              data-testid="filter-show-empty"
            >
              Libres
            </button>
          </div>
        </div>
      )}

      {/* Compare mode info banner */}
      {isCompareMode && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 px-3 py-2">
          <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">Modo comparación activo</p>
          <p className="text-[10px] text-amber-600/80 dark:text-amber-500/80 mt-0.5">
            Los demás filtros se ignoran. Solo se muestran las habitaciones ingresadas y REUB.
          </p>
        </div>
      )}

      {/* Reset */}
      {activeCount > 0 && (
        <>
          <Separator />
          <button
            onClick={() => {
              setFilters(() => DEFAULT_PLANNING_FILTER);
              onClose?.();
            }}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 py-1 rounded-md hover:bg-muted transition-colors"
            data-testid="filter-reset"
          >
            <X className="h-3.5 w-3.5" />
            Limpiar todos los filtros
          </button>
        </>
      )}
    </div>
  );
}

import { SlidersHorizontal } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PLANNING_COLORS } from "@/lib/planning-utils";
import type { PlanningCellStatus } from "@shared/schema";

export type PlanningFilter = {
  showEmpty: boolean;
  showOccupied: boolean;
  roomTypeIds: string[];
  floorFilter: string;
  statusFilter: PlanningCellStatus | "";
};

export const DEFAULT_PLANNING_FILTER: PlanningFilter = {
  showEmpty: true,
  showOccupied: true,
  roomTypeIds: [],
  floorFilter: "",
  statusFilter: "",
};

interface PlanningFiltersPanelProps {
  filters: PlanningFilter;
  setFilters: (updater: (f: PlanningFilter) => PlanningFilter) => void;
  availableFloors: string[];
  availableRoomTypes: { id: string; name: string }[];
}

export function PlanningFiltersPanel({
  filters,
  setFilters,
  availableFloors,
  availableRoomTypes,
}: PlanningFiltersPanelProps) {
  const hasActiveFilters =
    filters.floorFilter ||
    filters.roomTypeIds.length > 0 ||
    filters.statusFilter ||
    !filters.showEmpty ||
    !filters.showOccupied;

  return (
    <div className="flex flex-wrap items-center gap-3 pt-1">
      <div className="flex items-center gap-1.5">
        <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Filtros:</span>
      </div>
      <button
        onClick={() => setFilters(f => ({ ...f, showOccupied: !f.showOccupied }))}
        className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${filters.showOccupied ? "bg-blue-100 dark:bg-blue-900/40 border-blue-300 text-blue-800 dark:text-blue-200" : "bg-muted border-border text-muted-foreground"}`}
        data-testid="filter-show-occupied"
      >
        Con reservas
      </button>
      <button
        onClick={() => setFilters(f => ({ ...f, showEmpty: !f.showEmpty }))}
        className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${filters.showEmpty ? "bg-zinc-100 dark:bg-zinc-800 border-zinc-300 text-zinc-700 dark:text-zinc-300" : "bg-muted border-border text-muted-foreground"}`}
        data-testid="filter-show-empty"
      >
        Sin reservas
      </button>
      <Select
        value={filters.floorFilter || "__all__"}
        onValueChange={v => setFilters(f => ({ ...f, floorFilter: v === "__all__" ? "" : v }))}
      >
        <SelectTrigger className="h-7 text-xs w-28" data-testid="filter-floor">
          <SelectValue placeholder="Piso" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Todos los pisos</SelectItem>
          {availableFloors.map(fl => (
            <SelectItem key={fl} value={fl}>Piso {fl}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {availableRoomTypes.length > 1 && (
        <Select
          value={filters.roomTypeIds[0] || "__all__"}
          onValueChange={v => setFilters(f => ({ ...f, roomTypeIds: v === "__all__" ? [] : [v] }))}
        >
          <SelectTrigger className="h-7 text-xs w-36" data-testid="filter-roomtype">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas las categorías</SelectItem>
            {availableRoomTypes.map(rt => (
              <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Select
        value={filters.statusFilter || "__all__"}
        onValueChange={v => setFilters(f => ({ ...f, statusFilter: v === "__all__" ? "" : v as PlanningCellStatus }))}
      >
        <SelectTrigger className="h-7 text-xs w-36" data-testid="filter-status">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Todos los estados</SelectItem>
          {(Object.keys(PLANNING_COLORS) as PlanningCellStatus[]).map(s => (
            <SelectItem key={s} value={s}>{PLANNING_COLORS[s].label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hasActiveFilters && (
        <button
          onClick={() => setFilters(() => DEFAULT_PLANNING_FILTER)}
          className="text-xs text-muted-foreground underline"
          data-testid="filter-reset"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}

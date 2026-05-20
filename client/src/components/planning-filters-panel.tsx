import { SlidersHorizontal, Search, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PLANNING_COLORS } from "@/lib/planning-utils";
import type { PlanningCellStatus } from "@shared/schema";

export type PlanningFilter = {
  showEmpty: boolean;
  showOccupied: boolean;
  roomTypeIds: string[];
  floorFilter: string;
  statusFilter: PlanningCellStatus | "";
  guestSearch: string;
  roomNumberSearch: string;
};

export const DEFAULT_PLANNING_FILTER: PlanningFilter = {
  showEmpty: true,
  showOccupied: true,
  roomTypeIds: [],
  floorFilter: "",
  statusFilter: "",
  guestSearch: "",
  roomNumberSearch: "",
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
  const activeCount = [
    filters.floorFilter,
    filters.roomTypeIds.length > 0,
    filters.statusFilter,
    !filters.showEmpty,
    !filters.showOccupied,
    filters.guestSearch,
    filters.roomNumberSearch,
  ].filter(Boolean).length;

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1 pb-0.5">

      {/* Label */}
      <div className="flex items-center gap-1.5 shrink-0">
        <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Filtrar:</span>
        {activeCount > 0 && (
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px] leading-none">
            {activeCount}
          </Badge>
        )}
      </div>

      {/* Guest search — most important */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Buscar huésped..."
          value={filters.guestSearch}
          onChange={e => setFilters(f => ({ ...f, guestSearch: e.target.value }))}
          className="h-7 pl-6 pr-6 text-xs w-44"
          data-testid="filter-guest-search"
        />
        {filters.guestSearch && (
          <button
            onClick={() => setFilters(f => ({ ...f, guestSearch: "" }))}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Room number search */}
      <div className="relative">
        <Input
          placeholder="Nro. hab."
          value={filters.roomNumberSearch}
          onChange={e => setFilters(f => ({ ...f, roomNumberSearch: e.target.value }))}
          className="h-7 text-xs w-24"
          data-testid="filter-room-number"
        />
        {filters.roomNumberSearch && (
          <button
            onClick={() => setFilters(f => ({ ...f, roomNumberSearch: "" }))}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Room type */}
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

      {/* Floor */}
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

      {/* Status */}
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

      {/* Toggle pills */}
      <button
        onClick={() => setFilters(f => ({ ...f, showOccupied: !f.showOccupied }))}
        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filters.showOccupied ? "bg-blue-100 dark:bg-blue-900/40 border-blue-300 text-blue-800 dark:text-blue-200" : "bg-muted border-border text-muted-foreground line-through opacity-60"}`}
        data-testid="filter-show-occupied"
      >
        Ocupadas
      </button>
      <button
        onClick={() => setFilters(f => ({ ...f, showEmpty: !f.showEmpty }))}
        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filters.showEmpty ? "bg-zinc-100 dark:bg-zinc-800 border-zinc-300 text-zinc-700 dark:text-zinc-300" : "bg-muted border-border text-muted-foreground line-through opacity-60"}`}
        data-testid="filter-show-empty"
      >
        Libres
      </button>

      {/* Reset */}
      {activeCount > 0 && (
        <button
          onClick={() => setFilters(() => DEFAULT_PLANNING_FILTER)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 underline"
          data-testid="filter-reset"
        >
          <X className="h-3 w-3" />
          Limpiar
        </button>
      )}
    </div>
  );
}

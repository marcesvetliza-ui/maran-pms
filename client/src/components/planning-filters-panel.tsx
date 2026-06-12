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

export function countActiveFilters(filters: PlanningFilter): number {
  return [
    filters.floorFilter,
    filters.roomTypeIds.length > 0,
    filters.statusFilter,
    !filters.showEmpty,
    !filters.showOccupied,
    filters.guestSearch,
    filters.roomNumberSearch,
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

      {/* Room number */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Número de habitación</Label>
        <div className="relative">
          <Input
            placeholder="Ej: 201, 305..."
            value={filters.roomNumberSearch}
            onChange={e => setFilters(f => ({ ...f, roomNumberSearch: e.target.value }))}
            className="h-8 text-sm pr-8"
            data-testid="filter-room-number"
          />
          {filters.roomNumberSearch && (
            <button
              onClick={() => setFilters(f => ({ ...f, roomNumberSearch: "" }))}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <Separator />

      {/* Room type */}
      {availableRoomTypes.length > 1 && (
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

      {/* Floor */}
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

      {/* Room status */}
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

      <Separator />

      {/* Show/hide toggles */}
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

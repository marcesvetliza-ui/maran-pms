import { useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reviewSources, reviewStates, type ReviewArea } from "@shared/reviews";
import {
  moveReviewDay,
  reviewDayLabel,
  type ReviewDayMode,
} from "@/lib/review-period";

export type InboxFilters = Record<string, string>;
const fieldClass =
  "box-border h-9 w-full min-w-0 max-w-full rounded-lg border border-input bg-background px-3 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const dateClass =
  fieldClass +
  " appearance-none [min-inline-size:0] [&::-webkit-date-and-time-value]:text-left";
function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={fieldClass + " text-foreground"}
      >
        {children}
      </select>
    </label>
  );
}
export function ReviewInboxControls({
  filters,
  from,
  to,
  today,
  mode,
  onMode,
  onDates,
  onChange,
  onClear,
  areas,
  options,
}: {
  filters: InboxFilters;
  from: string;
  to: string;
  today: string;
  mode: ReviewDayMode;
  onMode: (mode: ReviewDayMode) => void;
  onDates: (from: string, to: string) => void;
  onChange: (key: string, value: string) => void;
  onClear: () => void;
  areas: ReviewArea[];
  options: any;
}) {
  const [expanded, setExpanded] = useState(false);
  const active = Object.entries(filters).filter(
    ([key, value]) =>
      !["from", "to", "search", "sector", "sectorMode"].includes(key) &&
      (key === "source"
        ? value !== "survey"
        : key === "dateField"
          ? value !== "response"
          : Boolean(value)),
  ).length;
  const title =
    mode === "yesterday"
      ? "Recibidas ayer"
      : mode === "today"
        ? "Recibidas hoy"
        : from === to
          ? "Encuestas del día"
          : "Encuestas del período";
  return (
    <section
      className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm"
      aria-label="Filtros de encuestas"
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-4 px-4 py-4 lg:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight">{title}</h2>
            <p className="text-xs text-muted-foreground">
              {reviewDayLabel(from)}
              {to !== from && ` al ${reviewDayLabel(to)}`} · Fecha de respuesta,
              hora argentina
            </p>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div
            className="inline-flex h-9 shrink-0 items-center rounded-lg bg-muted p-1"
            aria-label="Días rápidos"
          >
            <Button
              size="sm"
              variant="ghost"
              className={
                "h-7 rounded-md px-3 text-xs " +
                (mode === "yesterday"
                  ? "bg-background text-primary shadow-sm"
                  : "text-muted-foreground")
              }
              aria-pressed={mode === "yesterday"}
              onClick={() => onMode("yesterday")}
            >
              Ayer
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={
                "h-7 rounded-md px-3 text-xs " +
                (mode === "today"
                  ? "bg-background text-primary shadow-sm"
                  : "text-muted-foreground")
              }
              aria-pressed={mode === "today"}
              onClick={() => onMode("today")}
            >
              Hoy
            </Button>
          </div>
          <div className="flex h-9 min-w-0 items-center gap-1 rounded-lg border bg-background px-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              aria-label="Día anterior"
              title="Día anterior"
              onClick={() => {
                const day = moveReviewDay(from, -1);
                onDates(day, day);
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input
              type="date"
              aria-label="Ver encuestas de otra fecha"
              max={today}
              value={from === to ? from : ""}
              onChange={(e) => {
                if (e.target.value) onDates(e.target.value, e.target.value);
              }}
              className={
                dateClass +
                " h-8 w-[150px] border-0 shadow-none focus-visible:ring-0"
              }
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              aria-label="Día siguiente"
              title="Día siguiente"
              disabled={from >= today}
              onClick={() => {
                const day = moveReviewDay(from, 1);
                onDates(day, day);
              }}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-3 border-t bg-muted/20 px-4 py-3 lg:px-5">
        <div className="relative min-w-0 flex-1 basis-64">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Buscar opiniones"
            placeholder="Buscar huésped o comentario…"
            value={filters.search}
            onChange={(e) => onChange("search", e.target.value)}
            className={fieldClass + " pl-9"}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9 shrink-0 gap-2 rounded-lg bg-background"
          aria-expanded={expanded}
          aria-controls="review-advanced-filters"
          onClick={() => setExpanded((v) => !v)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Más filtros
          {active > 0 && (
            <span className="rounded-full bg-primary/10 px-1.5 text-xs text-primary">
              {active}
            </span>
          )}
        </Button>
        {(active > 0 || filters.search) && (
          <Button
            size="sm"
            variant="ghost"
            className="h-9 gap-1.5 text-muted-foreground"
            onClick={onClear}
          >
            <X className="h-3.5 w-3.5" />
            Limpiar
          </Button>
        )}
      </div>
      {expanded && (
        <div
          id="review-advanced-filters"
          className="grid min-w-0 grid-cols-1 gap-4 border-t px-4 py-4 sm:grid-cols-2 xl:grid-cols-4 lg:px-5"
        >
          <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted-foreground">
            Desde
            <Input
              aria-label="Desde"
              type="date"
              max={today}
              value={from}
              className={dateClass}
              onChange={(e) => {
                if (e.target.value)
                  onDates(
                    e.target.value,
                    e.target.value > to ? e.target.value : to,
                  );
              }}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted-foreground">
            Hasta
            <Input
              aria-label="Hasta"
              type="date"
              max={today}
              value={to}
              className={dateClass}
              onChange={(e) => {
                if (e.target.value)
                  onDates(
                    e.target.value < from ? e.target.value : from,
                    e.target.value,
                  );
              }}
            />
          </label>
          <FilterSelect
            label="Tipo de encuesta"
            value={filters.surveyKind || ""}
            onChange={(v) => onChange("surveyKind", v)}
          >
            <option value="">Todas</option>
            <option value="personal">Vinculada a una estadía</option>
            <option value="generic">Enlace genérico</option>
          </FilterSelect>
          <FilterSelect
            label="Origen"
            value={filters.source}
            onChange={(v) => onChange("source", v)}
          >
            <option value="">Todas las opiniones</option>
            {Object.entries(reviewSources).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="Seguimiento"
            value={filters.status}
            onChange={(v) => onChange("status", v)}
          >
            <option value="">Todos los estados</option>
            {Object.entries(reviewStates).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="Área evaluada"
            value={filters.area}
            onChange={(v) => onChange("area", v)}
          >
            <option value="">Todas las áreas</option>
            {areas.map((a) => (
              <option key={a.key} value={a.key}>
                {a.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="Calificación general"
            value={filters.rating}
            onChange={(v) => onChange("rating", v)}
          >
            <option value="">Todas las calificaciones</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} de 5 estrellas
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="Área que interviene"
            value={filters.actionArea}
            onChange={(v) => onChange("actionArea", v)}
          >
            <option value="">Todas las áreas</option>
            {areas.map((a) => (
              <option key={a.key} value={a.key}>
                {a.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="Habitación"
            value={filters.room}
            onChange={(v) => onChange("room", v)}
          >
            <option value="">Todas las habitaciones</option>
            {options?.rooms?.map((r: any) => (
              <option key={r.number}>{r.number}</option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="Tipo de habitación"
            value={filters.roomType}
            onChange={(v) => onChange("roomType", v)}
          >
            <option value="">Todos los tipos</option>
            {options?.roomTypes?.map((r: any) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="Canal de la reserva"
            value={filters.channel}
            onChange={(v) => onChange("channel", v)}
          >
            <option value="">Todos los canales</option>
            {options?.channels?.map((r: any) => (
              <option key={r.source}>{r.source}</option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="Valoración"
            value={filters.sentiment}
            onChange={(v) => onChange("sentiment", v)}
          >
            <option value="">Todas</option>
            <option value="positive">Positiva</option>
            <option value="neutral">Neutra</option>
            <option value="negative">Negativa</option>
          </FilterSelect>
        </div>
      )}
    </section>
  );
}

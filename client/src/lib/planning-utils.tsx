import { Accessibility, Mountain, Sofa, Armchair, BedDouble, ArrowLeftRight, BedSingle, Droplets } from "lucide-react";
import type { PlanningCellStatus, ReservationSource } from "@shared/schema";
import { getLocalToday } from "@/lib/utils";

export function formatDate(dateStr: string) {
  const date = new Date(dateStr + "T12:00:00");
  return {
    dayName: date.toLocaleDateString("es-ES", { weekday: "short" }),
    dayNumber: date.getDate(),
    monthName: date.toLocaleDateString("es-ES", { month: "short" }),
    isToday: dateStr === getLocalToday(),
    isWeekend: date.getDay() === 0 || date.getDay() === 6,
  };
}

export function formatDateReadable(dateStr: string) {
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
}

export const PLANNING_COLORS: Record<PlanningCellStatus, { bg: string; text: string; label: string; border: string }> = {
  available:      { bg: "bg-white dark:bg-zinc-900",              text: "text-zinc-400",                          label: "Disponible",       border: "border-zinc-200 dark:border-zinc-700" },
  booked:         { bg: "bg-gray-200 dark:bg-gray-700/60",        text: "text-gray-700 dark:text-gray-300",       label: "Reservado",        border: "border-gray-300 dark:border-gray-600" },
  web_checkin:    { bg: "bg-teal-200 dark:bg-teal-800/70",        text: "text-teal-900 dark:text-teal-100",       label: "Pre Check-In",     border: "border-teal-400 dark:border-teal-500 border-2" },
  checkin_today:  { bg: "bg-gray-200 dark:bg-gray-700",           text: "text-gray-700 dark:text-gray-200",       label: "Check-in hoy",     border: "border-green-700 dark:border-green-500 border-2" },
  checked_in:     { bg: "bg-emerald-200 dark:bg-emerald-800",     text: "text-emerald-900 dark:text-emerald-100", label: "Ocupado",          border: "border-emerald-300 dark:border-emerald-600" },
  checkout_today: { bg: "bg-emerald-200 dark:bg-emerald-800",     text: "text-emerald-900 dark:text-emerald-100", label: "Check-out hoy",    border: "border-red-500 dark:border-red-400 border-2" },
  maintenance:    { bg: "bg-red-200 dark:bg-red-900/50",          text: "text-red-800 dark:text-red-200",         label: "Mantenimiento",    border: "border-red-300 dark:border-red-700" },
  cleaning:       { bg: "bg-yellow-100 dark:bg-yellow-900/40",    text: "text-yellow-800",                        label: "Limpieza",         border: "border-yellow-200 dark:border-yellow-700" },
  dirty:          { bg: "bg-orange-100 dark:bg-orange-900/40",    text: "text-orange-800",                        label: "Sucia",            border: "border-orange-200 dark:border-orange-700" },
  group_blocked:  { bg: "bg-violet-200 dark:bg-violet-800/50",    text: "text-violet-900 dark:text-violet-100",   label: "Grupo",            border: "border-violet-300 dark:border-violet-600" },
  early_blocked:  { bg: "bg-sky-100 dark:bg-sky-900/30",          text: "text-sky-800",                           label: "Early check-in",   border: "border-sky-200 dark:border-sky-700 border-dashed" },
  late_blocked:   { bg: "bg-pink-100 dark:bg-pink-900/30",        text: "text-pink-800",                          label: "Late check-out",   border: "border-pink-200 dark:border-pink-700 border-dashed" },
  inspected:      { bg: "bg-green-50 dark:bg-green-900/20",       text: "text-green-700",                         label: "Inspeccionada",    border: "border-green-200 dark:border-green-700" },
  checked_out:    { bg: "bg-zinc-100 dark:bg-zinc-800/40",        text: "text-zinc-400 dark:text-zinc-500",       label: "Check-out realizado", border: "border-zinc-200 dark:border-zinc-700 border-dashed" },
};

export function getStatusColor(status: PlanningCellStatus): string {
  const c = PLANNING_COLORS[status];
  if (!c) return "bg-muted border-border";
  return `${c.bg} ${c.border}`;
}

export function getStatusLabel(status: PlanningCellStatus): string {
  return PLANNING_COLORS[status]?.label ?? status;
}

export function getSourceColor(source: ReservationSource): string {
  if (["booking", "expedia", "airbnb", "despegar", "hotelbeds", "agoda", "ota"].includes(source)) {
    return "bg-indigo-200 dark:bg-indigo-800/60 border-indigo-300 dark:border-indigo-700";
  }
  if (["directo", "telefono", "web"].includes(source)) {
    return "bg-gray-200 dark:bg-gray-700/60 border-gray-300 dark:border-gray-600";
  }
  if (["empresa", "agencia"].includes(source)) {
    return "bg-sky-200 dark:bg-sky-800/60 border-sky-300 dark:border-sky-700";
  }
  return "bg-gray-200 dark:bg-gray-700/60 border-gray-300 dark:border-gray-600";
}

export function getSourceBg(source: ReservationSource): string {
  if (["booking", "expedia", "airbnb", "despegar", "hotelbeds", "agoda", "ota"].includes(source)) {
    return "bg-indigo-200 dark:bg-indigo-800/60";
  }
  if (["directo", "telefono", "web"].includes(source)) {
    return "bg-gray-200 dark:bg-gray-700/60";
  }
  if (["empresa", "agencia"].includes(source)) {
    return "bg-sky-200 dark:bg-sky-800/60";
  }
  return "bg-gray-200 dark:bg-gray-700/60";
}

export function getPlanningCellClasses(status: PlanningCellStatus, source: ReservationSource): string {
  switch (status) {
    case "checkin_today":
      return `${getSourceBg(source)} border-2 border-green-700 dark:border-green-500`;
    case "checked_in":
      return "bg-emerald-200 dark:bg-emerald-800 border border-emerald-300 dark:border-emerald-600";
    case "checkout_today":
      return "bg-emerald-200 dark:bg-emerald-800 border-2 border-red-500 dark:border-red-400";
    case "web_checkin":
      return "bg-teal-200 dark:bg-teal-800/70 border-2 border-teal-400 dark:border-teal-500";
    default:
      return `${getSourceColor(source)} border`;
  }
}

export function getGroupCellStyle(groupColor: string | undefined): React.CSSProperties {
  if (!groupColor) return {};
  const hex = groupColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.25)`,
    borderColor: `rgba(${r}, ${g}, ${b}, 0.7)`,
  };
}

export function getSourceLabel(source: ReservationSource): string {
  if (["booking", "expedia", "airbnb", "despegar", "hotelbeds", "agoda", "ota"].includes(source)) {
    return "OTA";
  }
  if (["directo", "telefono", "web"].includes(source)) {
    return "Directo";
  }
  if (["empresa", "agencia"].includes(source)) {
    return "Empresa";
  }
  return source;
}

export const featureIconMap: Record<string, { icon: typeof Accessibility; label: string }> = {
  accessible: { icon: Accessibility, label: "Accesible" },
  balcony: { icon: Mountain, label: "Balcón" },
  sofa_bed: { icon: Sofa, label: "Sofá cama" },
  living_room: { icon: Armchair, label: "Living" },
  twin_config: { icon: BedDouble, label: "Config. twin" },
  separable_bed: { icon: ArrowLeftRight, label: "Camas separables" },
  extra_bed: { icon: BedSingle, label: "Cama extra" },
  shower_only: { icon: Droplets, label: "Solo ducha" },
};

export const bedConfigLabels: Record<string, string> = {
  MAT: "Matrimonial",
  TWIN: "Twin",
  MAT_CC: "Matrimonial + Cama cucheta",
  TWIN_CC: "Twin + Cama cucheta",
  MAT_EXTRA: "Matrimonial + Extra",
  MAT_CC_EXTRA: "Matrimonial + CC + Extra",
};

export const ROOM_STATUS_OPTIONS: { value: string; label: string; dot: string }[] = [
  { value: "available",    label: "Libre limpia",    dot: "bg-green-500" },
  { value: "dirty",        label: "Libre sucia",     dot: "bg-orange-500" },
  { value: "cleaning",     label: "En limpieza",     dot: "bg-yellow-400" },
  { value: "inspected",    label: "Inspeccionada",   dot: "bg-blue-500" },
  { value: "maintenance",  label: "Mantenimiento",   dot: "bg-red-500" },
];

export function Legend({ activeStatuses }: { activeStatuses?: Set<PlanningCellStatus> }) {
  const allStatuses = Object.entries(PLANNING_COLORS) as [PlanningCellStatus, typeof PLANNING_COLORS[PlanningCellStatus]][];
  const visibleStatuses = allStatuses.filter(([status]) =>
    !activeStatuses || activeStatuses.has(status) || status === "available"
  );

  const sourceItems: { source: ReservationSource; label: string }[] = [
    { source: "directo", label: "Directo (tel / web / presencial)" },
    { source: "booking", label: "OTAs (Booking, Expedia, Airbnb, etc.)" },
    { source: "empresa", label: "Empresa / Agencia" },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground">Estado:</span>
        {visibleStatuses
          .filter(([s]) => !["checkin_today", "checkout_today", "booked"].includes(s))
          .map(([status, c]) => (
            <div key={status} className="flex items-center gap-1.5">
              <div className={`w-4 h-4 rounded border ${c.bg} ${c.border}`} />
              <span className="text-xs text-muted-foreground">{c.label}</span>
            </div>
          ))}
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-gray-200 dark:bg-gray-700 border-2 border-green-700 dark:border-green-500" />
          <span className="text-xs text-muted-foreground">Check-in hoy</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-emerald-200 dark:bg-emerald-800 border-2 border-red-500 dark:border-red-400" />
          <span className="text-xs text-muted-foreground">Check-out hoy</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground">Origen (reservado):</span>
        {sourceItems.map(({ source, label }) => (
          <div key={source} className="flex items-center gap-1.5">
            <div className={`w-4 h-4 rounded border ${getSourceColor(source)}`} />
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs text-muted-foreground italic">
          El check-in hoy conserva el color de origen con borde verde · Los grupos muestran su color asignado
        </span>
      </div>
    </div>
  );
}

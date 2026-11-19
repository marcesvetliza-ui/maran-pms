import { surveySectors } from "@shared/survey-sectors";
import {
  Eye,
  ChevronRight,
  Star,
  Inbox,
  Phone,
  MessageSquare,
  CheckCircle2,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  reviewStates,
  type ReviewArea,
  type ReviewItem,
} from "@shared/reviews";
import { formatDisplayDate } from "@shared/date-display";

function Score({
  value,
  label,
  general = false,
}: {
  value: number | null | undefined;
  label: string;
  general?: boolean;
}) {
  if (value == null)
    return (
      <span
        className="text-muted-foreground/50"
        title="Sin evaluar"
        aria-label={`${label}: sin evaluar`}
      >
        —
      </span>
    );
  return (
    <span
      aria-label={`${label}: ${value} de 5`}
      className={
        "inline-flex h-7 min-w-8 items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold tabular-nums " +
        (value <= 2
          ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
          : general
            ? "bg-primary/10 text-primary"
            : "bg-muted/70 text-foreground")
      }
    >
      {general && <Star className="h-3 w-3 fill-current" />}
      {value}
    </span>
  );
}
export function ReviewInboxTable({
  items,
  areas,
  total,
  page,
  loading,
  error,
  stats,
  onView,
  onComment,
  onPage,
  onRetry,
  onToday,
  showToday,
  dateRange,
  compact = false,
  restrictToAreas = false,
}: {
  items: ReviewItem[];
  areas: ReviewArea[];
  total: number;
  page: number;
  loading: boolean;
  error: boolean;
  stats: any;
  onView: (id: string) => void;
  onComment: (r: ReviewItem) => void;
  onPage: (page: number) => void;
  onRetry: () => void;
  onToday: () => void;
  showToday: boolean;
  dateRange: boolean;
  compact?: boolean;
  restrictToAreas?: boolean;
}) {
  const keys = new Set(
    compact
      ? []
      : items
          .flatMap((r) => Object.keys(r.areaRatings))
          .filter(
            (key) => !restrictToAreas || areas.some((a) => a.key === key),
          ),
  );
  const columns = (compact ? [] : areas)
    .filter((a) => (a.active && a.inSurvey) || keys.has(a.key))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));
  for (const key of keys)
    if (!columns.some((a) => a.key === key))
      columns.push({
        key,
        name: key,
        question: key,
        active: false,
        inSurvey: false,
        sortOrder: 999,
        notificationArea: "reception",
      });
  return (
    <section
      className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm"
      aria-label="Encuestas recibidas"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b px-5 py-4">
        <div>
          <h2 className="text-base font-semibold">
            Respuestas de los huéspedes{" "}
            <span className="ml-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {total}
            </span>
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Puntajes en el orden de la encuesta. Abrí el ojo para leer un
            comentario.
          </p>
        </div>
        <div className="flex items-center gap-5 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5 text-amber-500" />
            <span>
              Promedio{" "}
              <strong className="ml-1 text-sm font-semibold text-foreground">
                {stats?.average == null
                  ? "—"
                  : Number(stats.average).toLocaleString("es-AR", {
                      maximumFractionDigits: 2,
                    })}
                <span className="text-xs font-normal text-muted-foreground">
                  {" "}
                  / 5
                </span>
              </strong>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            <span>
              <strong className="mr-1 font-semibold text-foreground">
                {stats?.pending ?? 0}
              </strong>
              por revisar
            </span>
          </div>
        </div>
      </div>
      {loading ? (
        <div className="p-12 text-center text-sm text-muted-foreground">
          Cargando encuestas…
        </div>
      ) : error ? (
        <div className="p-10 text-center">
          <p role="alert" className="text-sm">
            No se pudieron cargar las encuestas.
          </p>
          <Button variant="outline" className="mt-3" onClick={onRetry}>
            Reintentar
          </Button>
        </div>
      ) : !items.length ? (
        <div className="flex flex-col items-center px-6 py-14 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/5 text-primary/70">
            <Inbox className="h-7 w-7" />
          </div>
          <h3 className="text-base font-medium">
            No hay encuestas en este período
          </h3>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Las respuestas aparecerán acá cuando lleguen. Podés cambiar el día o
            revisar los filtros.
          </p>
          {showToday && (
            <Button
              variant="outline"
              className="mt-5 gap-2 rounded-lg"
              onClick={onToday}
            >
              Ver las de hoy
              <ArrowUpRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      ) : (
        <>
          <div
            className="max-w-full overflow-x-auto overscroll-x-contain"
            tabIndex={0}
            aria-label="Tabla de puntajes por encuesta"
          >
            <table
              className="w-full border-collapse text-sm"
              style={{ minWidth: Math.max(960, 430 + columns.length * 75) }}
            >
              <caption className="sr-only">
                Huésped, calificación general, puntajes por área, recomendación
                y comentarios.
              </caption>
              <thead className="border-b bg-muted/40">
                <tr>
                  <th
                    scope="col"
                    className="w-60 px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    Huésped / estadía
                  </th>
                  <th
                    scope="col"
                    className="px-2 py-3 text-center text-xs font-semibold"
                  >
                    General
                  </th>
                  {columns.map((a) => (
                    <th
                      key={a.key}
                      scope="col"
                      className="max-w-24 break-words px-2 py-3 text-center text-[11px] font-medium text-muted-foreground"
                      title={a.question}
                    >
                      {a.name}
                    </th>
                  ))}
                  <th
                    scope="col"
                    className="px-2 py-3 text-center text-[11px] font-medium text-muted-foreground"
                  >
                    Recomienda<span className="block font-normal">0 a 10</span>
                  </th>
                  <th
                    scope="col"
                    className="px-2 py-3 text-center text-[11px] font-medium text-muted-foreground"
                  >
                    Comentario
                  </th>
                  <th scope="col" className="w-10">
                    <span className="sr-only">Detalle</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((r) => (
                  <tr
                    key={r.id}
                    className="transition-colors hover:bg-muted/25"
                  >
                    <td className="px-5 py-4">
                      <div className="flex max-w-[220px] items-center gap-2">
                        <span
                          className="truncate text-[13px] font-semibold"
                          title={r.guestName}
                        >
                          {r.guestName}
                        </span>
                        {r.contactRequested && (
                          <Phone
                            className="h-3.5 w-3.5 shrink-0 text-primary"
                            aria-label="Solicitó contacto"
                          />
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {r.surveyKind === "generic"
                          ? `Visita: ${formatDisplayDate(r.visitDate)}`
                          : r.roomNumber
                            ? `Hab. ${r.roomNumber}`
                            : "Sin habitación"}
                        {r.sector && ` · ${surveySectors[r.sector]}`}
                        {r.surveyKind === "generic" && " · Genérica"}
                        {r.checkIn &&
                          ` · ${formatDisplayDate(r.checkIn)}–${formatDisplayDate(r.checkOut)}`}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2 text-[10px]">
                        {r.followupStatus === "resolved" ? (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <CheckCircle2 className="h-3 w-3" />
                            Resuelto
                          </span>
                        ) : (
                          <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                            {reviewStates[r.followupStatus]}
                          </span>
                        )}
                        {dateRange && (
                          <span className="text-muted-foreground">
                            Recibida {formatDisplayDate(r.reviewDate)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-4 text-center">
                      <Score value={r.rating} label="General" general />
                    </td>
                    {columns.map((a) => (
                      <td key={a.key} className="px-2 py-4 text-center">
                        <Score value={r.areaRatings[a.key]} label={a.name} />
                      </td>
                    ))}
                    <td className="px-2 py-4 text-center font-medium tabular-nums">
                      {r.nps == null ? (
                        <span className="text-muted-foreground/50">—</span>
                      ) : (
                        r.nps
                      )}
                    </td>
                    <td className="px-2 py-4 text-center">
                      {r.content.trim() ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 rounded-lg text-primary hover:bg-primary/10"
                          aria-label={`Ver comentario de ${r.guestName}`}
                          title="Leer comentario"
                          onClick={() => onComment(r)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      ) : (
                        <span
                          className="text-muted-foreground/40"
                          aria-label="Sin comentario"
                        >
                          —
                        </span>
                      )}
                    </td>
                    <td className="py-4 pl-1 pr-3">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 rounded-lg text-muted-foreground"
                        aria-label={`Ver encuesta de ${r.guestName}`}
                        title="Ver encuesta y seguimiento"
                        onClick={() => onView(r.id)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/10 px-5 py-3">
            <p className="text-[11px] text-muted-foreground">
              {compact
                ? "Elegí un sector para comparar puntajes por área."
                : "— Sin evaluar · Escala de 1 a 5 por área"}
            </p>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {(page - 1) * 50 + 1}–{Math.min(page * 50, total)} de {total}
              </span>
              {total > 50 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => onPage(page - 1)}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page * 50 >= total}
                    onClick={() => onPage(page + 1)}
                  >
                    Siguiente
                  </Button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
export function ReviewComment({
  review,
  onClose,
  onDetail,
}: {
  review: ReviewItem;
  onClose: () => void;
  onDetail: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-lg overflow-hidden rounded-2xl p-0">
        <div className="border-b bg-muted/20 px-6 py-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Eye className="h-5 w-5 text-primary" />
              Comentario del huésped
            </DialogTitle>
            <DialogDescription>
              {review.guestName}
              {review.roomNumber && ` · Hab. ${review.roomNumber}`} ·{" "}
              {formatDisplayDate(review.reviewDate)}
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="px-6 py-5">
          <blockquote className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap break-words text-[15px] leading-relaxed">
            {review.content}
          </blockquote>
          <div className="mt-6 flex items-center justify-between gap-3 border-t pt-4">
            <span className="text-xs text-muted-foreground">
              Calificación general:{" "}
              <strong className="text-foreground">{review.rating}/5</strong>
            </span>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-lg"
              onClick={onDetail}
            >
              Ver encuesta completa
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

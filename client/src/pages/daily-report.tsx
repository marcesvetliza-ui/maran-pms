import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, RefreshCw, LogOut, LogIn, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getArgentinaToday } from "@/lib/date-utils";
import { formatHotelDateTime } from "@/lib/hotelTime";

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  if (!d) return "-";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function fmtMoney(n: number | null | undefined) {
  if (n == null) return "-";
  return `$${n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtDateLong(d: string) {
  if (!d) return "";
  const date = new Date(d + "T12:00:00");
  return date.toLocaleDateString("es-AR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

// ── Types ────────────────────────────────────────────────────────────────────

interface CheckOut {
  reservationId: string;
  reservationCode: string | null;
  roomNumber: string;
  roomTypeName: string | null;
  guestName: string;
  guestPhone: string | null;
  checkInDate: string;
  checkOutDate: string;
  nightsStayed: number;
  nights: number;
  finalRatePerNight: number | null;
  totalRoomAmount: number | null;
  folioBalance: number;
  bedTypeNotes: string | null;
  lateCheckOut: boolean;
  lateCheckOutTime: string | null;
  notes: string | null;
  numberOfGuests: number;
}

interface CheckIn {
  reservationId: string;
  reservationCode: string | null;
  roomNumber: string;
  floor: string | null;
  roomTypeName: string | null;
  guestName: string;
  guestPhone: string | null;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  finalRatePerNight: number | null;
  totalRoomAmount: number | null;
  bedTypeNotes: string | null;
  earlyCheckIn: boolean;
  earlyCheckInTime: string | null;
  numberOfGuests: number;
  notes: string | null;
  source: string | null;
  status: string;
}

interface DailyReport {
  date: string;
  checkOuts: CheckOut[];
  checkIns: CheckIn[];
}

// ── Print stylesheet ─────────────────────────────────────────────────────────
const PRINT_STYLE = `
@page {
  size: A4 portrait;
  margin: 10mm 8mm;
}
@media print {
  /* Ocultar chrome de la app */
  [data-sidebar], nav, header, aside, [data-no-print],
  .no-print { display: none !important; }
  body { background: white !important; color: black !important; margin: 0; padding: 0; font-family: Arial, sans-serif; }

  .print-container {
    padding: 0 !important;
    max-width: 100% !important;
    margin: 0 !important;
    min-height: unset !important;
  }

  /* ── Tabla ultra-compacta ── */
  table {
    font-size: 7.5pt;
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  th {
    background: #d0d0d0 !important;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
    font-size: 6.5pt;
    font-weight: 700;
    text-transform: uppercase;
    padding: 2px 4px !important;
    white-space: nowrap;
    border: 0.5px solid #aaa;
  }
  td {
    padding: 2px 4px !important;
    font-size: 7.5pt;
    vertical-align: middle;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border: 0.5px solid #ccc;
    line-height: 1.25;
  }
  tr { page-break-inside: avoid; }
  tbody tr:nth-child(even) {
    background: #f4f4f4 !important;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }

  /* Highlight filas con saldo */
  .row-pending {
    background: #fff3cd !important;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }

  /* Colores de saldo */
  .saldo-pending { color: #b91c1c !important; font-weight: 700; }
  .saldo-ok      { color: #15803d !important; }
  .saldo-credit  { color: #1d4ed8 !important; }

  /* Badge de sección */
  .section-badge {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
    border-radius: 2px !important;
    padding: 1px 6px !important;
    font-size: 8pt !important;
    font-weight: 700;
  }
  .section-badge-red  { background: #dc2626 !important; color: white !important; }
  .section-badge-green{ background: #16a34a !important; color: white !important; }

  /* Espaciado entre secciones */
  .section-gap { margin-top: 8mm !important; }

  /* Ancho de columnas fijo */
  .col-hab   { width: 28px;  }
  .col-guest { width: auto;  }
  .col-tipo  { width: 80px;  }
  .col-n     { width: 24px;  text-align: center; }
  .col-fecha { width: 44px;  }
  .col-rate  { width: 80px;  text-align: right; }
  .col-saldo { width: 70px;  text-align: right; }
  .col-orig  { width: 48px;  }

  /* Header del documento */
  .doc-header { border-bottom: 1.5px solid black; padding-bottom: 3mm; margin-bottom: 3mm; }
}
`;

// ── Component ────────────────────────────────────────────────────────────────

export default function DailyReportPage() {
  const [date, setDate] = useState(getArgentinaToday());

  const { data, isLoading, refetch, isRefetching } = useQuery<DailyReport>({
    queryKey: ["/api/daily-report", date],
    queryFn: async () => {
      const res = await fetch(`/api/daily-report?date=${date}`, { credentials: "include" });
      if (!res.ok) throw new Error("Error al cargar planilla");
      return res.json();
    },
  });

  const handlePrint = () => window.print();

  const sourceLabel: Record<string, string> = {
    direct: "Directa", directo: "Directa",
    phone: "Tel.", telefono: "Tel.",
    email: "Email",
    walk_in: "Walk-in",
    booking: "Booking",
    expedia: "Expedia",
    airbnb: "Airbnb",
    despegar: "Despegar",
    empresa: "Empresa",
    agencia: "Agencia",
    web: "Web",
    other: "Otro",
  };

  const checkOuts = data?.checkOuts ?? [];
  const checkIns  = data?.checkIns  ?? [];

  // ── Rate compacta (una línea) ────────────────────────────────────────────
  function rateCompact(ratePerNight: number | null, total: number | null) {
    if (ratePerNight == null) return <span className="text-gray-400">-</span>;
    return (
      <span>
        {fmtMoney(ratePerNight)}<span className="text-gray-400">/n</span>
        {total != null && <> · {fmtMoney(total)}</>}
      </span>
    );
  }

  // ── Nombre + info en una línea para impresión ────────────────────────────
  function guestLine(name: string, phone: string | null, pax: number, extra?: React.ReactNode) {
    const parts: string[] = [name];
    if (phone) parts.push(phone);
    if (pax > 1) parts.push(`${pax}pax`);
    return (
      <>
        <span className="font-medium">{parts.join(" · ")}</span>
        {extra && <span className="ml-1">{extra}</span>}
      </>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLE }} />

      <div className="print-container min-h-screen bg-background p-4 md:p-6 max-w-[1100px] mx-auto">

        {/* ── Toolbar (oculto al imprimir) ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 no-print" data-no-print>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Planilla Operativa Diaria</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Check-outs y check-ins del día</p>
          </div>
          <div className="flex items-center gap-2">
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-40 h-9" />
            <Button variant="outline" size="sm" onClick={() => setDate(getArgentinaToday())}>Hoy</Button>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => refetch()}>
              <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
            </Button>
            <Button size="sm" onClick={handlePrint} className="gap-1.5">
              <Printer className="h-4 w-4" />
              Imprimir
            </Button>
          </div>
        </div>

        {/* ── Encabezado del documento (solo al imprimir) ── */}
        <div className="hidden print:block doc-header">
          <div className="flex items-start justify-between">
            <div>
              <p style={{ fontSize: "11pt", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Maran Suites &amp; Towers
              </p>
              <p style={{ fontSize: "7.5pt", color: "#555" }}>Alameda de la Federación 698, Paraná, Entre Ríos</p>
            </div>
            <div className="text-right">
              <p style={{ fontSize: "10pt", fontWeight: "bold" }}>PLANILLA OPERATIVA DIARIA</p>
              <p style={{ fontSize: "8.5pt", textTransform: "capitalize" }}>{fmtDateLong(date)}</p>
              <p style={{ fontSize: "7pt", color: "#555" }}>Impreso: {formatHotelDateTime(new Date())}</p>
            </div>
          </div>
        </div>

        {/* ── Chips resumen (solo pantalla) ── */}
        {!isLoading && (
          <div className="flex gap-3 mb-5 flex-wrap no-print" data-no-print>
            <div className="flex items-center gap-2 rounded-lg border px-3 py-2 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900">
              <LogOut className="h-4 w-4 text-red-600 dark:text-red-400" />
              <span className="text-sm font-semibold text-red-700 dark:text-red-300">{checkOuts.length} salida{checkOuts.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border px-3 py-2 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900">
              <LogIn className="h-4 w-4 text-green-600 dark:text-green-400" />
              <span className="text-sm font-semibold text-green-700 dark:text-green-300">{checkIns.length} entrada{checkIns.length !== 1 ? "s" : ""}</span>
            </div>
            {checkOuts.some(c => c.folioBalance > 0.5) && (
              <div className="flex items-center gap-2 rounded-lg border px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                  {checkOuts.filter(c => c.folioBalance > 0.5).length} con saldo pendiente
                </span>
              </div>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : (
          <>
            {/* ════════════════════════════════════════
                SECCIÓN 1: CHECK-OUTS
            ════════════════════════════════════════ */}
            <div className="mb-8">
              {/* Título de sección */}
              <div className="flex items-center gap-2 mb-2">
                <span className="section-badge section-badge-red bg-red-600 text-white rounded px-3 py-1 font-bold text-sm uppercase tracking-wide">
                  <LogOut className="inline h-3.5 w-3.5 mr-1 print:hidden" />
                  Salidas del día — {fmtDate(date)}
                </span>
                <span className="text-sm text-muted-foreground">{checkOuts.length} habitacion{checkOuts.length !== 1 ? "es" : ""}</span>
              </div>

              {checkOuts.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
                  Sin check-outs programados para esta fecha
                </div>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <colgroup>
                      <col className="col-hab" style={{ width: 36 }} />
                      <col className="col-guest" />
                      <col className="col-tipo" style={{ width: 90 }} />
                      <col className="col-n" style={{ width: 30 }} />
                      <col className="col-fecha" style={{ width: 52 }} />
                      <col className="col-rate" style={{ width: 120 }} />
                      <col className="col-saldo" style={{ width: 80 }} />
                    </colgroup>
                    <thead>
                      <tr className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="text-left px-2 py-1.5 font-semibold">HAB.</th>
                        <th className="text-left px-2 py-1.5 font-semibold">HUÉSPED</th>
                        <th className="text-left px-2 py-1.5 font-semibold">TIPO / CAMAJE</th>
                        <th className="text-center px-2 py-1.5 font-semibold">N</th>
                        <th className="text-left px-2 py-1.5 font-semibold">CI</th>
                        <th className="text-right px-2 py-1.5 font-semibold">TARIFA · TOTAL</th>
                        <th className="text-right px-2 py-1.5 font-semibold">SALDO</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {checkOuts.map((co) => (
                        <tr
                          key={co.reservationId}
                          className={co.folioBalance > 0.5 ? "row-pending bg-amber-50 dark:bg-amber-950/20" : "hover:bg-muted/30"}
                        >
                          <td className="px-2 py-1 font-bold text-sm col-hab">{co.roomNumber}</td>
                          <td className="px-2 py-1 col-guest max-w-0">
                            {/* Pantalla: apilado; Impresión: una línea via CSS */}
                            <div className="font-medium leading-tight">{co.guestName}</div>
                            <div className="text-xs text-muted-foreground leading-tight print:hidden">
                              {[co.guestPhone, co.numberOfGuests > 1 ? `${co.numberOfGuests} pax` : null]
                                .filter(Boolean).join(" · ")}
                              {co.lateCheckOut && (
                                <span className="ml-1 text-amber-700 dark:text-amber-400">
                                  · LATE {co.lateCheckOutTime || ""}
                                </span>
                              )}
                            </div>
                            {/* Solo impresión: todo en una línea */}
                            <div className="hidden print:block text-xs text-gray-500 leading-none">
                              {[
                                co.guestPhone,
                                co.numberOfGuests > 1 ? `${co.numberOfGuests} pax` : null,
                                co.lateCheckOut ? `LATE ${co.lateCheckOutTime || ""}` : null,
                              ].filter(Boolean).join(" · ")}
                            </div>
                          </td>
                          <td className="px-2 py-1 col-tipo text-xs">
                            {co.roomTypeName || ""}
                            {co.bedTypeNotes && <span className="text-muted-foreground"> · {co.bedTypeNotes}</span>}
                          </td>
                          <td className="px-2 py-1 col-n text-center tabular-nums">{co.nightsStayed || co.nights}</td>
                          <td className="px-2 py-1 col-fecha text-xs text-muted-foreground whitespace-nowrap">{fmtDate(co.checkInDate)}</td>
                          <td className="px-2 py-1 col-rate text-right tabular-nums text-xs whitespace-nowrap">
                            {rateCompact(co.finalRatePerNight, co.totalRoomAmount)}
                          </td>
                          <td className="px-2 py-1 col-saldo text-right tabular-nums font-semibold whitespace-nowrap">
                            {co.folioBalance > 0.5 ? (
                              <span className="saldo-pending text-red-600 dark:text-red-400">{fmtMoney(co.folioBalance)}</span>
                            ) : co.folioBalance < -0.5 ? (
                              <span className="saldo-credit text-blue-600 dark:text-blue-400">{fmtMoney(co.folioBalance)}</span>
                            ) : (
                              <span className="saldo-ok text-green-600 dark:text-green-400">✓ Saldado</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {/* Totales */}
                    {checkOuts.length > 0 && (
                      <tfoot>
                        <tr className="bg-muted/40 font-semibold text-xs">
                          <td colSpan={5} className="px-2 py-1 text-right text-muted-foreground uppercase tracking-wide">Totales</td>
                          <td className="px-2 py-1 text-right tabular-nums">
                            {fmtMoney(checkOuts.reduce((s, c) => s + (c.totalRoomAmount ?? 0), 0))}
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums">
                            {(() => {
                              const total = checkOuts.reduce((s, c) => s + c.folioBalance, 0);
                              return total > 0.5
                                ? <span className="saldo-pending text-red-600">{fmtMoney(total)}</span>
                                : <span className="saldo-ok text-green-600">✓</span>;
                            })()}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </div>

            {/* ════════════════════════════════════════
                SECCIÓN 2: CHECK-INS
            ════════════════════════════════════════ */}
            <div className="section-gap">
              <div className="flex items-center gap-2 mb-2">
                <span className="section-badge section-badge-green bg-green-600 text-white rounded px-3 py-1 font-bold text-sm uppercase tracking-wide">
                  <LogIn className="inline h-3.5 w-3.5 mr-1 print:hidden" />
                  Entradas del día — {fmtDate(date)}
                </span>
                <span className="text-sm text-muted-foreground">{checkIns.length} habitacion{checkIns.length !== 1 ? "es" : ""}</span>
              </div>

              {checkIns.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
                  Sin check-ins programados para esta fecha
                </div>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <colgroup>
                      <col style={{ width: 36 }} />
                      <col />
                      <col style={{ width: 90 }} />
                      <col style={{ width: 30 }} />
                      <col style={{ width: 52 }} />
                      <col style={{ width: 120 }} />
                      <col style={{ width: 48 }} />
                    </colgroup>
                    <thead>
                      <tr className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="text-left px-2 py-1.5 font-semibold">HAB.</th>
                        <th className="text-left px-2 py-1.5 font-semibold">HUÉSPED</th>
                        <th className="text-left px-2 py-1.5 font-semibold">TIPO / CAMAJE</th>
                        <th className="text-center px-2 py-1.5 font-semibold">N</th>
                        <th className="text-left px-2 py-1.5 font-semibold">CO</th>
                        <th className="text-right px-2 py-1.5 font-semibold">TARIFA · TOTAL</th>
                        <th className="text-left px-2 py-1.5 font-semibold">ORIGEN</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {checkIns.map((ci) => (
                        <tr key={ci.reservationId} className="hover:bg-muted/30">
                          <td className="px-2 py-1 font-bold text-sm">{ci.roomNumber}</td>
                          <td className="px-2 py-1 max-w-0">
                            <div className="font-medium leading-tight">{ci.guestName}</div>
                            <div className="text-xs text-muted-foreground leading-tight print:hidden">
                              {[
                                ci.guestPhone,
                                ci.numberOfGuests > 1 ? `${ci.numberOfGuests} pax` : null,
                                ci.earlyCheckIn ? `EARLY ${ci.earlyCheckInTime || ""}` : null,
                              ].filter(Boolean).join(" · ")}
                              {ci.status === "web_checkin" && (
                                <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0 border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300">
                                  Web CI
                                </Badge>
                              )}
                            </div>
                            {/* Solo impresión */}
                            <div className="hidden print:block text-xs text-gray-500 leading-none">
                              {[
                                ci.guestPhone,
                                ci.numberOfGuests > 1 ? `${ci.numberOfGuests} pax` : null,
                                ci.earlyCheckIn ? `EARLY ${ci.earlyCheckInTime || ""}` : null,
                              ].filter(Boolean).join(" · ")}
                            </div>
                          </td>
                          <td className="px-2 py-1 text-xs">
                            {ci.roomTypeName || ""}
                            {ci.bedTypeNotes && <span className="text-muted-foreground"> · {ci.bedTypeNotes}</span>}
                          </td>
                          <td className="px-2 py-1 text-center tabular-nums">{ci.nights}</td>
                          <td className="px-2 py-1 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(ci.checkOutDate)}</td>
                          <td className="px-2 py-1 text-right tabular-nums text-xs whitespace-nowrap">
                            {rateCompact(ci.finalRatePerNight, ci.totalRoomAmount)}
                          </td>
                          <td className="px-2 py-1 text-xs text-muted-foreground">
                            {ci.source ? (sourceLabel[ci.source] || ci.source) : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {checkIns.length > 0 && (
                      <tfoot>
                        <tr className="bg-muted/40 font-semibold text-xs">
                          <td colSpan={5} className="px-2 py-1 text-right text-muted-foreground uppercase tracking-wide">Totales</td>
                          <td className="px-2 py-1 text-right tabular-nums">
                            {fmtMoney(checkIns.reduce((s, c) => s + (c.totalRoomAmount ?? 0), 0))}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </div>

            {/* ── Pie de página impresión ── */}
            <div className="hidden print:block mt-6 pt-3 border-t border-gray-300 text-center text-gray-400" style={{ fontSize: "6.5pt" }}>
              Planilla Operativa Diaria — Maran Suites &amp; Towers · Generado el {formatHotelDateTime(new Date())}
            </div>
          </>
        )}
      </div>
    </>
  );
}

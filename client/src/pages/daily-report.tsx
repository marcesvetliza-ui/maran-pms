import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, RefreshCw, LogOut, LogIn, Clock, AlertCircle, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// ── Helpers ─────────────────────────────────────────────────────────────────

function getArgentinaToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}

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

// ── Print stylesheet injected into document ──────────────────────────────────
const PRINT_STYLE = `
@media print {
  [data-sidebar], nav, header, aside, [data-no-print], .print\\:hidden { display: none !important; }
  body { background: white !important; color: black !important; font-size: 11pt; }
  .print-container { padding: 0 !important; }
  table { font-size: 9pt; width: 100%; border-collapse: collapse; }
  th { background: #f0f0f0 !important; font-size: 8pt; text-transform: uppercase; }
  tr { page-break-inside: avoid; }
  .section-title { page-break-before: auto; }
  .page-break { page-break-before: always; }
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
    direct: "Directa",
    phone: "Teléfono",
    email: "Email",
    walk_in: "Walk-in",
    booking: "Booking",
    expedia: "Expedia",
    airbnb: "Airbnb",
    despegar: "Despegar",
    other: "Otro",
  };

  const checkOuts = data?.checkOuts ?? [];
  const checkIns = data?.checkIns ?? [];

  return (
    <>
      {/* Inject print CSS */}
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLE }} />

      <div className="print-container min-h-screen bg-background p-4 md:p-6 max-w-[1100px] mx-auto">

        {/* ── Toolbar (hidden on print) ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6" data-no-print>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Planilla Operativa Diaria</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Check-outs y check-ins del día — para imprimir o consultar en pantalla</p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-40 h-9"
            />
            <Button variant="outline" size="sm" onClick={() => { setDate(getArgentinaToday()); }} title="Ir a hoy">
              Hoy
            </Button>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => refetch()} title="Actualizar">
              <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
            </Button>
            <Button size="sm" onClick={handlePrint} className="gap-1.5">
              <Printer className="h-4 w-4" />
              Imprimir
            </Button>
          </div>
        </div>

        {/* ── Print header (visible only on print) ── */}
        <div className="hidden print:block mb-6 pb-4 border-b-2 border-black">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-lg font-bold uppercase tracking-widest">Maran Suites & Towers</p>
              <p className="text-xs text-gray-500">Alameda de la Federación 698, Paraná, Entre Ríos</p>
            </div>
            <div className="text-right">
              <p className="text-base font-semibold">PLANILLA OPERATIVA DIARIA</p>
              <p className="text-sm capitalize">{fmtDateLong(date)}</p>
              <p className="text-xs text-gray-500">Impreso: {new Date().toLocaleString("es-AR")}</p>
            </div>
          </div>
        </div>

        {/* ── Summary chips ── */}
        {!isLoading && (
          <div className="flex gap-3 mb-5 flex-wrap" data-no-print>
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
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <>
            {/* ══════════════════════════════════════════════════════════════
                SECTION 1: CHECK-OUTS
            ══════════════════════════════════════════════════════════════ */}
            <div className="mb-8">
              <div className="section-title flex items-center gap-2 mb-3">
                <div className="flex items-center gap-2 bg-red-600 text-white rounded-md px-3 py-1.5">
                  <LogOut className="h-4 w-4" />
                  <span className="font-bold text-sm uppercase tracking-wide">Salidas del día — {fmtDate(date)}</span>
                </div>
                <span className="text-sm text-muted-foreground">{checkOuts.length} habitacion{checkOuts.length !== 1 ? "es" : ""}</span>
              </div>

              {checkOuts.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
                  Sin check-outs programados para esta fecha
                </div>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="text-left px-3 py-2.5 font-semibold w-14">HAB.</th>
                        <th className="text-left px-3 py-2.5 font-semibold">HUÉSPED</th>
                        <th className="text-left px-3 py-2.5 font-semibold hidden sm:table-cell">TIPO / CAMAJE</th>
                        <th className="text-center px-3 py-2.5 font-semibold w-16">NOCHES</th>
                        <th className="text-left px-3 py-2.5 font-semibold hidden md:table-cell w-24">CHECK-IN</th>
                        <th className="text-right px-3 py-2.5 font-semibold w-28">TARIFA</th>
                        <th className="text-right px-3 py-2.5 font-semibold w-28">SALDO</th>
                        <th className="text-left px-3 py-2.5 font-semibold hidden lg:table-cell">NOTAS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {checkOuts.map((co) => (
                        <tr key={co.reservationId} className={co.folioBalance > 0.5 ? "bg-amber-50 dark:bg-amber-950/20" : "hover:bg-muted/30"}>
                          <td className="px-3 py-2.5 font-bold text-base">{co.roomNumber}</td>
                          <td className="px-3 py-2.5">
                            <div className="font-medium">{co.guestName}</div>
                            {co.guestPhone && <div className="text-xs text-muted-foreground">{co.guestPhone}</div>}
                            {co.numberOfGuests > 1 && <div className="text-xs text-muted-foreground">{co.numberOfGuests} personas</div>}
                            {co.lateCheckOut && (
                              <div className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                                <Clock className="h-3 w-3" />
                                LATE {co.lateCheckOutTime || ""}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 hidden sm:table-cell">
                            <div className="text-xs text-muted-foreground">{co.roomTypeName || ""}</div>
                            {co.bedTypeNotes && <div className="text-xs">{co.bedTypeNotes}</div>}
                          </td>
                          <td className="px-3 py-2.5 text-center tabular-nums">{co.nightsStayed || co.nights}</td>
                          <td className="px-3 py-2.5 hidden md:table-cell text-xs text-muted-foreground">{fmtDate(co.checkInDate)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                            {co.finalRatePerNight != null ? (
                              <div>
                                <div>{fmtMoney(co.finalRatePerNight)}<span className="text-muted-foreground">/n</span></div>
                                {co.totalRoomAmount != null && <div className="text-muted-foreground">{fmtMoney(co.totalRoomAmount)} total</div>}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                            {co.folioBalance > 0.5 ? (
                              <span className="text-red-600 dark:text-red-400">{fmtMoney(co.folioBalance)}</span>
                            ) : co.folioBalance < -0.5 ? (
                              <span className="text-blue-600 dark:text-blue-400">{fmtMoney(co.folioBalance)}</span>
                            ) : (
                              <span className="text-green-600 dark:text-green-400 font-medium">✓ Saldado</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 hidden lg:table-cell text-xs text-muted-foreground max-w-[180px] truncate">
                            {co.notes || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ══════════════════════════════════════════════════════════════
                SECTION 2: CHECK-INS
            ══════════════════════════════════════════════════════════════ */}
            <div>
              <div className="section-title flex items-center gap-2 mb-3">
                <div className="flex items-center gap-2 bg-green-600 text-white rounded-md px-3 py-1.5">
                  <LogIn className="h-4 w-4" />
                  <span className="font-bold text-sm uppercase tracking-wide">Entradas del día — {fmtDate(date)}</span>
                </div>
                <span className="text-sm text-muted-foreground">{checkIns.length} habitacion{checkIns.length !== 1 ? "es" : ""}</span>
              </div>

              {checkIns.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
                  Sin check-ins programados para esta fecha
                </div>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="text-left px-3 py-2.5 font-semibold w-14">HAB.</th>
                        <th className="text-left px-3 py-2.5 font-semibold">HUÉSPED</th>
                        <th className="text-left px-3 py-2.5 font-semibold hidden sm:table-cell">TIPO / CAMAJE</th>
                        <th className="text-center px-3 py-2.5 font-semibold w-16">NOCHES</th>
                        <th className="text-left px-3 py-2.5 font-semibold hidden md:table-cell w-24">CHECK-OUT</th>
                        <th className="text-right px-3 py-2.5 font-semibold w-28">TARIFA</th>
                        <th className="text-left px-3 py-2.5 font-semibold hidden md:table-cell w-24">ORIGEN</th>
                        <th className="text-left px-3 py-2.5 font-semibold hidden lg:table-cell">NOTAS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {checkIns.map((ci) => (
                        <tr key={ci.reservationId} className="hover:bg-muted/30">
                          <td className="px-3 py-2.5 font-bold text-base">{ci.roomNumber}</td>
                          <td className="px-3 py-2.5">
                            <div className="font-medium">{ci.guestName}</div>
                            {ci.guestPhone && <div className="text-xs text-muted-foreground">{ci.guestPhone}</div>}
                            {ci.numberOfGuests > 1 && <div className="text-xs text-muted-foreground">{ci.numberOfGuests} personas</div>}
                            {ci.earlyCheckIn && (
                              <div className="flex items-center gap-1 text-xs text-blue-700 dark:text-blue-400 mt-0.5">
                                <Clock className="h-3 w-3" />
                                EARLY {ci.earlyCheckInTime || ""}
                              </div>
                            )}
                            {ci.status === "web_checkin" && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 mt-0.5 border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300">
                                Web Check-in
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-2.5 hidden sm:table-cell">
                            <div className="text-xs text-muted-foreground">{ci.roomTypeName || ""}</div>
                            {ci.bedTypeNotes && <div className="text-xs">{ci.bedTypeNotes}</div>}
                          </td>
                          <td className="px-3 py-2.5 text-center tabular-nums">{ci.nights}</td>
                          <td className="px-3 py-2.5 hidden md:table-cell text-xs text-muted-foreground">{fmtDate(ci.checkOutDate)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                            {ci.finalRatePerNight != null ? (
                              <div>
                                <div>{fmtMoney(ci.finalRatePerNight)}<span className="text-muted-foreground">/n</span></div>
                                {ci.totalRoomAmount != null && <div className="text-muted-foreground">{fmtMoney(ci.totalRoomAmount)} total</div>}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 hidden md:table-cell text-xs text-muted-foreground">
                            {ci.source ? (sourceLabel[ci.source] || ci.source) : "-"}
                          </td>
                          <td className="px-3 py-2.5 hidden lg:table-cell text-xs text-muted-foreground max-w-[180px] truncate">
                            {ci.notes || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Print footer ── */}
            <div className="hidden print:block mt-8 pt-4 border-t border-gray-300 text-center text-xs text-gray-500">
              Planilla Operativa Diaria — Maran Suites & Towers · Generado el {new Date().toLocaleString("es-AR")}
            </div>
          </>
        )}
      </div>
    </>
  );
}

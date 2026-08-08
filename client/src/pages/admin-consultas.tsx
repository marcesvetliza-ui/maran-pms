import { useState } from "react";
import { useLocation } from "wouter";
import {
  FileText, Download, FileSpreadsheet, FileCode,
  BookOpen, BarChart2, Users, ArrowLeft, Loader2,
  CalendarDays, AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMonths(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 24; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    months.push(`${mm}/${yyyy}`);
  }
  return months.reverse();
}

async function downloadFile(url: string, fallbackName: string) {
  const resp = await fetch(url, { credentials: "include" });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(err.error || `Error ${resp.status}`);
  }
  const cd = resp.headers.get("Content-Disposition") || "";
  const match = cd.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : fallbackName;
  const blob = await resp.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="rounded-lg p-2.5 bg-primary/10 shrink-0">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function DownloadButton({
  label, icon: Icon, url, filename, variant = "outline", disabled = false
}: {
  label: string;
  icon?: any;
  url: string;
  filename: string;
  variant?: "outline" | "default" | "secondary";
  disabled?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleClick = async () => {
    setLoading(true);
    try {
      await downloadFile(url, filename);
      toast({ title: "Descarga iniciada", description: label });
    } catch (e: any) {
      toast({ title: "Error al generar", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const Ic = Icon || Download;

  return (
    <Button
      variant={variant}
      size="sm"
      onClick={handleClick}
      disabled={disabled || loading}
      className="gap-2"
      data-testid={`button-download-${filename}`}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ic className="h-4 w-4" />}
      {label}
    </Button>
  );
}

// ─── SIRCAR Section ───────────────────────────────────────────────────────────

function SircarSection() {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleGenerar = async () => {
    if (!desde || !hasta) {
      toast({ title: "Faltan fechas", description: "Seleccioná rango de fechas para el SIRCAR", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await downloadFile(`/api/exports/sircar?desde=${desde}&hasta=${hasta}`, "SIRCAR.zip");
      toast({ title: "SIRCAR generado", description: "ZIP descargado correctamente" });
    } catch (e: any) {
      toast({ title: "Error al generar SIRCAR", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">SIRCAR</CardTitle>
        <CardDescription>Genera el archivo TXT para ARCA + 2 Excel de retenciones IIBB</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="sircar-desde" className="text-xs">Desde</Label>
            <Input id="sircar-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} data-testid="input-sircar-desde" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sircar-hasta" className="text-xs">Hasta</Label>
            <Input id="sircar-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} data-testid="input-sircar-hasta" />
          </div>
        </div>
        <Button
          className="w-full gap-2"
          onClick={handleGenerar}
          disabled={loading || !desde || !hasta}
          data-testid="button-sircar-generar"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Generar SIRCAR (ZIP)
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Retenciones IIBB PDF ─────────────────────────────────────────────────────

function RetencionesSection() {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const url = desde && hasta ? `/api/exports/listado-retenciones?desde=${desde}&hasta=${hasta}` : "";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Listado Retenciones IIBB</CardTitle>
        <CardDescription>PDF con detalle de retenciones de Ingresos Brutos</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Desde</Label>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} data-testid="input-retenciones-desde" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hasta</Label>
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} data-testid="input-retenciones-hasta" />
          </div>
        </div>
        <DownloadButton
          label="Listado Retenciones (PDF)"
          icon={FileText}
          url={url}
          filename="retenciones_iibb.pdf"
          variant="outline"
          disabled={!desde || !hasta}
        />
      </CardContent>
    </Card>
  );
}

// ─── Libro IVA Compras ────────────────────────────────────────────────────────

function LibroIVAComprasSection() {
  const [periodo, setPeriodo] = useState("");
  const months = getMonths();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Libro IVA Compras</CardTitle>
        <CardDescription>Excel agrupado + TXT ARCA (CBTE y Alícuotas)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label className="text-xs">Período</Label>
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger data-testid="select-iva-compras-periodo">
              <SelectValue placeholder="Seleccioná período..." />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          <DownloadButton
            label="Excel Libro IVA Compras"
            icon={FileSpreadsheet}
            url={`/api/exports/libro-iva-compras?periodo=${periodo}&tipo=excel`}
            filename={`libro_iva_compras_${periodo?.replace("/", "")}.xlsx`}
            disabled={!periodo}
          />
          <DownloadButton
            label="TXT CBTE"
            icon={FileCode}
            url={`/api/exports/libro-iva-compras?periodo=${periodo}&tipo=cbte`}
            filename={`LIBRO_IVA_DIGITAL_COMPRAS_CBTE.txt`}
            disabled={!periodo}
          />
          <DownloadButton
            label="TXT Alícuotas"
            icon={FileCode}
            url={`/api/exports/libro-iva-compras?periodo=${periodo}&tipo=alicuotas`}
            filename={`LIBRO_IVA_DIGITAL_COMPRAS_ALICUOTAS.txt`}
            disabled={!periodo}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Mayor de Cuentas ─────────────────────────────────────────────────────────

function MayorSection() {
  const [periodo, setPeriodo] = useState("");
  const months = getMonths();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Mayor de Cuentas</CardTitle>
        <CardDescription>PDF totalizado o detallado por período contable</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label className="text-xs">Período</Label>
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger data-testid="select-mayor-periodo">
              <SelectValue placeholder="Seleccioná período..." />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          <DownloadButton
            label="Mayor Totalizado (PDF)"
            icon={FileText}
            url={`/api/exports/mayor?periodo=${periodo}&tipo=totalizado`}
            filename={`mayor_totalizado_${periodo?.replace("/", "_")}.pdf`}
            disabled={!periodo}
          />
          <DownloadButton
            label="Mayor Detallado (PDF)"
            icon={FileText}
            url={`/api/exports/mayor?periodo=${periodo}&tipo=detallado`}
            filename={`mayor_detallado_${periodo?.replace("/", "_")}.pdf`}
            disabled={!periodo}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Libro IVA Ventas ─────────────────────────────────────────────────────────

function LibroIVAVentasSection() {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const ts = desde && hasta ? `${desde.replace(/-/g, "")}-${hasta.replace(/-/g, "")}` : "";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Libro IVA Ventas</CardTitle>
        <CardDescription>Excel + TXT ARCA para facturas emitidas a huéspedes</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Desde</Label>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} data-testid="input-iva-ventas-desde" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hasta</Label>
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} data-testid="input-iva-ventas-hasta" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <DownloadButton
            label="Excel Libro IVA Ventas"
            icon={FileSpreadsheet}
            url={`/api/exports/libro-iva-ventas?desde=${desde}&hasta=${hasta}&tipo=excel`}
            filename={`libro_iva_ventas_${ts}.xlsx`}
            disabled={!desde || !hasta}
          />
          <DownloadButton
            label="TXT CBTE"
            icon={FileCode}
            url={`/api/exports/libro-iva-ventas?desde=${desde}&hasta=${hasta}&tipo=cbte`}
            filename={`LIBRO_IVA_DIGITAL_VENTAS_CBTE_${ts}.txt`}
            disabled={!desde || !hasta}
          />
          <DownloadButton
            label="TXT Alícuotas"
            icon={FileCode}
            url={`/api/exports/libro-iva-ventas?desde=${desde}&hasta=${hasta}&tipo=alicuotas`}
            filename={`LIBRO_IVA_DIGITAL_VENTAS_ALICUOTAS_${ts}.txt`}
            disabled={!desde || !hasta}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── CC Proveedores ───────────────────────────────────────────────────────────

function CCProveedoresSection() {
  const todayISO = new Date().toISOString().split("T")[0];
  const [fechaCorte, setFechaCorte] = useState(todayISO);

  const pdfUrl = fechaCorte
    ? `/api/exports/cc-proveedores?fechaCorte=${fechaCorte}`
    : "/api/exports/cc-proveedores";

  const fmtLabel = fechaCorte
    ? `cc_proveedores_al_${fechaCorte.replace(/-/g, "")}.pdf`
    : "cc_proveedores.pdf";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Cuenta Corriente Proveedores</CardTitle>
        <CardDescription>PDF con saldos pendientes por proveedor a una fecha de corte</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Label htmlFor="cc-fecha-corte" className="text-xs whitespace-nowrap">Saldo al:</Label>
          <Input
            id="cc-fecha-corte"
            type="date"
            value={fechaCorte}
            onChange={(e) => setFechaCorte(e.target.value)}
            className="h-8 text-sm w-44"
          />
        </div>
        <DownloadButton
          label="Cuenta Corriente Proveedores (PDF)"
          icon={FileText}
          url={pdfUrl}
          filename={fmtLabel}
          disabled={!fechaCorte}
        />
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminConsultasPage() {
  const [, navigate] = useLocation();

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} className="gap-1" data-testid="button-back-admin">
          <ArrowLeft className="h-4 w-4" />
          Administración
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-consultas-title">Consultas Contables</h1>
        <p className="text-muted-foreground mt-1">
          Exportaciones para ARCA/AFIP, informes contables y reportes de proveedores.
        </p>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Los archivos TXT para ARCA (IVA Digital) deben validarse contra los archivos de ejemplo antes de presentarlos.
          Consultar con la encargada contable el valor correcto de <code>_iva</code> para cada período.
        </AlertDescription>
      </Alert>

      {/* Sección Compras */}
      <div>
        <SectionTitle
          icon={BookOpen}
          title="Compras"
          description="Reportes y exportaciones de facturas de proveedores"
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <LibroIVAComprasSection />
          <SircarSection />
          <RetencionesSection />
          <MayorSection />
        </div>
      </div>

      <Separator />

      {/* Sección Ventas */}
      <div>
        <SectionTitle
          icon={BarChart2}
          title="Ventas"
          description="Libro IVA Ventas desde los pagos registrados de huéspedes"
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <LibroIVAVentasSection />
        </div>
      </div>

      <Separator />

      {/* Sección Proveedores */}
      <div>
        <SectionTitle
          icon={Users}
          title="Proveedores"
          description="Cuenta corriente y certificados de retención"
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <CCProveedoresSection />

          {/* Ord. Pago - info card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Orden de Pago PDF</CardTitle>
              <CardDescription>
                La Orden de Pago se descarga desde el módulo{" "}
                <Button variant="link" className="p-0 h-auto text-sm" onClick={() => navigate("/purchase-invoices")}>
                  Comprobantes de Compra
                </Button>{" "}
                → ficha del proveedor → botón "OP PDF".
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => navigate("/purchase-invoices")}
                data-testid="button-goto-purchase-invoices"
              >
                <FileText className="h-4 w-4" />
                Ir a Comprobantes de Compra
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

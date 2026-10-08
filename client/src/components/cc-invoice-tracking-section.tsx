import {useAuth} from '@/App';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileCheck, ChevronDown, ChevronUp, Loader2, Save, Search, Printer, Receipt } from "lucide-react";

type Estado = "pendiente" | "enviada" | "reclamada" | "pagada" | "cargada_extranet";

type TrackingRow = {
  manualId?: number;
  amountPending?: boolean;
  salesInvoiceId: number;
  numeroFactura: string;
  tipoComprobante: string;
  fecha: string;
  entityType: "company" | "agency";
  entityId: string;
  entityName: string;
  motivo: string | null;
  monto: number;
  estado: Estado;
  observaciones: string | null;
  updatedAt: string | null;
};

type MonthSummary = {
  totalFacturado: number;
  totalFacturas: number;
  porEstado: Array<{ estado: Estado; cantidad: number; monto: number }>;
  porEmpresa: Array<{ entityType: string; entityId: string; entityName: string; cantidad: number; monto: number }>;
};

const ESTADO_LABELS: Record<Estado, string> = {
  pendiente: "Pendiente",
  enviada: "Enviada",
  reclamada: "Reclamada",
  pagada: "Pagada",
  cargada_extranet: "Cargada a Extranet",
};

const ESTADO_COLORS: Record<Estado, string> = {
  pendiente: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  enviada: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  reclamada: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  pagada: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  cargada_extranet: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400",
};

function fmtMoney(n: number) {
  return `$${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function TrackingRowEditor({ row }: { row: TrackingRow }) {
  const { toast } = useToast();
  const {user}=useAuth();
  const canEdit=!row.manualId || ["admin","jefe_recepcion"].includes(user?.role??"");
  const [expanded, setExpanded] = useState(false);
  const [estado, setEstado] = useState<Estado>(row.estado);
  const [observaciones, setObservaciones] = useState(row.observaciones || "");

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", row.manualId ? `/api/cc-invoice-tracking/manual/${row.manualId}` : `/api/cc-invoice-tracking/${row.salesInvoiceId}`, {
        estado,
        observaciones: row.manualId ? observaciones : observaciones || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cc-invoice-tracking"] });
      toast({ title: "Seguimiento actualizado" });
      queryClient.invalidateQueries({queryKey:["/api/cc-invoice-tracking/month"]});
      setExpanded(false);
    },
    onError: (error: any) => toast({ title: "Error al guardar", description: error.message, variant: "destructive" }),
  });

  return (
    <>
      <div className="rounded-lg border bg-background" data-testid={`cc-tracking-row-${row.salesInvoiceId}`}>
        <div className="flex items-start justify-between gap-3 p-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="text-[10px]">{row.manualId ? 'Seguimiento manual' : row.entityType==='agency' ? 'Agencia' : 'Empresa'}</Badge><span className="text-sm font-medium">{row.entityName}</span></div>
            <p className="text-xs text-muted-foreground">{row.tipoComprobante} {row.numeroFactura}{row.motivo && ` · ${row.motivo}`}</p>
            <p className="text-[11px] text-muted-foreground">{row.fecha.split('-').reverse().join('/')}</p>
            {row.observaciones && <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{row.observaciones}</p>}
          </div>
          <div className="flex shrink-0 items-start gap-2">
            <div className="text-right space-y-1"><p className="text-sm font-semibold tabular-nums">{row.amountPending ? <span className="text-amber-700 dark:text-amber-400">Pendiente de liquidación</span> : fmtMoney(row.monto)}</p><Badge className={`${ESTADO_COLORS[row.estado]} border-0`} data-testid={`badge-estado-${row.salesInvoiceId}`}>{ESTADO_LABELS[row.estado]}</Badge></div>
            {canEdit && <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={expanded?'Cerrar edición del seguimiento':'Editar seguimiento'} aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?<ChevronUp className="h-4 w-4" />:<ChevronDown className="h-4 w-4" />}</Button>}
          </div>
        </div>
        {expanded && (
          <div className="border-t bg-muted/20 p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Estado</Label>
                <Select value={estado} onValueChange={(v) => setEstado(v as Estado)}>
                  <SelectTrigger className="w-44" data-testid={`select-estado-${row.salesInvoiceId}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ESTADO_LABELS).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-48 space-y-1">
                <Label className="text-xs">Observaciones</Label>
                <Textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  rows={1}
                  className="min-h-0 h-9 resize-none"
                  data-testid={`input-observaciones-${row.salesInvoiceId}`}
                />
              </div>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                data-testid={`button-save-tracking-${row.salesInvoiceId}`}
              >
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Guardar
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function ListadoTab() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [estado, setEstado] = useState<string>("todos");
  const [search, setSearch] = useState("");

  const { data: rows = [], isLoading } = useQuery<TrackingRow[]>({
    queryKey: ["/api/cc-invoice-tracking", from, to, estado, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (estado !== "todos") params.set("estado", estado);
      if (search) params.set("search", search);
      const res = await apiRequest("GET", `/api/cc-invoice-tracking?${params.toString()}`);
      return res.json();
    },
  });

  const total = rows.reduce((sum, r) => sum + r.monto, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Desde</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="input-cc-tracking-from" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Hasta</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="input-cc-tracking-to" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Estado</Label>
          <Select value={estado} onValueChange={setEstado}>
            <SelectTrigger className="w-48" data-testid="select-cc-tracking-estado-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              {Object.entries(ESTADO_LABELS).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-48 space-y-1">
          <Label className="text-xs">Buscar (factura, empresa, huésped, observación)</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-cc-tracking-search" />
          </div>
        </div>
      </div>

      {isLoading ? (
        <Loader2 className="h-6 w-6 animate-spin mx-auto my-8" />
      ) : rows.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No hay facturas CC en los filtros elegidos.</p>
      ) : (
        <>
          <div className="space-y-2">
            {rows.map(row => <TrackingRowEditor key={row.manualId ? `manual-${row.manualId}` : row.salesInvoiceId} row={row} />)}
          </div>
          <div className="text-sm text-muted-foreground text-right">
            {rows.length} registro(s) — total conocido {fmtMoney(total)}
          </div>
        </>
      )}
    </div>
  );
}

function InformeMensualTab() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const { data: summary, isLoading } = useQuery<MonthSummary>({
    queryKey: ["/api/cc-invoice-tracking/month", year, month],
  });

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <div className="space-y-1">
          <Label className="text-xs">Mes</Label>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-40" data-testid="select-cc-tracking-month"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <SelectItem key={m} value={String(m)}>
                  {new Date(2000, m - 1, 1).toLocaleDateString("es-AR", { month: "long" })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Año</Label>
          <Input
            type="number"
            className="w-24"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            data-testid="input-cc-tracking-year"
          />
        </div>
        <Button variant="outline" onClick={() => window.print()} data-testid="button-print-cc-tracking-month">
          <Printer className="h-4 w-4 mr-2" /> Imprimir
        </Button>
      </div>

      {isLoading ? (
        <Loader2 className="h-6 w-6 animate-spin mx-auto my-8" />
      ) : !summary || summary.totalFacturas === 0 ? (
        <p className="text-center text-muted-foreground py-8">Sin facturas CC en {monthLabel}.</p>
      ) : (
        <>
          <h3 className="text-sm font-medium capitalize">{monthLabel}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">Total facturado</p>
                <p className="text-xl font-bold">{fmtMoney(summary.totalFacturado)}</p>
                <p className="text-[11px] text-muted-foreground">{summary.totalFacturas} factura(s)</p>
              </CardContent>
            </Card>
            {summary.porEstado.filter(e => e.cantidad > 0).map(e => (
              <Card key={e.estado}>
                <CardContent className="pt-4 text-center">
                  <p className="text-xs text-muted-foreground">{ESTADO_LABELS[e.estado]}</p>
                  <p className="text-lg font-bold">{fmtMoney(e.monto)}</p>
                  <p className="text-[11px] text-muted-foreground">{e.cantidad} factura(s)</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <h4 className="text-sm font-medium mt-4">Por empresa/agencia</h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organismo/Empresa</TableHead>
                <TableHead className="text-right">Facturas</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.porEmpresa.map(e => (
                <TableRow key={`${e.entityType}:${e.entityId || e.entityName}`}>
                  <TableCell>{e.entityName}</TableCell>
                  <TableCell className="text-right">{e.cantidad}</TableCell>
                  <TableCell className="text-right">{fmtMoney(e.monto)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}

function BackfillRecipientsButton() {
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/cc-invoice-tracking/backfill-recipients");
      return res.json();
    },
    onSuccess: (result: { updated: number; unmatched: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cc-invoice-tracking"] });
      toast({
        title: result.updated > 0 ? `Se vincularon ${result.updated} factura(s)` : "No había facturas para vincular",
        description: result.unmatched > 0
          ? `${result.unmatched} factura(s) no se pudieron vincular automáticamente (CUIT sin un único match en Empresas/Agencias).`
          : undefined,
      });
    },
    onError: (error: any) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      data-testid="button-backfill-cc-recipients"
    >
      {mutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
      Vincular facturas antiguas
    </Button>
  );
}

export function CcInvoiceTrackingSection() {
  const [expanded,setExpanded]=useState(false);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <FileCheck className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Seguimiento de Facturas CC</h2>
        </div>
        <Button variant="outline" size="sm" aria-expanded={expanded} aria-controls="cc-tracking-content" onClick={()=>setExpanded(!expanded)} className="print:hidden">{expanded?'Ocultar':'Mostrar'}{expanded?<ChevronUp className="ml-2 h-4 w-4" />:<ChevronDown className="ml-2 h-4 w-4" />}</Button>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Facturas emitidas a Empresas y Agencias en Cuenta Corriente. El estado y las observaciones se cargan y editan acá.
        También podés agregar manualmente una factura o una gestión pendiente. Los seguimientos no modifican saldos ni emiten comprobantes.
      </p>
      <div id="cc-tracking-content" className={expanded?'':'hidden print:block'}>
      <div className="mb-4 flex flex-wrap gap-2 print:hidden"><AddManualTrackingButton /><BackfillRecipientsButton /></div>
      <Tabs defaultValue="listado">
        <TabsList>
          <TabsTrigger value="listado" data-testid="tab-cc-tracking-listado">
            <Receipt className="h-4 w-4 mr-2" /> Listado
          </TabsTrigger>
          <TabsTrigger value="informe" data-testid="tab-cc-tracking-informe">Informe mensual</TabsTrigger>
        </TabsList>
        <TabsContent value="listado" className="mt-4"><ListadoTab /></TabsContent>
        <TabsContent value="informe" className="mt-4"><InformeMensualTab /></TabsContent>
      </Tabs>
      </div>
    </div>
  );
}

function AddManualTrackingButton(){
 const {user}=useAuth();const {toast}=useToast();
 const [open,setOpen]=useState(false),[mode,setMode]=useState('invoice'),[search,setSearch]=useState(''),[invoiceId,setInvoiceId]=useState('');
 const [entityName,setEntityName]=useState(''),[reference,setReference]=useState(''),[motivo,setMotivo]=useState(''),[observaciones,setObservaciones]=useState(''),[monto,setMonto]=useState('');
 const [fecha,setFecha]=useState(new Date().toLocaleDateString('en-CA',{timeZone:'America/Argentina/Cordoba'}));
 const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
 const allowed=['admin','jefe_recepcion'].includes(user?.role??'');
 const {data:candidates=[],isLoading,isError}=useQuery<any[]>({queryKey:['/api/cc-invoice-tracking/candidates',search],enabled:allowed&&open&&mode==='invoice',queryFn:async()=>{const res=await apiRequest('GET',`/api/cc-invoice-tracking/candidates?search=${encodeURIComponent(search)}`);return res.json();}});
 const selected=candidates.find(c=>String(c.id)===invoiceId);
 const save=useMutation({mutationFn:async()=>{const res=await apiRequest('POST','/api/cc-invoice-tracking/manual',{requestId,salesInvoiceId:mode==='invoice'?Number(invoiceId):null,entityName:mode==='invoice'?selected?.name:entityName,reference,fecha,motivo,monto:mode==='invoice'||!monto.trim()?null:Number(monto.replace(',','.')),observaciones:observaciones||null});return res.json();},onSuccess:()=>{
  queryClient.invalidateQueries({queryKey:['/api/cc-invoice-tracking']});queryClient.invalidateQueries({queryKey:['/api/cc-invoice-tracking/month']});queryClient.invalidateQueries({queryKey:['/api/cc-invoice-tracking/candidates']});setOpen(false);setRequestId(crypto.randomUUID());setInvoiceId('');setEntityName('');setReference('');setMotivo('');setMonto('');setObservaciones('');toast({title:'Seguimiento agregado'});
 },onError:(error:any)=>toast({title:'No se pudo agregar',description:error.message,variant:'destructive'})});
 if(!allowed)return null;
 return <><Button size="sm" onClick={()=>setOpen(true)}>Agregar seguimiento</Button>
 <Dialog open={open} onOpenChange={value=>{if(!save.isPending)setOpen(value);}}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Agregar seguimiento</DialogTitle><DialogDescription>Registrá una gestión pendiente. No modifica la cuenta corriente ni emite una factura.</DialogDescription></DialogHeader>
 <div className="space-y-4">
  <div className="flex gap-2"><Button variant={mode==='invoice'?'default':'outline'} onClick={()=>setMode('invoice')}>Factura existente</Button><Button variant={mode==='free'?'default':'outline'} onClick={()=>setMode('free')}>Seguimiento libre</Button></div>
  {mode==='invoice'?<div className="space-y-2"><Label>Buscar factura por empresa o número</Label><Input value={search} onChange={e=>{setSearch(e.target.value);setInvoiceId('');}} placeholder="Despegar, número de factura…" />
   {isError?<p className="text-sm text-destructive">No se pudieron cargar las facturas.</p>:<Select value={invoiceId} onValueChange={setInvoiceId}><SelectTrigger><SelectValue placeholder={isLoading?'Cargando…':'Elegir factura en cuenta corriente'} /></SelectTrigger><SelectContent>{candidates.map(c=><SelectItem key={c.id} value={String(c.id)}>{c.reference} · {c.name} · {fmtMoney(Number(c.monto))}</SelectItem>)}</SelectContent></Select>}
   {!isLoading&&!isError&&candidates.length===0&&<p className="text-xs text-muted-foreground">No hay facturas disponibles con esa búsqueda.</p>}
  </div>:<><div><Label>Empresa / Agencia *</Label><Input value={entityName} onChange={e=>setEntityName(e.target.value)} maxLength={250} /></div><div className="grid grid-cols-2 gap-3"><div><Label>Fecha *</Label><Input type="date" value={fecha} onChange={e=>setFecha(e.target.value)} /></div><div><Label>Referencia / Reserva</Label><Input value={reference} onChange={e=>setReference(e.target.value)} maxLength={150} /></div></div><div><Label>Importe conocido (opcional)</Label><Input inputMode="decimal" value={monto} onChange={e=>setMonto(e.target.value)} placeholder="Sin importe: pendiente de liquidación" /></div></>}
  <div><Label>Motivo *</Label><Textarea value={motivo} onChange={e=>setMotivo(e.target.value)} maxLength={1000} placeholder="Esperar liquidación mensual de Despegar…" /></div>
  <div><Label>Observaciones</Label><Textarea value={observaciones} onChange={e=>setObservaciones(e.target.value)} maxLength={5000} /></div>
 </div><DialogFooter><Button variant="outline" disabled={save.isPending} onClick={()=>setOpen(false)}>Cancelar</Button><Button disabled={save.isPending||!motivo.trim()||(mode==='invoice'?!selected:!entityName.trim()||!fecha)} onClick={()=>save.mutate()}>{save.isPending?'Guardando…':'Agregar seguimiento'}</Button></DialogFooter></DialogContent></Dialog></>;
}

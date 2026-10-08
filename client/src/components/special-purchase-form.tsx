import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getLocalToday, fmtMoney } from "@/lib/utils";
import {
  specialPurchaseTotals,
  specialPurchaseAccountCode,
  RETENTION_LABELS,
} from "@shared/specialPurchase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
export function SpecialPurchaseForm({
  tipo,
  suppliers,
  accounts,
  onClose,
}: {
  tipo: string;
  suppliers: any[];
  accounts: any[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const ret = tipo === "RETENCION",
    bank = tipo === "RESUMEN-BANCO";
  const [issuerType, setIssuerType] = useState(ret ? "company" : "supplier"),
    [issuerId, setIssuerId] = useState(""),
    [subtipo, setSubtipo] = useState<keyof typeof RETENTION_LABELS>("iva");
  const [numero, setNumero] = useState(""),
    [fecha, setFecha] = useState(getLocalToday()),
    [period, setPeriod] = useState(getLocalToday().slice(0, 7)),
    [jurisdiction, setJurisdiction] = useState(""),
    [payment, setPayment] = useState("none"),
    [notes, setNotes] = useState(""),
    [reason, setReason] = useState(""),
    [correction, setCorrection] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const { data: entities = [], isError: entityError } = useQuery<any[]>({
    queryKey: [issuerType === "company" ? "/api/companies" : "/api/agencies"],
    enabled: ret,
  });
  const { data: payments = [], isError: paymentError } = useQuery<any[]>({
    queryKey: [
      "/api/purchase-invoices/retention-payments",
      issuerType,
      issuerId,
    ],
    enabled: ret && !!issuerId,
    queryFn: async () => {
      const r = await apiRequest(
        "GET",
        `/api/purchase-invoices/retention-payments?entityType=${issuerType}&entityId=${encodeURIComponent(issuerId)}`,
      );
      return r.json();
    },
  });
  const issuers = ret
    ? entities.map((e) => ({
        id: String(e.id),
        name: e.razonSocial,
        cuit: e.cuilCuit,
      }))
    : suppliers.map((e) => ({
        id: String(e.id),
        name: e.razonSocial,
        cuit: e.cuit,
      }));
  const code = specialPurchaseAccountCode(tipo, subtipo),
    account = accounts.find((a) => a.codigo === code);
  const parsed = Object.fromEntries(
    Object.entries(values)
      .filter(([, v]) => v.trim() !== "")
      .map(([k, v]) => [k, Number(v)]),
  );
  const details = {
    version: 1,
    issuerType,
    issuerId,
    subtipo: ret ? subtipo : undefined,
    jurisdiction: ret ? jurisdiction : "",
    period: period || undefined,
    paymentMovementId: ret && payment !== "none" ? payment : null,
    ...parsed,
    roundingReason: reason,
  };
  const totals = specialPurchaseTotals({ ...parsed, tipo });
  const valid =
    !!issuerId &&
    !!account &&
    !!numero.trim() &&
    !!fecha &&
    totals.total > 0 &&
    Object.values(parsed).every((n) => Number.isFinite(n) && n >= 0) &&
    (!correction || !!reason.trim());
  const save = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/purchase-invoices", {
        tipoComprobante: tipo,
        numeroComprobante: numero,
        fechaEmision: fecha,
        specialDetails: details,
        observaciones: notes,
      });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/reports/estado-resultados"],
      });
      toast({ title: "Comprobante registrado" });
      onClose();
    },
    onError: (e: Error) =>
      toast({
        title: "No se pudo registrar",
        description: e.message,
        variant: "destructive",
      }),
  });
  const field = (key: string, label: string) => (
    <div key={key} className="space-y-1">
      <Label htmlFor={`special-${key}`}>{label}</Label>
      <Input
        id={`special-${key}`}
        type="number"
        min="0"
        step="0.01"
        value={values[key] ?? ""}
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
      />
    </div>
  );
  return (
    <div className="space-y-5" data-testid="special-purchase-form">
      <p className="text-sm text-muted-foreground">
        Registro informativo. No genera pago, deuda, asiento ni movimientos de
        Caja o stock.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {ret && (
          <div>
            <Label>Tipo de agente</Label>
            <Select
              value={issuerType}
              onValueChange={(v) => {
                setIssuerType(v);
                setIssuerId("");
                setPayment("none");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="company">Empresa</SelectItem>
                <SelectItem value="agency">Agencia</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <Label>
            {ret
              ? "Empresa / Agencia que retuvo"
              : bank
                ? "Banco"
                : "Tarjeta / Procesadora"}
          </Label>
          <Select
            value={issuerId}
            onValueChange={(v) => {
              setIssuerId(v);
              setPayment("none");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Elegir emisor" />
            </SelectTrigger>
            <SelectContent>
              {issuers.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name} · {e.cuit}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {entityError && ret && (
            <p className="text-destructive text-xs">
              No se pudieron cargar los agentes.
            </p>
          )}
        </div>
        {ret && (
          <div>
            <Label>Impuesto retenido</Label>
            <Select value={subtipo} onValueChange={(v) => setSubtipo(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(RETENTION_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <Label>Número de {ret ? "certificado" : "comprobante"} *</Label>
          <Input
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            maxLength={100}
          />
        </div>
        <div>
          <Label>Fecha *</Label>
          <Input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>
        <div>
          <Label>Período del documento</Label>
          <Input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Label>Cuenta asociada</Label>
          <Input
            readOnly
            value={
              account
                ? `${code} — ${account.nombre}`
                : `${code} — Cuenta no disponible: revisar plan de cuentas`
            }
          />
        </div>
        {ret && (
          <>
            <div>
              <Label>Jurisdicción (IIBB / Municipalidad)</Label>
              <Input
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value)}
                maxLength={100}
              />
            </div>
            <div>
              <Label>Cobro asociado (opcional)</Label>
              <Select value={payment} onValueChange={setPayment}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Pendiente de asociar</SelectItem>
                  {payments.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.date} · {p.description} · $
                      {fmtMoney(Math.abs(Number(p.amount)))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {paymentError && (
                <p className="text-xs text-destructive">
                  No se pudieron cargar los cobros.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                El vínculo documenta el certificado; no vuelve a registrar la
                retención del cobro.
              </p>
            </div>
          </>
        )}
      </div>
      <div className="rounded-lg border bg-muted/10 p-4">
        <h3 className="mb-3 font-semibold">
          {ret ? "Importe final del certificado" : "Desglose de cargos"}
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {ret ? (
            field("importe", "Importe final, sin agregar IVA")
          ) : (
            <>
              {field("neto21", "Neto gravado al 21%")}
              {!bank && field("neto105", "Neto gravado al 10,5%")}
              {field("exento", "Conceptos exentos (opcional)")}
              {field("percepcionIva", "Percepción IVA")}
              {bank
                ? field("ley25413", "Impuesto Ley 25.413")
                : field("retencionIibb", "Retención IIBB sufrida")}
              <div className="rounded-md bg-background p-3 text-sm">
                <p>IVA 21%: ${fmtMoney(totals.iva21)}</p>
                {!bank && <p>IVA 10,5%: ${fmtMoney(totals.iva105)}</p>}
              </div>
            </>
          )}
        </div>
        {!ret && (
          <>
            <Button
              type="button"
              variant="ghost"
              className="px-0"
              onClick={() => {
                setCorrection(!correction);
                setValues((v) => {
                  const n = { ...v };
                  delete n.iva21Override;
                  delete n.iva105Override;
                  return n;
                });
                setReason("");
              }}
            >
              {correction
                ? "Usar IVA automático"
                : "Corregir IVA según documento"}
            </Button>
            {correction && (
              <div className="grid gap-3 sm:grid-cols-2">
                {field("iva21Override", "IVA 21% informado")}
                {!bank && field("iva105Override", "IVA 10,5% informado")}
                <div className="sm:col-span-2">
                  <Label>Motivo de la corrección *</Label>
                  <Input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={500}
                  />
                </div>
              </div>
            )}
          </>
        )}
        <div className="mt-4 border-t pt-3 text-right font-semibold">
          {ret ? "Importe" : "Total de cargos / descuentos"}: $
          {fmtMoney(totals.total)}
        </div>
      </div>
      <div>
        <Label>Observaciones</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={5000}
        />
      </div>
      <Button disabled={!valid || save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? "Guardando…" : "Registrar comprobante"}
      </Button>
    </div>
  );
}

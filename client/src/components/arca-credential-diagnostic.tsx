import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/App";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ArcaCredentialDiagnostic } from "@shared/arcaCredentialDiagnostic";

const validityLabels = {
  missing: "No cargado",
  invalid: "Formato inválido",
  "not-yet-valid": "Todavía no vigente",
  expired: "Vencido",
  valid: "Vigente",
};

function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }) : "—";
}

export function ArcaCredentialDiagnosticPanel() {
  const { user } = useAuth();
  const diagnostic = useMutation<ArcaCredentialDiagnostic>({
    mutationFn: async () => {
      const response = await apiRequest("GET", "/api/billing/credential-diagnostic");
      return response.json();
    },
  });
  if (user?.role !== "admin") return null;
  const report = diagnostic.data;

  return (
    <Card data-testid="arca-credential-diagnostic">
      <CardHeader>
        <CardTitle className="text-base">Comprobación segura de credenciales ARCA</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Revisa el certificado y la clave guardados dentro del servidor. No muestra ni descarga la clave,
          no se conecta a ARCA, no solicita tickets y no cambia la configuración.
        </p>
        <p className="text-xs text-muted-foreground">
          Funciona también en modo ficticio. Los archivos seleccionados sin guardar no se revisan.
        </p>
        <Button variant="outline" onClick={() => diagnostic.mutate()} disabled={diagnostic.isPending}
          data-testid="btn-check-arca-credentials">
          {diagnostic.isPending ? "Comprobando..." : "Comprobar certificado y clave"}
        </Button>
        {diagnostic.isError && (
          <p role="alert" className="text-destructive">
            No se pudo completar la comprobación. Verificá tu sesión de administrador e intentá nuevamente.
          </p>
        )}
        {report && !diagnostic.isPending && !diagnostic.isError && (
          <div role="status" className="space-y-3 border rounded-md p-3">
            <p className={`font-medium ${report.ok ? "text-green-700 dark:text-green-400" : "text-destructive"}`}>
              {report.ok ? "Revisión local correcta" : "Se detectaron problemas en las credenciales"}
            </p>
            <p className="text-xs text-muted-foreground">Comprobado: {dateLabel(report.checkedAt)}</p>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              <div><dt className="text-muted-foreground">Ambiente guardado</dt><dd>{report.environment}</dd></div>
              <div><dt className="text-muted-foreground">Puntos de venta guardados</dt>
                <dd>Homologación: {report.homologationPointOfSale ?? "—"} · Producción: {report.productionPointOfSale ?? "—"}</dd></div>
              <div><dt className="text-muted-foreground">Certificado</dt><dd>{validityLabels[report.certificate.validity]}</dd></div>
              <div><dt className="text-muted-foreground">Clave privada</dt>
                <dd>{!report.privateKey.present ? "No cargada" : report.privateKey.parseable ? "Formato legible" : "Formato inválido o protegido"}</dd></div>
              <div><dt className="text-muted-foreground">Correspondencia del par</dt>
                <dd>{report.pairMatches === null ? "No se pudo comprobar" : report.pairMatches ? "Certificado y clave coinciden" : "Certificado y clave NO coinciden"}</dd></div>
              <div><dt className="text-muted-foreground">Compatibilidad con el firmador RSA</dt>
                <dd>{report.signerCompatible === null ? "No se pudo comprobar" : report.signerCompatible ? "Compatible" : "No compatible"}</dd></div>
              <div><dt className="text-muted-foreground">Vigente desde</dt><dd>{dateLabel(report.certificate.validFrom)}</dd></div>
              <div><dt className="text-muted-foreground">Vigente hasta</dt><dd>{dateLabel(report.certificate.validTo)}</dd></div>
              <div><dt className="text-muted-foreground">Nombre declarado del emisor</dt>
                <dd>{report.certificate.issuerCommonName ?? "No identificado como autoridad ARCA conocida"}</dd></div>
              <div><dt className="text-muted-foreground">Tipo de clave pública</dt>
                <dd>{report.certificate.publicKeyType ?? "—"}{report.certificate.rsaBits ? ` · ${report.certificate.rsaBits} bits` : ""}</dd></div>
            </dl>
            {(report.certificate.publicKeyFingerprintSha256 || report.privateKey.publicKeyFingerprintSha256) && (
              <div className="space-y-2">
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">Huella pública del certificado</dt>
                    <dd className="font-mono text-xs break-all select-all" data-testid="arca-certificate-public-fingerprint">
                      {report.certificate.publicKeyFingerprintSha256 ?? "No disponible"}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">Huella pública derivada de la clave</dt>
                    <dd className="font-mono text-xs break-all select-all" data-testid="arca-key-public-fingerprint">
                      {report.privateKey.publicKeyFingerprintSha256 ?? "No disponible"}
                    </dd>
                  </div>
                </dl>
                <p className="text-xs text-muted-foreground">
                  SHA-256 de las claves públicas (SPKI). Permiten comparar con el certificado o la solicitud original,
                  sin mostrar la clave privada. No validan la autorización de ARCA.
                </p>
              </div>
            )}
            {report.certificate.suggestedEnvironment && (
              <p className="text-xs">Ambiente sugerido por el nombre del emisor: {report.certificate.suggestedEnvironment} (sin validar su autenticidad en ARCA).</p>
            )}
            {report.issues.length > 0 && <ul className="list-disc pl-5 text-destructive">{report.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
            <ul className="list-disc pl-5 text-xs text-muted-foreground">{report.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
            <p className="text-xs font-medium">Este resultado no confirma que la conexión con ARCA funcione ni que el punto de venta esté habilitado.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
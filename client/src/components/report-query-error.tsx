import { Button } from "@/components/ui/button";
export function ReportQueryError({ retry }: { retry: () => unknown }) {
  return <div role="alert" className="rounded border border-destructive p-4 my-4 space-y-2">
    <p>No se pudo consultar el reporte. No se muestran cifras porque la información no está disponible.</p>
    <Button variant="outline" onClick={() => void retry()}>Reintentar consulta</Button>
  </div>;
}

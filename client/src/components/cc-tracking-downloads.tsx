import { useState } from 'react';
import { FileDown, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

export function CcTrackingDownloads({ url, filename, disabled, scope }: { url: string; filename: string; disabled: boolean; scope: 'list' | 'month' }) {
  const [pending, setPending] = useState<'pdf' | 'xlsx' | null>(null);
  const { toast } = useToast();
  async function download(format: 'pdf' | 'xlsx') {
    setPending(format);
    try {
      const endpoint = new URL(url, window.location.origin); endpoint.searchParams.set('format', format);
      const response = await apiRequest('GET', endpoint.pathname + endpoint.search);
      const mime = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      if (!response.headers.get('content-type')?.includes(mime)) throw new Error('La respuesta no contiene un archivo válido. Reintentá la descarga.');
      const blob = await response.blob();
      if (!blob.size) throw new Error('El archivo recibido está vacío. Reintentá la descarga.');
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = objectUrl; link.download = `${filename}.${format}`;
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error: any) {
      toast({ title: 'No se pudo descargar el seguimiento', description: error.message, variant: 'destructive' });
    } finally { setPending(null); }
  }
  return <div className="flex flex-wrap gap-2 print:hidden" aria-label="Descargas del seguimiento">
    <Button type="button" variant="outline" disabled={disabled || !!pending} onClick={() => download('pdf')} data-testid={`button-download-cc-${scope}-pdf`}>
      {pending === 'pdf' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}Descargar PDF
    </Button>
    <Button type="button" variant="outline" disabled={disabled || !!pending} onClick={() => download('xlsx')} data-testid={`button-download-cc-${scope}-xlsx`}>
      {pending === 'xlsx' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}Descargar Excel
    </Button>
  </div>;
}

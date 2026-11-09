import {useChannexAccess} from '@/hooks/use-channex-access';
import {Button} from '@/components/ui/button';
import {Card,CardHeader,CardTitle,CardContent} from '@/components/ui/card';
export function ChannexAccessManagement() {
  const {data:access}=useChannexAccess();
  if (!access?.owner) return null;
  return <Card><CardHeader><CardTitle>Permisos de Canales OTAs</CardTitle></CardHeader><CardContent className="space-y-3">
    <p className="text-sm text-muted-foreground">Administrá las funciones de cada rol en la matriz general, sección Canales OTAs. Los cambios se aplican a todos los usuarios de ese rol.</p>
    <Button asChild variant="outline"><a href="/admin/permisos">Abrir Permisos por Rol</a></Button>
  </CardContent></Card>;
}

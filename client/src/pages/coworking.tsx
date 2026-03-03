import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Monitor, Users, Calendar, CreditCard, Plus } from "lucide-react";

export default function CoworkingPage() {
  return (
    <div className="p-6 space-y-6" data-testid="page-coworking">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Coworking</h1>
          <p className="text-muted-foreground">Gestión de espacios de trabajo compartido</p>
        </div>
      </div>

      <Tabs defaultValue="spaces" className="space-y-4">
        <TabsList>
          <TabsTrigger value="spaces" data-testid="tab-spaces">
            <Monitor className="h-4 w-4 mr-2" />
            Espacios
          </TabsTrigger>
          <TabsTrigger value="memberships" data-testid="tab-memberships">
            <CreditCard className="h-4 w-4 mr-2" />
            Membresías
          </TabsTrigger>
          <TabsTrigger value="passes" data-testid="tab-passes">
            <Users className="h-4 w-4 mr-2" />
            Pases Diarios
          </TabsTrigger>
          <TabsTrigger value="rooms" data-testid="tab-rooms">
            <Calendar className="h-4 w-4 mr-2" />
            Salas de Reunión
          </TabsTrigger>
        </TabsList>

        <TabsContent value="spaces" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Espacios de Trabajo</h2>
            <Button data-testid="button-add-space">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Espacio
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  Hot Desk - Planta Baja
                  <Badge variant="secondary">8 puestos</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Ocupación actual</span>
                  <span className="font-medium">3/8</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-1">
                  <span className="text-muted-foreground">Tarifa diaria</span>
                  <span className="font-medium">$5.000</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  Escritorio Fijo - Piso 1
                  <Badge variant="secondary">4 puestos</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Ocupación actual</span>
                  <span className="font-medium">2/4</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-1">
                  <span className="text-muted-foreground">Tarifa mensual</span>
                  <span className="font-medium">$85.000</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  Oficina Privada
                  <Badge variant="secondary">2 oficinas</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Ocupación actual</span>
                  <span className="font-medium">1/2</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-1">
                  <span className="text-muted-foreground">Tarifa mensual</span>
                  <span className="font-medium">$150.000</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="memberships" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Membresías Activas</h2>
            <Button data-testid="button-add-membership">
              <Plus className="h-4 w-4 mr-2" />
              Nueva Membresía
            </Button>
          </div>
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-center py-8">
                No hay membresías registradas. Creá una nueva membresía para comenzar.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="passes" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Pases Diarios</h2>
            <Button data-testid="button-add-pass">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Pase
            </Button>
          </div>
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-center py-8">
                No hay pases diarios registrados para hoy.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rooms" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Salas de Reunión</h2>
            <Button data-testid="button-add-room-booking">
              <Plus className="h-4 w-4 mr-2" />
              Reservar Sala
            </Button>
          </div>
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-center py-8">
                No hay reservas de salas para hoy.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

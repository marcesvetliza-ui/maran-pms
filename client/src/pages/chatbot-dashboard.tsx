import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SystemNotification } from "@shared/schema";
import {
  Bot,
  Bell,
  CheckCheck,
  Filter,
  Smartphone,
  AlertTriangle,
  ArrowUpCircle,
  Clock,
  DoorOpen,
  UtensilsCrossed,
  Flower2,
  Wrench,
  Sparkles,
  Search,
  RefreshCw,
  Eye,
  EyeOff,
  MessageCircle,
  User,
  Hash,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function formatTimeAgo(date: Date | string): string {
  const now = new Date();
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getAreaIcon(area: string) {
  switch (area) {
    case "housekeeping": return <Sparkles className="h-4 w-4" />;
    case "maintenance": return <Wrench className="h-4 w-4" />;
    case "restaurant": return <UtensilsCrossed className="h-4 w-4" />;
    case "spa": return <Flower2 className="h-4 w-4" />;
    case "reception": return <DoorOpen className="h-4 w-4" />;
    default: return <Bell className="h-4 w-4" />;
  }
}

function getAreaLabel(area: string): string {
  const labels: Record<string, string> = {
    reception: "Recepción",
    housekeeping: "Housekeeping",
    maintenance: "Mantenimiento",
    restaurant: "Restaurante",
    spa: "SPA",
    all: "General",
  };
  return labels[area] || area;
}

function getAreaColor(area: string): string {
  switch (area) {
    case "housekeeping": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
    case "maintenance": return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
    case "restaurant": return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
    case "spa": return "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200";
    case "reception": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    default: return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
  }
}

function getPriorityBadge(priority: string) {
  switch (priority) {
    case "urgent":
      return (
        <Badge variant="destructive" className="text-xs gap-1">
          <AlertTriangle className="h-3 w-3" />
          Urgente
        </Badge>
      );
    case "high":
      return (
        <Badge className="text-xs gap-1 bg-orange-500 hover:bg-orange-600">
          <ArrowUpCircle className="h-3 w-3" />
          Alta
        </Badge>
      );
    default:
      return null;
  }
}

export default function ChatbotDashboardPage() {
  const { toast } = useToast();
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showRead, setShowRead] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<SystemNotification | null>(null);

  const { data: notifications = [], isLoading } = useQuery<SystemNotification[]>({
    queryKey: ["/api/notifications", "chatbot"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/notifications?limit=200");
      const all: SystemNotification[] = await res.json();
      return all.filter((n) => n.type.startsWith("chatbot_"));
    },
    refetchInterval: 15000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/notifications/read-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({ title: "Todos los mensajes marcados como leídos" });
    },
  });

  const filteredMessages = notifications.filter((n) => {
    if (areaFilter !== "all" && n.targetArea !== areaFilter) return false;
    if (!showRead && n.isRead) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        n.title.toLowerCase().includes(term) ||
        n.message.toLowerCase().includes(term) ||
        (n.relatedEntityId && n.relatedEntityId.toLowerCase().includes(term))
      );
    }
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const unreadByArea = notifications.reduce((acc, n) => {
    if (!n.isRead) {
      acc[n.targetArea] = (acc[n.targetArea] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const areaStats = notifications.reduce((acc, n) => {
    acc[n.targetArea] = (acc[n.targetArea] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleSelectMessage = (msg: SystemNotification) => {
    setSelectedMessage(msg);
    if (!msg.isRead) {
      markReadMutation.mutate(msg.id);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="chatbot-dashboard">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900">
            <Bot className="h-6 w-6 text-blue-600 dark:text-blue-300" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">MARA Chatbot</h1>
            <p className="text-sm text-muted-foreground">
              Mensajes y solicitudes recibidas del chatbot
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Badge variant="secondary" className="text-sm" data-testid="badge-unread-count">
              {unreadCount} sin leer
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] })}
            data-testid="button-refresh"
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Actualizar
          </Button>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="h-4 w-4 mr-1" />
              Marcar todas leídas
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          { area: "all", label: "Todos", icon: <MessageCircle className="h-4 w-4" /> },
          { area: "housekeeping", label: "Housekeeping", icon: <Sparkles className="h-4 w-4" /> },
          { area: "maintenance", label: "Mantenimiento", icon: <Wrench className="h-4 w-4" /> },
          { area: "restaurant", label: "Restaurante", icon: <UtensilsCrossed className="h-4 w-4" /> },
          { area: "spa", label: "SPA", icon: <Flower2 className="h-4 w-4" /> },
          { area: "reception", label: "Recepción", icon: <DoorOpen className="h-4 w-4" /> },
        ].map((item) => {
          const count = item.area === "all" ? notifications.length : (areaStats[item.area] || 0);
          const unread = item.area === "all" ? unreadCount : (unreadByArea[item.area] || 0);
          return (
            <Card
              key={item.area}
              className={`cursor-pointer transition-all hover:shadow-md ${
                areaFilter === item.area
                  ? "ring-2 ring-primary border-primary"
                  : ""
              }`}
              onClick={() => setAreaFilter(item.area)}
              data-testid={`filter-area-${item.area}`}
            >
              <CardContent className="p-3 flex items-center gap-2">
                {item.icon}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{item.label}</p>
                  <p className="text-lg font-bold">{count}</p>
                </div>
                {unread > 0 && (
                  <Badge variant="destructive" className="text-xs h-5 min-w-5 flex items-center justify-center">
                    {unread}
                  </Badge>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por huésped, habitación o mensaje..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
            data-testid="input-search"
          />
        </div>
        <Button
          variant={showRead ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowRead(!showRead)}
          data-testid="button-toggle-read"
        >
          {showRead ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
          {showRead ? "Mostrando leídos" : "Ocultar leídos"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              Mensajes
              {filteredMessages.length > 0 && (
                <Badge variant="outline" className="ml-1">{filteredMessages.length}</Badge>
              )}
            </CardTitle>
            <CardDescription>
              {areaFilter === "all" ? "Todos los mensajes del chatbot" : `Filtrado por: ${getAreaLabel(areaFilter)}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              {isLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <RefreshCw className="h-5 w-5 animate-spin mr-2" />
                  Cargando mensajes...
                </div>
              ) : filteredMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <Bot className="h-10 w-10 opacity-30" />
                  <p className="text-sm">No hay mensajes{areaFilter !== "all" ? ` de ${getAreaLabel(areaFilter)}` : ""}</p>
                  <p className="text-xs">Los mensajes del chatbot MARA aparecerán aquí automáticamente</p>
                </div>
              ) : (
                <div className="divide-y">
                  {filteredMessages
                    .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
                    .map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex items-start gap-3 p-4 cursor-pointer transition-colors hover:bg-muted/50 ${
                          !msg.isRead ? "bg-blue-50/50 dark:bg-blue-950/20" : ""
                        } ${selectedMessage?.id === msg.id ? "bg-muted" : ""}`}
                        onClick={() => handleSelectMessage(msg)}
                        data-testid={`message-item-${msg.id}`}
                      >
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${getAreaColor(msg.targetArea)}`}>
                          {getAreaIcon(msg.targetArea)}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <p className={`text-sm font-medium truncate ${!msg.isRead ? "font-semibold" : ""}`}>
                              {msg.title}
                            </p>
                            {!msg.isRead && (
                              <span className="flex h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-1">{msg.message}</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${getAreaColor(msg.targetArea)}`}>
                              {getAreaIcon(msg.targetArea)}
                              {getAreaLabel(msg.targetArea)}
                            </span>
                            {getPriorityBadge(msg.priority)}
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatTimeAgo(msg.createdAt!)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Detalle del Mensaje</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedMessage ? (
              <div className="space-y-4" data-testid="message-detail">
                <div className="flex items-center gap-3">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-full ${getAreaColor(selectedMessage.targetArea)}`}>
                    {getAreaIcon(selectedMessage.targetArea)}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">{selectedMessage.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${getAreaColor(selectedMessage.targetArea)}`}>
                        {getAreaLabel(selectedMessage.targetArea)}
                      </span>
                      {getPriorityBadge(selectedMessage.priority)}
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-1">Mensaje</p>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-sm whitespace-pre-wrap">{selectedMessage.message}</p>
                    </div>
                  </div>

                  {selectedMessage.relatedEntityId && (
                    <div className="flex items-center gap-2 text-sm">
                      {selectedMessage.relatedEntityType === "room" ? (
                        <>
                          <DoorOpen className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Habitación:</span>
                          <span className="font-medium">{selectedMessage.relatedEntityId}</span>
                        </>
                      ) : (
                        <>
                          <Hash className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Reserva:</span>
                          <span className="font-medium">{selectedMessage.relatedEntityId}</span>
                        </>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Recibido:</span>
                    <span className="font-medium">{formatDate(selectedMessage.createdAt!)}</span>
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    {selectedMessage.isRead ? (
                      <>
                        <Eye className="h-4 w-4 text-green-500" />
                        <span className="text-green-600 dark:text-green-400">Leído</span>
                        {selectedMessage.readAt && (
                          <span className="text-xs text-muted-foreground">
                            {formatDate(selectedMessage.readAt)}
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-4 w-4 text-amber-500" />
                        <span className="text-amber-600 dark:text-amber-400">Sin leer</span>
                      </>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="flex gap-2">
                  {!selectedMessage.isRead && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => markReadMutation.mutate(selectedMessage.id)}
                      data-testid="button-mark-read"
                    >
                      <CheckCheck className="h-4 w-4 mr-1" />
                      Marcar como leído
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                <MessageCircle className="h-8 w-8 opacity-30" />
                <p className="text-sm text-center">
                  Seleccioná un mensaje para ver los detalles
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Configuración del Webhook
          </CardTitle>
          <CardDescription>
            Información para conectar tu chatbot MARA con este sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Endpoint</p>
              <code className="block p-2 bg-muted rounded text-xs font-mono" data-testid="text-webhook-url">
                POST /api/webhook/chatbot
              </code>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Header de Autenticación</p>
              <code className="block p-2 bg-muted rounded text-xs font-mono">
                X-Chatbot-Secret: ••••••••
              </code>
            </div>
            <div className="space-y-2 md:col-span-2">
              <p className="text-sm font-medium">Áreas soportadas</p>
              <div className="flex flex-wrap gap-2">
                {["housekeeping", "maintenance", "restaurant", "spa", "reception"].map((area) => (
                  <span
                    key={area}
                    className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full ${getAreaColor(area)}`}
                  >
                    {getAreaIcon(area)}
                    {getAreaLabel(area)}
                  </span>
                ))}
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <p className="text-sm font-medium">Ejemplo de payload</p>
              <pre className="p-3 bg-muted rounded text-xs font-mono overflow-x-auto" data-testid="text-payload-example">
{`{
  "eventType": "guest_request",
  "area": "housekeeping",
  "priority": "normal",
  "guestName": "Carlos García",
  "roomNumber": "305",
  "message": "Solicita toallas adicionales",
  "timestamp": "${new Date().toISOString()}"
}`}
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

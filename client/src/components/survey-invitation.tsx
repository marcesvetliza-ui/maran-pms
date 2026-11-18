import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/App";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatHotelDateTime } from "@/lib/hotelTime";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
export function SurveyInvitation({ reservationId }: { reservationId: string }) {
  const { hasPermission } = useAuth(),
    { toast } = useToast();
  const canRead = hasPermission("sidebar:/reviews"),
    canManage = hasPermission("api:reviews:manage");
  const key = ["/api/reviews", "invitation", reservationId];
  const { data } = useQuery<any>({
    queryKey: key,
    queryFn: async () =>
      (
        await apiRequest(
          "GET",
          `/api/reservations/${reservationId}/survey-invitation`,
        )
      ).json(),
    enabled: canRead,
  });
  const send = useMutation({
    mutationFn: async () => {
      const acknowledge = ["sent", "unknown"].includes(data?.status);
      if (
        acknowledge &&
        !window.confirm(
          "Este correo ya se envió o no pudo confirmarse su envío. ¿Querés reenviar la misma encuesta?",
        )
      )
        return false;
      await apiRequest(
        "POST",
        `/api/reservations/${reservationId}/survey-invitation`,
        { acknowledge },
      );
      return true;
    },
    onSuccess: (ok) => {
      if (ok) {
        void queryClient.invalidateQueries({ queryKey: ["/api/reviews"] });
        toast({
          title: "Encuesta programada para enviar en el próximo minuto",
        });
      }
    },
    onError: (e: any) =>
      toast({
        title: "No se pudo programar la encuesta",
        description: e.message,
        variant: "destructive",
      }),
  });
  if (!canRead) return null;
  return (
    <div className="mt-3 text-sm space-y-1">
      <p className="font-medium">Encuesta posestadía</p>
      {data?.status === "queued" && (
        <p className="text-muted-foreground">
          Programada: {formatHotelDateTime(data.scheduledFor)}
        </p>
      )}
      {data?.sentAt && (
        <p className="text-muted-foreground">
          Enviada: {formatHotelDateTime(data.sentAt)}
        </p>
      )}
      {data?.status === "completed" && <p>Encuesta finalizada.</p>}
      {data?.lastError && <p className="text-destructive">{data.lastError}</p>}
      {canManage &&
        !["sending", "completed", "queued"].includes(data?.status) && (
          <Button
            size="sm"
            variant="outline"
            disabled={send.isPending}
            onClick={() => send.mutate()}
          >
            {data?.sentAt ? "Reenviar encuesta" : "Enviar encuesta"}
          </Button>
        )}
    </div>
  );
}

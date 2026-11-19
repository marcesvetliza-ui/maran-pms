import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, Download, ExternalLink, MessageCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { surveySectors, type SurveySector } from "@shared/survey-sectors";

async function copyLink(url: string) {
  await navigator.clipboard.writeText(url);
}
export function PersonalSurveySharing({
  reservationId,
}: {
  reservationId: string;
}) {
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const currentReservation = useRef(reservationId);
  currentReservation.current = reservationId;
  useEffect(() => setUrl(""), [reservationId]);
  const prepare = useMutation({
    mutationFn: async (markSent: boolean) => {
      const result = await (
        await apiRequest(
          "POST",
          `/api/reservations/${reservationId}/survey-link`,
          { markSent },
        )
      ).json();
      if (currentReservation.current !== reservationId) return;
      setUrl(result.url);
      if (!markSent) {
        try {
          await copyLink(result.url);
          toast({ title: "Enlace copiado para compartir" });
        } catch {
          toast({ title: "Enlace listo. Podés copiarlo desde el campo." });
        }
      } else {
        void queryClient.invalidateQueries({ queryKey: ["/api/reviews"] });
        toast({ title: "Registrada como compartida por WhatsApp" });
      }
    },
    onError: (e: any) =>
      toast({
        title: "No se pudo preparar la encuesta",
        description: e.message,
        variant: "destructive",
      }),
  });
  return (
    <div className="space-y-2 pt-1">
      <Button
        size="sm"
        variant="outline"
        disabled={prepare.isPending}
        onClick={() => prepare.mutate(false)}
      >
        <Copy className="mr-2 h-4 w-4" />
        Copiar enlace para WhatsApp
      </Button>
      {url && (
        <>
          <Input
            aria-label="Enlace personal de encuesta"
            readOnly
            value={url}
            onFocus={(e) => e.target.select()}
          />
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <a
                href={`https://wa.me/?text=${encodeURIComponent("Gracias por tu visita a Maran. Nos gustaría conocer tu opinión: " + url)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                Abrir WhatsApp
              </a>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={prepare.isPending}
              onClick={() => prepare.mutate(true)}
            >
              Marcar como compartida por WhatsApp
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Es la misma encuesta del correo. Copiar el enlace no envía mensajes
            ni registra un envío.
          </p>
        </>
      )}
    </div>
  );
}
export function SurveySectorLinks({ canConfigure }: { canConfigure: boolean }) {
  const { toast } = useToast();
  const links = useQuery<
    { sector: SurveySector; url: string; active: boolean }[]
  >({
    queryKey: ["/api/reviews", "links"],
    queryFn: async () => (await apiRequest("GET", "/api/reviews/links")).json(),
  });
  const pause = useMutation({
    mutationFn: async ({
      sector,
      active,
    }: {
      sector: SurveySector;
      active: boolean;
    }) => apiRequest("PATCH", `/api/reviews/links/${sector}`, { active }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["/api/reviews", "links"],
      });
    },
    onError: (e: any) =>
      toast({
        title: "No se pudo guardar",
        description: e.message,
        variant: "destructive",
      }),
  });
  const download = async (sector: SurveySector) => {
    try {
      const response = await apiRequest(
        "GET",
        `/api/reviews/links/${sector}/qr`,
      );
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `encuesta-${sector}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast({ title: "No se pudo descargar el QR", variant: "destructive" });
    }
  };
  return (
    <section className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Enlaces reutilizables para WhatsApp o QR. Cada persona abre una encuesta
        en blanco y completa sus propios datos. Para una estadía conocida, usá
        el enlace personal desde la reserva.
      </p>
      {links.isLoading && <p>Cargando enlaces…</p>}
      {links.isError && (
        <p role="alert">
          No se pudieron cargar los enlaces.{" "}
          <Button variant="ghost" onClick={() => links.refetch()}>
            Reintentar
          </Button>
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {links.data?.map((link) => (
          <Card key={link.sector}>
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">
                  {surveySectors[link.sector]}
                </h2>
                {canConfigure ? (
                  <label className="flex gap-2 items-center text-sm">
                    <Checkbox
                      checked={link.active}
                      disabled={pause.isPending}
                      onCheckedChange={(v) =>
                        pause.mutate({
                          sector: link.sector,
                          active: v === true,
                        })
                      }
                    />
                    Enlace activo
                  </label>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {link.active ? "Activo" : "Pausado"}
                  </span>
                )}
              </div>
              <Input
                aria-label={`Enlace de ${surveySectors[link.sector]}`}
                readOnly
                value={link.url}
                onFocus={(e) => e.target.select()}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!link.active}
                  onClick={() =>
                    copyLink(link.url)
                      .then(() => toast({ title: "Enlace copiado" }))
                      .catch(() =>
                        toast({
                          title: "Podés copiar el enlace desde el campo.",
                        }),
                      )
                  }
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copiar enlace
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => download(link.sector)}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Descargar QR
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <a href={link.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Ver encuesta
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

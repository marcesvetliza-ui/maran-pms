import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  MessageSquare,
  Plus,
  Search,
  Star,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Trash2,
  Eye,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { GuestReviewWithDetails, Guest, SentimentType } from "@shared/schema";

type ReviewAnalytics = {
  totalReviews: number;
  averageRating: number;
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  topCategories: { category: string; count: number; avgSentiment: number }[];
  recentTrend: { date: string; avgRating: number; count: number }[];
  improvementAreas: string[];
};

function SentimentBadge({ sentiment }: { sentiment: SentimentType | null }) {
  if (!sentiment) {
    return <Badge variant="outline">Sin analizar</Badge>;
  }

  const config: Record<SentimentType, { label: string; variant: "default" | "secondary" | "destructive"; icon: typeof TrendingUp }> = {
    positive: { label: "Positivo", variant: "default", icon: TrendingUp },
    neutral: { label: "Neutral", variant: "secondary", icon: Minus },
    negative: { label: "Negativo", variant: "destructive", icon: TrendingDown },
  };

  const { label, variant, icon: Icon } = config[sentiment];
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-4 w-4 ${star <= rating ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground"}`}
        />
      ))}
      <span className="ml-1 text-sm text-muted-foreground">{rating}/5</span>
    </div>
  );
}

const categoryLabels: Record<string, string> = {
  service: "Servicio",
  cleanliness: "Limpieza",
  location: "Ubicacion",
  amenities: "Comodidades",
  value: "Relacion Calidad-Precio",
  food: "Gastronomia",
  staff: "Personal",
  general: "General",
};

function ReviewFormDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

  const [formData, setFormData] = useState({
    guestId: "",
    rating: 5,
    title: "",
    content: "",
    source: "direct",
    reviewDate: today,
  });

  const { data: guests } = useQuery<Guest[]>({
    queryKey: ["/api/guests"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", "/api/reviews", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reviews/analytics"] });
      toast({ title: "Resena creada exitosamente" });
      onSuccess();
      onOpenChange(false);
      setFormData({ guestId: "", rating: 5, title: "", content: "", source: "direct", reviewDate: today });
    },
    onError: () => {
      toast({ title: "Error al crear resena", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva Resena</DialogTitle>
          <DialogDescription>Registrar una resena de huesped</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate(formData);
          }}
          className="space-y-4"
        >
          <div>
            <Label>Huesped *</Label>
            <Select value={formData.guestId} onValueChange={(v) => setFormData({ ...formData, guestId: v })}>
              <SelectTrigger data-testid="select-guest">
                <SelectValue placeholder="Seleccionar huesped" />
              </SelectTrigger>
              <SelectContent>
                {guests?.filter(guest => guest.id).map((guest) => (
                  <SelectItem key={guest.id} value={guest.id}>
                    {guest.lastName} {guest.firstName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Calificacion *</Label>
            <div className="flex items-center gap-1 mt-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setFormData({ ...formData, rating: star })}
                  className="p-1"
                  data-testid={`button-rating-${star}`}
                >
                  <Star
                    className={`h-6 w-6 ${star <= formData.rating ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground"}`}
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Titulo</Label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Resumen de la experiencia"
              data-testid="input-review-title"
            />
          </div>

          <div>
            <Label>Contenido *</Label>
            <Textarea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="Detalle de la experiencia del huesped..."
              rows={4}
              data-testid="input-review-content"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Fuente</Label>
              <Select value={formData.source} onValueChange={(v) => setFormData({ ...formData, source: v })}>
                <SelectTrigger data-testid="select-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="direct">Directo</SelectItem>
                  <SelectItem value="booking">Booking</SelectItem>
                  <SelectItem value="expedia">Expedia</SelectItem>
                  <SelectItem value="tripadvisor">TripAdvisor</SelectItem>
                  <SelectItem value="google">Google</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha</Label>
              <Input
                type="date"
                value={formData.reviewDate}
                onChange={(e) => setFormData({ ...formData, reviewDate: e.target.value })}
                data-testid="input-review-date"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createMutation.isPending || !formData.guestId || !formData.content} data-testid="button-submit-review">
              {createMutation.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReviewDetailDialog({
  review,
  open,
  onOpenChange,
}: {
  review: GuestReviewWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/reviews/${review?.id}/analyze`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reviews/analytics"] });
      toast({ title: "Analisis de sentimiento completado" });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Error al analizar resena", variant: "destructive" });
    },
  });

  if (!review) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Detalle de Resena
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm text-muted-foreground">Huesped</p>
              <p className="font-medium">{review.guest?.lastName} {review.guest?.firstName}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Fecha</p>
              <p className="font-medium">{new Date(review.reviewDate).toLocaleDateString("es-AR")}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Fuente</p>
              <Badge variant="outline">{review.source}</Badge>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <StarRating rating={review.rating} />
            <SentimentBadge sentiment={review.sentiment as SentimentType | null} />
          </div>

          {review.title && (
            <div>
              <p className="text-sm text-muted-foreground">Titulo</p>
              <p className="font-medium">{review.title}</p>
            </div>
          )}

          <div>
            <p className="text-sm text-muted-foreground">Contenido</p>
            <p className="mt-1 text-sm">{review.content}</p>
          </div>

          {review.analyzedAt && (
            <>
              {review.categories && review.categories.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Categorias Detectadas</p>
                  <div className="flex flex-wrap gap-1">
                    {review.categories.map((cat) => (
                      <Badge key={cat} variant="secondary">
                        {categoryLabels[cat] || cat}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {review.keyPhrases && review.keyPhrases.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Frases Clave</p>
                  <div className="flex flex-wrap gap-1">
                    {review.keyPhrases.map((phrase, i) => (
                      <Badge key={i} variant="outline">
                        {phrase}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {review.improvementSuggestions && review.improvementSuggestions.length > 0 && (
                <div className="rounded-md bg-destructive/10 p-3">
                  <p className="text-sm font-medium text-destructive mb-2 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    Areas de Mejora
                  </p>
                  <ul className="text-sm space-y-1">
                    {review.improvementSuggestions.map((suggestion, i) => (
                      <li key={i}>- {suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Analizado: {new Date(review.analyzedAt).toLocaleString("es-AR")}
              </p>
            </>
          )}

          {!review.analyzedAt && (
            <Button
              onClick={() => analyzeMutation.mutate()}
              disabled={analyzeMutation.isPending}
              className="w-full"
              data-testid="button-analyze-review"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {analyzeMutation.isPending ? "Analizando..." : "Analizar Sentimiento con IA"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ReviewsPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState<string>("all");
  const [showFormDialog, setShowFormDialog] = useState(false);
  const [selectedReview, setSelectedReview] = useState<GuestReviewWithDetails | null>(null);
  const [deleteConfirmReview, setDeleteConfirmReview] = useState<GuestReviewWithDetails | null>(null);

  const { data: reviews, isLoading } = useQuery<GuestReviewWithDetails[]>({
    queryKey: ["/api/reviews"],
  });

  const { data: analytics } = useQuery<ReviewAnalytics>({
    queryKey: ["/api/reviews/analytics"],
  });

  const analyzeAllMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/reviews/analyze-all"),
    onSuccess: async (response) => {
      const result = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/reviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reviews/analytics"] });
      toast({ title: result.message });
    },
    onError: () => {
      toast({ title: "Error al analizar resenas", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/reviews/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reviews/analytics"] });
      toast({ title: "Resena eliminada" });
      setDeleteConfirmReview(null);
    },
    onError: () => {
      toast({ title: "Error al eliminar resena", variant: "destructive" });
    },
  });

  const filteredReviews = reviews?.filter((review) => {
    const matchesSearch =
      review.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      review.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      `${review.guest?.lastName} ${review.guest?.firstName}`.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSentiment =
      sentimentFilter === "all" ||
      review.sentiment === sentimentFilter ||
      (sentimentFilter === "unanalyzed" && !review.analyzedAt);

    return matchesSearch && matchesSentiment;
  });

  const unanalyzedCount = reviews?.filter((r) => !r.analyzedAt).length || 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-6 w-6" />
          <h1 className="text-2xl font-semibold">Resenas de Huespedes</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {unanalyzedCount > 0 && (
            <Button
              variant="outline"
              onClick={() => analyzeAllMutation.mutate()}
              disabled={analyzeAllMutation.isPending}
              data-testid="button-analyze-all"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {analyzeAllMutation.isPending ? "Analizando..." : `Analizar ${unanalyzedCount} pendientes`}
            </Button>
          )}
          <Button onClick={() => setShowFormDialog(true)} data-testid="button-new-review">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Resena
          </Button>
        </div>
      </div>

      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total Resenas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-reviews">{analytics.totalReviews}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Calificacion Promedio</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Star className="h-5 w-5 fill-yellow-500 text-yellow-500" />
                <span className="text-2xl font-bold" data-testid="text-avg-rating">{analytics.averageRating}</span>
                <span className="text-muted-foreground">/ 5</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Sentimiento</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 text-green-600">
                  <ThumbsUp className="h-4 w-4" />
                  <span className="font-medium" data-testid="text-positive-count">{analytics.sentimentBreakdown.positive}</span>
                </div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Minus className="h-4 w-4" />
                  <span className="font-medium" data-testid="text-neutral-count">{analytics.sentimentBreakdown.neutral}</span>
                </div>
                <div className="flex items-center gap-1 text-red-600">
                  <ThumbsDown className="h-4 w-4" />
                  <span className="font-medium" data-testid="text-negative-count">{analytics.sentimentBreakdown.negative}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Areas de Mejora</CardTitle>
            </CardHeader>
            <CardContent>
              {analytics.improvementAreas.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {analytics.improvementAreas.slice(0, 3).map((area, i) => (
                    <Badge key={i} variant="destructive" className="text-xs">
                      {area.slice(0, 30)}...
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sin sugerencias</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar resenas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-reviews"
          />
        </div>
        <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-sentiment-filter">
            <SelectValue placeholder="Filtrar por sentimiento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="positive">Positivos</SelectItem>
            <SelectItem value="neutral">Neutrales</SelectItem>
            <SelectItem value="negative">Negativos</SelectItem>
            <SelectItem value="unanalyzed">Sin Analizar</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : filteredReviews && filteredReviews.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredReviews.map((review) => (
            <Card key={review.id} className="hover-elevate cursor-pointer" onClick={() => setSelectedReview(review)} data-testid={`card-review-${review.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm font-medium truncate">
                    {review.guest?.lastName} {review.guest?.firstName}
                  </CardTitle>
                  <SentimentBadge sentiment={review.sentiment as SentimentType | null} />
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <StarRating rating={review.rating} />
                  <Badge variant="outline" className="text-xs">{review.source}</Badge>
                </div>
                {review.title && <p className="font-medium text-sm truncate">{review.title}</p>}
                <p className="text-sm text-muted-foreground line-clamp-2">{review.content}</p>
                <div className="flex items-center justify-between gap-2 pt-2">
                  <span className="text-xs text-muted-foreground">
                    {new Date(review.reviewDate).toLocaleDateString("es-AR")}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedReview(review);
                      }}
                      data-testid={`button-view-review-${review.id}`}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmReview(review);
                      }}
                      data-testid={`button-delete-review-${review.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No hay resenas registradas</p>
            <Button onClick={() => setShowFormDialog(true)} variant="outline" className="mt-4">
              <Plus className="h-4 w-4 mr-2" />
              Agregar primera resena
            </Button>
          </CardContent>
        </Card>
      )}

      <ReviewFormDialog
        open={showFormDialog}
        onOpenChange={setShowFormDialog}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/reviews/analytics"] });
        }}
      />

      <ReviewDetailDialog
        review={selectedReview}
        open={!!selectedReview}
        onOpenChange={(open) => !open && setSelectedReview(null)}
      />

      <AlertDialog open={!!deleteConfirmReview} onOpenChange={(open) => !open && setDeleteConfirmReview(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar resena</AlertDialogTitle>
            <AlertDialogDescription>
              Esta accion no se puede deshacer. Se eliminara permanentemente la resena.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmReview && deleteMutation.mutate(deleteConfirmReview.id)}
              className="bg-destructive text-destructive-foreground"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { useMemo, useRef, useState, useEffect } from "react";
import { Search, Check, X, Gift } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { GiftVoucher, GiftVoucherArea } from "@shared/schema";

type GiftVoucherSelectProps = {
  area: GiftVoucherArea;
  selectedVoucher: GiftVoucher | null;
  onSelect: (voucher: GiftVoucher | null) => void;
  label?: string;
  "data-testid"?: string;
};

export function GiftVoucherSelect({
  area,
  selectedVoucher,
  onSelect,
  label = "Voucher de regalo",
  "data-testid": testId = "gift-voucher-select",
}: GiftVoucherSelectProps) {
  const [query, setQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: vouchers = [], isLoading } = useQuery<GiftVoucher[]>({
    queryKey: ["/api/gift-vouchers/available", area],
    queryFn: async () => {
      const res = await fetch(`/api/gift-vouchers/available?area=${encodeURIComponent(area)}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return vouchers;
    return vouchers.filter(v =>
      v.voucherCode.toLowerCase().includes(term) ||
      (v.beneficiaryName || "").toLowerCase().includes(term) ||
      (v.buyerName || "").toLowerCase().includes(term) ||
      (v.description || "").toLowerCase().includes(term)
    );
  }, [vouchers, query]);

  const handleClear = () => {
    onSelect(null);
    setQuery("");
  };

  return (
    <div ref={containerRef} className="relative" data-testid={testId}>
      {label && <Label className="text-sm font-medium mb-1.5 block">{label}</Label>}

      {selectedVoucher ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/40">
          <Check className="h-4 w-4 text-green-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium font-mono truncate">{selectedVoucher.voucherCode}</p>
            <p className="text-xs text-muted-foreground truncate">
              {selectedVoucher.beneficiaryName || selectedVoucher.buyerName}
              {selectedVoucher.valueType === "monetario" && selectedVoucher.valueAmount &&
                ` · $${parseFloat(selectedVoucher.valueAmount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="text-muted-foreground hover:text-foreground shrink-0"
            data-testid={`${testId}-clear`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setShowDropdown(true)}
            placeholder="Buscar por código o beneficiario..."
            className="pl-8"
            data-testid={`${testId}-input`}
          />
        </div>
      )}

      {showDropdown && !selectedVoucher && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-y-auto">
          {isLoading ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">Buscando...</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {vouchers.length === 0 ? "No hay vouchers activos para esta área" : "Sin resultados"}
            </div>
          ) : (
            results.map((v) => (
              <button
                key={v.id}
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex flex-col gap-0.5 border-b last:border-0"
                onClick={() => { onSelect(v); setQuery(""); setShowDropdown(false); }}
                data-testid={`${testId}-result-${v.id}`}
              >
                <span className="font-medium font-mono flex items-center gap-1.5">
                  <Gift className="h-3.5 w-3.5 text-muted-foreground" />
                  {v.voucherCode}
                </span>
                <span className="text-xs text-muted-foreground">
                  {[
                    v.beneficiaryName || v.buyerName,
                    v.valueType === "monetario" && v.valueAmount
                      ? `$${parseFloat(v.valueAmount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
                      : v.description,
                    v.expiresAt && `Vence ${v.expiresAt}`,
                  ].filter(Boolean).join(" · ")}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import type { BedType } from "@shared/schema";
import { bedCatalogOptions, bedLabel, roomBedOptions } from "@shared/bedCatalog";

export function useBedCatalog() {
  const query = useQuery<BedType[]>({ queryKey: ["/api/bed-types"], staleTime: 0, refetchOnMount: "always" });
  const catalog = Array.isArray(query.data) ? query.data : [];
  return {
    ready: query.isSuccess && !query.isError,
    error: query.isError,
    label: (code: string) => bedLabel(code, catalog),
    options: (retained: readonly string[] = []) => bedCatalogOptions(catalog, retained),
    forRoom: (allowed?: readonly string[] | null, current?: string | null) => roomBedOptions(catalog, allowed, current),
  };
}

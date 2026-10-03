export type DespegarUnbilledRow = {
  reservationId: string;
  reservationCode: string | null;
  roomNumber: string;
  guestName: string;
  checkInDate: string;
  checkOutDate: string;
  totalRoomAmount: number | null;
};

export const DESPEGAR_UNBILLED_QUERY_KEY = ["/api/night-audit/despegar-sin-facturar"] as const;

export const despegarUnbilledQueryOptions = {
  queryKey: DESPEGAR_UNBILLED_QUERY_KEY,
  staleTime: 0,
  refetchOnMount: "always" as const,
  refetchOnWindowFocus: true,
  refetchInterval: 60_000,
};
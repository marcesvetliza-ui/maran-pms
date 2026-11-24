export type RelocationRoom = {
  id: string;
  roomNumber: string;
  roomTypeId: string;
  category: string;
  categoryOrder: number;
  floor: number;
  status: string;
  bed: string | null;
  capacity: number | null;
  bedComparison: "same" | "different" | "review" | "unspecified";
  ready: boolean;
  selectable: boolean;
  unavailableReason: string | null;
  token: string;
};
export type RelocationPreview = {
  reservation: {
    id: string;
    code: string;
    guest: string;
    room: string;
    category: string;
    status: string;
    guests: number;
    requestedBed: string;
    bedNotes: string | null;
    preparation: string | null;
    from: string;
    to: string;
    token: string;
  };
  rooms: RelocationRoom[];
};

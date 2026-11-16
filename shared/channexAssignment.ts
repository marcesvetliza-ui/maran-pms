export type InboundAssignmentRoom = {
  id: string; number: string; categoryId: string; category: string;
  capacity: number; floor: number | null;
  categoryChanged: boolean; scopeOverride: boolean;
};
export type InboundAssignmentOptions = {
  revisionId: string; payloadHash: string; configurationHash: string;
  reviewCode: string | null; arrival: string; departure: string;
  currency: string; amount: string; exchangeRate: string; settlementTotal: string;
  canOverrideScope: boolean;
  rooms: {
    key: string; category: string; mappedCategory: string | null;
    occupancy: number; sourceTotal: string; choices: InboundAssignmentRoom[];
  }[];
};
export type InboundAssignmentRequest = {
  expectedPayloadHash: string; expectedConfigurationHash: string;
  assignments: Record<string, string>;
  reason: string;
  confirmCategoryChange: boolean; confirmScopeChange: boolean;
  overrideTentativeGroupWarning?: boolean;
};

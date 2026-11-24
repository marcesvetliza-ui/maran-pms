import { z } from "zod";

export const holderCorrectionSchema = z
  .object({
    guestId: z.string().min(1).max(100),
    expectedGuestId: z.string().min(1).max(100),
    reason: z.string().trim().min(10).max(1000),
    confirmed: z.literal(true),
  })
  .strict();

export type HolderCorrectionPreview = {
  reservationId: string;
  status: string;
  guest: { id: string; firstName: string; lastName: string };
  groupLinked: boolean;
  companionCount: number;
  canCorrect: boolean;
  blockers: string[];
};

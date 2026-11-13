import { z } from "zod";

export type ShiftStaff = {
  id: string;
  fullName: string;
  role: string;
  kind: "permanent" | "extra";
  serviceDate: string | null;
  source: "user" | "operational";
};
export type ExpiredShiftStaff = ShiftStaff & { pendingCount: number };
export const addShiftStaffSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  kind: z.enum(["permanent", "extra"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();

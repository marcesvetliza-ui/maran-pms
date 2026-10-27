import { db } from "../db";
import { billingConfig } from "@shared/schema";
import { eq } from "drizzle-orm";

export type BillingConfig = typeof billingConfig.$inferSelect;

export async function getBillingConfig(database: Omit<typeof db,"$client"> = db): Promise<BillingConfig> {
  const rows = await database.select().from(billingConfig).limit(1);
  if (rows.length > 0) return rows[0];
  // Insert default row if none exists
  const [row] = await database.insert(billingConfig).values({ id: 1 }).returning();
  return row;
}

export async function updateBillingConfig(data: Partial<BillingConfig>): Promise<BillingConfig> {
  const existing = await getBillingConfig();
  const [updated] = await db
    .update(billingConfig)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(billingConfig.id, existing.id))
    .returning();
  return updated;
}

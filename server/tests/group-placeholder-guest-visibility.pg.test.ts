import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../db";
import { storage } from "../db-storage";
import { guests } from "@shared/schema";
import { eq } from "drizzle-orm";

const id = `test-group-placeholder-${randomUUID()}`;
const realId = `test-null-code-guest-${randomUUID()}`;
const name = `Visibility Placeholder ${id}`;

describe("group placeholder visibility", () => {
  beforeAll(async () => {
    await db.insert(guests).values({
      id, firstName: name, lastName: "", codigo: `GROUP-${id}`,
      segment: "LEISURE", sexo: "no_especifica",
    } as any);
    await db.insert(guests).values({
      id: realId, firstName: `Null Code ${realId}`, lastName: "",
      codigo: null, segment: "LEISURE", sexo: "no_especifica",
    } as any);
  });
  afterAll(async () => {
    await db.delete(guests).where(eq(guests.id, id));
    await db.delete(guests).where(eq(guests.id, realId));
  });

  it("excludes explicit GROUP codes from lists and searches", async () => {
    const [all, results] = await Promise.all([storage.getGuests(), storage.searchGuests(name)]);
    expect(all.some(guest => guest.id === id)).toBe(false);
    expect(results.some(guest => guest.id === id)).toBe(false);
    expect(all.some(guest => guest.id === realId)).toBe(true);
  });
});
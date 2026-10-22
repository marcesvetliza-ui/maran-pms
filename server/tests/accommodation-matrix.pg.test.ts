import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, it, describe, expect } from "vitest";
import { ACCOMMODATION_PERMISSION as key } from "@shared/accommodationPermission";
const enabled =
  !!process.env.DATABASE_URL &&
  process.env.ALLOW_DESTRUCTIVE_PG_TESTS === "true";
if (enabled) {
  const u = new URL(process.env.DATABASE_URL!);
  if (
    !["localhost", "127.0.0.1"].includes(u.hostname) ||
    !/test/i.test(u.pathname)
  )
    throw Error("Disposable local DB required");
}
let pool: any, can: any, ensure: any, reload: any;
const id = "folio-permission-" + randomUUID();
let previous: any[] = [];
describe.skipIf(!enabled)(
  "Folio role matrix preserves individual permissions",
  () => {
    beforeAll(async () => {
      ({ pool } = await import("../db"));
      ({
        canEditAccommodation: can,
        ensureAccommodationPermissionsSchema: ensure,
      } = await import("../accommodationPermissions"));
      ({ loadRolePermissionsCache: reload } = await import("../permissions"));
      previous = (
        await pool.query(
          "SELECT role,resource_key FROM role_permissions WHERE role=$1 AND resource_key=$2",
          ["comercial", key],
        )
      ).rows;
      await pool.query(
        "INSERT INTO system_users(id,username,password,full_name,email,role,is_active,created_at)VALUES($1::text,$1::text,'synthetic','Synthetic commercial','test@example.invalid','comercial','true',NOW())",
        [id],
      );
      await ensure();
      await reload();
    });
    afterAll(async () => {
      if (pool) {
        await pool.query(
          "DELETE FROM user_permission_overrides WHERE user_id=$1",
          [id],
        );
        await pool.query("DELETE FROM system_users WHERE id=$1", [id]);
        await pool.query(
          "DELETE FROM role_permissions WHERE role=$1 AND resource_key=$2",
          ["comercial", key],
        );
        for (const v of previous)
          await pool.query(
            "INSERT INTO role_permissions(role,resource_key)VALUES($1,$2) ON CONFLICT DO NOTHING",
            [v.role, v.resource_key],
          );
        await pool.end();
      }
    });
    it("changes editing independently of access to reservations and retains exceptions", async () => {
      const user = { id, role: "comercial" };
      await pool.query(
        "INSERT INTO role_permissions(role,resource_key)VALUES($1,$2) ON CONFLICT DO NOTHING",
        ["comercial", key],
      );
      await reload();
      expect(await can(user)).toBe(true);
      await pool.query(
        "DELETE FROM role_permissions WHERE role=$1 AND resource_key=$2",
        ["comercial", key],
      );
      await reload();
      expect(await can(user)).toBe(false);
      expect(
        (
          await pool.query(
            "SELECT 1 FROM role_permissions WHERE role='comercial' AND resource_key='sidebar:/reservations'",
          )
        ).rows,
      ).toHaveLength(1);
      await pool.query(
        "INSERT INTO user_permission_overrides(user_id,resource_key,allowed)VALUES($1,$2,true)",
        [id, key],
      );
      expect(await can(user)).toBe(true);
      await pool.query(
        "UPDATE user_permission_overrides SET allowed=false WHERE user_id=$1",
        [id],
      );
      await pool.query(
        "INSERT INTO role_permissions(role,resource_key)VALUES($1,$2) ON CONFLICT DO NOTHING",
        ["comercial", key],
      );
      await reload();
      expect(await can(user)).toBe(false);
    });
    it("does not restore revoked grants during repeated migration", async () => {
      await pool.query(
        "DELETE FROM user_permission_overrides WHERE user_id=$1",
        [id],
      );
      await pool.query(
        "DELETE FROM role_permissions WHERE role=$1 AND resource_key=$2",
        ["comercial", key],
      );
      await ensure();
      await ensure();
      await reload();
      expect(await can({ id, role: "comercial" })).toBe(false);
    });
  },
);

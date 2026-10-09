import {randomUUID} from "node:crypto";
import pg from "pg";
import {drizzle} from "drizzle-orm/node-postgres";
import {describe,it,expect} from "vitest";
import {seedPilotPermissionsOnce} from "../pilot-permissions";

(process.env.DATABASE_URL ? describe : describe.skip)("pilot permission upgrade",()=>{
  it("preserves demo access without granting administration, and respects subsequent revocations",async()=>{
    const client=new pg.Client({connectionString:process.env.DATABASE_URL});
    const schema="pilot_permission_"+randomUUID().replaceAll("-","");
    await client.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      await client.query("CREATE TABLE resource_permission_seeds(resource_key text PRIMARY KEY); CREATE TABLE role_permissions(role text,resource_key text,UNIQUE(role,resource_key))");
      const database=drizzle(client);
      await seedPilotPermissionsOnce(database);
      const granted=(await client.query("SELECT resource_key FROM role_permissions WHERE role='piloto_externo'")).rows.map(r=>r.resource_key);
      expect(granted).toContain("sidebar:/planning");
      expect(granted).toContain("sidebar:/spa");
      expect(granted).not.toContain("sidebar:/admin");
      expect(granted).not.toContain("sidebar:/billing");
      await client.query("DELETE FROM role_permissions WHERE resource_key='sidebar:/spa'");
      await seedPilotPermissionsOnce(database);
      expect((await client.query("SELECT * FROM role_permissions WHERE resource_key='sidebar:/spa'")).rowCount).toBe(0);
    } finally {
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });
});

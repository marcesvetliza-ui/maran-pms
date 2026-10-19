/** Explicit disposable database only. No operational URL, no ARCA calls, no real guests. */
import { sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { storage } from "../server/db-storage";
import bcrypt from "bcryptjs";
import { initialNightlyPricing } from "../shared/nightlyPricing";
const expected = "postgresql://runner@/maran_nightly_folio_demo?host=%2Ftmp%2Fmaran-nightly-folio-demo%2Fsocket&port=55478";
if (process.env.DATABASE_URL !== expected) throw new Error("Refusing seed: use the exact disposable demo database.");
const identity = (await pool.query("SELECT current_database() AS name, inet_server_addr() AS address")).rows[0];
if (identity.name !== "maran_nightly_folio_demo" || identity.address !== null) throw new Error("Refusing nonlocal database.");
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
const day = (offset: number) => new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
await db.execute(sql`
  INSERT INTO system_users(id,username,password,email,full_name,role,created_at,is_active)
  VALUES ('nightly-demo-admin','demo.nightly',${await bcrypt.hash("DemoNightly2026!",10)},'nightly@example.invalid','Operador Demo Nocturna','admin',NOW(),'true')
  ON CONFLICT (id) DO NOTHING
`);
await db.execute(sql`INSERT INTO room_types(id,code,name) VALUES ('nightly-demo-type','DEMO-NIGHTLY','Demo Nocturna') ON CONFLICT (id) DO NOTHING`);
await db.execute(sql`
  INSERT INTO guests(id,first_name,last_name,document_type,document_number,email)
  VALUES ('nightly-demo-guest','Huésped','Sintético','dni','DEMO-NIGHTLY','guest@example.invalid') ON CONFLICT (id) DO NOTHING
`);
for (let i = 1; i <= 5; i++) await db.execute(sql`
  INSERT INTO rooms(id,room_number,room_type_id,floor,status)
  VALUES (${`nightly-demo-room-${i}`},${`D${i}`},'nightly-demo-type',0,'available')
  ON CONFLICT (id) DO NOTHING
`);
await db.execute(sql`INSERT INTO system_settings(key,value,category,updated_at) VALUES ('reservation_nightly_activation_at','2001-01-01T00:00:00.000Z','reservations',NOW()) ON CONFLICT(key) DO NOTHING`);
for (const [index, id] of ["nightly-demo-editable", "nightly-demo-partial", "nightly-demo-full", "nightly-demo-legacy"].entries()) {
  const found = await storage.getReservation(id);
  if (found) continue;
  const legacy = id.endsWith("legacy");
  const lines = initialNightlyPricing({ checkInDate: day(1), checkOutDate: day(4), baseRatePerNight: "90000", totalRoomAmount: "270000" });
  if (!legacy) { lines[1].rateCents = 9_500_000; lines[2].rateCents = 10_000_000; }
  const total = legacy ? "270000.00" : "285000.00";
  await db.execute(sql`
    INSERT INTO reservations(id,reservation_code,guest_id,room_id,room_type_id,check_in_date,check_out_date,nights,
      base_rate_per_night,final_rate_per_night,total_room_amount,discount_type,discount_value,status,source,number_of_guests,
      created_at,pricing_scheme,pricing_revision,nightly_pricing,last_modified_by)
    VALUES (${id},${`DEMO-NOCTURNA-${index+1}`},'nightly-demo-guest',${`nightly-demo-room-${index+1}`},'nightly-demo-type',
      ${day(1)},${day(4)},3,90000,${legacy ? "90000" : "95000"},${total},'none',0,'confirmed','directo',1,
      ${legacy ? "2000-01-01" : new Date().toISOString()}::timestamp,${legacy ? "legacy" : "nightly_v1"},0,
      ${legacy ? null : JSON.stringify(lines)}::jsonb,'nightly-demo-admin')
  `);
  await db.execute(sql`INSERT INTO reservation_changelog(reservation_id,operador,tipo,descripcion) VALUES (${id},'Operador Demo','creation','Reserva sintética de demostración. Sin operaciones fiscales reales.')`);
  if (!legacy) await db.execute(sql`
    INSERT INTO payments(id,reservation_id,amount,method,notes,date,status)
    VALUES (${`${id}-advance`},${id},50000,'transferencia','Anticipo sintético, no fiscal',${today},'active')
  `);
  if (id.endsWith("partial") || id.endsWith("full")) {
    const amount = id.endsWith("full") ? 285000 : 100000;
    await db.execute(sql`
      INSERT INTO sales_invoices(tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,
        cliente_condicion_iva,monto_neto,monto_total,estado,modo_ficticio,reserva_id,source_charge_ids,source_charge_amounts,items)
      VALUES ('FB',999,${index+1},${today},'Huésped Sintético','consumidor_final',${amount},${amount},'emitida',true,${id},
        '["accommodation"]'::jsonb,${JSON.stringify({ accommodation: amount })}::jsonb,'[]'::jsonb)
    `);
  }
}
await db.execute(sql`INSERT INTO billing_config(id,arca_ambiente) VALUES (1,'ficticio') ON CONFLICT(id) DO UPDATE SET arca_ambiente='ficticio'`);
console.log("Demo isolated: editable, fiscal partial/full and legacy reservations. No real fiscal service or operational DB used.");
await pool.end();

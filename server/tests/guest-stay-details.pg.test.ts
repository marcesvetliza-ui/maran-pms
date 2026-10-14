import express from "express";
import http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { emptyStayProfile, type GuestStayProfile } from "../../shared/guestStayProfile";

vi.mock("../auth", () => ({
  requireAuth: (req: any, res: any, next: any) => req.headers["x-role"] ? next() : res.sendStatus(401),
  requirePermission: () => (req: any, res: any, next: any) => ["admin", "reception"].includes(req.headers["x-role"]) ? next() : res.sendStatus(403),
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));
const suite = process.env.DATABASE_URL ? describe : describe.skip;
const prefix = `stay-${randomUUID()}`;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
let service: typeof import("../guestStayDetails");
let server: http.Server;
let base = "";
let counter = 0;
const profile: GuestStayProfile = {
  family: [{ id: "daughter", firstName: "Ana", lastName: "Prueba", relationship: "Hija", documentType: "DNI", documentNumber: "12345678", dateOfBirth: "2015-05-10", nationality: "Argentina" }],
  vehicles: [{ id: "car", plate: "ABC123", brand: "Toyota", model: "Corolla", color: "Blanco" }],
  pets: [{ id: "pet", name: "Lola", species: "Perro", notes: "Pequeña" }],
};
async function reservation() {
  const id = `${prefix}-${counter++}`;
  await pool!.query("INSERT INTO reservations(id,reservation_code,guest_id,room_id,room_type_id,check_in_date,check_out_date,nights,created_at) VALUES($1,$3,$2,$2,$2,'2028-01-01','2028-01-03',2,now())", [id, prefix, id]);
  return id;
}
function input(version = 0, selection = profile) { return { guestId: prefix, version, selection }; }
async function request(id: string, body?: any, role = "reception") {
  const response = await fetch(`${base}/api/reservations/${id}/stay-details`, { method: body ? "PUT" : "GET", headers: { "Content-Type": "application/json", "x-role": role }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: response.status === 403 ? null : await response.json() };
}
suite("Selecciones de estadía con PostgreSQL real", () => {
  beforeAll(async () => {
    if (process.env.NODE_ENV === "production") throw new Error("Solo base de pruebas");
    const { ensureGuestStaySchema } = await import("../guestStaySchema"); await ensureGuestStaySchema(); await ensureGuestStaySchema();
    await pool!.query("INSERT INTO guests(id,first_name,last_name,stay_profile) VALUES($1,'Titular','Prueba',$2),($3,'Otro','Titular',null)", [prefix, JSON.stringify(profile), `${prefix}-other`]);
    await pool!.query("INSERT INTO room_types(id,code,name) VALUES($1,$2,'Prueba')", [prefix, prefix]);
    await pool!.query("INSERT INTO rooms(id,room_number,room_type_id,status) VALUES($1,$2,$1,'available')", [prefix, prefix]);
    service = await import("../guestStayDetails");
    const app = express(); app.use(express.json()); app.use((req,_res,next) => { req.user = {id:prefix,username:"Prueba",role:"admin"} as any; req.isAuthenticated = () => Boolean(req.headers["x-role"]); next(); });
    server = http.createServer(app);
    const { registerRoutes } = await import("../routes"); await registerRoutes(server,app);
    await new Promise<void>(resolve => server.listen(0,"127.0.0.1",resolve)); base = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    await pool!.query("DELETE FROM reservation_changelog WHERE reservation_id IN(SELECT id FROM reservations WHERE reservation_code LIKE $1)", [`${prefix}%`]);
    await pool!.query("DELETE FROM audit_logs WHERE entity_id IN(SELECT id FROM reservations WHERE reservation_code LIKE $1)", [`${prefix}%`]);
    await pool!.query("DELETE FROM reservations WHERE reservation_code LIKE $1", [`${prefix}%`]);
    await pool!.query("DELETE FROM guests WHERE id IN($1,$2)", [prefix,`${prefix}-other`]);
    await pool!.query("DELETE FROM rooms WHERE id=$1", [prefix]); await pool!.query("DELETE FROM room_types WHERE id=$1", [prefix]);
    await pool!.end();
    const database = await import("../db"); await database.pool.end();
  });
  it("no selecciona datos habituales ni crea clientes hasta confirmar; guarda sin duplicados", async () => {
    const id = await reservation();
    expect((await request(id)).body).toMatchObject({ ...emptyStayProfile(), version: 0 });
    expect((await request(id,input())).status).toBe(200);
    expect((await request(id,input(1))).status).toBe(200);
    expect((await pool!.query("SELECT first_name, profile_member_id FROM reservation_companions WHERE reservation_id=$1",[id])).rows).toEqual([{first_name:"Ana",profile_member_id:"daughter"}]);
    expect((await pool!.query("SELECT id FROM guests WHERE id LIKE $1",[`${prefix}%`])).rows).toHaveLength(2);
    expect((await request(id)).body.vehicles[0].plate).toBe("ABC123");
  });
  it("la API completa guarda la edición del perfil y lo conserva al crear una reserva", async () => {
    await pool!.query("UPDATE guests SET stay_profile=null,vehiculo_patente=null,vehiculo_marca=null,vehiculo_modelo=null,vehiculo_color=null WHERE id=$1",[prefix]);
    const headers={"Content-Type":"application/json","x-role":"reception"};
    const updated=await fetch(`${base}/api/guests/${prefix}`,{method:"PATCH",headers,body:JSON.stringify({stayProfile:profile,vehiculoPatente:"",vehiculoMarca:"",vehiculoModelo:"",vehiculoColor:"",id:"no-se-debe-cambiar"})});
    expect(updated.status).toBe(200);expect(await updated.json()).toMatchObject({id:prefix,stayProfile:profile,vehiculoPatente:"ABC123"});
    const reloaded=await fetch(`${base}/api/guests/${prefix}`,{headers});expect((await reloaded.json()).stayProfile).toEqual(profile);
    const created=await fetch(`${base}/api/reservations`,{method:"POST",headers,body:JSON.stringify({reservationCode:`${prefix}-profile-route`,guestId:prefix,roomTypeId:prefix,roomId:prefix,checkInDate:"2032-01-01",checkOutDate:"2032-01-03",nights:2,finalRatePerNight:"100",totalRoomAmount:"200",status:"confirmed",numberOfGuests:1,stayDetailsInput:input(0,emptyStayProfile())})});
    expect(created.status).toBe(201);const row=await created.json();expect((await request(row.id)).body).toMatchObject(emptyStayProfile());
    expect((await (await fetch(`${base}/api/guests/${prefix}`,{headers})).json()).stayProfile).toEqual(profile);
  });
  it("la ruta completa valida perfiles inválidos y conserva el perfil previamente guardado",async()=>{
    const headers={"Content-Type":"application/json","x-role":"reception"};
    const response=await fetch(`${base}/api/guests/${prefix}`,{method:"PATCH",headers,body:JSON.stringify({stayProfile:{...profile,pets:[{...profile.pets[0],species:""}]}})});
    expect(response.status).toBe(400);
    expect((await (await fetch(`${base}/api/guests/${prefix}`,{headers})).json()).stayProfile).toEqual(profile);
  });
  it("editar la ficha habitual no reescribe los datos de una estadía", async () => {
    const id = await reservation(); await service.saveStayDetails(id,input());
    await pool!.query("UPDATE guests SET stay_profile=$2 WHERE id=$1",[prefix,JSON.stringify({...profile,vehicles:[{...profile.vehicles[0],plate:"NEW123"}],family:[{...profile.family[0],firstName:"Cambiado"}]})]);
    const stored = await service.readStayDetails(id); expect(stored.family[0].firstName).toBe("Ana"); expect(stored.vehicles[0].plate).toBe("ABC123");
    await pool!.query("UPDATE guests SET stay_profile=$2 WHERE id=$1",[prefix,JSON.stringify(profile)]);
  });
  it("deseleccionar familiares conserva acompañantes ocasionales y la agenda", async () => {
    const id = await reservation(); await service.saveStayDetails(id,input());
    await pool!.query("INSERT INTO reservation_companions(reservation_id,first_name,last_name) VALUES($1,'Amigo','Ocasional')",[id]);
    await service.saveStayDetails(id,input(1,emptyStayProfile()));
    expect((await pool!.query("SELECT first_name FROM reservation_companions WHERE reservation_id=$1",[id])).rows).toEqual([{first_name:"Amigo"}]);
    expect((await pool!.query("SELECT stay_profile FROM guests WHERE id=$1",[prefix])).rows[0].stay_profile.family).toHaveLength(1);
  });
  it("reutiliza un acompañante manual con el mismo documento", async () => {
    const id = await reservation(); await pool!.query("INSERT INTO reservation_companions(reservation_id,first_name,last_name,document_number) VALUES($1,'Ana','Prueba','12345678')",[id]);
    await service.saveStayDetails(id,input());
    expect((await pool!.query("SELECT id FROM reservation_companions WHERE reservation_id=$1",[id])).rows).toHaveLength(1);
  });
  it("dos guardados simultáneos no pisan cambios ni duplican familiares", async () => {
    const id = await reservation(); const results = await Promise.all([request(id,input()),request(id,input())]);
    expect(results.map(row => row.status).sort()).toEqual([200,409]);
    expect((await pool!.query("SELECT id FROM reservation_companions WHERE reservation_id=$1",[id])).rows).toHaveLength(1);
  });
  it("rechaza datos del titular anterior sin modificar la reserva", async () => {
    const id = await reservation(); await pool!.query("UPDATE reservations SET guest_id=$2 WHERE id=$1",[id,`${prefix}-other`]);
    expect((await request(id,input())).status).toBe(409); expect((await service.readStayDetails(id)).family).toHaveLength(0);
  });
  it("guarda un dato ocasional en la ficha solo con autorización explícita", async () => {
    const id = await reservation(); const pet = {...profile.pets[0],id:"occasional",name:"Otra"}; const selection = {...emptyStayProfile(),pets:[pet]};
    await service.saveStayDetails(id,input(0,selection));
    expect((await pool!.query("SELECT stay_profile FROM guests WHERE id=$1",[prefix])).rows[0].stay_profile.pets).toHaveLength(1);
    await service.saveStayDetails(id,{...input(1,selection),remember:selection});
    expect((await pool!.query("SELECT stay_profile FROM guests WHERE id=$1",[prefix])).rows[0].stay_profile.pets).toHaveLength(2);
  });
  it("un fallo al recordar datos revierte también la selección y los acompañantes", async () => {
    const id = await reservation(); const invalidRemember = {...emptyStayProfile(), vehicles:Array.from({length:10},(_,i)=>({...profile.vehicles[0],id:`extra${i}`}))};
    await expect(service.saveStayDetails(id,{...input(),remember:invalidRemember})).rejects.toThrow();
    expect((await service.readStayDetails(id)).version).toBe(0); expect((await pool!.query("SELECT id FROM reservation_companions WHERE reservation_id=$1",[id])).rows).toHaveLength(0);
  });
  it("valida datos y permisos en el servidor", async () => {
    const id = await reservation(); expect((await request(id,input(),"housekeeping")).status).toBe(403); expect((await request(id,undefined,"housekeeping")).status).toBe(403);
    expect((await request(id,input(0,{...profile,vehicles:[{...profile.vehicles[0],plate:""}]}))).status).toBe(400);
    expect((await request(id,input(0,{...profile,family:[{...profile.family[0],dateOfBirth:"2015-02-30"}]}))).status).toBe(400);
  });
  it("crear una reserva y sus selecciones se confirma en una sola transacción", async () => {
    const { storage } = await import("../db-storage");
    const payload = { reservationCode: `${prefix}-atomic`, guestId: prefix, roomTypeId: prefix, roomId: prefix, checkInDate: "2031-01-01", checkOutDate: "2031-01-03", nights: 2, createdAt: new Date(), numberOfGuests: 2, finalRatePerNight: "100", totalRoomAmount: "200", status: "confirmed" as const };
    const created = await storage.createReservation(payload, row => service.saveStayDetails(row.id,input()).then(() => undefined));
    expect((await service.readStayDetails(created.id)).family).toHaveLength(1);
    const invalidRemember = {...emptyStayProfile(), vehicles:Array.from({length:10},(_,i)=>({...profile.vehicles[0],id:`failure${i}`}))};
    await expect(storage.createReservation({...payload,reservationCode:`${prefix}-rollback`,checkInDate:"2031-02-01",checkOutDate:"2031-02-03"},row=>service.saveStayDetails(row.id,{...input(),remember:invalidRemember}).then(()=>undefined))).rejects.toThrow();
    expect((await pool!.query("SELECT id FROM reservations WHERE reservation_code=$1",[`${prefix}-rollback`])).rows).toHaveLength(0);
  });
  it("cambiar el titular limpia selecciones del anterior sin borrar acompañantes ocasionales", async () => {
    const { storage } = await import("../db-storage");const id=await reservation();await service.saveStayDetails(id,input());
    await pool!.query("INSERT INTO reservation_companions(reservation_id,first_name,last_name) VALUES($1,'Amigo','Ocasional')",[id]);
    await storage.updateReservation(id,{guestId:`${prefix}-other`});
    const details=await service.readStayDetails(id);expect(details.family).toHaveLength(0);expect(details.vehicles).toHaveLength(0);expect(details.pets).toHaveLength(0);
    expect((await pool!.query("SELECT first_name FROM reservation_companions WHERE reservation_id=$1",[id])).rows).toEqual([{first_name:"Amigo"}]);
  });
});

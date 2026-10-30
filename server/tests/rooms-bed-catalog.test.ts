import express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  allowed: true,
  save: vi.fn(),
  room: { id:"room", bedConfig:"OLD", allowedBedConfigs:["CUSTOM","OLD"], status:"dirty" },
}));
vi.mock("../db", () => ({ db: {}, pool: {} }));
vi.mock("../audit", () => ({ audit: vi.fn() }));
vi.mock("../permissions", () => ({hasPermission: () => state.allowed}));
vi.mock("../db-storage", () => ({
  storage: {
    getRoom: async () => state.room,
    getBedTypes: async () => [
      {code:"CUSTOM",name:"Triple",isActive:true},
      {code:"OTHER",name:"Otro",isActive:true},
      {code:"OLD",name:"Anterior",isActive:false},
    ],
    updateRoom: async (_id:string, patch:unknown) => { state.save(patch); return patch; },
    createRoom: async (patch:unknown) => {state.save(patch);return patch;},
  },
}));
import { registerRoomsRoutes } from "../routes/rooms";

// Exercise the registered route AND its actual permission middleware in memory.
// No listener, network request or database credentials are needed.
async function call(method: "post" | "patch", body: unknown) {
  const app = express();
  registerRoomsRoutes(app);
  const path = method === "patch" ? "/api/rooms/:id" : "/api/rooms";
  const route = (app as any)._router.stack.find((layer:any) => layer.route?.path === path && layer.route.methods[method]).route;
  const req:any = {body, params:{id:"room"},user:{role:"admin"},isAuthenticated:()=>true};
  let status = 200, payload:unknown;
  const res:any = {status:(value:number) => {status=value;return res;},json:(value:unknown) => {payload=value;return res;}};
  for (const layer of route.stack) {
    let next = false;
    await layer.handle(req,res,() => {next=true;});
    if (!next) break;
  }
  return {status,payload};
}
beforeEach(() => { state.allowed=true; state.save.mockClear(); });
describe("room bed catalog route validation", () => {
  it("accepts active custom codes and persists room restrictions", async () => {
    const patch={bedConfig:"CUSTOM",allowedBedConfigs:["CUSTOM","OLD"]};
    expect(await call("patch",patch)).toEqual({status:200,payload:patch});
    expect(state.save).toHaveBeenCalledWith(patch);
  });
  it.each([{bedConfig:"FORGED"},{bedConfig:"OTHER"},{allowedBedConfigs:["FORGED"]}])("rejects invalid or disallowed assignments without writes: %j", async patch => {
    expect((await call("patch",patch)).status).toBe(400);
    expect(state.save).not.toHaveBeenCalled();
  });
  it("preserves inactive history without allowing a new room to choose it", async () => {
    expect((await call("patch",{bedConfig:"OLD",allowedBedConfigs:["OLD"]})).status).toBe(200);
    state.save.mockClear();
    expect((await call("post",{bedConfig:"OLD"})).status).toBe(400);
    expect(state.save).not.toHaveBeenCalled();
  });
  it("keeps permissions enforced before accepting a valid catalog choice", async () => {
    state.allowed=false;
    expect((await call("patch",{bedConfig:"CUSTOM"})).status).toBe(403);
    expect(state.save).not.toHaveBeenCalled();
  });
});

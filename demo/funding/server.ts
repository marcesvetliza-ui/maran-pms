import express from "express";
import pg from "pg";
import { fileURLToPath } from "node:url";
import { createDemoService, demoActor, installSyntheticSchema, seedDemo } from "./backend";
import { registerPaymentFundingRoutes, fundingErrorResponse } from "../../server/billing/funding/routes";

const socket=process.argv[2]??"/tmp/folio-funding-isolated/socket";
const port=Number(process.argv[3]??8099);
if (!socket.startsWith("/tmp/folio-funding-isolated/")) throw new Error("Only the isolated synthetic Unix socket is allowed.");
const pool=new pg.Pool({host:socket,port:55439,user:"runner",password:"",database:"folio_funding_synthetic",ssl:false,max:15});
await installSyntheticSchema(pool);
const {service,faults}=createDemoService(pool);
// Preserve state across process restarts, including post-CAE holds.
const existing=(await pool.query("SELECT 1 FROM payment_funding.scopes WHERE id='spa-existing'")).rowCount;
const scenarios=existing?null:await seedDemo(service);
// Scenario requests are descriptions; refreshing/restarting must not reseed money.
const catalog=await import("./scenarios");
const app=express();
app.disable("x-powered-by");
app.use(express.json({limit:"128kb"}));
app.use((_req,res,next)=>{res.setHeader("Cache-Control","no-store");next();});
registerPaymentFundingRoutes(app,service,{authenticate:(_req,_res,next)=>next(),actor:()=>demoActor});
app.get("/api/demo/scenarios",(_req,res)=>res.json({ok:true,data:scenarios??catalog.scenarioCatalog()}));
app.post("/api/demo/faults",(req,res)=>{
  if (!["after_cae","finalize_after_cash"].includes(req.body.point)) return res.status(422).json({ok:false,error:{code:"INVALID_FAULT",message:"Fallo no permitido.",retryable:false}});
  faults.add(req.body.point);res.json({ok:true,data:{point:req.body.point,oneShot:true}});
});
app.get("/api/demo/health",async(_req,res)=>{
  try { await pool.query("SELECT 1");res.json({ok:true,data:{synthetic:true,productionEnabled:false,emitter:"fake",database:"PostgreSQL"}}); }
  catch(error) { fundingErrorResponse(res,error); }
});
app.use(express.static(fileURLToPath(new URL(".",import.meta.url))));
const server=app.listen(port,"0.0.0.0",()=>console.log(`Synthetic Folio/SPA demo ready on ${port}; PostgreSQL Unix socket only; no ARCA/operational DB.`));
async function stop(){server.close();await pool.end();process.exit(0);}
process.on("SIGTERM",stop);process.on("SIGINT",stop);

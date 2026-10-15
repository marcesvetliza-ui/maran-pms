import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { AsyncLocalStorage } from "node:async_hooks";
import * as schema from "../../../shared/schema";

// No DATABASE_URL, server/db import, TCP, or operational data.
export const pool=new pg.Pool({
  host:"/tmp/folio-funding-isolated/socket",port:55439,user:"runner",password:"",
  database:"folio_funding_synthetic",ssl:false,max:20,options:"-c search_path=funding_demo,public",
});
const root=drizzle(pool,{schema});
type Transaction=Parameters<Parameters<typeof root.transaction>[0]>[0];
const context=new AsyncLocalStorage<Transaction>();
export const db:typeof root=new Proxy(root,{
  get(_target,key) {
    const executor=context.getStore()??root,value=Reflect.get(executor,key,executor);
    return typeof value==="function"?value.bind(executor):value;
  },
});
export function withDatabaseTransaction<T>(run:()=>Promise<T>):Promise<T> {
  if(context.getStore()) return run();
  return root.transaction(tx=>context.run(tx,run));
}

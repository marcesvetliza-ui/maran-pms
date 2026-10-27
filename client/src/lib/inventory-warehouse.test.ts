import {it,expect} from "vitest";
import {isActiveWarehouse} from "./inventory-warehouse";
it("accepts real API and legacy warehouse state without showing inactive or malformed entries",()=>{
 expect([{id:"a",is_active:"true"},{id:"b",isActive:"true"},{id:"c",is_active:false,isActive:"true"},{id:"d",is_active:true},{id:"e",is_active:"false"},{id:"f"},{}].filter(isActiveWarehouse).map(w=>w.id)).toEqual(["a","b","d"]);
});

import { describe, expect, it } from "vitest";
import { bedCatalogOptions, bedLabel, roomBedOptions, validateRoomBeds } from "./bedCatalog";
const catalog = [
  {code:"CUSTOM",name:"Tres camas",isActive:true},
  {code:"MAT",name:"Doble configurable",isActive:true},
  {code:"OFF",name:"Camaje anterior",isActive:false},
];
describe("editable bed catalog", () => {
  it("uses configured labels and alphabetic order without adding the fixed list", () => {
    expect(bedCatalogOptions(catalog).map(o => o.label)).toEqual(["Doble configurable","Tres camas"]);
    expect(bedLabel("MAT", catalog)).toBe("Doble configurable");
  });
  it("keeps saved inactive and missing values visible, without making them new choices", () => {
    expect(bedCatalogOptions(catalog,["OFF","MISSING"]).filter(o => o.disabled).map(o => o.value)).toEqual(["OFF","MISSING"]);
    expect(bedLabel("TWIN",catalog)).toBe("Twin (2 camas)");
    expect(bedLabel("MISSING",catalog)).toBe("MISSING");
  });
  it("restricts a room and preserves an out-of-list current value as disabled", () => {
    expect(roomBedOptions(catalog,["CUSTOM"],"OFF")).toEqual([
      {value:"OFF",label:"Camaje anterior",disabled:true},
      {value:"CUSTOM",label:"Tres camas",disabled:false},
    ]);
    expect(roomBedOptions(catalog,[]).map(o => o.value)).toEqual(["MAT","CUSTOM"]);
  });
  it("rejects forged or inactive new codes and respects room restrictions", () => {
    expect(validateRoomBeds(catalog,{bedConfig:"CUSTOM"})).toBeNull();
    expect(validateRoomBeds(catalog,{bedConfig:"FORGED"})).toBeTruthy();
    expect(validateRoomBeds(catalog,{bedConfig:"OFF"})).toBeTruthy();
    expect(validateRoomBeds(catalog,{bedConfig:"CUSTOM"},{allowedBedConfigs:["MAT"]})).toBeTruthy();
    expect(validateRoomBeds(catalog,{allowedBedConfigs:["FORGED"]})).toBeTruthy();
    expect(validateRoomBeds(catalog,{allowedBedConfigs:"CUSTOM"})).toBeTruthy();
  });
  it("allows unrelated edits retaining history but never adds inactive options to another room", () => {
    expect(validateRoomBeds(catalog,{bedConfig:"OFF",allowedBedConfigs:["OFF","CUSTOM"]},{bedConfig:"OFF",allowedBedConfigs:["OFF"]})).toBeNull();
    expect(validateRoomBeds(catalog,{allowedBedConfigs:["OFF"]},{bedConfig:"MAT"})).toBeTruthy();
  });
  it("keeps explicitly saved legacy codes usable without inventing new legacy choices", () => {
    expect(validateRoomBeds(catalog,{bedConfig:"TWIN"},{allowedBedConfigs:["TWIN"]})).toBeNull();
    expect(validateRoomBeds(catalog,{bedConfig:"TWIN"})).toBeTruthy();
    expect(bedCatalogOptions([], ["TWIN"])).toEqual([{value:"TWIN",label:"Twin (2 camas)",disabled:false}]);
  });
});

import { describe, expect, it } from "vitest";
import { nonFiscalCollectionError } from "./cash-document-classification";
describe("cierre de habitación a cuenta corriente",()=>{
 it.each(['cuenta_corriente','current_account'])("%s traslada deuda sin cobrar",method=>expect(nonFiscalCollectionError('cierre_habitacion',[method])).toBeNull());
 it.each(['tarjeta_credito','debit_card','transferencia'])("sigue rechazando cobro no fiscal por %s",method=>expect(nonFiscalCollectionError('cierre_habitacion',['cuenta_corriente',method])).toMatch(/efectivo/));
 it.each(['ticket','cierre_spa','voucher_justo'])("no amplía las reglas de %s",type=>expect(nonFiscalCollectionError(type,['cuenta_corriente'])).toBeTruthy());
});

import { expect, it } from "vitest";
import { creditTypeForDebitNote, debitNoteCorrectionTag, isDebitAnnulmentCredit } from "./debitNoteActions";

it.each([['NDA','NCA'],['NDB','NCB'],['NDC','NCC'],['NDT','NCT'],['NDM','NCM'],['NDMB','NCMB']])('conserva la clase fiscal al anular %s',(debit,credit)=>expect(creditTypeForDebitNote(debit)).toBe(credit));
it.each(['FB','NCB','ticket','unknown','toString','__proto__'])('no trata %s como Nota de Débito',type=>expect(creditTypeForDebitNote(type)).toBeUndefined());
it('recupera la referencia persistida al final y no una etiqueta copiada dentro del motivo',()=>{
  const fingerprint='a'.repeat(64),old='b'.repeat(64),operationKey='debit-annul:42:11111111-1111-4111-8111-111111111111';
  const note={tipo_comprobante:'NCB',observaciones:`Motivo copiado [annul-debit:99:${old}] [debit-operation:debit-annul:99:22222222-2222-4222-8222-222222222222] [annul-debit:42:${fingerprint}] [debit-operation:${operationKey}]`};
  expect(debitNoteCorrectionTag(note)).toEqual({targetId:42,fingerprint,operationKey});expect(isDebitAnnulmentCredit(note)).toBe(true);
  expect(isDebitAnnulmentCredit({...note,tipo_comprobante:'FB'})).toBe(false);
});

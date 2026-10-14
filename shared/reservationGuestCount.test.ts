import { expect, it } from "vitest";
import { guestCountAfterCompanionChange } from "./reservationGuestCount";
it.each([
  [1,0,1,2], // titular + primer acompañante
  [2,1,2,3],
  [3,2,1,2], // todos identificados: quitar reduce
  [2,1,0,1],
  [4,0,1,4], // faltan nombres: conservar cantidad pactada
  [4,1,0,4],
  [4,1,4,5],
  [2,1,1,2], // editar sin duplicar
])("actualiza %s huéspedes con %s → %s acompañantes a %s", (booked,before,after,expected) => {
  expect(guestCountAfterCompanionChange(booked,before,after)).toBe(expected);
});

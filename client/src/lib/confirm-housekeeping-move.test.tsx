import {describe,it,expect} from 'vitest';
import {act,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {confirmHousekeepingMove} from './confirm-housekeeping-move';
describe('diálogo de cambio con preparación',()=>{
 it.each([['Cancelar',false],['Mover igualmente',true]] as const)('%s devuelve la decisión y cierra el aviso',async(label,expected)=>{
  let result!:Promise<boolean>;
  await act(async()=>{result=confirmHousekeepingMove('Cuna preparada en la 301');});
  expect(screen.getByRole('alertdialog')).toHaveTextContent('Cuna preparada en la 301');
  await userEvent.setup().click(screen.getByRole('button',{name:label}));expect(await result).toBe(expected);await waitFor(()=>expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
 });
});

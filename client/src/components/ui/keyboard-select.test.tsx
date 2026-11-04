import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './keyboard-select';
import { Dialog, DialogContent, DialogTitle } from './dialog';
import { Input } from './input';

function Form({ onChange = vi.fn(), controlled = false }: { onChange?: (value: string) => void; controlled?: boolean }) {
  const [open, setOpen] = useState(false);
  return <Dialog open><DialogContent><DialogTitle>Alta de prueba</DialogTitle>
    <Input aria-label="Nombre" />
    <Select defaultValue="kg" onValueChange={onChange} {...(controlled ? {open, onOpenChange:setOpen} : {})}>
      <SelectTrigger aria-label="Unidad"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="kg">Kilogramos</SelectItem><SelectItem value="g">Gramos</SelectItem></SelectContent>
    </Select>
    <Input aria-label="Deshabilitado" disabled />
    <Input aria-label="Oculto" hidden />
    <Input aria-label="Costo" />
  </DialogContent></Dialog>;
}

describe('TAB en formularios de artículos y recetas', () => {
  it('closes an open list and advances to the next editable field without changing its value', async () => {
    const user = userEvent.setup(); const change = vi.fn();
    render(<Form onChange={change} />);
    await user.click(screen.getByRole('combobox', { name: 'Unidad' }));
    expect(screen.getByRole('listbox')).toBeVisible();
    await user.tab();
    await waitFor(() => expect(screen.getByRole('textbox', {name:'Costo'})).toHaveFocus());
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
  });
  it('returns to the previous field with Shift + TAB from an open list', async () => {
    const user = userEvent.setup(); render(<Form />);
    await user.click(screen.getByRole('combobox', {name:'Unidad'}));
    await user.tab({shift:true});
    await waitFor(() => expect(screen.getByRole('textbox', {name:'Nombre'})).toHaveFocus());
  });
  it('keeps normal TAB order when the list is closed', async () => {
    const user = userEvent.setup(); render(<Form />);
    await user.click(screen.getByRole('textbox', {name:'Nombre'}));
    await user.tab(); expect(screen.getByRole('combobox', {name:'Unidad'})).toHaveFocus();
    await user.tab(); expect(screen.getByRole('textbox', {name:'Costo'})).toHaveFocus();
  });
  it('preserves arrow/Enter selection and normal focus restoration', async () => {
    const user = userEvent.setup(); const change = vi.fn(); render(<Form onChange={change} />);
    const trigger = screen.getByRole('combobox', {name:'Unidad'});
    await user.click(trigger);
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(screen.getByRole('option', {name:'Gramos'})).toHaveFocus());
    await user.keyboard('{Enter}');
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(change).toHaveBeenCalledWith('g');
    expect(change).toHaveBeenCalledTimes(1);
  });

  it('also closes controlled lists and moves focus with TAB', async () => {
    const user=userEvent.setup(); render(<Form controlled />);
    const trigger=screen.getByRole('combobox', {name:'Unidad'});
    await user.click(trigger); await user.tab();
    await waitFor(()=>expect(screen.getByRole('textbox', {name:'Costo'})).toHaveFocus());
    expect(trigger).toHaveAttribute('aria-expanded','false');
  });

});
